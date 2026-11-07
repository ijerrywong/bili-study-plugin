// lib/bili.js 纯函数单测（不依赖网络，parseLink 的 b23.tv 分支用 mock fetch）。
// 注意：parseLink 是 async（b23.tv 分支要 await fetch），因此取值需 await。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Bili, parseLink } from '../lib/bili.js'

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex')
const quote = (s) => encodeURIComponent(String(s)).replace(/%20/g, '+')

test('parseLink: UP 主主页', async () => {
  assert.deepEqual(await parseLink('https://space.bilibili.com/12345'), { kind: 'up', id: '12345' })
})

test('parseLink: 无协议前缀自动补 https', async () => {
  assert.deepEqual(await parseLink('space.bilibili.com/999'), { kind: 'up', id: '999' })
})

test('parseLink: 视频 BV 号', async () => {
  assert.deepEqual(await parseLink('https://www.bilibili.com/video/BV1ab2c3d4e5'), { kind: 'video', id: 'BV1ab2c3d4e5' })
})

test('parseLink: av 号', async () => {
  assert.deepEqual(await parseLink('https://www.bilibili.com/video/av123'), { kind: 'video', id: '123', isAid: true })
})

test('parseLink: 收藏夹 medialist', async () => {
  assert.deepEqual(await parseLink('https://www.bilibili.com/medialist/detail/ml456'), { kind: 'fav', id: '456' })
})

test('parseLink: 收藏夹 query media_id', async () => {
  assert.deepEqual(await parseLink('https://www.bilibili.com/x/v3/fav?media_id=789'), { kind: 'fav', id: '789' })
})

test('parseLink: 空链接抛错', async () => {
  await assert.rejects(() => parseLink(''), /链接为空/)
})

test('parseLink: 无法识别的链接抛错', async () => {
  await assert.rejects(() => parseLink('https://example.com/foo'), /没认出链接类型/)
})

test('parseLink: b23.tv 短链解析跳转', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => ({ headers: { get: () => 'https://www.bilibili.com/video/BVxyz987' } })
  try {
    const r = await parseLink('https://b23.tv/abcd')
    assert.deepEqual(r, { kind: 'video', id: 'BVxyz987' })
  } finally {
    globalThis.fetch = orig
  }
})

test('Bili._sign: 生成 w_rid 且 md5 可复现', () => {
  const b = new Bili()
  b.mixinKey = 'k'.repeat(32)
  const p = b._sign({ b: 2, a: 1, name: 'hello world' })
  assert.equal(typeof p.wts, 'number')
  assert.match(p.w_rid, /^[0-9a-f]{32}$/)
  // 用同样算法复算，验证排序 + quote + md5 全链路一致
  const base = { ...p }
  delete base.w_rid
  const keys = Object.keys(base).sort()
  const q = keys.map((k) => `${quote(k)}=${quote(String(base[k]).replace(/[!'()*]/g, ''))}`).join('&')
  assert.equal(md5(q + b.mixinKey), p.w_rid)
})

test("Bili._sign: 剥离特殊字符 !'()*", () => {
  const b = new Bili()
  b.mixinKey = 'm'.repeat(32)
  const p = b._sign({ x: "a'b(c)d!e*f" })
  const base = { ...p }
  delete base.w_rid
  const keys = Object.keys(base).sort()
  const q = keys.map((k) => `${quote(k)}=${quote(String(base[k]).replace(/[!'()*]/g, ''))}`).join('&')
  assert.equal(md5(q + b.mixinKey), p.w_rid)
  // 特殊字符已被剥离（quote 后不应再出现这些字符）
  assert.ok(!q.includes("'") && !q.includes('(') && !q.includes(')') && !q.includes('*'))
})
