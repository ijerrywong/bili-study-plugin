// lib/store.js 纯函数单测。readState/writeState/mutate 用独立临时 DSH_HOME，避免污染真实数据。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultState, normalizeCatalog, readState, writeState, mutate } from '../lib/store.js'

test('defaultState: 结构完整且版本为 1', () => {
  const s = defaultState()
  assert.equal(s.version, 1)
  assert.equal(s.rev, 0)
  assert.deepEqual(s.catalog, [])
  assert.deepEqual(s.videos, {})
  assert.equal(s.rewards.points, 0)
  assert.equal(s.rewards.streak, 0)
})

test('normalizeCatalog: 缺失 id 自动补，保留给定 id', () => {
  const out = normalizeCatalog([
    { name: '科目A', children: [{ name: '章1' }] },
    { id: 'fix1', name: '科目B' },
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].id.length > 0, true)
  assert.equal(out[0].name, '科目A')
  assert.equal(out[0].children[0].id.length > 0, true)
  assert.equal(out[1].id, 'fix1')
})

test('normalizeCatalog: 丢弃无名节点，截断超长名到 120', () => {
  const out = normalizeCatalog([{ name: 'x'.repeat(200) }, { note: '无名字' }, { name: 'ok' }])
  assert.equal(out.length, 2)
  assert.equal(out[0].name.length, 120)
  assert.equal(out[1].name, 'ok')
})

test('normalizeCatalog: videos 限长 500', () => {
  const many = Array.from({ length: 600 }, (_, i) => `BV${i}`)
  const out = normalizeCatalog([{ name: 't', videos: many }])
  assert.equal(out[0].videos.length, 500)
})

test('normalizeCatalog: 过滤非字符串/空 video', () => {
  const out = normalizeCatalog([{ name: 't', videos: [123, '', null, 'BVgood', 'BV2'] }])
  assert.deepEqual(out[0].videos, ['BVgood', 'BV2'])
})

test('normalizeCatalog: 空 children/videos 不写字段', () => {
  const out = normalizeCatalog([{ name: 't', children: [], videos: [] }])
  assert.equal(out[0].children, undefined)
  assert.equal(out[0].videos, undefined)
})

test('normalizeCatalog: 非数组输入返回空数组', () => {
  assert.deepEqual(normalizeCatalog(null), [])
  assert.deepEqual(normalizeCatalog('xxx'), [])
})

// 所有涉及真实文件读写的用例放在同一个串行用例里，统一用一份临时 DSH_HOME，
// 避免 node:test 并发子测试同时改写 process.env.DSH_HOME 互相干扰。
test('状态读写 / 合并默认值 / rev 自增 / mutate 锁内改写', async () => {
  const prev = process.env.DSH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'bili-test-'))
  process.env.DSH_HOME = dir
  try {
    // 全新：无文件时返回默认值
    assert.equal(readState().version, 1)
    assert.equal(readState().rev, 0)

    // 写入部分状态，读取应保留默认值其余字段，且 rev 自增为 1
    writeState({ catalog: [{ id: 'a', name: 'x' }] })
    let s = readState()
    assert.equal(s.catalog.length, 1)
    assert.equal(s.catalog[0].name, 'x')
    assert.equal(s.rewards.points, 0) // 来自 defaultState 合并
    assert.equal(s.rev, 1)

    // 再次写入，rev 继续自增
    writeState({ catalog: [] })
    assert.equal(readState().rev, 2)

    // mutate 在锁内读改写，rev 继续自增且改动生效
    const out = await mutate((st) => {
      st.sources.push({ type: 'up', id: '1', name: 't', url: '', addedAt: '' })
      return st
    })
    assert.equal(out.rev, 3)
    assert.equal(readState().sources.length, 1)
    assert.equal(readState().rev, 3)
  } finally {
    process.env.DSH_HOME = prev
  }
})
