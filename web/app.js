/* B 站学习台 面板逻辑（纯脚本，无框架） */
'use strict'
const $ = (s, r) => (r || document).querySelector(s)
const $$ = (s, r) => [...(r || document).querySelectorAll(s)]
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmtDur = (s) => { s = Number(s) || 0; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` }
const fmtPlay = (n) => (n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n || 0))
const bvUrl = (v, p) => `https://www.bilibili.com/video/${v.bvid}${p > 1 ? '?p=' + p : ''}`
const playerSrc = (v, p) => `https://player.bilibili.com/player.html?isOutside=true&bvid=${v.bvid}&p=${p || 1}&autoplay=0&high_quality=1&danmaku=0`

// ---- 预设的概念学习提示词（可脚本化，无需 AI 现场发挥）----
const PRESETS = [
  { id: 'plain', label: '通俗讲解', tpl: '请用通俗易懂的方式给我讲清楚「{x}」。从零基础讲起，先给一句话定义，再讲核心要点，举一个生活中的例子，最后用一句话总结。' },
  { id: 'feynman', label: '费曼学习法', tpl: '请用费曼学习法给我讲「{x}」：假装讲给一个完全没学过的人听，用最简单的语言，然后指出初学者最容易误解的地方，最后出一道自测题考我。' },
  { id: 'map', label: '知识图谱', tpl: '围绕「{x}」所在的整个知识体系，给出 8–15 个知识点及其关系（前置 / 包含 / 推出），先用一两句话说明整体结构；最后附一个 ```graph 代码块，内容是 JSON：{"nodes":[{"id","label"}],"edges":[{"from","to","type"}]}，并标出 {x} 本身对应的节点。' },
  { id: 'exam', label: '题型总结', tpl: '围绕「{x}」这个知识点，总结常见题型和解题思路，各给一道典型例题并写出解析步骤（学习向，非刷题导向）。' },
  { id: 'analogy', label: '类比记忆', tpl: '请给「{x}」找一个生动的类比，帮助我长期记忆，并说明这个类比的适用边界（哪里不能类比）。' },
  { id: 'explore', label: '拓展知识', tpl: '给出与「{x}」相关的延伸知识——跨学科联系、实际应用、历史由来、更高阶的后续内容，每条用一句话说明为什么相关。只输出文字。' },
]

// ---- 公式工具栏（笔记里快速插入算式/符号；模板是 LaTeX，符号是 Unicode）----
const FORMULA_BAR = [
  { label: '分式', tex: '$\\frac{}{}$', cur: 7 },
  { label: '根号', tex: '$\\sqrt{}$', cur: 7 },
  { label: '上标', tex: '$x^{}$', cur: 4 },
  { label: '下标', tex: '$x_{}$', cur: 4 },
  { label: '求和', tex: '$\\sum_{}^{}$', cur: 7 },
  { label: '积分', tex: '$\\int_{}^{}$', cur: 7 },
  { label: '∑', tex: '∑' }, { label: '∫', tex: '∫' }, { label: '∏', tex: '∏' },
  { label: '√', tex: '√' }, { label: 'π', tex: 'π' }, { label: 'θ', tex: 'θ' },
  { label: '∞', tex: '∞' }, { label: '±', tex: '±' }, { label: '×', tex: '×' }, { label: '÷', tex: '÷' },
  { label: '≤', tex: '≤' }, { label: '≥', tex: '≥' }, { label: '≠', tex: '≠' }, { label: '≈', tex: '≈' },
  { label: '∈', tex: '∈' }, { label: '∀', tex: '∀' }, { label: '∃', tex: '∃' }, { label: '→', tex: '→' },
  { label: 'Δ', tex: 'Δ' }, { label: '∂', tex: '∂' }, { label: '∇', tex: '∇' },
  { label: 'α', tex: 'α' }, { label: 'β', tex: 'β' }, { label: 'γ', tex: 'γ' }, { label: 'λ', tex: 'λ' },
  { label: 'σ', tex: 'σ' }, { label: 'ω', tex: 'ω' },
  { label: '²', tex: '²' }, { label: '³', tex: '³' }, { label: '°', tex: '°' }, { label: '·', tex: '·' },
]

// ---- 线条图标（Lucide 风格：24 网格、stroke=currentColor、stroke-width 2、fill none；离线可用）----
const ic = (inner) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
const ICONS = {
  sparkles: ic('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>'),
  wand: ic('<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>'),
  plus: ic('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  download: ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  note: ic('<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6"/>'),
  eye: ic('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
  save: ic('<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>'),
  bot: ic('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>'),
  shuffle: ic('<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="M18 2l4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="M18 14l4 4-4 4"/>'),
  tag: ic('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'),
  grid: ic('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'),
  dot: ic('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>'),
  star: ic('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  starFill: `<svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  pencil: ic('<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>'),
  trash: ic('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  folder: ic('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
  check: ic('<path d="M20 6 9 17l-5-5"/>'),
  more: `<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
}
// 把 index.html 里 <span data-icon="…"> 占位符替换成对应 SVG
function decorateStaticIcons() {
  $$('[data-icon]').forEach((el) => { const s = ICONS[el.dataset.icon]; if (s) el.outerHTML = s })
}

// ---- 状态 ----
let STATE = null
let view = { mode: 'overview', topicId: null, bvid: null, part: 1, sourceId: null }
let selPreset = 'plain'
let notePreviewOn = false
let saveTimer = null
let collapsed = new Set()      // 学科树里收起的节点
let expandedSrc = new Set()    // UP主 区展开的来源（'' 表示未分类）
let upOpen = false             // UP主 区是否展开（默认收起）
let classifyRun = null         // 正在进行的一轮智能分类（停止时置 aborted）
const CLASSIFY_BATCH = 30      // 每次请求模型的视频数

const defaultState = () => ({ version: 1, catalog: [], videos: {}, sources: [], notes: {}, progress: {}, links: {}, rewards: { points: 0, streak: 0, best: 0, lastActive: '', badges: [], log: [] }, lastWatch: null })

async function loadState() {
  try {
    const r = await fetch('/bili-study/api/state')
    const j = await r.json()
    STATE = { ...defaultState(), ...(j.state || {}) }
  } catch (e) {
    STATE = defaultState()
  }
  // 记住上次看的视频，直接回到那个页面
  const lw = STATE.lastWatch
  if (lw && lw.bvid && STATE.videos[lw.bvid]) {
    view = { mode: 'watch', bvid: lw.bvid, part: lw.part || 1, topicId: lw.topicId || null, sourceId: lw.sourceId || null }
  }
  renderAll()
}
function saveState(immediate) {
  if (saveTimer) clearTimeout(saveTimer)
  const run = async () => {
    try {
      const r = await fetch('/bili-study/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: STATE, rev: STATE.rev ?? null }) })
      if (r.status === 409) {
        // 服务端状态已被其他操作（如 AI 写目录）更新，刷新到最新，避免静默覆盖
        await loadState()
        toast('数据已被其他操作更新，已为你刷新到最新状态（本次未保存的改动可能丢失，请重试）')
        return
      }
      const j = await r.json().catch(() => ({}))
      if (j && j.rev != null) STATE.rev = j.rev
    } catch (e) { /* 忽略网络错误，下次保存重试 */ }
  }
  if (immediate) return run()
  saveTimer = setTimeout(run, 400)
}
function persist() { saveState(true) }

// 软刷新：只更新数据与侧栏/顶栏，观看时不重建播放器，避免打断播放
async function refreshSoft() {
  try {
    const j = await (await fetch('/bili-study/api/state')).json()
    STATE = { ...defaultState(), ...(j.state || {}) }
  } catch { return }
  renderSide()
  if (view.mode !== 'watch') renderContent()
}

// ---- 目录 / 来源工具 ----
function walk(nodes, fn) { for (const n of nodes || []) { if (fn(n)) return true; if (n.children && walk(n.children, fn)) return true } return false }
function forAllNodes(fn) { const rec = (nodes) => { for (const n of nodes || []) { fn(n); if (n.children) rec(n.children) } }; rec(STATE.catalog) }
function findNode(id) { let out = null; walk(STATE.catalog, (n) => { if (n.id === id) { out = n; return true } }); return out }
function topicVideos(node) { return (node && node.videos) || [] }
function nodeCount(node) { let c = 0; walk([node], (n) => { c += (n.videos || []).length }); return c }
function assignedBvids() { const s = new Set(); walk(STATE.catalog, (n) => (n.videos || []).forEach((b) => s.add(b))); return s }
function unassigned() { const a = assignedBvids(); return Object.keys(STATE.videos).filter((b) => !a.has(b)) }
function videosOfSource(sourceId) { return Object.keys(STATE.videos).filter((b) => STATE.videos[b] && STATE.videos[b].sourceId === String(sourceId)) }
function isLeaf(n) { return !n.children || !n.children.length }
function isTopicDone(node) { const vs = topicVideos(node); return vs.length > 0 && vs.every((b) => STATE.progress[b] && STATE.progress[b].seen) }
function ancestorPath(topicId) { const parts = []; const rec = (nodes, trail) => { for (const n of nodes || []) { const t = [...trail, n]; if (n.id === topicId) { parts.push(...t); return true } if (n.children && rec(n.children, t)) return true } }; rec(STATE.catalog, []); return parts }
// 一个视频当前所属的主题节点（叶子），没归类返回 null
function topicOf(bvid) { let out = null; walk(STATE.catalog, (n) => { if (isLeaf(n) && (n.videos || []).includes(bvid)) { out = n; return true } }); return out }
// 观看时的播放列表：主题 → 来源 → 未分类
function watchList() {
  if (view.topicId) return (findNode(view.topicId) || {}).videos || []
  if (view.sourceId) return videosOfSource(view.sourceId)
  return unassigned()
}
// 把一个视频从所有主题里移除
function removeVideoFromTopic(bvid) { forAllNodes((n) => { if ((n.videos || []).includes(bvid)) n.videos = (n.videos || []).filter((x) => x !== bvid) }) }
// 把一个视频移动到指定主题（移动语义：先从其他主题移除，再加入目标）
function moveVideo(bvid, topicId) {
  removeVideoFromTopic(bvid)
  const t = findNode(topicId)
  if (t) { const set = new Set(t.videos || []); set.add(bvid); t.videos = [...set] }
}

// ---- 渲染 ----
function renderSide() { renderUpList(); renderTree(); renderHeader() }
function renderAll() { renderSide(); renderContent() }
function refreshUI() { renderSide(); if (view.mode !== 'watch') renderContent() }

// 今日目标：今天看完几个视频算完成（改这个常量即可调整目标）
const DAILY_GOAL_VIDEOS = 3

function renderHeader() {
  $('#points').textContent = STATE.rewards.points || 0
  $('#streak').textContent = `连续 ${STATE.rewards.streak || 0} 天`
  const done = Math.min(todaySeenCount(), DAILY_GOAL_VIDEOS)
  const ring = $('#goalRing')
  if (ring) {
    const C = 2 * Math.PI * 9
    const fg = ring.querySelector('.ring-fg')
    if (fg) fg.style.strokeDashoffset = String(C * (1 - (DAILY_GOAL_VIDEOS ? done / DAILY_GOAL_VIDEOS : 0)))
    ring.classList.toggle('done', DAILY_GOAL_VIDEOS > 0 && done >= DAILY_GOAL_VIDEOS)
    ring.title = `今日目标：${done}/${DAILY_GOAL_VIDEOS} 个视频`
  }
  const btn = $('#btnRewards')
  if (btn) btn.title = `学习奖励 · 今日目标 ${done}/${DAILY_GOAL_VIDEOS}`
  const sc = $('#btnSmartClassify')
  if (sc) {
    const n = unassigned().length
    sc.title = n ? `用 AI 把已有视频归到学科主题（未分类 ${n} 个）` : '用 AI 把已有视频归到学科主题'
  }
}

// 学科树
function renderTree() {
  const box = $('#catalogTree')
  if (!STATE.catalog.length) { box.innerHTML = '<div class="empty">还没有目录。点「AI 建目录」或「加科目」开始。</div>'; return }
  const rec = (nodes, depth) => nodes.map((n) => {
    const leaf = isLeaf(n)
    const count = leaf ? (n.videos || []).length : nodeCount(n)
    const done = leaf && isTopicDone(n)
    const active = (view.mode === 'topic' && view.topicId === n.id) || (view.mode === 'watch' && view.topicId === n.id)
    const caret = leaf ? '<span class="caret"></span>' : `<span class="caret">${collapsed.has(n.id) ? '▸' : '▾'}</span>`
    const kids = n.children && n.children.length
      ? `<ul class="${collapsed.has(n.id) ? 'collapsed' : ''}">${rec(n.children, depth + 1)}</ul>`
      : ''
    return `<li>${row(n, leaf, count, done, active, caret)}${kids}</li>`
  }).join('')
  box.innerHTML = `<ul class="tree">${rec(STATE.catalog, 0)}</ul>`
}
function row(n, leaf, count, done, active, caret) {
  const cls = ['row', leaf ? 'leaf' : 'branch', active ? 'active' : '', done ? 'done' : ''].filter(Boolean).join(' ')
  return `<div class="row ${cls}" data-id="${esc(n.id)}">${caret}<span class="name">${esc(n.name)}</span><span class="n">${count || ''}</span></div>`
}

// UP主 区：来源 + 未分类，各带视频名列表（展开后）
function renderUpList() {
  const box = $('#upList')
  const total = Object.keys(STATE.videos).length
  const cnt = $('#upCount'); if (cnt) cnt.textContent = total
  const caret = $('#upCaret'); if (caret) caret.textContent = upOpen ? '▾' : '▸'
  box.classList.toggle('up-collapsed', !upOpen)
  const blocks = [upBlock('', '', '未分类', unassigned())]
  for (const s of STATE.sources || []) {
    blocks.push(upBlock(String(s.id), srcTag(s.type), srcDisplayName(s), videosOfSource(s.id)))
  }
  box.innerHTML = blocks.join('') || '<div class="empty">还没有来源。点「粘贴 B 站链接」加入。</div>'
}
function upBlock(id, tag, label, bvids) {
  const watchingHere = view.mode === 'watch' && !view.topicId && view.sourceId === (id || null)
  const exp = expandedSrc.has(id) || watchingHere
  const active = (view.mode === 'sources' && view.sourceId === (id || null)) || watchingHere
  const caret = bvids.length ? `<span class="caret">${exp ? '▾' : '▸'}</span>` : '<span class="caret"></span>'
  const tagHtml = tag ? `<span class="tag">${esc(tag)}</span>` : ''
  let h = `<div class="src ${active ? 'active' : ''}" data-src="${esc(id)}">${caret}${tagHtml}<span class="name">${esc(label)}</span><span class="n">${bvids.length || ''}</span><button class="vassign" data-grid="${esc(id)}" title="查看全部（网格）">${ICONS.grid}</button></div>`
  if (exp && bvids.length) {
    h += `<ul class="vlist">${bvids.map((b) => {
      const v = STATE.videos[b]
      const t = topicOf(b)
      const cur = view.mode === 'watch' && view.bvid === b
      return `<li class="vitem ${cur ? 'cur' : ''}" data-video="${esc(b)}" data-src="${esc(id)}" title="${esc(v ? v.title : '')}">
        <span class="vt">${esc(v ? v.title : b)}</span>
        ${t ? `<span class="vtag" title="学科：${esc(t.name)}">${ICONS.dot}</span>` : ''}
        <button class="vassign" data-assign="${esc(b)}" title="调整学科分类">${ICONS.tag}</button>
      </li>`
    }).join('')}</ul>`
  }
  return h
}
function srcTag(type) { return { up: 'UP主', fav: '收藏夹', video: '视频' }[type] || '来源' }
// 来源显示名：名字为空或仍是网址时，退回「类型 id」短名，避免显示整条网址
function srcDisplayName(s) {
  const name = String((s && s.name) || '').trim()
  if (!name || /^https?:\/\//i.test(name) || /bilibili\.com/i.test(name)) {
    return `${srcTag(s && s.type)} ${String((s && s.id) || '')}`.trim()
  }
  return name
}

function renderContent() {
  const box = $('#content')
  box.removeAttribute('aria-busy')
  if (view.mode === 'watch' && view.bvid) return renderWatch(box)
  if (view.mode === 'topic' && view.topicId) return renderTopic(box)
  if (view.mode === 'sources') return renderSourcesView(box)
  renderOverview(box)
  showSide(false)
}

// ---- 概览 ----
function renderOverview(box) {
  const total = Object.keys(STATE.videos).length
  const seen = Object.keys(STATE.videos).filter((b) => STATE.progress[b] && STATE.progress[b].seen).length
  const unc = unassigned().length
  const first = firstUnfinished()
  let h = `<div class="hero"><h1>欢迎来到 B 站学习台 👋</h1>
    <p>聚合 B 站学习视频，按目录专注学习。已收录 <b>${total}</b> 个视频 · 已看 <b>${seen}</b> 个 · 未分类 <b>${unc}</b> 个。</p>
    <div class="row">`
  if (first) h += `<button class="btn primary" data-go="topic:${esc(first.id)}">接着学：${esc(first.name)}</button>`
  h += `<button class="btn" id="hintAi">${ICONS.sparkles}<span>用提示词生成目录</span></button>
      <button class="btn" id="hintLink">${ICONS.plus}<span>粘贴 B 站链接抓视频</span></button>
      <button class="btn" id="hintClassify">${ICONS.wand}<span>智能分类未分类视频</span></button></div></div>`
  if (unc) h += `<h2 class="title">未分类的视频</h2>${grid(unassigned())}`
  else h += `<div class="empty-state">还没有视频。<br>先从「粘贴 B 站链接」开始，把喜欢的博主主页加进来；再「AI 建目录」，把视频归到学科里。</div>`
  box.innerHTML = h
}
function firstUnfinished() {
  let out = null
  walk(STATE.catalog, (n) => { if (isLeaf(n) && (n.videos || []).length && !isTopicDone(n)) { out = n; return true } })
  return out
}

// ---- 主题 / 来源视图 ----
function renderTopic(box) {
  const n = findNode(view.topicId)
  if (!n) { box.innerHTML = '<p class="empty-state">没有这个主题。</p>'; return }
  const vs = (n.videos || []).map((b) => STATE.videos[b]).filter(Boolean)
  showSide(false)
  const path = ancestorPath(view.topicId).map((x) => esc(x.name)).join(' › ')
  const done = isTopicDone(n)
  const seenCount = (n.videos || []).filter((b) => STATE.progress[b] && STATE.progress[b].seen).length
  const totalCount = (n.videos || []).length
  const pct = totalCount ? Math.round(seenCount / totalCount * 100) : 0
  const progress = totalCount ? `<div class="progress">
    <div class="progress-label">已看 <b>${seenCount}</b> / ${totalCount}</div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
  </div>` : ''
  box.innerHTML = `<div class="crumb">${path}（右键目录项可重命名/删除）</div><h2 class="title">${esc(n.name)}${done ? '<span class="note">✓ 已学完</span>' : ''}</h2>${progress}
    ${n.note ? `<p class="crumb">${esc(n.note)}</p>` : ''}` + (vs.length ? grid(vs.map((v) => v.bvid)) : '<div class="empty-state">这个主题还没有视频。<br>点左侧 UP主 区的「归类」按钮，把视频归进来。</div>')
}
function renderSourcesView(box) {
  showSide(false)
  const list = view.sourceId ? videosOfSource(view.sourceId) : unassigned()
  const src = view.sourceId && (STATE.sources || []).find((s) => String(s.id) === String(view.sourceId))
  const title = view.sourceId ? (src ? `${srcTag(src.type)} · ${srcDisplayName(src)}` : '来源') : '未分类的视频'
  const hint = view.sourceId ? '<div class="crumb">点卡片下的「加入主题 / 调整分类」把视频归到学科目录；UP主 列表里视频会同时保留。</div>' : '<div class="crumb">这些视频还没归类。点卡片下的「加入主题」归到学科目录，或者用「智能分类」让 AI 一次处理。</div>'
  const scopeBtn = list.length ? `<button class="btn" data-act="smartClassify" data-source="${esc(view.sourceId || '')}">${ICONS.wand}<span>智能分类${view.sourceId ? '这个来源' : '未分类视频'}</span></button>` : ''
  box.innerHTML = `<div class="titlebar"><h2 class="title">${esc(title)}</h2>${scopeBtn}</div>${hint}` + (list.length ? grid(list) : '<div class="empty-state">这里还没有视频。</div>')
}

// ---- 观看 ----
function renderWatch(box) {
  const v = STATE.videos[view.bvid]
  if (!v) { box.innerHTML = '<p class="empty-state">没有这个视频。</p>'; return }
  showSide(true)
  markSeen(view.bvid)
  const p = view.part || 1
  const pages = v.pages || []
  const partbar = pages.length > 1 ? `<div class="partbar">${pages.map((pg) => `<button data-part="${pg.page}" class="${pg.page === p ? 'on' : ''}">P${pg.page} ${esc(pg.part)}</button>`).join('')}</div>` : ''
  const list = watchList()
  const i = list.indexOf(view.bvid)
  const nxt = list[i + 1]
  const t = topicOf(view.bvid)
  const subParts = []
  if (v.author) subParts.push(esc(v.author))
  subParts.push(`${fmtPlay(v.play)} 播放`)
  subParts.push(fmtDur(v.duration))
  if (v.collection) subParts.push(esc(v.collection))
  const subTail = t ? ` · 学科：<span class="tag">${esc(t.name)}</span>` : ' · 未归类'
  // 节内切换条：只在本节视频数 >1 时显示，和「下一个」按钮、j/k 快捷键并存
  const epbar = list.length > 1 && i >= 0 ? `<div class="epbar">
    <button class="epbtn" data-act="epPrev" title="上一个（k）" ${i <= 0 ? 'disabled' : ''}>‹</button>
    <span>第 <b>${i + 1}</b> / ${list.length} 个</span>
    <button class="epbtn" data-act="epNext" title="下一个（j）" ${i >= list.length - 1 ? 'disabled' : ''}>›</button>
  </div>` : ''
  const graph = t
    ? '<div class="watch-graph" id="watchGraphBox"></div>'
    : '<div class="graph-hint">这个视频还没归到「科目 › 章 › 主题」，所以没有知识图谱。右键视频标题把它归类后，就能看到相邻节之间的关系。</div>'
  box.innerHTML = `<div class="watch">
    <iframe class="player" allowfullscreen src="${playerSrc(v, p)}"></iframe>
    ${partbar}
    <div class="vtitle">${esc(v.title)}</div>
    <div class="vsub">${subParts.join(' · ')}${subTail}</div>
    <div class="bar">
      <a class="btn" href="${bvUrl(v, p)}" target="_blank" rel="noopener">去 B 站看（高清）↗</a>
      <button class="btn" data-act="classify">${ICONS.shuffle}<span>调整分类</span></button>
      ${nxt ? `<button class="btn" data-go="watch:${esc(nxt)}">下一个 →</button>` : ''}
      <button class="btn" data-act="toggleLater">${STATE.progress[view.bvid]?.later ? ICONS.starFill : ICONS.star}<span>${STATE.progress[view.bvid]?.later ? '已收藏' : '稍后看'}</span></button>
    </div>
    ${epbar}
    ${graph}
    <div class="crumb">快捷键：<span class="kbd">j</span>/<span class="kbd">k</span> 上下切换 · 右侧记笔记 · <b>右键</b>标题可调整分类</div>
  </div>`
  renderNotePane(v, p)
  if (t) refreshWatchGraph()
  requestAnimationFrame(() => {
    const on = box.querySelector('.partbar button.on')
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

// ---- 观看页知识图谱 ----
// 范围：当前视频所在节的本章全部节 + AI 连线里当前节的跨章前置节（淡色）
function watchGraphScope(topic) {
  if (!topic) return null
  const path = ancestorPath(topic.id)
  const subject = path[0] || null
  if (!subject) return null
  const chapter = path.length >= 2 ? path[path.length - 2] : subject
  const inChapter = []
  const rec = (nodes) => {
    for (const n of nodes || []) {
      if (isLeaf(n)) inChapter.push(n)
      else rec(n.children)
    }
  }
  rec(chapter.children)
  if (!inChapter.length) inChapter.push(topic)
  const ids = new Set(inChapter.map((n) => n.id))
  const links = ((STATE.links || {})[subject.id] || []).filter((e) => e && e.from && e.to)
  const extra = []
  const extraIds = new Set()
  for (const e of links) {
    if (e.to !== topic.id || e.from === topic.id || ids.has(e.from) || extraIds.has(e.from)) continue
    const n = findNode(e.from)
    if (n && isLeaf(n)) { extraIds.add(n.id); extra.push(n) }
  }
  return { subject, chapter, inChapter, extra, links }
}

function refreshWatchGraph() {
  const box = $('#watchGraphBox')
  if (!box) return
  const topic = topicOf(view.bvid)
  if (!topic) return
  const scope = watchGraphScope(topic)
  if (!scope) return
  const links = (STATE.links || {})[scope.subject.id]
  const has = Array.isArray(links) && links.length > 0
  const btns = has
    ? '<button class="btn small" data-act="linkRegen">重新生成</button><button class="btn small" data-act="linkClear">清除连线</button>'
    : '<button class="btn small primary" data-act="linkGen">AI 补前置连线</button>'
  box.innerHTML = `<div class="watch-graph-head"><span>知识图谱 · 本章 ${scope.inChapter.length} 节${scope.extra.length ? ` + ${scope.extra.length} 个前置` : ''}${has ? ' · 点连线可删除' : ''}</span><span class="btns">${btns}</span></div>
    <div id="watchGraphCanvas"></div>`
  const canvas = $('#watchGraphCanvas')
  if (!canvas) return
  const nodeIds = new Set([...scope.inChapter, ...scope.extra].map((n) => n.id))
  const nodes = [...scope.inChapter, ...scope.extra].map((n) => ({
    id: n.id,
    label: n.name,
    done: isTopicDone(n),
    empty: (n.videos || []).length === 0,
    dim: scope.extra.includes(n),
  }))
  // 渲染时忽略指向已删除主题的边
  const edges = scope.links.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)).map((e) => ({ from: e.from, to: e.to, type: '前置' }))
  renderGraph(canvas, {
    nodes,
    edges,
    highlight: topic.id,
    onNodeClick: (id) => gotoWatchNode(id),
    onEdgeClick: (edge, ev) => showLinkMenu(scope.subject.id, edge, ev),
  })
}

// 点图谱节点：进该节第一个还没看的视频；全看过进第一个；没有视频就打开该节网格
function gotoWatchNode(id) {
  const n = findNode(id)
  if (!n) return
  const cur = topicOf(view.bvid)
  if (view.mode === 'watch' && cur && cur.id === id) return
  const vs = (n.videos || []).filter((b) => STATE.videos[b])
  if (!vs.length) {
    view = { mode: 'topic', topicId: id, part: 1 }
    renderContent(); renderSide()
    return
  }
  const target = vs.find((b) => !(STATE.progress[b] && STATE.progress[b].seen)) || vs[0]
  view = { mode: 'watch', bvid: target, part: 1, topicId: id, sourceId: null }
  renderContent(); renderSide()
}

function showLinkMenu(subjectId, edge, ev) {
  showCtxMenu(ev && ev.clientX || 0, ev && ev.clientY || 0, [{
    label: '删除这条连线',
    html: `${ICONS.trash}<span>删除这条连线</span>`,
    danger: true,
    onClick: () => removeWatchLink(subjectId, edge),
  }])
}
function removeWatchLink(subjectId, edge) {
  const all = STATE.links || (STATE.links = {})
  const arr = all[subjectId]
  if (!Array.isArray(arr)) return
  all[subjectId] = arr.filter((e) => !(e && e.from === edge.from && e.to === edge.to))
  if (!all[subjectId].length) delete all[subjectId]
  persist(); refreshWatchGraph(); toast('已删除连线')
}

// AI 补前置连线：只请求、不写盘；拿到结果后由前端确认写入 STATE.links
async function generateWatchLinks() {
  const topic = topicOf(view.bvid)
  const scope = watchGraphScope(topic)
  if (!scope) return
  const subject = scope.subject
  const btns = $$('#watchGraphBox [data-act="linkGen"], #watchGraphBox [data-act="linkRegen"]')
  const labels = btns.map((b) => b.textContent)
  btns.forEach((b) => { b.disabled = true; b.textContent = '生成中…' })
  const restore = () => btns.forEach((b, k) => { b.disabled = false; b.textContent = labels[k] })
  try {
    const r = await fetch('/bili-study/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectId: subject.id, catalog: [subject] }),
    })
    const j = await r.json().catch(() => null)
    if (!j || !j.ok) { toast((j && j.error) || '生成失败'); restore(); return }
    const links = (Array.isArray(j.links) ? j.links : []).filter((e) => e && e.from && e.to && e.from !== e.to)
    if (!links.length) { toast('模型没有给出有效的前置连线'); restore(); return }
    STATE.links = STATE.links || {}
    STATE.links[subject.id] = links
    persist()
    refreshWatchGraph()
    toast(`已补 ${links.length} 条前置连线`)
  } catch (e) {
    toast('生成失败：' + ((e && e.message) || '网络错误'))
    restore()
  }
}
function clearWatchLinks() {
  const scope = watchGraphScope(topicOf(view.bvid))
  if (!scope) return
  if (STATE.links) delete STATE.links[scope.subject.id]
  persist(); refreshWatchGraph(); toast('已清除本科目的前置连线')
}
function renderNotePane(v, p) {
  const key = noteKey(v.bvid, p)
  const note = STATE.notes[key]
  $('#noteText').value = note ? note.text : ''
  $('#noteHint').textContent = note && note.updatedAt ? '已存 ' + fmtWhen(note.updatedAt) : '自动保存'
  $('#noteText').dataset.key = key
  if (notePreviewOn) $('#notePreview').innerHTML = renderRich($('#noteText').value)
}
function noteKey(bvid, p) { return p > 1 ? `${bvid}-p${p}` : bvid }
function fmtWhen(ts) { try { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` } catch { return '' } }
// 立即保存当前笔记（不等自动保存）
function saveNoteNow() {
  const ta = $('#noteText')
  const key = ta.dataset.key
  if (!key) return
  const n = STATE.notes[key] || (STATE.notes[key] = {})
  n.text = ta.value
  n.updatedAt = new Date().toISOString()
  if (ta.value.trim() && !n._rewarded) { n._rewarded = true; reward(10, '记笔记') }
  persist()
  $('#noteHint').textContent = '已保存 ' + fmtWhen(n.updatedAt)
  toast('笔记已保存')
}
function toggleNotePreview() {
  notePreviewOn = !notePreviewOn
  $('#notePreview').classList.toggle('hidden', !notePreviewOn)
  $('#btnPreview').classList.toggle('on', notePreviewOn)
  if (notePreviewOn) $('#notePreview').innerHTML = renderRich($('#noteText').value)
}

function showSide(on) { $('#sidePane').classList.toggle('hidden', !on) }

// ---- 视频网格 ----
function grid(bvids) {
  if (!bvids || !bvids.length) return '<div class="empty-state">这里还没有视频。</div>'
  return `<div class="grid">${bvids.map((b) => card(STATE.videos[b], b)).join('')}</div>`
}
function card(v, b) {
  if (!v) return ''
  const seen = STATE.progress[b] && STATE.progress[b].seen
  const img = v.pic ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(v.pic)}@480w_270h.jpg" alt="">` : ''
  const t = topicOf(b)
  const inSourceView = view.mode === 'sources' || view.mode === 'overview'
  const menuBtn = inSourceView ? `<button class="card-menu" data-menu="${esc(b)}" title="${t ? '调整分类' : '加入主题'}">${ICONS.more}</button>` : ''
  const metaParts = []
  if (v.author) metaParts.push(v.author)
  metaParts.push(`${fmtPlay(v.play)} 播放`)
  if (t) metaParts.push(`学科：${t.name}`)
  return `<div class="card ${seen ? 'seen' : ''}" data-open="${esc(b)}">
    <div class="thumb">${img}${menuBtn}${seen ? `<span class="seen-check" title="已看过">${ICONS.check}</span>` : ''}<span class="d">${fmtDur(v.duration)}</span></div>
    <div class="meta"><div class="t">${esc(v.title)}</div><div class="s">${esc(metaParts.join(' · '))}</div></div>
  </div>`
}

// ---- 奖励（脚本化规则）----
function dayStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function todayStr() { return dayStr(new Date()) }
// 今天看完的视频数（progress[b].seen 存的是看过的毫秒时间戳）
function todaySeenCount() {
  const today = todayStr()
  let n = 0
  for (const b of Object.keys(STATE.progress || {})) {
    const p = STATE.progress[b]
    if (!p || !p.seen) continue
    const ts = typeof p.seen === 'number' ? p.seen : Date.parse(p.seen)
    if (ts && dayStr(new Date(ts)) === today) n++
  }
  return n
}
function touchStreak() {
  const r = STATE.rewards
  const today = todayStr()
  if (r.lastActive !== today) {
    const y = new Date(Date.now() - 86400e3)
    const ystr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
    r.streak = r.lastActive === ystr ? (r.streak || 0) + 1 : 1
    r.best = Math.max(r.best || 0, r.streak)
    r.lastActive = today
  }
}
function reward(delta, label) {
  touchStreak()
  const r = STATE.rewards
  r.points = (r.points || 0) + delta
  r.log = r.log || []
  r.log.unshift({ t: new Date().toISOString(), delta, label })
  if (r.log.length > 50) r.log.length = 50
  updateBadges()
  if (delta > 0) toast(`⭐ +${delta} ${label}`)
  renderHeader()
}
function countDoneTopics() { let c = 0; walk(STATE.catalog, (n) => { if (isLeaf(n) && isTopicDone(n)) c++ }); return c }
// 徽章定义：cur/goal 同时用于解锁判断和「还差多少」的进度文案
function badgeDefs() {
  const r = STATE.rewards || {}
  const seen = Object.keys(STATE.progress || {}).filter((b) => STATE.progress[b] && STATE.progress[b].seen).length
  const notes = Object.keys(STATE.notes || {}).filter((k) => { const n = STATE.notes[k]; return n && n.text && n.text.trim() }).length
  const defs = [
    { id: 'first', ico: '🎯', n: '初来乍到', cur: seen, goal: 1, unit: '个视频' },
    { id: 'notes', ico: '📝', n: '笔记达人', cur: notes, goal: 1, unit: '篇笔记' },
    { id: 'streak3', ico: '🔥', n: '连续 3 天', cur: r.streak || 0, goal: 3, unit: '天' },
    { id: 'topic', ico: '🏆', n: '学完一个主题', cur: countDoneTopics(), goal: 1, unit: '个主题' },
    { id: 'v10', ico: '📚', n: '看完 10 个视频', cur: seen, goal: 10, unit: '个视频' },
    { id: 'p100', ico: '💯', n: '累计 100 分', cur: r.points || 0, goal: 100, unit: '分' },
    { id: 'streak7', ico: '⚡', n: '连续 7 天', cur: r.streak || 0, goal: 7, unit: '天' },
    { id: 'v50', ico: '🎓', n: '看完 50 个视频', cur: seen, goal: 50, unit: '个视频' },
  ]
  for (const d of defs) d.cond = d.cur >= d.goal
  return defs
}
function updateBadges() {
  const r = STATE.rewards
  const have = new Set(r.badges || [])
  for (const d of badgeDefs()) if (d.cond && !have.has(d.id)) have.add(d.id)
  r.badges = [...have]
}
function markSeen(bvid) {
  if (!bvid || !STATE.videos[bvid]) return
  const p = STATE.progress[bvid] || (STATE.progress[bvid] = {})
  if (!p.seen) { p.seen = Date.now(); reward(10, '看完一个视频') }
  if (view.topicId) {
    const n = findNode(view.topicId)
    if (n && isTopicDone(n) && !n.__doneRewarded) { n.__doneRewarded = true; reward(20, '学完一个主题 🎉') }
  }
  // 记住当前位置，下次进入直接回到这里
  STATE.lastWatch = { bvid, part: view.part || 1, topicId: view.topicId || null, sourceId: view.sourceId || null }
  renderHeader(); renderTree(); persist()
}

// ---- 右键菜单 ----
function showCtxMenu(x, y, items) {
  const m = $('#ctxmenu')
  m.innerHTML = items.map((it, i) => `<div class="ctx-item ${it.danger ? 'danger' : ''}" data-i="${i}">${it.html || esc(it.label)}</div>`).join('')
  m._items = items
  m.style.display = 'block'
  const r = m.getBoundingClientRect()
  let left = x, top = y
  if (left + r.width > innerWidth - 8) left = innerWidth - r.width - 8
  if (top + r.height > innerHeight - 8) top = innerHeight - r.height - 8
  m.style.left = left + 'px'; m.style.top = top + 'px'
}
function hideCtxMenu() { $('#ctxmenu').style.display = 'none' }

// 宿主窗口按钮占位：侧栏收起时，dsh 会把「打开侧边栏」等按钮浮在主区域左上角。
// 页面在 iframe 里，读取宿主发布的 --dsh-frame-leading-clearance，让顶栏这排内容右移让开。
function syncHostInset() {
  let inset = 0
  try {
    const frame = window.frameElement
    if (frame) {
      const view = frame.ownerDocument && frame.ownerDocument.defaultView
      const raw = view ? view.getComputedStyle(frame).getPropertyValue('--dsh-frame-leading-clearance') : ''
      inset = parseFloat(raw) || 0
      if (!inset) {
        // 没有这个变量时，直接量一下宿主左上角按钮区
        const seat = frame.ownerDocument.querySelector('[data-shell-leading]')
        if (seat) {
          const fr = frame.getBoundingClientRect()
          const sr = seat.getBoundingClientRect()
          if (sr.right > fr.left && sr.left < fr.right && sr.bottom > fr.top) {
            inset = Math.max(0, Math.ceil(sr.right - fr.left + 12))
          }
        }
      }
    }
  } catch { inset = 0 }
  document.documentElement.style.setProperty('--host-leading-inset', `${Math.min(260, Math.max(0, inset))}px`)
}

// ---- 交互绑定 ----
function bind() {
  // 学科树：点击（展开/进主题）+ 右键（重命名/删除）
  $('#catalogTree').addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]')
    if (!row) return
    const n = findNode(row.dataset.id)
    if (!n) return
    if (isLeaf(n)) { view = { mode: 'topic', topicId: n.id, part: 1 }; renderContent(); renderSide() }
    else { if (collapsed.has(n.id)) collapsed.delete(n.id); else collapsed.add(n.id); renderTree() }
  })
  $('#catalogTree').addEventListener('contextmenu', (e) => {
    const row = e.target.closest('[data-id]')
    if (!row) return
    e.preventDefault()
    const id = row.dataset.id
    const n = findNode(id)
    if (!n) return
    showCtxMenu(e.clientX, e.clientY, [
      { label: '重命名', html: `${ICONS.pencil}<span>重命名</span>`, onClick: () => openRename(id) },
      { label: '删除', html: `${ICONS.trash}<span>删除</span>`, danger: true, onClick: () => deleteNode(id) },
    ])
  })
  // UP主 区：点击（展开/进来源、点视频看、归类、查看网格）
  $('#upList').addEventListener('click', (e) => {
    const assign = e.target.closest('[data-assign]')
    if (assign) { openMoveAssign(assign.dataset.assign); return }
    const grid = e.target.closest('[data-grid]')
    if (grid) { view = { mode: 'sources', sourceId: grid.dataset.grid || null, part: 1 }; renderContent(); renderSide(); return }
    const vid = e.target.closest('[data-video]')
    if (vid) { openVideoFromSource(vid.dataset.video, vid.dataset.src || null); return }
    const src = e.target.closest('[data-src]')
    if (src) {
      const id = src.dataset.src
      if (expandedSrc.has(id)) expandedSrc.delete(id); else expandedSrc.add(id)
      renderUpList()
    }
  })
  // UP主 区标题：点击展开/收起
  $('#upHead').addEventListener('click', () => { upOpen = !upOpen; renderUpList() })
  // 内容区事件（事件委托）
  $('#content').addEventListener('click', (e) => {
    const menu = e.target.closest('[data-menu]')
    if (menu) {
      e.stopPropagation()
      const b = menu.dataset.menu
      const cur = topicOf(b)
      const r = menu.getBoundingClientRect()
      showCtxMenu(r.right - 8, r.bottom + 4, [{
        label: cur ? '调整学科分类' : '加入学科分类',
        html: (cur ? ICONS.shuffle : ICONS.folder) + `<span>${cur ? '调整学科分类' : '加入学科分类'}</span>`,
        onClick: () => openMoveAssign(b),
      }])
      return
    }
    const assign = e.target.closest('[data-assign]')
    if (assign) { openMoveAssign(assign.dataset.assign); return }
    const card = e.target.closest('[data-open]')
    if (card) { openVideo(card.dataset.open); return }
    const go = e.target.closest('[data-go]')
    if (go) { const [m, arg] = go.dataset.go.split(':'); if (m === 'topic') { view = { mode: 'topic', topicId: arg, part: 1 } } else if (m === 'watch') { openVideo(arg) } renderContent(); return }
    const act = e.target.closest('[data-act]')
    if (act && act.dataset.act === 'toggleLater') { const p = STATE.progress[view.bvid] || (STATE.progress[view.bvid] = {}); if (p.later) delete p.later; else p.later = Date.now(); renderContent(); persist(); return }
    if (act && act.dataset.act === 'classify') { openMoveAssign(view.bvid); return }
    if (act && act.dataset.act === 'smartClassify') { openSmartClassify(act.dataset.source || null); return }
    if (act && (act.dataset.act === 'epPrev' || act.dataset.act === 'epNext')) {
      const list = watchList()
      const i = list.indexOf(view.bvid)
      const target = list[i + (act.dataset.act === 'epNext' ? 1 : -1)]
      if (target) openVideo(target)
      return
    }
    if (act && (act.dataset.act === 'linkGen' || act.dataset.act === 'linkRegen')) { generateWatchLinks(); return }
    if (act && act.dataset.act === 'linkClear') { clearWatchLinks(); return }
    const part = e.target.closest('[data-part]')
    if (part) { view.part = Number(part.dataset.part); renderContent(); return }
    if (e.target.closest('#hintAi')) return openAiCatalog()
    if (e.target.closest('#hintLink')) return openAddSource()
    if (e.target.closest('#hintClassify')) return openSmartClassify()
  })
  // 观看页右键 → 调整分类
  $('#content').addEventListener('contextmenu', (e) => {
    if (view.mode !== 'watch' || !view.bvid) return
    if (!e.target.closest('.watch')) return
    e.preventDefault()
    const b = view.bvid
    const cur = topicOf(b)
    const items = [{ label: cur ? '调整学科分类…' : '加入学科分类…', html: (cur ? ICONS.shuffle : ICONS.folder) + `<span>${cur ? '调整学科分类…' : '加入学科分类…'}</span>`, onClick: () => openMoveAssign(b) }]
    if (cur) items.push({ label: `移出「${cur.name}」`, danger: true, onClick: () => { removeVideoFromTopic(b); persist(); refreshUI(); toast('已移出分类') } })
    showCtxMenu(e.clientX, e.clientY, items)
  })
  // 右键菜单自身
  $('#ctxmenu').addEventListener('click', (e) => {
    const it = e.target.closest('[data-i]')
    if (!it) return
    const fn = ($('#ctxmenu')._items || [])[Number(it.dataset.i)]?.onClick
    hideCtxMenu()
    if (fn) fn()
  })
  addEventListener('click', hideCtxMenu)
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideCtxMenu(); closeFormulaPop(); closeModal() } })
  // 顶栏
  $('#btnAiCatalog').onclick = openAiCatalog
  $('#btnAddSource').onclick = openAddSource
  $('#btnSmartClassify').onclick = () => openSmartClassify()
  $('#btnAddSubject').onclick = openAddSubject
  $('#btnExport').onclick = exportNotes
  $('#btnRewards').onclick = openRewards
  // 笔记
  const ta = $('#noteText')
  ta.addEventListener('input', () => {
    const key = ta.dataset.key; if (!key) return
    const n = STATE.notes[key] || (STATE.notes[key] = {})
    n.text = ta.value; n.updatedAt = new Date().toISOString()
    saveState()
    if (ta.value.trim() && !n._rewarded) { n._rewarded = true; reward(10, '记笔记') }
    if (notePreviewOn) $('#notePreview').innerHTML = renderRich(ta.value)
  })
  ta.addEventListener('blur', () => { if (ta.dataset.key) persist() })
  $('#btnSaveNote').onclick = saveNoteNow
  $('#btnPreview').onclick = toggleNotePreview
  // 公式符号浮层：插入算式模板 / 数学符号；插入后保持打开，方便连续插入
  const fpop = $('#formulaPop')
  fpop.innerHTML = FORMULA_BAR.map((f) => `<button class="fbtn" data-tex="${esc(f.tex)}" data-cur="${f.cur ?? ''}">${esc(f.label)}</button>`).join('')
  fpop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tex]'); if (!b) return
    e.stopPropagation()
    insertAtCursor($('#noteText'), b.dataset.tex, b.dataset.cur ? Number(b.dataset.cur) : undefined)
  })
  $('#btnFormula').onclick = (e) => { e.stopPropagation(); toggleFormulaPop() }
  // 点面板外关闭（按钮 / 面板内的点击已 stopPropagation，不会被这里立刻关掉）
  addEventListener('click', (e) => {
    if (e.target.closest && (e.target.closest('#formulaPop') || e.target.closest('#btnFormula'))) return
    closeFormulaPop()
  })
  // AI
  $('#presets').innerHTML = PRESETS.map((p) => `<button data-preset="${p.id}" class="${p.id === selPreset ? 'on' : ''}">${esc(p.label)}</button>`).join('')
  $('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]'); if (!b) return
    selPreset = b.dataset.preset
    $$('#presets button').forEach((x) => x.classList.toggle('on', x.dataset.preset === selPreset))
  })
  $('#btnAsk').onclick = askAi
  $('#aiConcept').addEventListener('keydown', (e) => { if (e.key === 'Enter') askAi() })
  // 明暗主题
  addEventListener('message', (e) => {
    if (e.origin !== location.origin) return
    const m = e.data
    if (m && m.type === 'bili-study:scheme') document.documentElement.dataset.scheme = m.scheme
  })
  // 侧栏收起/展开会改变 iframe 宽度，重新量一次左上角按钮占位
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncHostInset).observe(document.documentElement)
  else addEventListener('resize', syncHostInset)
  // 回到面板时刷新（模型工具可能改了状态）；观看时只刷新侧栏和顶栏，不打断播放
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshSoft() })
  // 快捷键
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName)) return
    if (view.mode !== 'watch') return
    const list = watchList()
    const i = list.indexOf(view.bvid)
    if (e.key === 'j' && list[i + 1]) openVideo(list[i + 1])
    else if (e.key === 'k' && list[i - 1]) openVideo(list[i - 1])
  })
}

function openVideo(bvid) {
  const v = STATE.videos[bvid]; if (!v) return
  let topicId = view.topicId
  let sourceId = view.sourceId
  if (!topicId && !sourceId) {
    const t = topicOf(bvid)
    if (t) topicId = t.id
  }
  view = { mode: 'watch', bvid, part: 1, topicId, sourceId }
  renderContent(); renderSide()
}
function openVideoFromSource(bvid, sourceId) {
  const v = STATE.videos[bvid]; if (!v) return
  view = { mode: 'watch', bvid, part: 1, topicId: null, sourceId: sourceId || null }
  renderContent(); renderSide()
}

// ---- 弹层 / 提示 ----
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show')
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600)
}
function openModal(html) { $('#modal').innerHTML = `<div class="modal-mask">${html}</div>`; const x = $('#modal .modal'); if (x && x.querySelector('input,textarea')) x.querySelector('input,textarea').focus() }
function closeModal() {
  // 关掉进度弹层（点遮罩 / Esc）就中止还在跑的智能分类，避免它结束后又弹回来
  if (classifyRun) { classifyRun.aborted = true; classifyRun = null }
  $('#modal').innerHTML = ''
}
$('#modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal-mask')) closeModal() })

// ---- AI 建目录 / 问 AI ----
function startChat(prompt) {
  parent.postMessage({ type: 'bili-study:start', prompt }, location.origin)
}
function openAiCatalog() {
  openModal(`<div class="modal">
    <h2>${ICONS.sparkles}<span>用提示词生成学习目录</span></h2>
    <p class="desc">描述你想学的领域，AI 会生成「科目 → 章 → 主题」的大纲，存进左侧「学科」目录。<br>视频之后由你粘贴 B 站链接填充（这一步纯脚本，不费 AI）。</p>
    <div class="field"><label>你的学习需求</label><textarea id="aiPrompt" placeholder="例如：我想系统学习高中物理（人教版），从必修一开始……"></textarea></div>
    <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="doAiCatalog">生成目录</button></div>
  </div>`)
  $('#doAiCatalog').onclick = () => {
    const p = $('#aiPrompt').value.trim()
    if (!p) return toast('先写一句你想学的领域')
    closeModal()
    startChat(`请根据我的学习需求，生成一份「学习视频目录」大纲（只给结构化大纲，不要视频链接、不要 BV 号）。

我的需求：${p}

要求：
1. 面向学习领域（K12 或成人学习均可），用中文。
2. 结构最多三层：科目 → 章 → 主题，叶子节点是具体学习主题。
3. 覆盖该领域主要知识点，数量适中（每个科目 3-6 章，每章 3-8 个主题）。
4. 生成后调用工具 bili_study_save_catalog 保存。catalog 参数结构：
   [{ "name": "科目", "children": [{ "name": "章", "children": [{ "name": "主题" }] }] }]
   叶子节点不要 children，也不要 videos。`)
    toast('已生成草稿，去对话发送后，目录会出现在这里')
  }
}
async function askAi() {
  const c = $('#aiConcept').value.trim()
  if (!c) return toast('先输入一个概念')
  const preset = PRESETS.find((p) => p.id === selPreset) || PRESETS[0]
  const tail = preset.id === 'map'
    ? '\n\n（这是我正在看的学习视频里的概念。请按上面的要求输出，graph 代码块放在最后，内容是合法 JSON。）'
    : preset.id === 'explore'
      ? '\n\n（这是我正在看的学习视频里的概念，请只输出文字。）'
      : '\n\n（这是我正在看的学习视频里的概念，请面向学习给我讲清楚，别太长。）'
  const prompt = preset.tpl.replace('{x}', c) + tail
  const box = $('#aiAnswer')
  const btn = $('#btnAsk')
  box.innerHTML = '<div class="ai-loading"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">思考中…</span></div>'
  btn.disabled = true
  try {
    const r = await fetch('/bili-study/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: prompt, preset: preset.id }) })
    const j = await r.json()
    if (j.ok) {
      // 知识图谱预设：先抽出 ```graph 块画在答案上方，其余文字照旧走 renderRich；解析失败只显示文字
      const ex = extractGraph(j.answer)
      box.innerHTML = `${ex.graph ? '<div class="ai-graph" id="aiGraph"></div>' : ''}<div class="ai-answer-text">${renderAnswer(ex.rest)}</div>`
      if (ex.graph) {
        renderGraph($('#aiGraph'), {
          nodes: ex.graph.nodes,
          edges: ex.graph.edges,
          highlight: graphHighlightId(ex.graph, c),
        })
      }
    } else {
      box.innerHTML = `<div class="chat-hint" style="color:var(--danger)">${esc(j.error || '查询失败')}</div>`
    }
  } catch (e) {
    box.innerHTML = `<div class="chat-hint" style="color:var(--danger)">查询失败：${esc(e && e.message)}</div>`
  } finally {
    btn.disabled = false
  }
}
function renderAnswer(text) { return renderRich(text) }

// 从回答里抠出 ```graph 代码块（也接受 ```json / 无语言标记的合法图谱）；解析失败就当没有
function extractGraph(text) {
  const src = String(text ?? '')
  const re = /```[ \t]*(graph|json)?[ \t]*\r?\n?([\s\S]*?)```/g
  let m
  while ((m = re.exec(src))) {
    const body = (m[2] || '').trim()
    if (!body) continue
    let data
    try { data = JSON.parse(body) } catch { continue }
    if (!data || !Array.isArray(data.nodes) || !data.nodes.length) continue
    const graph = normalizeGraph(data)
    if (!graph.nodes.length) continue
    const rest = (src.slice(0, m.index) + src.slice(m.index + m[0].length)).replace(/\n{3,}/g, '\n\n').trim()
    return { graph, rest }
  }
  return { graph: null, rest: src }
}
function normalizeGraph(data) {
  const nodes = []
  const ids = new Set()
  for (const n of Array.isArray(data && data.nodes) ? data.nodes : []) {
    if (!n || typeof n !== 'object') continue
    const id = n.id === undefined || n.id === null ? '' : String(n.id)
    if (!id || ids.has(id) || nodes.length >= 60) continue
    ids.add(id)
    nodes.push({ id, label: String(n.label ?? n.name ?? id), highlighted: n.highlight === true || n.root === true })
  }
  const edges = []
  for (const e of Array.isArray(data && data.edges) ? data.edges : []) {
    if (!e || typeof e !== 'object') continue
    const from = String(e.from ?? '')
    const to = String(e.to ?? '')
    if (!ids.has(from) || !ids.has(to) || from === to) continue
    edges.push({ from, to, type: String(e.type ?? '') })
  }
  return { nodes, edges }
}
// 找出 {x} 本身对应的节点：先精确匹配，再包含匹配，最后看模型自己标的高亮
function graphHighlightId(graph, concept) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase()
  const c = norm(concept)
  const ns = (graph && graph.nodes) || []
  let hit = ns.find((n) => norm(n.label) === c || norm(n.id) === c)
  if (!hit) hit = ns.find((n) => { const l = norm(n.label); return !!l && !!c && (l.includes(c) || c.includes(l)) })
  if (!hit) hit = ns.find((n) => n.highlighted)
  return hit ? hit.id : null
}

// 富文本渲染：Markdown（标题/列表/段落/加粗/代码）+ LaTeX 公式（$...$ 行内，$$...$$ 独立行）
function renderRich(text) {
  // 归一化其它常见 LaTeX 定界符：\(...\) → $...$，\[...\] → $$...$$
  text = String(text ?? '')
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => '$$' + m + '$$')
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => '$' + m + '$')
  // 先整体转义 HTML，再把公式抽成占位符交给 KaTeX；占位符不参与后续 Markdown 替换
  const safe = esc(text)
  const math = []
  const withPh = safe.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (whole, display, inline) => {
    const isDisplay = display !== undefined
    const latex = unescapeMath((isDisplay ? display : inline).trim())
    let out = whole
    try {
      if (window.katex) out = window.katex.renderToString(latex, { throwOnError: false, displayMode: isDisplay })
    } catch { /* 渲染失败保留原文 */ }
    const idx = math.push({ html: out, display: isDisplay }) - 1
    return `\u0000${idx}\u0000`
  })
  return markdownBlocks(withPh.split('\n'), math)
}

// 转义后的 LaTeX 需要还原 & < > 等实体，否则 KaTeX 会把它们当普通字符
function unescapeMath(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

// 行内格式：**加粗**、`代码`、公式占位符（HTML 已整体转义过，安全）
function inlineFormat(s, math) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => (math[Number(i)] ? math[Number(i)].html : ''))
}

// 块级 Markdown：空行分段、#/##/### 标题、- / 1. 列表、独立成行的公式
function markdownBlocks(lines, math) {
  const out = []
  let para = []
  let list = null
  const flushPara = () => {
    if (!para.length) return
    out.push(`<p>${para.map((l) => inlineFormat(l, math)).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (!list) return
    out.push(`<${list.type}>${list.items.map((i) => `<li>${inlineFormat(i, math)}</li>`).join('')}</${list.type}>`)
    list = null
  }
  for (const line of lines) {
    const t = line.trim()
    if (!t) { flushPara(); flushList(); continue }
    const h = t.match(/^(#{1,3})\s+(.+)$/)
    if (h) {
      flushPara(); flushList()
      const lv = Math.min(h[1].length + 2, 5)
      out.push(`<h${lv}>${inlineFormat(h[2], math)}</h${lv}>`)
      continue
    }
    // 独立成行的 $$...$$ 直接作为块输出，避免被 <p> 包住
    const ph = t.match(/^\u0000(\d+)\u0000$/)
    if (ph && math[Number(ph[1])] && math[Number(ph[1])].display) {
      flushPara(); flushList(); out.push(math[Number(ph[1])].html); continue
    }
    const ul = t.match(/^[-*]\s+(.+)$/)
    if (ul) {
      flushPara()
      if (list && list.type === 'ul') list.items.push(ul[1])
      else { flushList(); list = { type: 'ul', items: [ul[1]] } }
      continue
    }
    const ol = t.match(/^\d+\.\s+(.+)$/)
    if (ol) {
      flushPara()
      if (list && list.type === 'ol') list.items.push(ol[1])
      else { flushList(); list = { type: 'ol', items: [ol[1]] } }
      continue
    }
    flushList(); para.push(t)
  }
  flushPara(); flushList()
  return out.join('')
}

// 在 textarea 光标处插入文本（可选把光标放到插入文本内第 cur 个字符后）
function insertAtCursor(ta, text, cur) {
  const start = ta.selectionStart ?? ta.value.length
  const end = ta.selectionEnd ?? start
  ta.setRangeText(text, start, end, 'end')
  const pos = start + (cur ?? text.length)
  ta.selectionStart = ta.selectionEnd = pos
  ta.focus()
  ta.dispatchEvent(new Event('input'))
}

// 公式符号浮层：绝对定位在「∑ 公式」按钮下方，盖住笔记输入框，不改变布局
function openFormulaPop() {
  const pop = $('#formulaPop')
  const btn = $('#btnFormula')
  const pane = $('#notePane')
  if (!pop || !btn || !pane) return
  const pr = pane.getBoundingClientRect()
  const br = btn.getBoundingClientRect()
  pop.style.top = `${Math.max(0, Math.round(br.bottom - pr.top + 6))}px`
  pop.classList.remove('hidden')
  btn.classList.add('on')
  btn.setAttribute('aria-expanded', 'true')
}
function closeFormulaPop() {
  const pop = $('#formulaPop')
  const btn = $('#btnFormula')
  if (pop) pop.classList.add('hidden')
  if (btn) { btn.classList.remove('on'); btn.setAttribute('aria-expanded', 'false') }
}
function toggleFormulaPop() {
  const pop = $('#formulaPop')
  if (!pop) return
  if (pop.classList.contains('hidden')) openFormulaPop()
  else closeFormulaPop()
}

// ---- 通用知识图谱渲染器 ----
// 手写 SVG，不引库。有边时按边做拓扑分层（自动丢掉成环的边），无边时按给定顺序排列。
// 颜色只用 style.css 里的主题变量（--accent / --accent-soft / --line / --mute / --ink / --panel），自动跟随明暗主题。
// 节点可带 done（打 ✓）/ empty（灰色虚框）/ dim（淡色）状态；highlight 传当前节点的 id。
// 节点多时容器内横向滚动，不撑破页面。
let graphSeq = 0
const GRAPH_FONT = 12
const GRAPH_LINE = 16

function graphCharW(ch) {
  return /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(ch) ? GRAPH_FONT : GRAPH_FONT * 0.58
}
function graphTextW(s) {
  let w = 0
  for (const ch of String(s)) w += graphCharW(ch)
  return w
}
// 折成最多两行；第二行还放不下就截断加省略号
function graphWrap(text, maxW = 150) {
  const chars = [...String(text ?? '').trim()]
  if (!chars.length) return ['·']
  const lines = []
  let cur = ''
  let w = 0
  for (const ch of chars) {
    const cw = graphCharW(ch)
    if (cur && w + cw > maxW) {
      if (lines.length === 1) {
        let tail = cur
        while (tail && graphTextW(tail + '…') > maxW) tail = tail.slice(0, -1)
        lines.push((tail || cur.slice(0, 1)) + '…')
        return lines
      }
      lines.push(cur)
      cur = ''
      w = 0
    }
    cur += ch
    w += cw
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['·']
}

function renderGraph(box, opts) {
  if (!box) return
  const o = opts || {}
  const seq = ++graphSeq
  const hi = new Set(Array.isArray(o.highlight) ? o.highlight.map(String) : o.highlight == null ? [] : [String(o.highlight)])
  const nodes = []
  const byId = new Map()
  for (const raw of Array.isArray(o.nodes) ? o.nodes : []) {
    if (!raw || raw.id === undefined || raw.id === null) continue
    const id = String(raw.id)
    if (!id || byId.has(id) || nodes.length >= 60) continue
    const n = {
      id,
      label: String(raw.label ?? raw.name ?? id),
      done: !!raw.done,
      empty: !!raw.empty,
      dim: !!raw.dim,
      highlight: !!raw.highlight || hi.has(id),
    }
    n.text = n.done ? `✓ ${n.label}` : n.label
    byId.set(id, n)
    nodes.push(n)
  }
  if (!nodes.length) { box.innerHTML = ''; return }

  const edges = []
  const edgeSeen = new Set()
  for (const raw of Array.isArray(o.edges) ? o.edges : []) {
    if (!raw) continue
    const from = String(raw.from ?? '')
    const to = String(raw.to ?? '')
    // 忽略指向已删除节点 / 自环 / 重复的边
    if (!byId.has(from) || !byId.has(to) || from === to) continue
    const key = `${from}\u0000${to}`
    if (edgeSeen.has(key)) continue
    edgeSeen.add(key)
    edges.push({ from, to, type: String(raw.type ?? '') })
  }

  // 破环：DFS 时丢掉指回当前栈上的边
  const out = new Map(nodes.map((n) => [n.id, []]))
  for (const e of edges) out.get(e.from).push(e.to)
  const mark = new Map()
  const acyclic = []
  const seen = new Set()
  const dfs = (u) => {
    mark.set(u, 1)
    for (const v of out.get(u) || []) {
      const m = mark.get(v) || 0
      if (m === 1) continue
      const key = `${u}\u0000${v}`
      if (!seen.has(key)) { seen.add(key); acyclic.push([u, v]) }
      if (!m) dfs(v)
    }
    mark.set(u, 2)
  }
  for (const n of nodes) if (!mark.get(n.id)) dfs(n.id)
  const drawEdges = edges.filter((e) => seen.has(`${e.from}\u0000${e.to}`))

  // 拓扑分层：layer = 最长前置路径
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const adj = new Map(nodes.map((n) => [n.id, []]))
  for (const [u, v] of acyclic) {
    indeg.set(v, (indeg.get(v) || 0) + 1)
    adj.get(u).push(v)
  }
  const layer = new Map(nodes.map((n) => [n.id, 0]))
  const queue = nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id)
  const left = new Map(indeg)
  const ordered = new Set()
  while (queue.length) {
    const u = queue.shift()
    ordered.add(u)
    for (const v of adj.get(u)) {
      layer.set(v, Math.max(layer.get(v) || 0, (layer.get(u) || 0) + 1))
      left.set(v, left.get(v) - 1)
      if (!left.get(v)) queue.push(v)
    }
  }
  for (const n of nodes) if (!ordered.has(n.id)) layer.set(n.id, 0)

  const rows = [...new Set(nodes.map((n) => layer.get(n.id) || 0))]
    .sort((a, b) => a - b)
    .map((l) => nodes.filter((n) => (layer.get(n.id) || 0) === l))

  // 尺寸与排布
  const PADX = 12, PADY = 9, GAPX = 26, GAPY = 44, MARGIN = 6
  for (const n of nodes) {
    n.lines = graphWrap(n.text)
    n.w = Math.max(56, Math.ceil(Math.max(...n.lines.map(graphTextW)) + PADX * 2))
    n.h = n.lines.length * GRAPH_LINE + PADY * 2
  }
  const rowH = rows.map((r) => Math.max(...r.map((n) => n.h)))
  const rowW = rows.map((r) => r.reduce((s, n) => s + n.w, 0) + Math.max(0, r.length - 1) * GAPX)
  const totalW = Math.max(200, ...rowW)
  const totalH = Math.max(64, rowH.reduce((s, h) => s + h, 0) + Math.max(0, rows.length - 1) * GAPY + MARGIN * 2)
  let cursorY = MARGIN
  rows.forEach((row, ri) => {
    let x = MARGIN + (totalW - rowW[ri]) / 2
    for (const n of row) {
      n.x = x
      n.y = cursorY + (rowH[ri] - n.h) / 2
      x += n.w + GAPX
    }
    cursorY += rowH[ri] + GAPY
  })

  const edgeSvg = drawEdges.map((e, i) => {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    const x1 = a.x + a.w / 2, y1 = a.y + a.h
    const x2 = b.x + b.w / 2, y2 = b.y - 4
    const dy = Math.max(26, (y2 - y1) * 0.5)
    const d = `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    let label = ''
    if (e.type) {
      const w = Math.ceil(graphTextW(e.type)) + 8
      label = `<rect class="gedge-label-bg" x="${mx - w / 2}" y="${my - 9}" width="${w}" height="16" rx="4"></rect><text class="gedge-label" x="${mx}" y="${my + 3.4}" text-anchor="middle" font-size="9.5">${esc(e.type)}</text>`
    }
    return `<g class="gedge-g" data-gedge="${i}">
      <path class="gedge-hit" d="${d}" style="stroke-width:12;pointer-events:stroke"></path>
      <path class="gedge" d="${d}" marker-end="url(#bili-arrow-${seq})"></path>
      ${label}
    </g>`
  }).join('')

  const nodeSvg = nodes.map((n) => {
    const cls = ['gnode', n.done ? 'done' : '', n.empty ? 'empty' : '', n.highlight ? 'hi' : '', o.onNodeClick ? 'clickable' : ''].filter(Boolean).join(' ')
    const top = n.y + n.h / 2 - ((n.lines.length - 1) * GRAPH_LINE) / 2 + 4.2
    const tspans = n.lines.map((line, i) => `<tspan x="${n.x + n.w / 2}" y="${top + i * GRAPH_LINE}">${esc(line)}</tspan>`).join('')
    return `<g class="${cls}" data-gnode="${esc(n.id)}"${n.dim ? ' opacity=".55"' : ''}>
      <title>${esc(n.label)}</title>
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="9"></rect>
      <text text-anchor="middle" font-size="${GRAPH_FONT}">${tspans}</text>
    </g>`
  }).join('')

  const W = Math.ceil(totalW + MARGIN * 2)
  const H = Math.ceil(totalH)
  box.innerHTML = `<svg class="graph-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="知识图谱">
    <defs><marker id="bili-arrow-${seq}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--mute)"></path></marker></defs>
    ${edgeSvg}${nodeSvg}
  </svg>`
  box.classList.add('graph-box')
  box.onclick = (e) => {
    const nodeEl = e.target.closest ? e.target.closest('[data-gnode]') : null
    if (nodeEl && o.onNodeClick) { o.onNodeClick(nodeEl.dataset.gnode, byId.get(nodeEl.dataset.gnode), e); return }
    const edgeEl = e.target.closest ? e.target.closest('[data-gedge]') : null
    if (edgeEl && o.onEdgeClick) {
      const edge = edges[Number(edgeEl.dataset.gedge)]
      if (edge) { e.stopPropagation(); o.onEdgeClick(edge, e) }
    }
  }
}

// ---- 粘贴链接 / 抓取 ----
function openAddSource() {
  openModal(`<div class="modal">
    <h2>${ICONS.plus}<span>粘贴 B 站链接</span></h2>
    <p class="desc">支持 UP 主主页（space.bilibili.com/…）、单个视频页、收藏夹链接。抓取走脚本接口，不费 AI。</p>
    <div class="field"><label>链接</label><input type="text" id="srcUrl" placeholder="https://space.bilibili.com/14229967"></div>
    <div id="srcPreview"></div>
    <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn" id="doFetch">抓取预览</button></div>
  </div>`)
  $('#doFetch').onclick = () => {
    const url = $('#srcUrl').value.trim()
    if (!url) return toast('先粘贴链接')
    const btn = $('#doFetch'); btn.disabled = true; btn.textContent = '抓取中…'
    fetch('/bili-study/api/fetch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })
      .then((r) => r.json()).then((r) => {
        btn.disabled = false; btn.textContent = '抓取预览'
        if (!r.ok) { $('#srcPreview').innerHTML = `<p class="chat-hint" style="color:var(--danger)">${esc(r.error || '抓取失败')}</p>`; return }
        const titles = (r.videos || []).slice(0, 8).map((v) => esc(v.title)).join('</div><div>')
        $('#srcPreview').innerHTML = `<p class="desc">找到 <b>${r.videos.length}</b> 个视频：</p><div class="preview"><div>${titles}</div></div>
          <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="doAdd">确认加入（${r.videos.length} 个）</button></div>`
        $('#doAdd').onclick = () => addSource(r, url)
      }).catch(() => { btn.disabled = false; btn.textContent = '抓取预览'; toast('抓取失败') })
  }
}
function addSource(r, url) {
  const id = String(r.id ?? url)
  for (const v of r.videos || []) { STATE.videos[v.bvid] = { ...(STATE.videos[v.bvid] || {}), ...v, sourceId: id, sourceType: r.kind } }
  if (!(STATE.sources || []).some((s) => String(s.id) === id)) STATE.sources.unshift({ type: r.kind, id, name: (r.meta && r.meta.name) || url, url, addedAt: new Date().toISOString() })
  persist(); closeModal()
  view = { mode: 'sources', sourceId: id, part: 1 }
  renderAll()
  toast(`已加入 ${(r.videos || []).length} 个视频到「UP主」目录，点「归类」归到学科`)
}

// ---- 分类 / 移动 ----
function leafOptions(nodes) {
  let h = '<option value="" disabled>— 请选择主题 —</option>'
  const rec = (list, d) => {
    for (const n of list || []) {
      if (isLeaf(n)) h += `<option value="${esc(n.id)}">${'　'.repeat(Math.min(d, 3))}${esc(n.name)}</option>`
      else rec(n.children, d + 1)
    }
  }
  rec(nodes, 0)
  return h
}
function openMoveAssign(bvid) {
  const v = STATE.videos[bvid]
  const cur = topicOf(bvid)
  const opts = leafOptions(STATE.catalog)
  openModal(`<div class="modal">
    <h2>${cur ? ICONS.shuffle : ICONS.folder}<span>${cur ? '调整学科分类' : '加入学科分类'}</span></h2>
    <p class="desc">${esc(v && v.title)}${cur ? `<br>当前分类：${esc(cur.name)}` : ''}<br>归到学科后，视频仍会保留在 UP主 目录里。</p>
    <div class="field"><label>选择主题</label><select id="assignSel">${opts}</select></div>
    <div class="actions">
      ${cur ? `<button class="btn" id="doRemove" style="margin-right:auto">移出分类</button>` : ''}
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn primary" id="doAssign">${cur ? '移动到此' : '分配'}</button>
    </div>
  </div>`)
  if (cur) $('#assignSel').value = cur.id
  $('#doAssign').onclick = () => {
    const tid = $('#assignSel').value
    if (!tid) return toast('选一个主题')
    moveVideo(bvid, tid)
    persist(); closeModal(); refreshUI(); toast('已更新分类')
  }
  const rm = $('#doRemove')
  if (rm) rm.onclick = () => { removeVideoFromTopic(bvid); persist(); closeModal(); refreshUI(); toast('已移出分类') }
}

// ---- 智能分类：AI 批量把已有视频归到学科主题，先预览再写入 ----
function leafTopics() {
  const out = []
  walk(STATE.catalog, (n) => { if (isLeaf(n)) out.push(n) })
  return out
}
// 下拉选项：主题叶子（带当前选中项），第一项是「跳过」
function leafOptionsFor(selected) {
  let h = '<option value="">— 跳过，不分类 —</option>'
  const rec = (list, d) => {
    for (const n of list || []) {
      if (isLeaf(n)) h += `<option value="${esc(n.id)}"${n.id === selected ? ' selected' : ''}>${'　'.repeat(Math.min(d, 3))}${esc(n.name)}</option>`
      else rec(n.children, d + 1)
    }
  }
  rec(STATE.catalog, 0)
  return h
}
function classifyScopeChoices(sourceId) {
  const unc = unassigned().length
  const total = Object.keys(STATE.videos).length
  const srcN = sourceId ? videosOfSource(sourceId).length : 0
  const list = []
  if (sourceId && srcN) list.push({ v: 'source', label: `这个来源（${srcN} 个）` })
  if (unc) list.push({ v: 'unassigned', label: `未分类的视频（${unc} 个）` })
  list.push({ v: 'all', label: `全部视频（${total} 个，含已归类）` })
  return list
}

function openSmartClassify(sourceId) {
  if (!leafTopics().length) return toast('先建好「科目 › 章 › 主题」目录，再来智能分类')
  if (!Object.keys(STATE.videos).length) return toast('还没有视频，先粘贴 B 站链接抓取')
  const choices = classifyScopeChoices(sourceId || null)
  openModal(`<div class="modal">
    <h2>${ICONS.wand}<span>智能分类</span></h2>
    <p class="desc">AI 读视频标题，按你的「科目 › 章 › 主题」目录给每个视频挑一个主题。先给建议，你确认后才写入。</p>
    <div class="field"><label>分类范围</label><select id="clfScope">${choices.map((c) => `<option value="${c.v}">${esc(c.label)}</option>`).join('')}</select></div>
    <p class="chat-hint">视频多时会分几批请求模型，中途可以停止；不会动你的笔记和观看进度。应用后视频会从原主题移到建议的主题。</p>
    <div class="actions">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn primary" id="doClassify">开始分析</button>
    </div>
  </div>`)
  $('#doClassify').onclick = () => {
    const scope = $('#clfScope').value
    const list = scope === 'source' ? videosOfSource(sourceId)
      : scope === 'all' ? Object.keys(STATE.videos)
        : unassigned()
    if (!list.length) return toast('这个范围里没有视频')
    runClassify(list)
  }
}

function showClassifyProgress(total, run) {
  openModal(`<div class="modal">
    <h2>${ICONS.wand}<span>正在智能分类</span></h2>
    <p class="desc">AI 正在读标题、匹配主题，请稍候。可以随时停止，已分析出的建议会保留。</p>
    <div class="progress">
      <div class="progress-label">已分析 <b id="clfDone">0</b> / ${total}</div>
      <div class="progress-track"><div class="progress-fill" id="clfBar" style="width:0%"></div></div>
    </div>
    <p class="chat-hint" id="clfNow">准备中…</p>
    <div class="actions"><button class="btn" id="clfStop">停止</button></div>
  </div>`)
  $('#clfStop').onclick = () => {
    run.aborted = true
    $('#clfStop').disabled = true
    $('#clfNow').textContent = '正在停止（等这一批返回）…'
  }
}
function updateClassifyProgress(done, total, text) {
  const d = $('#clfDone'); if (d) d.textContent = String(done)
  const bar = $('#clfBar'); if (bar) bar.style.width = `${total ? Math.round(done / total * 100) : 0}%`
  const now = $('#clfNow'); if (now && text) now.textContent = text
}

async function runClassify(list) {
  const run = { aborted: false }
  classifyRun = run
  const batches = []
  for (let i = 0; i < list.length; i += CLASSIFY_BATCH) batches.push(list.slice(i, i + CLASSIFY_BATCH))
  showClassifyProgress(list.length, run)
  const got = new Map()
  const errors = []
  let done = 0
  for (let bi = 0; bi < batches.length; bi++) {
    if (run.aborted) break
    updateClassifyProgress(done, list.length, `正在分析第 ${bi + 1} / ${batches.length} 批（${batches[bi].length} 个视频）…`)
    let err = null
    // 单批失败自动重试一次；旧后端 404 重试也没用，直接记错
    for (let attempt = 0; attempt < 2 && !run.aborted; attempt++) {
      try {
        const res = await fetch('/bili-study/api/classify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bvids: batches[bi] }),
        })
        if (res.status === 404) throw Object.assign(new Error('后端还是旧版本，重启一次 DeepSeek Harness 后再试'), { fatal: true })
        const r = await res.json().catch(() => null)
        if (!r) throw new Error(`第 ${bi + 1} 批返回格式不对`)
        if (!r.ok) throw new Error(r.error || `第 ${bi + 1} 批失败`)
        for (const it of r.items || []) if (it && it.bvid && !got.has(it.bvid)) got.set(it.bvid, it)
        err = null
        break
      } catch (e) {
        err = e
        if (e && e.fatal) break
      }
    }
    if (err) errors.push(`第 ${bi + 1}/${batches.length} 批：${(err.message) || '请求失败'}`)
    done += batches[bi].length
    updateClassifyProgress(done, list.length, '')
  }
  if (classifyRun !== run) return
  classifyRun = null
  if (run.aborted) {
    closeModal()
    toast(`已停止，已分析 ${got.size} 个视频`)
    if (got.size) showClassifyPreview(list, got, errors)
    return
  }
  if (!got.size) {
    openModal(`<div class="modal">
      <h2>${ICONS.wand}<span>智能分类</span></h2>
      <p class="desc">没有拿到任何建议。</p>
      ${errors.length ? `<p class="chat-hint" style="color:var(--danger)">${esc(errors[0])}</p>` : ''}
      <div class="actions"><button class="btn" onclick="closeModal()">关闭</button><button class="btn primary" id="clfRetry">重试</button></div>
    </div>`)
    $('#clfRetry').onclick = () => runClassify(list)
    return
  }
  showClassifyPreview(list, got, errors)
}

function showClassifyPreview(list, got, errors) {
  const rows = list.map((b) => ({ b, v: STATE.videos[b], s: got.get(b) || null, missing: !got.has(b) })).filter((r) => r.v)
  // 按建议的目录路径排序，同主题的视频挨在一起，方便快速扫一遍
  const pathKey = (r) => {
    if (!r.s || !r.s.topicId) return '\uffff'
    return ancestorPath(r.s.topicId).map((x) => x.name).join(' / ') || '\uffff'
  }
  rows.sort((a, b) => pathKey(a).localeCompare(pathKey(b), 'zh'))
  const suggested = rows.filter((r) => r.s && r.s.topicId && !r.missing).length
  const missing = rows.filter((r) => r.missing).length
  const blank = rows.length - suggested - missing
  const rowHtml = (r) => {
    const miss = r.missing
    const t = !miss && r.s && r.s.topicId ? findNode(r.s.topicId) : null
    const cur = topicOf(r.b)
    const conf = r.s && Number.isFinite(r.s.confidence) ? Math.round(r.s.confidence * 100) : null
    const meta = [r.v.author, cur ? `现：${cur.name}` : '未分类', miss ? '这批没拿到结果' : (r.s && r.s.reason)].filter(Boolean).join(' · ')
    const fullPath = t ? ancestorPath(t.id).map((x) => x.name).join(' › ') : ''
    const tip = miss ? '这批没拿到结果，点击手动指定' : t ? `${fullPath}（点击换主题）` : '没有合适主题，点击手动指定'
    const label = miss ? '未分析' : (t ? t.name : '跳过')
    return `<div class="clf-row" data-bvid="${esc(r.b)}">
      <input type="checkbox" class="clf-check" ${t ? 'checked' : 'disabled'} aria-label="采纳这条建议">
      <div class="clf-main">
        <div class="clf-title" title="${esc(r.v.title)}">${esc(r.v.title)}</div>
        <div class="clf-meta">${esc(meta)}${conf === null ? '' : ` · <span class="clf-conf${conf < 55 ? ' low' : ''}" title="模型置信度">${conf}%</span>`}</div>
      </div>
      <button class="clf-topic${t ? '' : ' skip'}" data-clf-topic="${esc(r.b)}" data-tid="${esc(r.s && r.s.topicId ? r.s.topicId : '')}" title="${esc(tip)}">${esc(label)}</button>
    </div>`
  }
  openModal(`<div class="modal wide">
    <h2>${ICONS.wand}<span>确认分类建议</span></h2>
    <p class="desc">建议归类 <b>${suggested}</b> 个 · 未给建议或不相关 <b>${blank}</b> 个${missing ? ` · <span style="color:var(--danger)">未分析 ${missing} 个</span>` : ''}${errors.length ? ` · <span style="color:var(--danger)">${errors.length} 批失败</span>` : ''}<br>点右侧主题可以改，取消勾选则不写入；应用后视频会移到建议的主题。</p>
    <div class="clf-toolbar">
      <label class="clf-all"><input type="checkbox" id="clfAll" ${suggested ? 'checked' : ''}> 全选建议</label>
      <span class="chat-hint" id="clfCount">已选 ${suggested} 个</span>
    </div>
    <div class="clf-list" id="clfList">${rows.map(rowHtml).join('')}</div>
    <div class="actions">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn primary" id="doApplyClassify">应用 ${suggested} 个</button>
    </div>
  </div>`)
  const box = $('#clfList')
  const refresh = () => {
    const checks = $$('.clf-check', box)
    const eligible = checks.filter((x) => !x.disabled)
    const n = checks.filter((x) => x.checked && !x.disabled).length
    const count = $('#clfCount'); if (count) count.textContent = `已选 ${n} 个`
    const apply = $('#doApplyClassify'); if (apply) apply.textContent = `应用 ${n} 个`
    const all = $('#clfAll')
    if (all) { all.checked = n > 0 && n === eligible.length; all.indeterminate = n > 0 && n < eligible.length }
  }
  box.addEventListener('change', (e) => { if (e.target.classList.contains('clf-check')) refresh() })
  // 点行勾选；点主题按钮就地切换成下拉，只改这一条
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clf-topic]')
    if (btn) {
      e.stopPropagation()
      const bvid = btn.dataset.clfTopic
      const row = btn.closest('.clf-row')
      const sel = document.createElement('select')
      sel.className = 'clf-sel'
      sel.innerHTML = leafOptionsFor(btn.dataset.tid || '')
      btn.replaceWith(sel)
      sel.focus()
      // 选中后把下拉换回按钮；blur 和 change 谁先来都安全
      let settled = false
      const applyChoice = (n) => {
        const chk = row && row.querySelector('.clf-check')
        if (chk) { chk.disabled = !n; chk.checked = !!n; refresh() }
      }
      sel.addEventListener('change', () => {
        const n = findNode(sel.value)
        if (settled) {
          // blur 已经把按钮换回来了：直接更新那颗按钮，别丢用户的选择
          btn.dataset.tid = sel.value
          btn.textContent = n ? n.name : '跳过'
          btn.title = n ? `${ancestorPath(n.id).map((x) => x.name).join(' › ')}（点击换主题）` : '没有合适主题，点击手动指定'
          btn.classList.toggle('skip', !n)
          applyChoice(n)
          return
        }
        settled = true
        const nb = document.createElement('button')
        nb.className = 'clf-topic' + (n ? '' : ' skip')
        nb.dataset.clfTopic = bvid
        nb.dataset.tid = sel.value
        nb.title = n ? `${ancestorPath(n.id).map((x) => x.name).join(' › ')}（点击换主题）` : '没有合适主题，点击手动指定'
        nb.textContent = n ? n.name : '跳过'
        sel.replaceWith(nb)
        applyChoice(n)
      })
      sel.addEventListener('blur', () => {
        if (settled) return
        settled = true
        if (sel.parentNode) sel.replaceWith(btn)
      })
      return
    }
    if (e.target.closest('button, select, input')) return
    const row = e.target.closest('.clf-row')
    if (!row) return
    const chk = row.querySelector('.clf-check')
    if (!chk || chk.disabled) return
    chk.checked = !chk.checked
    refresh()
  })
  $('#clfAll').onchange = () => {
    const on = $('#clfAll').checked
    $$('.clf-check', box).forEach((x) => { if (!x.disabled) x.checked = on })
    refresh()
  }
  $('#doApplyClassify').onclick = () => {
    let n = 0
    for (const row of $$('.clf-row', box)) {
      const chk = row.querySelector('.clf-check')
      const btn = row.querySelector('[data-clf-topic]')
      if (!chk || !chk.checked || !btn) continue
      const tid = btn.dataset.tid
      if (!tid || !findNode(tid)) continue
      moveVideo(row.dataset.bvid, tid)
      n++
    }
    if (!n) return toast('没有勾选任何建议')
    persist(); closeModal(); refreshUI(); toast(`已把 ${n} 个视频归到学科`)
  }
  refresh()
}

// ---- 目录重命名 / 删除 ----
function openRename(id) {
  const n = findNode(id); if (!n) return
  openModal(`<div class="modal">
    <h2>${ICONS.pencil}<span>重命名</span></h2>
    <div class="field"><label>名称</label><input type="text" id="renameInput" value="${esc(n.name)}"></div>
    <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="doRename">保存</button></div>
  </div>`)
  $('#doRename').onclick = () => {
    const name = $('#renameInput').value.trim()
    if (!name) return toast('名称不能为空')
    n.name = name
    persist(); closeModal(); refreshUI(); toast('已重命名')
  }
}
function removeNode(id) {
  const rec = (nodes) => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) { nodes.splice(i, 1); return true }
      if (nodes[i].children && rec(nodes[i].children)) return true
    }
    return false
  }
  rec(STATE.catalog)
}
function deleteNode(id) {
  const n = findNode(id); if (!n) return
  const count = nodeCount(n)
  openModal(`<div class="modal">
    <h2>${ICONS.trash}<span>删除「${esc(n.name)}」</span></h2>
    <p class="desc">${count ? `这个目录下有 ${count} 个视频，删除后它们会回到「未分类」（UP主 目录里仍保留）。` : '这个目录是空的。'}</p>
    <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="doDelete" style="background:var(--danger);border-color:var(--danger)">删除</button></div>
  </div>`)
  $('#doDelete').onclick = () => { removeNode(id); persist(); closeModal(); refreshUI(); toast('已删除') }
}

// ---- 手动加科目 ----
function openAddSubject() {
  openModal(`<div class="modal">
    <h2>${ICONS.plus}<span>手动加科目</span></h2>
    <p class="desc">不加视频也可以先搭骨架。之后在 UP主 区点视频旁的「归类」，把视频归到主题。</p>
    <div class="field"><label>科目名</label><input type="text" id="subjName" placeholder="例如：数学"></div>
    <div class="field"><label>章（用逗号分隔，可选）</label><input type="text" id="subjChs" placeholder="函数, 几何, 概率"></div>
    <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="doSubj">添加</button></div>
  </div>`)
  $('#doSubj').onclick = () => {
    const name = $('#subjName').value.trim()
    if (!name) return toast('填一个科目名')
    const chs = $('#subjChs').value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
    const node = { id: uid(), name }
    if (chs.length) node.children = chs.map((c) => ({ id: uid(), name: c, videos: [] }))
    else node.videos = []
    STATE.catalog.push(node)
    persist(); closeModal(); renderSide(); toast('已添加科目')
  }
}
function uid() { return 'n-' + Math.random().toString(36).slice(2, 9) }

// ---- 导出笔记 ----
function exportNotes() {
  const keys = Object.keys(STATE.notes || {})
  if (!keys.length) return toast('还没有笔记')
  const lines = []
  for (const k of keys) {
    const n = STATE.notes[k]
    if (!n || !n.text || !n.text.trim()) continue
    const bvid = k.replace(/-p\d+$/, '')
    const v = STATE.videos[bvid]
    const title = v ? v.title : bvid
    const part = k.includes('-p') ? ' · ' + k.split('-p')[1] + 'P' : ''
    lines.push(`## ${title}${part}\n- 链接：https://www.bilibili.com/video/${bvid}\n- 时间：${n.updatedAt ? fmtWhen(n.updatedAt) : ''}\n\n${n.text.trim()}\n`)
  }
  const md = `# 学习笔记\n\n导出时间：${new Date().toLocaleString()}\n\n---\n\n` + lines.join('\n---\n\n')
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `学习笔记-${todayStr()}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  toast('已导出 Markdown 到本地')
}

// ---- 奖励弹层 ----
function openRewards() {
  const r = STATE.rewards
  const defs = badgeDefs()
  const level = Math.floor(Math.sqrt((r.points || 0) / 25)) + 1
  const have = new Set(r.badges || [])
  const log = (r.log || []).slice(0, 8).map((l) => `<div class="logline">${l.label} <span style="float:right">+${l.delta}</span></div>`).join('')
  openModal(`<div class="modal">
    <h2>${ICONS.starFill}<span>学习奖励</span></h2>
    <div class="statline">
      <div class="st"><b>${r.points || 0}</b><span>积分</span></div>
      <div class="st"><b>Lv${level}</b><span>等级</span></div>
      <div class="st"><b>${r.streak || 0} 天</b><span>连续（最高 ${r.best || 0}）</span></div>
    </div>
    <p class="desc">规则：看完视频 +10 · 记笔记 +10 · 学完主题 +20 · 连续学习有成就。</p>
    <div class="badge-grid">${defs.map((d) => {
      const unlocked = have.has(d.id) || d.cond
      const note = unlocked ? '已获得' : `还差 ${Math.max(0, d.goal - d.cur)} ${d.unit}`
      return `<div class="badge ${unlocked ? '' : 'locked'}"><div class="ico">${d.ico}</div><div>${d.n}</div><div class="n">${note}</div></div>`
    }).join('')}</div>
    ${log ? `<h2 class="sub">最近</h2>${log}` : ''}
    <div class="actions"><button class="btn primary" onclick="closeModal()">好</button></div>
  </div>`)
}

// ---- 启动 ----
decorateStaticIcons()
bind()
syncHostInset()
loadState()
