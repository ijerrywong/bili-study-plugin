// B 站学习台：注册给模型的两个工具，在 Host 进程执行（不经过模型 bash 沙箱）。
// 1. bili_study_save_catalog —— 模型按用户提示词生成的「学习目录」存进状态。
// 2. bili_study_fetch        —— 从 B 站链接抓取视频并入状态（与面板 /api/fetch 共用 fetchFromUrl）。
import { addSourceVideos, assignVideos, normalizeCatalog, readState, saveCatalog } from './store.js'
import { fetchFromUrl } from './bili.js'

const text = (value) => [{ type: 'text', text: value }]

const saveCatalogTool = {
  name: 'bili_study_save_catalog',
  description: '把按用户提示词生成的「学习视频目录」（结构化大纲，科目→章→主题，最多三层）存进 B 站学习台面板。只存大纲，不要编造 BV 号或视频链接；视频由用户在面板里粘贴 B 站链接抓取。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['catalog'],
    properties: {
      catalog: {
        type: 'array',
        description: '目录树（科目→章→主题，最多三层）。每个节点是 { "name": "节点名", "note": "可选说明", "children": [同构子节点…], "videos": ["BV号…"] }；叶子主题节点省略 children 和 videos。只存大纲，不要编造 BV 号。',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            name: { type: 'string', description: '节点名：科目 / 章 / 主题' },
            note: { type: 'string', description: '可选的一句话说明' },
            children: { type: 'array', description: '子节点，结构与父节点相同（递归同构，最多三层）' },
            videos: { type: 'array', items: { type: 'string' }, description: '主题叶子节点下的 BV 号数组（一般留空，由用户粘贴链接填充）' },
          },
        },
      },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: false, required: ['nodes'], properties: { nodes: { type: 'integer' } } },
    render: (_a, v) => text(`已把 ${v.nodes} 个顶层科目存进 B 站学习台目录。用户回到侧栏「B 站学习台」即可看到；接着让他粘贴喜欢的 B 站博主主页链接，把视频加进对应主题；也可以用面板的「智能分类」把已有视频批量归到主题。`),
  },
  async execute(args) {
    if (!Array.isArray(args?.catalog)) throw new Error('catalog 必须是数组')
    const catalog = normalizeCatalog(args.catalog)
    if (!catalog.length) throw new Error('目录是空的，请先按「科目→章→主题」生成大纲')
    await saveCatalog(catalog)
    return { nodes: catalog.length }
  },
}

const fetchTool = {
  name: 'bili_study_fetch',
  description: '从 B 站链接抓取视频并入 B 站学习台状态：支持 UP 主主页（space.bilibili.com/<mid>，走公开合集）、单个视频页（BV 号）、收藏夹（medialist/ml<id> 或 ?media_id=）。抓回的视频先放在「未分类」里，等用户在面板里分配到主题（或用面板的「智能分类」批量归类）；给 topic 参数可自动分配到同名主题。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['url'],
    properties: {
      url: { type: 'string', description: 'B 站 UP 主主页 / 视频页 / 收藏夹链接' },
      topic: { type: 'string', description: '可选：把抓回的视频自动分配到这个名字的主题节点下' },
    },
  },
  output: {
    schema: { type: 'object', additionalProperties: false, required: ['count', 'kind'], properties: { count: { type: 'integer' }, kind: { type: 'string' } } },
    render: (_a, v) => text(`已抓取 ${v.count} 个视频（来源：${v.kind}）。用户回到侧栏「B 站学习台 → 来源」可以把它们分配到各主题。`),
  },
  async execute(args) {
    const url = String(args?.url || '').trim()
    if (!url) throw new Error('缺少 url')
    const r = await fetchFromUrl(url)
    if (!r.ok) throw new Error(r.error || '抓取失败')
    const name = (r.meta && r.meta.name) || url
    await addSourceVideos(r.kind, r.id ?? url, name, url, r.videos)
    if (args?.topic && typeof args.topic === 'string' && args.topic.trim()) {
      const state = readState()
      const hit = findTopic(state.catalog, args.topic.trim())
      if (hit) await assignVideos(hit, r.videos.map((v) => v.bvid))
    }
    return { count: (r.videos || []).length, kind: r.kind }
  },
}

function findTopic(nodes, name) {
  for (const n of nodes || []) {
    if (n.name === name && (!n.children || !n.children.length)) return n.id
    const sub = findTopic(n.children, name)
    if (sub) return sub
  }
  return null
}

export const TOOLS = [saveCatalogTool, fetchTool]
