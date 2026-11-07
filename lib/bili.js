// B 站学习台：B 站客户端（不登录，限速约 1 次/秒，不规避反爬）。
// 从 gaozhong-tube 的 scripts/harvest.py 移植：WBI 签名、UP 主合集/视频列表、收藏夹、单视频。
// 优先走不被风控的「合集」接口；全部视频列表接口（space/wbi/arc/search）未登录常返回 -352。
import { createHash } from 'node:crypto'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const MIXIN = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 命中这些错误码时自动重试（风控 -352 / 请求过于频繁 -412）。
const RETRY_CODES = new Set([-352, -412])
const MAX_RETRY = 3

// 与 Python urllib.parse.quote_plus 对齐（对本插件用到的参数一致）。
const quote = (s) => encodeURIComponent(String(s)).replace(/%20/g, '+')

function md5(s) { return createHash('md5').update(s, 'utf8').digest('hex') }
function durToSec(s) {
  try { return String(s).split(':').map(Number).reduce((a, b) => a * 60 + b, 0) } catch { return 0 }
}
function fileStem(url) { return String(url).split('/').pop().split('.')[0] }

export class Bili {
  constructor() { this.cookie = ''; this.mixinKey = null; this.last = 0 }

  async _get(url, params, referer = 'https://www.bilibili.com/', attempt = 0) {
    const wait = this.last + 1000 - Date.now()
    if (wait > 0) await sleep(wait)
    const u = params ? `${url}?${new URLSearchParams(params).toString()}` : url
    let res, json
    try {
      res = await fetch(u, { headers: { 'User-Agent': UA, Referer: referer, Cookie: this.cookie }, signal: AbortSignal.timeout(20000) })
    } catch (e) {
      this.last = Date.now()
      // 网络层失败也重试，避免偶发抖动直接报错
      if (attempt < MAX_RETRY) { await sleep(this._backoff(attempt)); return this._get(url, params, referer, attempt + 1) }
      return { code: -1, message: `请求失败：${e && e.message}` }
    }
    this.last = Date.now()
    try { json = await res.json() } catch { return { code: -1, message: `非 JSON 响应 ${res.status}` } }
    // 命中风控 / 频控，指数退避后重试
    if (RETRY_CODES.has(json?.code) && attempt < MAX_RETRY) {
      await sleep(this._backoff(attempt))
      return this._get(url, params, referer, attempt + 1)
    }
    return json
  }

  // 重试退避：1s, 2s, 4s（封顶 8s）
  _backoff(attempt) { return Math.min(8000, 1000 * 2 ** attempt) }

  // 拿 buvid3/buvid4 + WBI mixin key。仅 wbi 接口需要，合集接口不用。
  async init() {
    const spi = await this._get('https://api.bilibili.com/x/frontend/finger/spi')
    const d = (spi && spi.data) || {}
    this.cookie = `buvid3=${d.b_3 || ''}; buvid4=${d.b_4 || ''}`
    const nav = await this._get('https://api.bilibili.com/x/web-interface/nav')
    const img = (nav && nav.data && nav.data.wbi_img) || {}
    const key = fileStem(img.img_url) + fileStem(img.sub_url)
    this.mixinKey = MIXIN.map((i) => key[i] || '').join('').slice(0, 32)
    return !!this.mixinKey
  }

  _sign(params) {
    const p = { ...params, wts: Math.floor(Date.now() / 1000) }
    const keys = Object.keys(p).sort()
    const q = keys.map((k) => `${quote(k)}=${quote(String(p[k]).replace(/[!'()*]/g, ''))}`).join('&')
    p.w_rid = md5(q + this.mixinKey)
    return p
  }

  async view(bvid) {
    return this._get('https://api.bilibili.com/x/web-interface/view', { bvid })
  }

  // 单个视频（含分P信息）
  async fetchVideo(bvid) {
    const r = await this.view(bvid)
    if (r.code !== 0) return { ok: false, error: `${r.code} ${r.message}` }
    const d = r.data
    return {
      ok: true, kind: 'video', meta: { name: d.title },
      videos: [{
        bvid: d.bvid, aid: d.aid, title: d.title, author: d.owner.name, mid: d.owner.mid,
        duration: d.duration, play: d.stat.view, pic: d.pic, created: d.pubdate,
        pages: (d.pages || []).map((p) => ({ page: p.page, part: p.part, duration: p.duration })),
        videos: d.videos || 1,
      }],
    }
  }

  // UP 主公开合集（不被风控），含 seasons 和 series。返回其所有视频。
  async fetchUpSeasons(mid, name) {
    const r = await this._get('https://api.bilibili.com/x/polymer/web-space/seasons_series_list', { mid, page_num: 1, page_size: 20 })
    if (r.code !== 0) return { ok: false, error: `${r.code} ${r.message}`, hint: '合集接口不可用' }
    const lists = (r.data && r.data.items_lists) || {}
    const out = []
    const seen = new Set()
    let ownerName = name || ''
    const add = (arcs, coll) => {
      for (let i = 0; i < arcs.length; i++) {
        const a = arcs[i]
        if (!a || !a.bvid || seen.has(a.bvid)) continue
        seen.add(a.bvid)
        const author = (a.owner && a.owner.name) || a.author || name
        if (!ownerName && author) ownerName = author
        out.push({ bvid: a.bvid, aid: a.aid, title: a.title, duration: a.duration,
          play: (a.stat && a.stat.view) || 0, pic: a.pic || '', created: a.pubdate || 0,
          author, mid, collection: coll, index: i + 1 })
      }
    }
    for (const s of (lists.seasons_list || [])) {
      const sid = s.meta && s.meta.season_id
      const coll = (s.meta && s.meta.name) || '合集'
      let arcs = []
      let pn = 1
      for (;;) {
        const r2 = await this._get('https://api.bilibili.com/x/polymer/web-space/seasons_archives_list',
          { mid, season_id: sid, sort_reverse: 'false', page_num: pn, page_size: 100 })
        if (r2.code !== 0) break
        const page = (r2.data && r2.data.archives) || []
        arcs = arcs.concat(page)
        const total = (r2.data && r2.data.page && r2.data.page.total) || 0
        if (!page.length || arcs.length >= total) break
        pn += 1
      }
      add(arcs, coll)
    }
    for (const s of (lists.series_list || [])) {
      const sid = s.meta && s.meta.series_id
      const coll = '系列·' + ((s.meta && s.meta.name) || '')
      const r2 = await this._get('https://api.bilibili.com/x/series/archives', { mid, series_id: sid, pn: 1, ps: 100, sort: 'asc' })
      const arcs = (r2.data && r2.data.archives) || []
      add(arcs, coll)
    }
    if (!ownerName && out.length) ownerName = await this.fetchUpName(mid)
    return { ok: true, kind: 'up', meta: { name: ownerName || name, count: out.length, via: '合集' }, videos: out }
  }

  // 用卡片接口拿 UP 主昵称（合集里没带 owner 时兜底）。
  async fetchUpName(mid) {
    const r = await this._get('https://api.bilibili.com/x/web-interface/card', { mid })
    return (r.code === 0 && r.data && r.data.card && r.data.card.name) || ''
  }

  // UP 主全部视频列表（wbi，未登录常被风控）。仅作合集拿不到时的兜底。
  async fetchUpAll(mid, name) {
    if (!this.mixinKey && !(await this.init())) return { ok: false, error: 'WBI 初始化失败' }
    const out = []
    let ownerName = name || ''
    let pn = 1
    for (;;) {
      const r = await this._get('https://api.bilibili.com/x/space/wbi/arc/search',
        this._sign({ mid, ps: 30, pn, order: 'pubdate' }))
      if (r.code !== 0) return { ok: false, error: `${r.code} ${r.message}`, partial: out }
      const vl = ((r.data && r.data.list) || {}).vlist || []
      for (const v of vl) {
        const author = v.author || name
        if (!ownerName && author) ownerName = author
        out.push({ bvid: v.bvid, aid: v.aid, title: v.title, duration: durToSec(v.length),
          play: v.play || 0, comment: v.comment || 0, created: v.created || 0, pic: v.pic || '',
          description: (v.description || '').slice(0, 300), author })
      }
      const count = (r.data && r.data.page && r.data.page.count) || 0
      if (!vl.length || out.length >= count) break
      pn += 1
    }
    return { ok: true, kind: 'up', meta: { name: ownerName || name, count: out.length, via: '全部视频' }, videos: out }
  }

  // 收藏夹
  async fetchFav(mediaId) {
    const out = []
    let pn = 1
    for (;;) {
      const r = await this._get('https://api.bilibili.com/x/v3/fav/resource/list', { media_id: mediaId, pn, ps: 20, platform: 'web' })
      if (r.code !== 0) return { ok: false, error: `${r.code} ${r.message}`, partial: out }
      const d = r.data
      for (const m of (d && d.medias) || []) {
        if (m.type !== 2 || (m.attr || 0) & 1) continue
        out.push({ bvid: m.bvid, title: m.title, duration: m.duration,
          play: (m.cnt_info && m.cnt_info.play) || 0, pic: m.cover || '',
          author: (m.upper && m.upper.name) || '', mid: (m.upper && m.upper.mid) || 0,
          collection: '收藏夹·' + ((d.info && d.info.title) || ''), index: out.length + 1 })
      }
      if (!(d && d.has_more)) break
      pn += 1
    }
    const info = out[0] ? {} : {}
    return { ok: true, kind: 'fav', meta: { name: '', count: out.length }, videos: out, ...info }
  }
}

// 解析用户粘贴的链接 → { kind, id }。b23.tv 短链先解析跳转。
export async function parseLink(raw) {
  let url = String(raw || '').trim()
  if (!url) throw new Error('链接为空')
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  if (/b23\.tv|bili2233\.cn/i.test(url)) {
    try {
      const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA } })
      const loc = res.headers.get('location')
      if (loc) url = new URL(loc, url).href
    } catch { /* 解析失败就按原样继续 */ }
  }
  let m
  if ((m = url.match(/space\.bilibili\.com\/(\d+)/))) return { kind: 'up', id: m[1] }
  if ((m = url.match(/bilibili\.com\/video\/(BV[\w]+)/))) return { kind: 'video', id: m[1] }
  if ((m = url.match(/bilibili\.com\/video\/av(\d+)/))) return { kind: 'video', id: m[1], isAid: true }
  if ((m = url.match(/medialist\/detail\/ml(\d+)/))) return { kind: 'fav', id: m[1] }
  if ((m = url.match(/[?&](fid|media_id)=(\d+)/))) return { kind: 'fav', id: m[2] }
  throw new Error('没认出链接类型，请粘贴 UP 主主页、视频页或收藏夹链接')
}

// 统一入口：解析链接并抓取视频。供面板 /api/fetch 和模型工具共用。
export async function fetchFromUrl(raw) {
  const { kind, id, isAid } = await parseLink(raw)
  const bili = new Bili()
  if (kind === 'video') {
    if (isAid) {
      // av 号先转 BV
      const r = await bili._get('https://api.bilibili.com/x/web-interface/view', { aid: id })
      if (r.code === 0 && r.data && r.data.bvid) return { ...(await bili.fetchVideo(r.data.bvid)), id }
      return { ok: false, error: `av${id} 转 BV 失败：${r.code} ${r.message}` }
    }
    return { ...(await bili.fetchVideo(id)), id }
  }
  if (kind === 'fav') return { ...(await bili.fetchFav(id)), id }
  if (kind === 'up') {
    const seasons = await bili.fetchUpSeasons(id, '')
    if (seasons.ok && seasons.videos && seasons.videos.length) return { ...seasons, id }
    // 合集拿不到时兜底用全部视频列表（可能被风控）
    const all = await bili.fetchUpAll(id, '')
    if (all.ok && all.videos && all.videos.length) return { ...all, id }
    return all.ok ? { ...all, id } : { ok: false, error: (seasons.error || '') + '；' + (all.error || '') }
  }
  return { ok: false, error: '未知来源类型' }
}
