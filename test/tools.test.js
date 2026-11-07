// lib/tools.js 结构单测：只校验工具的静态定义（name / required / execute 类型），
// 不调用 execute（execute 会触发真实网络抓取）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOOLS } from '../lib/tools.js'

test('TOOLS: 注册两个工具', () => {
  assert.equal(TOOLS.length, 2)
})

test('TOOLS: save_catalog 工具结构正确', () => {
  const t = TOOLS.find((x) => x.name === 'bili_study_save_catalog')
  assert.ok(t, '存在 bili_study_save_catalog 工具')
  assert.deepEqual(t.parameters.required, ['catalog'])
  assert.ok(t.parameters.properties.catalog)
  assert.equal(typeof t.execute, 'function')
})

test('TOOLS: fetch 工具结构正确', () => {
  const t = TOOLS.find((x) => x.name === 'bili_study_fetch')
  assert.ok(t, '存在 bili_study_fetch 工具')
  assert.deepEqual(t.parameters.required, ['url'])
  assert.ok(t.parameters.properties.url)
  assert.equal(typeof t.execute, 'function')
})
