// B 站学习台 · DeepSeek Harness 插件：Host 半边
// 1. 注册给模型的两个工具（lib/tools.js）：保存生成的目录、抓取 B 站视频
// 2. /bili-study/             面板页面（web/index.html）
//    /bili-study/api/state    读写持久化状态
//    /bili-study/api/fetch    从 B 站链接抓视频（脚本化，不经过模型）
//    /bili-study/api/ask      概念速查：面板内直接调 LLM 回答，不跳出到对话
//    /bili-study/api/classify 智能分类：按现有目录给一批已有视频挑主题（面板预览后才写入）
//    /bili-study/api/links    AI 前置连线：按科目生成叶子主题之间的前置关系（只返回，不写盘）
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchFromUrl } from './lib/bili.js'
import { readState, writeState, withLock } from './lib/store.js'
import { TOOLS } from './lib/tools.js'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const BASE = '/bili-study'

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
}

export const name = 'bili-study'
export const inject = ['webServer', 'tools', 'llm']

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
}

// 只在 web/ 目录内找文件，拒绝 .. 和目录外符号链接。
function safeFile(rel) {
  if (!rel || rel.split('/').some((p) => p.startsWith('.'))) return null
  const base = realpathSync(join(ROOT, 'web'))
  const file = normalize(join(base, rel))
  if (!file.startsWith(base + sep) || !existsSync(file)) return null
  const real = realpathSync(file)
  return real.startsWith(base + sep) && statSync(real).isFile() ? real : null
}
function serveFile(req, res, file) {
  res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}
// 只接受同源 JSON POST。
function readJson(req, max = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('type'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => { size += c.length; if (size > max) req.destroy(); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(Object.assign(e, { status: 400 })) } })
    req.on('error', reject)
  })
}

// ---- 面板内调 LLM（概念速查 / 智能分类共用：跟随 dsh 默认模型）----
async function streamLlm(ctx, { system, prompt, maxTokens = 1200, temperature = 0.6, timeoutMs = 90000 }) {
  let provider = 'deepseek-official'
  let model = 'deepseek-v4-pro'
  let reasoningEffort
  try {
    const sel = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (sel?.provider) provider = sel.provider
    if (sel?.model) model = sel.model
    if (sel?.reasoningEffort) reasoningEffort = sel.reasoningEffort
  } catch { /* 读不到默认模型就用内置兜底 */ }
  let chunks
  try {
    chunks = ctx.llm.stream({
      provider, model, reasoningEffort,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      maxTokens, temperature,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    return { ok: false, error: e?.message || '模型调用失败' }
  }
  let answer = ''
  let error = null
  try {
    for await (const c of chunks) {
      if (c.type === 'text-delta') answer += c.text
      else if (c.type === 'finish') {
        if (c.reason.kind === 'error' || c.reason.kind === 'aborted') error = c.reason.failure?.message || '模型调用失败'
      }
    }
  } catch (e) {
    error = e?.message || '模型调用异常'
  }
  if (error) return { ok: false, error }
  return { ok: true, text: answer.trim() }
}

// 概念速查：面板内直接调 LLM 回答，不跳出到对话界面。
// 前端把预设 id 一起传上来，这里按 id 选 system 提示和 maxTokens（知识图谱要放宽字数并允许 graph 代码块）。
const ASK_BASE_SYSTEM = '你是 B 站学习台里的概念讲解助手。用中文、面向学习者、条理清晰。数学公式请用 LaTeX 书写：行内用 $...$，独立成行用 $$...$$。'
const ASK_PRESETS = {
  plain: {
    system: `${ASK_BASE_SYSTEM} 尽量控制在 300 字以内。`,
    maxTokens: 1200,
  },
  map: {
    system: `${ASK_BASE_SYSTEM} 这次的任务是梳理知识体系：先用一两句话说明整体结构，再列出 8–15 个知识点及它们的关系（前置 / 包含 / 推出）。篇幅可以放宽到 800 字左右。最后必须附一个 \`\`\`graph 代码块，内容只能是 JSON：{"nodes":[{"id":"n1","label":"知识点"}],"edges":[{"from":"n1","to":"n2","type":"前置"}]}；用户问到的概念对应的节点用 "root": true 标出。代码块之外不要再重复这段 JSON。`,
    maxTokens: 4096,
  },
  explore: {
    system: `${ASK_BASE_SYSTEM} 这次的任务是向外拓展：给出跨学科联系、实际应用、历史由来、更高阶的后续内容，每条用一句话说明为什么相关。只输出文字，不要画图，也不要输出 JSON 或代码块。`,
    maxTokens: 2200,
  },
}
async function askLlm(ctx, prompt, preset) {
  const p = ASK_PRESETS[preset] || ASK_PRESETS.plain
  const r = await streamLlm(ctx, {
    system: p.system,
    prompt,
    maxTokens: p.maxTokens,
    temperature: 0.6,
  })
  if (!r.ok) return r
  if (!r.text) return { ok: false, error: '没有生成回答' }
  return { ok: true, answer: r.text }
}

// ---- 智能分类：把一批已有视频按现有目录挑主题 ----
const CLASSIFY_SYSTEM = `你是 B 站学习台的视频归类助手。你要把学习视频放进最合适的学习主题里。
只依据用户给出的标题、UP 主、时长、合集名判断，不臆测视频内容。
只输出 JSON 数组，不要输出解释，不要用代码块包裹。`

function oneLine(s, max) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}
function fmtDurSec(sec) {
  const n = Number(sec) || 0
  return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
}
// 目录叶子 = 可归类的主题，带完整路径（重名主题靠 id 区分）
function collectLeafTopics(nodes, trail = []) {
  const out = []
  for (const n of Array.isArray(nodes) ? nodes : []) {
    const path = [...trail, n.name]
    if (Array.isArray(n.children) && n.children.length) out.push(...collectLeafTopics(n.children, path))
    else if (n.id) out.push({ id: n.id, name: n.name, path: path.join(' › ') })
  }
  return out
}
// 模型偶尔会把主题名/路径当地 id 返回，这里按 id → 路径 → 唯一名称依次兜底
function buildTopicResolver(topics) {
  const byId = new Set(topics.map((t) => t.id))
  const byPath = new Map(topics.map((t) => [t.path, t.id]))
  const byName = new Map()
  for (const t of topics) {
    if (!byName.has(t.name)) byName.set(t.name, [])
    byName.get(t.name).push(t.id)
  }
  const unique = (name) => { const ids = byName.get(name); return ids && ids.length === 1 ? ids[0] : null }
  return (raw) => {
    const s = oneLine(raw, 160).replace(/^[「『"'《]|[」』"'》]$/g, '').trim()
    if (!s || /^(null|none|undefined|无|跳过)$/i.test(s)) return null
    if (byId.has(s)) return s
    if (byPath.has(s)) return byPath.get(s)
    const exact = unique(s)
    if (exact) return exact
    // 「科目 › 章 › 主题」只写了尾段时，按主题名兜底
    const tail = s.split(/[›>／/]/).pop().trim()
    return tail && tail !== s ? unique(tail) : null
  }
}
// 从模型输出里抠出 JSON（允许 ```json 包裹或前后带解释）
function extractJsonArray(text) {
  let s = String(text || '').trim()
  if (!s) return null
  s = s.replace(/```(?:json|JSON)?/g, '').trim()
  const parse = (x) => { try { return JSON.parse(x) } catch { return undefined } }
  let v = parse(s)
  if (v === undefined) {
    const a = s.indexOf('['), b = s.lastIndexOf(']')
    if (a >= 0 && b > a) v = parse(s.slice(a, b + 1))
  }
  if (v === undefined) {
    const a = s.indexOf('{'), b = s.lastIndexOf('}')
    if (a >= 0 && b > a) v = parse(s.slice(a, b + 1))
  }
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') {
    for (const k of ['items', 'videos', 'results', 'assignments', 'data']) {
      if (Array.isArray(v[k])) return v[k]
    }
  }
  return null
}

async function classifyBvids(ctx, bvids) {
  const state = readState()
  const topics = collectLeafTopics(state.catalog)
  if (!topics.length) return { ok: false, error: '目录里还没有可归类的主题，先建目录再来智能分类' }
  const ids = [...new Set((Array.isArray(bvids) ? bvids : []).filter((b) => typeof b === 'string' && b))].slice(0, 40)
  // 只分类本地库里还有的视频，顺序即模型要回的序号
  const videos = ids.map((b) => [b, state.videos[b]]).filter(([, v]) => v)
  if (!videos.length) return { ok: false, error: '这些视频不在本地库里，可能已被删除' }

  const topicLines = topics.map((t) => `- ${t.id} | ${t.path}`).join('\n')
  const videoLines = videos.map(([bvid, v], i) => {
    const bits = [oneLine(v.title, 90)]
    if (v.author) bits.push(`— ${oneLine(v.author, 24)}`)
    if (v.duration) bits.push(`（${fmtDurSec(v.duration)}）`)
    if (v.collection) bits.push(`[${oneLine(v.collection, 30)}]`)
    return `#${i} ${bits.join(' ')}`
  }).join('\n')

  const prompt = `学习目录里的主题（格式：主题 id | 完整路径）：
${topicLines}

要归类的视频（格式：#序号 标题 — UP主（时长）[合集]）：
${videoLines}

请给每个视频选一个最合适的主题，规则：
1. topicId 只能填上面出现过的主题 id，不要编造，也不要写主题名。
2. 一个主题可以放多个视频。
3. 视频与所有主题都不相关（纯娱乐、无关内容）时，topicId 填 null。
4. 只看标题 / UP主 / 时长 / 合集判断；信息不足也可以猜，但 confidence 要低。
5. 输出 JSON 数组，每项 {"i": # 后面的序号, "topicId": "主题 id 或 null", "confidence": 0 到 1 的小数, "reason": "不超过 12 个字的理由"}。
只输出这个 JSON 数组，不要任何其他文字。`

  const r = await streamLlm(ctx, {
    system: CLASSIFY_SYSTEM,
    prompt,
    maxTokens: Math.min(4096, 1000 + videos.length * 80),
    temperature: 0.2,
    timeoutMs: 120000,
  })
  if (!r.ok) return r
  const parsed = extractJsonArray(r.text)
  if (!parsed) return { ok: false, error: '模型没有返回可解析的 JSON，请重试' }

  const resolve = buildTopicResolver(topics)
  const byIndex = new Map(videos.map(([b], i) => [i, b]))
  const byBvid = new Set(videos.map(([b]) => b))
  const out = []
  const seen = new Set()
  for (const it of parsed) {
    if (!it || typeof it !== 'object') continue
    let bvid = null
    const i = Number(it.i ?? it.index)
    if (Number.isInteger(i) && byIndex.has(i)) bvid = byIndex.get(i)
    else if (typeof it.bvid === 'string' && byBvid.has(it.bvid.trim())) bvid = it.bvid.trim()
    if (!bvid || seen.has(bvid)) continue
    seen.add(bvid)
    const topicId = resolve(it.topicId ?? it.topic_id ?? it.topic)
    let confidence = Number(it.confidence ?? it.score)
    confidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null
    out.push({ bvid, topicId, confidence, reason: oneLine(it.reason || it.why || '', 40) })
  }
  return { ok: true, items: out, total: videos.length }
}

// ---- AI 前置连线：按科目生成一次「学 to 之前要先会 from」的边（只返回，不写盘）----
const LINKS_SYSTEM = `你是 B 站学习台的知识图谱助手。你要根据学习目录里的主题，判断「学 to 之前要先会 from」的前置关系。
只依据主题名称和完整路径判断，不臆测具体视频内容。
只输出 JSON 数组，不要输出解释，不要用代码块包裹。`

function findNodeById(nodes, id) {
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (!n || typeof n !== 'object') continue
    if (n.id === id) return n
    if (n.children) {
      const hit = findNodeById(n.children, id)
      if (hit) return hit
    }
  }
  return null
}

async function suggestLinks(ctx, subjectId, catalog) {
  const state = readState()
  const sid = oneLine(subjectId, 80)
  let subject = findNodeById(Array.isArray(catalog) ? catalog : [], sid) || findNodeById(state.catalog, sid)
  if (!subject && Array.isArray(catalog) && catalog.length === 1) subject = catalog[0]
  if (!subject) return { ok: false, error: '找不到这个科目，刷新页面后再试' }
  // 复用智能分类的叶子主题收集：带完整路径，重名主题靠 id 区分
  const topics = collectLeafTopics([subject])
  if (topics.length < 2) return { ok: false, error: '这个科目的主题太少，先把目录补全再来补前置连线' }

  const topicLines = topics.map((t) => `- ${t.id} | ${t.path}`).join('\n')
  const cap = Math.min(60, topics.length * 2)
  const prompt = `学习目录里的主题（格式：主题 id | 完整路径）：
${topicLines}

请判断这些主题之间的前置关系，规则：
1. from 和 to 都只能填上面出现过的主题 id，不要编造，也不要写主题名。
2. 每条边表示「学 to 之前要先会 from」，方向不能反。
3. 只连确实有知识依赖的主题，不要为了连线而硬凑；同一个主题可以有多个前置。
4. 不要自环，不要成环（A→B 和 B→A 只能保留一个）。
5. 最多 ${cap} 条边。
6. 输出 JSON 数组，每项 {"from": "主题 id", "to": "主题 id"}。
只输出这个 JSON 数组，不要任何其他文字。`

  const r = await streamLlm(ctx, {
    system: LINKS_SYSTEM,
    prompt,
    maxTokens: Math.min(4096, 1200 + topics.length * 60),
    temperature: 0.2,
    timeoutMs: 120000,
  })
  if (!r.ok) return r
  const parsed = extractJsonArray(r.text)
  if (!parsed) return { ok: false, error: '模型没有返回可解析的 JSON，请重试' }

  // 用智能分类同一套 id → 路径 → 唯一名称兜底解析来校验，丢掉无效边 / 自环 / 成环边
  const resolve = buildTopicResolver(topics)
  const valid = new Set(topics.map((t) => t.id))
  const out = new Map()
  const accepted = []
  const seen = new Set()
  const canReach = (a, b) => {
    const stack = [a]
    const visited = new Set([a])
    while (stack.length) {
      const u = stack.pop()
      if (u === b) return true
      for (const v of out.get(u) || []) {
        if (!visited.has(v)) { visited.add(v); stack.push(v) }
      }
    }
    return false
  }
  for (const it of parsed) {
    if (!it || typeof it !== 'object') continue
    const from = resolve(it.from ?? it.source ?? it.pre)
    const to = resolve(it.to ?? it.target ?? it.next)
    if (!from || !to || from === to || !valid.has(from) || !valid.has(to)) continue
    const key = `${from}\u0000${to}`
    if (seen.has(key)) continue
    // 再加这条就闭环 → 丢掉
    if (canReach(to, from)) continue
    seen.add(key)
    if (!out.has(from)) out.set(from, [])
    out.get(from).push(to)
    accepted.push({ from, to })
  }
  return { ok: true, links: accepted, total: topics.length }
}

export function apply(ctx) {
  for (const tool of TOOLS) ctx.tools.register(tool)

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: BASE,
      async handler(req, res) {
        const url = new URL(req.url || '/', 'http://x')
        const rest = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'
        if (rest === '/api/state' && (req.method === 'GET' || req.method === 'HEAD')) {
          return sendJson(res, 200, { ok: true, state: readState() })
        }
        if (rest === '/api/state' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const incoming = body && body.state ? body.state : body
            const clientRev = body && typeof body.rev === 'number' ? body.rev : null
            if (!incoming || typeof incoming !== 'object') return sendJson(res, 400, { ok: false, error: '状态格式不对' })
            const result = await withLock(async () => {
              const cur = readState()
              // 乐观并发：客户端基于某个 rev 修改；若期间已被其他操作（如 AI 写目录）改写，则冲突，
              // 让前端刷新合并，而不是「后写覆盖先写」导致静默丢数据。
              if (clientRev != null && clientRev !== cur.rev) {
                return { conflict: true, state: cur }
              }
              const merged = { ...cur, ...incoming }
              delete merged.rev // rev 由 writeState 统一管理
              writeState(merged)
              return { ok: true, rev: merged.rev }
            })
            if (result.conflict) return sendJson(res, 409, { ok: false, conflict: true, state: result.state })
            return sendJson(res, 200, { ok: true, rev: result.rev })
          } catch (e) {
            return sendJson(res, e.status || 400, { ok: false, error: e.message })
          }
        }
        if (rest === '/api/fetch' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const r = await fetchFromUrl(String(body.url || ''))
            return sendJson(res, 200, r)
          } catch (e) {
            return sendJson(res, 400, { ok: false, error: e.message })
          }
        }
        if (rest === '/api/ask' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const q = String(body.question || '').trim()
            if (!q) return sendJson(res, 400, { ok: false, error: '问题为空' })
            const r = await askLlm(ctx, q, String(body.preset || 'plain'))
            return sendJson(res, r.ok ? 200 : 500, r)
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: e.message })
          }
        }
        if (rest === '/api/links' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const r = await suggestLinks(ctx, String(body.subjectId || ''), body.catalog)
            return sendJson(res, r.ok ? 200 : 400, r)
          } catch (e) {
            return sendJson(res, 400, { ok: false, error: e.message })
          }
        }
        if (rest === '/api/classify' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const r = await classifyBvids(ctx, body.bvids)
            return sendJson(res, r.ok ? 200 : 400, r)
          } catch (e) {
            return sendJson(res, 400, { ok: false, error: e.message })
          }
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res)
        const rel = rest === '/' ? 'index.html' : rest.slice(1)
        const f = safeFile(rel)
        return f ? serveFile(req, res, f) : notFound(res)
      },
    }),
  )
}
