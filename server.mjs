// 知学 bili-learn 本地服务：转发 B 站 API + WBI 签名 + 登录管理 + 视频流代理
// 零依赖，仅需 Node 18+（推荐 Node 22+）
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';

// 兼容 esbuild 打包为 CJS（Android 内嵌）：CJS 下 import.meta 为空，回退到 __dirname/require
const __dirname = (() => {
  try {
    return fileURLToPath(new URL('.', import.meta.url));
  } catch {
    return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  }
})();
const __require = (() => {
  try {
    return createRequire(import.meta.url);
  } catch {
    return typeof require !== 'undefined' ? require : null;
  }
})();
// Android 内嵌运行：PUBLIC_DIR/DATA_DIR 由启动器通过环境变量注入
const PUBLIC_DIR = process.env.BF_PUBLIC_DIR ? normalize(process.env.BF_PUBLIC_DIR) : join(__dirname, 'public');
const DATA_DIR = process.env.BF_DATA_DIR || join(__dirname, 'data');
const COOKIE_FILE = join(DATA_DIR, 'cookies.json');

const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.BF_HOST || process.env.HOST || '0.0.0.0';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BILI_API = 'https://api.bilibili.com';
const BILI_PASSPORT = 'https://passport.bilibili.com';
const REFERER = 'https://www.bilibili.com/';

// WBI 签名重排表（来自 bilibili-API-collect 文档）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

// ---------- Cookie 持久化（仅保存在本机） ----------
let cookieStore = { cookies: '', updatedAt: null };
try {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(COOKIE_FILE)) cookieStore = JSON.parse(readFileSync(COOKIE_FILE, 'utf8'));
} catch (e) {
  console.error('read cookies failed:', e.message);
}

function saveCookies() {
  try {
    writeFileSync(COOKIE_FILE, JSON.stringify(cookieStore, null, 2));
  } catch (e) {
    console.error('save cookies failed:', e.message);
  }
}

function mergeCookies(current, incoming) {
  const map = {};
  for (const part of `${current}; ${incoming}`.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k && v) map[k] = v;
  }
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

function cookieNames(cookies) {
  return cookies.split(';').map((p) => p.trim().split('=')[0]).filter(Boolean);
}

// ---------- WBI 签名 ----------
let wbiCache = { imgKey: '', subKey: '', fetchedAt: 0 };

function getMixinKey(orig) {
  return MIXIN_KEY_ENC_TAB.map((n) => orig[n]).join('').slice(0, 32);
}

function encWbiQuery(params, imgKey, subKey) {
  const mixinKey = getMixinKey(imgKey + subKey);
  const signed = { ...params, wts: Math.round(Date.now() / 1000) };
  const query = Object.keys(signed)
    .sort()
    .map((k) => {
      const v = String(signed[k]).replace(/[!'()*]/g, '');
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    })
    .join('&');
  const wRid = createHash('md5').update(query + mixinKey).digest('hex');
  return query + '&w_rid=' + wRid;
}

async function ensureWbiKeys(force = false) {
  const AGE_MS = 12 * 60 * 60 * 1000;
  if (!force && wbiCache.imgKey && Date.now() - wbiCache.fetchedAt < AGE_MS) return wbiCache;
  const res = await fetch(`${BILI_API}/x/web-interface/nav`, { headers: baseHeaders(), signal: AbortSignal.timeout(20000) });
  const j = await res.json();
  const img = j?.data?.wbi_img?.img_url || '';
  const sub = j?.data?.wbi_img?.sub_url || '';
  if (!img || !sub) {
    throw new Error(`nav 未返回 wbi_img (code=${j.code} message=${j.message})`);
  }
  const keyOf = (url) => url.split('/').pop().split('.')[0];
  wbiCache = { imgKey: keyOf(img), subKey: keyOf(sub), fetchedAt: Date.now() };
  return wbiCache;
}

// ---------- 基础请求 ----------
function baseHeaders(extra = {}) {
  const h = {
    'User-Agent': UA,
    Referer: REFERER,
    Accept: 'application/json, text/plain, */*',
    ...extra,
  };
  if (cookieStore.cookies) h.Cookie = cookieStore.cookies;
  return h;
}

// 把 fetch 失败原因转成可读信息（含底层错误码）
function netDetail(e) {
  const c = e?.cause;
  const code = c?.code || (Array.isArray(c?.errors) && c.errors[0]?.code) || '';
  const addr = c?.address ? ` ${c.address}` : '';
  const base = c ? `${c.message || ''}${code ? ` [${code}${addr}]` : ''}` : '';
  return (e?.message || 'fetch failed') + (base ? `（原因：${base}）` : '');
}

async function ensureBuvid() {
  if (cookieNames(cookieStore.cookies).includes('buvid3')) return;
  try {
    const res = await fetch(`${BILI_API}/x/frontend/finger/spi`, { headers: baseHeaders(), signal: AbortSignal.timeout(20000) });
    const j = await res.json();
    if (j.code === 0 && j.data?.b_3) {
      cookieStore.cookies = mergeCookies(cookieStore.cookies, `buvid3=${j.data.b_3}; buvid4=${j.data.b_4 || ''}`);
      cookieStore.updatedAt = new Date().toISOString();
      saveCookies();
    }
  } catch (e) {
    console.warn('buvid fetch failed:', e.message);
  }
}

async function biliFetch(path, { params = {}, wbi = false, method = 'GET', form = null, base = BILI_API, retried = false } = {}) {
  await ensureBuvid();
  let url;
  const init = { method, headers: baseHeaders() };
  if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
    url = `${base}${path}`;
  } else if (wbi) {
    await ensureWbiKeys();
    url = `${base}${path}?${encWbiQuery(params, wbiCache.imgKey, wbiCache.subKey)}`;
  } else {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) sp.set(k, String(v));
    const qs = sp.toString();
    url = `${base}${path}${qs ? '?' + qs : ''}`;
  }

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  } catch (e) {
    return {
      json: { code: 'NETWORK', message: '无法连接 B 站 API：' + netDetail(e) + '。请检查网络或代理后重试。' },
      text: '',
      meta: { endpoint: path, status: 0, wbi, timeMs: Date.now() - t0, url: wbi ? url.replace(/w_rid=[^&]*/, 'w_rid=***') : url },
    };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const meta = {
    endpoint: path,
    status: res.status,
    wbi,
    timeMs: Date.now() - t0,
    url: wbi ? url.replace(/w_rid=[^&]*/, 'w_rid=***') : url,
  };

  // WBI 签名失效 / 风控：刷新 key 重试一次
  if (wbi && !retried && json && (json.code === -403 || json.code === -352)) {
    wbiCache.fetchedAt = 0;
    return biliFetch(path, { params, wbi, method, form, base, retried: true });
  }
  return { json, text, meta };
}

// ---------- 结果规范化 ----------
const stripEm = (s) => String(s || '').replace(/<em class="keyword">|<\/em>/g, '');
const fmtDur = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n)) return String(s || '');
  const m = Math.floor(n / 60);
  const sec = Math.floor(n % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

function normVideo(v) {
  return { bvid: v.bvid, title: stripEm(v.title), cover: v.pic || '', author: v.author || '', play: v.play, dur: v.duration };
}

function normFav(m) {
  return { bvid: m.bvid || m.bv_id, title: m.title || '', cover: m.cover || '', author: m.upper?.name || '', play: m.cnt_info?.play, dur: fmtDur(m.duration) };
}

function normHist(h) {
  const bvid = h.history?.bvid || h.bvid || '';
  let progress = null;
  if (h.is_finish) progress = 100;
  else if (h.duration && h.progress != null) progress = Math.min(100, Math.round((h.progress / h.duration) * 100));
  return {
    bvid,
    title: h.title || '',
    cover: h.cover || h.pic || '',
    author: h.author_name || h.author || '',
    mid: h.author_mid || '',
    tname: h.tname || h.tag_name || '',
    viewAt: h.view_at || 0,
    dur: h.duration ? fmtDur(h.duration) : '',
    progress,
    finished: !!h.is_finish,
  };
}

// 历史内搜索：游标分页 + 标题本地过滤（最多翻 10 页 / 凑满 target 条）
async function searchHistory(keyword, max, viewAt, target = 20) {
  const kw = keyword.toLowerCase();
  const matches = [];
  let curMax = max || '';
  let curViewAt = viewAt || '';
  let guard = 0;
  while (matches.length < target && guard < 10) {
    const params = { ps: 20 };
    if (curMax) params.max = curMax;
    if (curViewAt) params.view_at = curViewAt;
    const r = await biliFetch('/x/web-interface/history/cursor', { params });
    const d = r.json?.data;
    if (r.json?.code !== 0 || !d) break;
    for (const it of d.list || []) {
      if ((it.title || '').toLowerCase().includes(kw) && (it.history?.bvid || it.bvid)) matches.push(normHist(it));
    }
    const items = d.list || [];
    const c = d.cursor || {};
    curMax = c.max || '';
    curViewAt = c.view_at || '';
    if (!items.length || items.length < 20) {
      curMax = '';
      break;
    }
    guard++;
  }
  return { items: matches, nextMax: curMax, nextViewAt: curViewAt, hasMore: !!curMax };
}

function normUP(u) {
  return {
    mid: u.mid,
    uname: u.uname || '',
    face: u.face || '',
    sign: u.sign || '',
    attribute: u.attribute ?? 0,
    special: u.special ?? 0,
    tag: Array.isArray(u.tag) ? u.tag : [],
    vip: !!u.vip?.status,
  };
}

function normDynamic(it) {
  const m = it.modules || {};
  const author = m.module_author || {};
  const dyn = m.module_dynamic || {};
  const major = dyn.major || {};
  const arch = major.archive || {};
  const stat = m.module_stat || {};
  return {
    id: it.id_str || '',
    type: major.type || '',
    bvid: arch.bvid || '',
    title: arch.title || '',
    cover: arch.cover || '',
    duration: arch.duration_text || '',
    play: arch.stat?.play,
    author: author.name || '',
    mid: String(author.mid || ''),
    face: author.face || '',
    pubTime: author.pub_ts || 0,
    desc: (typeof dyn.desc === 'string' ? dyn.desc : (dyn.desc && dyn.desc.text) || '')
      .replace(/<[^>]+>/g, ' ')
      .trim()
      .slice(0, 80),
    like: stat.like?.count,
    comment: stat.comment?.count,
  };
}

function codecFamily(codecs) {
  const c = String(codecs || '').toLowerCase();
  if (c.startsWith('av01')) return 'av1';
  if (c.startsWith('hvc1') || c.startsWith('hev1')) return 'hevc';
  if (c.startsWith('avc1')) return 'avc';
  return 'other';
}

function normalizeDynFeed(r) {
  const d = r.json?.data;
  const items = (d?.items || []).map(normDynamic).filter((x) => x.bvid && x.type === 'MAJOR_TYPE_ARCHIVE');
  return {
    ok: r.json?.code === 0,
    code: r.json?.code,
    message: r.json?.message,
    items,
    updateNum: d?.update_num || 0,
    hasMore: !!d?.has_more,
    offset: d?.offset || '',
    updateBaseline: d?.update_baseline || 0,
    meta: r.meta,
  };
}

function normComment(com) {
  return {
    rpid: com.rpid,
    uname: com.member?.uname || '',
    avatar: com.member?.avatar || '',
    message: com.content?.message || '',
    like: com.like || 0,
    rcount: com.rcount || 0,
    ctime: com.ctime || 0,
    replies: (com.replies || []).slice(0, 3).map(normComment),
  };
}

// ---------- 视频流令牌与 MPD ----------
const streamTokens = new Map(); // token -> { url, at }
const STREAM_TTL = 60 * 60 * 1000;

function storeStreamUrl(url) {
  const token = createHash('sha256').update(url + Date.now()).digest('hex').slice(0, 24);
  streamTokens.set(token, { url, at: Date.now() });
  if (streamTokens.size > 300) {
    const now = Date.now();
    for (const [k, v] of streamTokens) {
      if (now - v.at > STREAM_TTL) streamTokens.delete(k);
    }
  }
  return token;
}

function getStreamUrl(token) {
  const e = streamTokens.get(token);
  if (!e || Date.now() - e.at > STREAM_TTL) return null;
  return e.url;
}

function xmlEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildMpd(dash) {
  const video = (dash.video || [])
    .map((v) => {
      const t = storeStreamUrl(v.baseUrl);
      return (
        `<Representation id="${v.id}" bandwidth="${v.bandwidth}" width="${v.width}" height="${v.height}" codecs="${xmlEscape(v.codecs)}" frameRate="${xmlEscape(v.frameRate || '')}">` +
        `<BaseURL>/api/stream/${t}</BaseURL>` +
        `<SegmentBase indexRange="${xmlEscape(v.segment_base.index_range)}" timescale="1000">` +
        `<Initialization range="${xmlEscape(v.segment_base.initialization)}"/>` +
        `</SegmentBase></Representation>`
      );
    })
    .join('');
  const audio = (dash.audio || [])
    .map((a) => {
      const t = storeStreamUrl(a.baseUrl);
      return (
        `<Representation id="${a.id}" bandwidth="${a.bandwidth}" codecs="${xmlEscape(a.codecs)}" audioSamplingRate="${xmlEscape(a.audioSamplingRate || '')}">` +
        `<BaseURL>/api/stream/${t}</BaseURL>` +
        `<SegmentBase indexRange="${xmlEscape(a.segment_base.index_range)}" timescale="1000">` +
        `<Initialization range="${xmlEscape(a.segment_base.initialization)}"/>` +
        `</SegmentBase></Representation>`
      );
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT${dash.duration}S" minBufferTime="PT1.5S">
  <Period start="PT0S">
    <AdaptationSet id="1" mimeType="video/mp4" contentType="video" segmentAlignment="true" startWithSAP="1">${video}</AdaptationSet>
    <AdaptationSet id="2" mimeType="audio/mp4" contentType="audio" segmentAlignment="true" startWithSAP="1">${audio}</AdaptationSet>
  </Period>
</MPD>`;
}

// ---------- 播放流策略：先 DASH，失败回退单文件 ----------
async function getPlayData(bvid, cid, qn, codec) {
  const qnNum = Number(qn) || 80; // 默认 1080P，无权限时 B 站自动降级
  const want = codec === 'avc' || codec === 'hevc' || codec === 'av1' ? codec : 'auto';
  const r2 = await biliFetch('/x/player/wbi/playurl', {
    params: { bvid, cid, fnval: 4048, fourk: 1, qn: qnNum },
    wbi: true,
  });
  const d2 = r2.json?.data;
  if (r2.json?.code === 0 && d2?.dash?.video?.length) {
    const allCodecs = [...new Set((d2.dash.video || []).map((v) => codecFamily(v.codecs)))];
    let videos = d2.dash.video || [];
    let used = want;
    if (want !== 'auto') {
      const filtered = videos.filter((v) => codecFamily(v.codecs) === want);
      if (filtered.length) videos = filtered;
      else used = 'auto';
    }
    if (used === 'auto') {
      const order = ['avc', 'hevc', 'av1'];
      used = order.find((f) => videos.some((v) => codecFamily(v.codecs) === f)) || 'avc';
      videos = videos.filter((v) => codecFamily(v.codecs) === used);
    }
    return {
      ok: true,
      type: 'dash',
      codec: used,
      codecs: allCodecs,
      mpdUrl: `/api/play.mpd?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}&qn=${qnNum}&codec=${used}`,
      quality: d2.quality,
      acceptQuality: d2.accept_quality || [],
      duration: d2.dash.duration,
      meta: r2.meta,
    };
  }

  const r1 = await biliFetch('/x/player/wbi/playurl', {
    params: { bvid, cid, fnval: 1, fourk: 1, qn: qnNum },
    wbi: true,
  });
  const d1 = r1.json?.data;
  if (r1.json?.code === 0 && d1?.durl?.length) {
    const item = d1.durl[0];
    let type = 'mp4';
    try {
      const ext = new URL(item.url).pathname.split('.').pop().toLowerCase();
      if (ext === 'flv') type = 'flv';
    } catch {}
    return {
      ok: true,
      type,
      streamUrl: `/api/stream/${storeStreamUrl(item.url)}`,
      quality: d1.quality,
      acceptQuality: d1.accept_quality || [],
      duration: item.length,
      meta: r1.meta,
    };
  }
  return {
    ok: false,
    error: `获取播放流失败: dash code=${r2.json?.code} ${r2.json?.message} / durl code=${r1.json?.code} ${r1.json?.message}`,
  };
}

// ---------- 登录 ----------
let qrSession = null;

async function checkLogin() {
  const { json } = await biliFetch('/x/web-interface/nav');
  if (json?.code !== 0) return { ok: false, code: json?.code, message: json?.message, raw: json };
  const d = json.data;
  return {
    ok: !!d.isLogin,
    mid: d.mid,
    uname: d.uname,
    face: d.face,
    level: d.level_info?.current_level,
    vip: d.vipStatus === 1,
    wbiKeys: d.wbi_img
      ? {
          imgKey: d.wbi_img.img_url.split('/').pop().split('.')[0],
          subKey: d.wbi_img.sub_url.split('/').pop().split('.')[0],
        }
      : null,
  };
}

async function qrGenerate() {
  let j;
  try {
    const res = await fetch(`${BILI_PASSPORT}/x/passport-login/web/qrcode/generate`, {
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: 'https://passport.bilibili.com/login', Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    j = await res.json();
  } catch (e) {
    j = { code: 'NETWORK', message: '无法连接 B 站登录服务：' + netDetail(e) };
  }
  if (j.code === 0) {
    qrSession = { key: j.data.qrcode_key, url: j.data.url, expires: Date.now() + 3 * 60 * 1000 };
  }
  return { json: j, qr: qrSession };
}

async function fetchCookieChain(url) {
  let cookies = '';
  let current = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': UA, Referer: REFERER },
      signal: AbortSignal.timeout(20000),
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (setCookies.length) {
      cookies = mergeCookies(cookies, setCookies.map((c) => c.split(';')[0]).join('; '));
    }
    const loc = res.headers.get('location');
    if (!loc || res.status < 300 || res.status >= 400) break;
    current = new URL(loc, current).toString();
  }
  return cookies;
}

async function qrPoll(key) {
  let j;
  try {
    const res = await fetch(`${BILI_PASSPORT}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: 'https://passport.bilibili.com/login', Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    j = await res.json();
  } catch (e) {
    j = { code: 'NETWORK', message: '无法连接 B 站登录服务：' + netDetail(e) };
  }
  const inner = j?.data?.code; // 0 成功 / 86038 失效 / 86090 已扫码未确认 / 86101 未扫码
  if (j.code === 0 && inner === 0 && j.data?.url) {
    const got = await fetchCookieChain(j.data.url);
    if (got.includes('SESSDATA=')) {
      cookieStore.cookies = mergeCookies(cookieStore.cookies, got);
      cookieStore.updatedAt = new Date().toISOString();
      saveCookies();
      qrSession = null;
      return { json: j, inner, loggedIn: true };
    }
    return { json: j, inner, loggedIn: false, note: '登录成功但未捕获到 Cookie', got };
  }
  return { json: j, inner, loggedIn: false };
}

function setRawCookies(raw) {
  cookieStore.cookies = mergeCookies(cookieStore.cookies, raw);
  cookieStore.updatedAt = new Date().toISOString();
  saveCookies();
}

// ---------- 接口探针（一键验证） ----------
async function runVerify() {
  const results = [];
  const push = (name, r, note = '') => {
    const code = r?.json?.code;
    const ok = r?.json?.code === 0;
    results.push({
      name,
      ok,
      needsLogin: !ok && (code === -101 || r?.json?.message === '账号未登录'),
      code: code ?? r?.meta?.status,
      message: r?.json?.message ?? (r?.json ? JSON.stringify(r.json).slice(0, 80) : r?.text?.slice(0, 80)),
      timeMs: r?.meta?.timeMs,
      note,
    });
  };

  const login = await checkLogin();
  push('nav 登录信息', { json: { code: login.ok ? 0 : -101, message: login.ok ? '已登录' : '未登录', data: login }, meta: { timeMs: 0 } });

  const wbiKeys = await ensureWbiKeys();
  push('WBI key 获取', { json: { code: wbiKeys.imgKey ? 0 : -1, message: `img=${wbiKeys.imgKey.slice(0, 8)}... sub=${wbiKeys.subKey.slice(0, 8)}...` } }, '来自 nav 接口');

  const probe = await biliFetch('/x/web-interface/search/all/v2', { params: { keyword: '教程' }, wbi: true });
  push('搜索接口（WBI 签名探针）', probe, '缺 Cookie 时文档说明会返回 -412');

  const view = await biliFetch('/x/web-interface/view', { params: { bvid: 'BV1xx411c7mD' } });
  push('视频信息接口', view);

  const play = await getPlayData('BV1xx411c7mD', view.json?.data?.cid || 62131, 0);
  push('播放流接口', { json: { code: play.ok ? 0 : -1, message: play.ok ? `类型=${play.type} 清晰度=${play.quality}` : play.error }, meta: play.meta });

  if (login.ok) {
    const folders = await biliFetch('/x/v3/fav/folder/created/list-all', { params: { up_mid: login.mid, type: 0 } });
    push('收藏夹列表', folders);
    const hist = await biliFetch('/x/web-interface/history/cursor', { params: { ps: 5 } });
    push('历史记录', hist);
    const up = await biliFetch('/x/space/wbi/arc/search', { params: { mid: login.mid, pn: 1, ps: 5, order: 'pubdate' }, wbi: true });
    push('个人投稿', up);
  } else {
    for (const name of ['收藏夹列表', '历史记录', '个人投稿']) {
      results.push({ name, ok: false, needsLogin: true, code: '-', message: '未登录，跳过' });
    }
  }
  return results;
}

// ---------- 关注全量缓存（避免频繁拉 1000 人列表） ----------
let followCache = { key: '', data: null, at: 0 };
const FOLLOW_TTL = 5 * 60 * 1000;

async function getAllFollowings(vmid, tagid = '') {
  const key = tagid || 'all';
  if (followCache.key === key && followCache.data && Date.now() - followCache.at < FOLLOW_TTL) return followCache.data;
  const out = [];
  let total = 0;
  for (let page = 1; page <= 20; page++) {
    const r = await biliFetch('/x/relation/followings', { params: { vmid, pn: page, ps: 50, order: 'desc', ...(tagid ? { tagid } : {}) } });
    const d = r.json?.data;
    if (r.json?.code !== 0 || !d) break;
    total = d.total || total;
    out.push(...(d.list || []).map(normUP));
    if (!d.list?.length || d.list.length < 50 || out.length >= total) break;
  }
  const data = { list: out, total, pages: Math.ceil(out.length / 50) };
  followCache = { key, data, at: Date.now() };
  return data;
}

// ---------- HTTP 服务 ----------
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.mpd': 'application/dash+xml; charset=utf-8',
  '.xml': 'text/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};
function applyCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  applyCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const favCheckCache = new Map(); // bvid -> { at, data }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = u.pathname;

  try {
    if (req.method === 'OPTIONS') {
      applyCors(res);
      res.writeHead(204);
      return res.end();
    }

    // 视频流代理（Range 转发，带 Referer 防盗链头）
    if (req.method === 'GET' && path.startsWith('/api/stream/')) {
      const token = path.slice('/api/stream/'.length);
      const streamUrl = getStreamUrl(token);
      if (!streamUrl) return sendJson(res, 404, { ok: false, error: '流地址已失效，请重新打开视频' });
      const h = { 'User-Agent': UA, Referer: REFERER };
      if (req.headers.range) h.Range = req.headers.range;
      let up;
      try {
        up = await fetch(streamUrl, { headers: h, redirect: 'follow', signal: AbortSignal.timeout(30000) });
      } catch (e) {
        return sendJson(res, 502, { ok: false, error: '流代理请求失败：' + (e.name === 'TimeoutError' ? '上游超时' : e.message) });
      }
      if (!up.ok) return sendJson(res, 502, { ok: false, error: `流代理失败: HTTP ${up.status}` });
      const outHeaders = {
        'Content-Type': up.headers.get('content-type') || 'application/octet-stream',
        'Accept-Ranges': up.headers.get('accept-ranges') || 'bytes',
        'Cache-Control': 'private, max-age=3600',
      };
      const cl = up.headers.get('content-length');
      if (cl) outHeaders['Content-Length'] = cl;
      const cr = up.headers.get('content-range');
      if (cr) outHeaders['Content-Range'] = cr;
      applyCors(res);
      res.writeHead(up.status, outHeaders);
      try {
        for await (const chunk of up.body) {
          if (res.destroyed) break;
          res.write(chunk);
        }
        if (!res.destroyed) {
          try {
            res.end();
          } catch {}
        }
      } catch {
        if (!res.destroyed) {
          try {
            res.destroy();
          } catch {}
        }
      }
      return;
    }

    // 静态资源
    if (!path.startsWith('/api/')) {
      const rel = path === '/' ? 'index.html' : path.slice(1);
      const file = normalize(join(PUBLIC_DIR, rel));
      if (!file.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('forbidden');
      }
      if (!existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 not found');
      }
      const ext = extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return res.end(readFileSync(file));
    }

    const q = u.searchParams;

    // 快速就绪探针：不依赖 B 站网络，供启动器轮询
    if (req.method === 'GET' && path === '/api/ping') {
      return sendJson(res, 200, {
        ok: true,
        service: 'zhixue',
        node: process.version,
        port: PORT,
        host: HOST,
        lan: HOST !== '127.0.0.1',
        lanIPs: lanIPs().map((ip) => `http://${ip}:${PORT}`),
      });
    }

    if (req.method === 'GET' && path === '/api/status') {
      const login = await checkLogin();
      return sendJson(res, 200, {
        ok: true,
        node: process.version,
        port: PORT,
        host: HOST,
        lan: HOST !== '127.0.0.1',
        lanIPs: lanIPs().map((ip) => `http://${ip}:${PORT}`),
        login,
        cookieNames: cookieNames(cookieStore.cookies),
      });
    }

    if (req.method === 'GET' && path === '/api/nav') {
      const r = await biliFetch('/x/web-interface/nav');
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/search') {
      const keyword = (q.get('keyword') || '').trim();
      const scope = q.get('scope') || 'all';
      const page = Math.max(1, parseInt(q.get('page'), 10) || 1);
      if (!keyword) return sendJson(res, 400, { ok: false, error: '缺少 keyword 参数' });

      if (scope === 'fav') {
        const r = await biliFetch('/x/v3/fav/resource/list', {
          params: { type: 1, keyword, pn: page, ps: 20, platform: 'web' },
        });
        if (r.json?.code !== 0) return sendJson(res, 200, { ok: false, code: r.json?.code, message: r.json?.message, meta: r.meta });
        const medias = r.json.data?.medias || [];
        return sendJson(res, 200, {
          ok: true, code: 0, scope, keyword, page,
          hasMore: !!r.json.data?.has_more,
          items: medias.map(normFav),
          meta: r.meta,
        });
      }

      if (scope === 'history') {
        const histRes = await searchHistory(keyword, q.get('max') || '', q.get('view_at') || '');
        return sendJson(res, 200, {
          ok: true, code: 0, scope, keyword, page: 0,
          hasMore: histRes.hasMore, nextMax: histRes.nextMax, nextViewAt: histRes.nextViewAt,
          items: histRes.items,
        });
      }

      const r = await biliFetch('/x/web-interface/wbi/search/type', {
        params: { search_type: 'video', keyword, page, page_size: 20 },
        wbi: true,
      });
      if (r.json?.code !== 0) return sendJson(res, 200, { ok: false, code: r.json?.code, message: r.json?.message, meta: r.meta });
      const list = (r.json.data?.result || []).filter((v) => v.bvid);
      const total = r.json.data?.numResults ?? 0;
      return sendJson(res, 200, {
        ok: true, code: 0, scope, keyword, page,
        hasMore: list.length > 0 && page * 20 < total,
        total,
        items: list.map(normVideo),
        meta: r.meta,
      });
    }

    if (req.method === 'GET' && path === '/api/video') {
      const bvid = q.get('bvid') || '';
      if (!bvid) return sendJson(res, 400, { ok: false, error: '缺少 bvid 参数' });
      const r = await biliFetch('/x/web-interface/view', { params: { bvid } });
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/playurl') {
      const bvid = q.get('bvid') || '';
      const cid = q.get('cid') || '';
      if (!bvid || !cid) return sendJson(res, 400, { ok: false, error: '缺少 bvid/cid 参数' });
      const r = await biliFetch('/x/player/wbi/playurl', { params: { bvid, cid, fnval: 4048, fourk: 1 }, wbi: true });
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/play') {
      const bvid = q.get('bvid') || '';
      const cid = q.get('cid') || '';
      if (!bvid || !cid) return sendJson(res, 400, { ok: false, error: '缺少 bvid/cid 参数' });
      const r = await getPlayData(bvid, cid, q.get('qn'), q.get('codec') || 'auto');
      return sendJson(res, 200, r);
    }

    if (req.method === 'GET' && path === '/api/play.mpd') {
      const bvid = q.get('bvid') || '';
      const cid = q.get('cid') || '';
      const codec = q.get('codec') || 'auto';
      if (!bvid || !cid) return sendJson(res, 400, { ok: false, error: '缺少 bvid/cid 参数' });
      const r2 = await biliFetch('/x/player/wbi/playurl', {
        params: { bvid, cid, fnval: 4048, fourk: 1, qn: Number(q.get('qn')) || 80 },
        wbi: true,
      });
      if (r2.json?.code !== 0 || !r2.json.data?.dash) {
        return sendJson(res, 502, { ok: false, error: `获取 DASH 失败: code=${r2.json?.code} ${r2.json?.message}` });
      }
      let videos = r2.json.data.dash.video || [];
      if (codec !== 'auto') {
        const filtered = videos.filter((v) => codecFamily(v.codecs) === codec);
        if (filtered.length) videos = filtered;
      }
      applyCors(res);
      res.writeHead(200, { 'Content-Type': 'application/dash+xml; charset=utf-8', 'Cache-Control': 'private, max-age=300' });
      return res.end(buildMpd({ ...r2.json.data.dash, video: videos }));
    }

    if (req.method === 'POST' && path === '/api/play/report') {
      const body = await readBody(req);
      const csrf = (cookieStore.cookies.match(/bili_jct=([^;]+)/) || [])[1] || '';
      if (!csrf) return sendJson(res, 200, { ok: false, error: '缺少 bili_jct，登录状态可能已过期' });
      const aid = Number(body.aid) || 0;
      const cid = Number(body.cid) || 0;
      const mid = Number(body.mid) || 0;
      if (!aid || !cid || !mid) return sendJson(res, 400, { ok: false, error: '缺少 aid/cid/mid 参数' });
      const playType = [0, 1, 2, 3, 4].includes(Number(body.play_type)) ? Number(body.play_type) : 0;
      const r = await biliFetch('/x/click-interface/web/heartbeat', {
        method: 'POST',
        form: {
          aid,
          bvid: String(body.bvid || ''),
          cid,
          mid,
          csrf,
          played_time: Math.max(0, Math.round(Number(body.played_time) || 0)),
          realtime: Math.max(0, Math.round(Number(body.realtime) || 0)),
          start_ts: Math.round(Number(body.start_ts) || Date.now() / 1000),
          type: 3,
          dt: 2,
          play_type: playType,
        },
      });
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/upload') {
      const mid = q.get('mid') || '';
      if (!mid) return sendJson(res, 400, { ok: false, error: '缺少 mid 参数' });
      const r = await biliFetch('/x/space/wbi/arc/search', {
        params: { mid, pn: q.get('pn') || 1, ps: q.get('ps') || 20, order: 'pubdate' },
        wbi: true,
      });
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/fav/folders') {
      const mid = q.get('up_mid') || '';
      if (!mid) return sendJson(res, 400, { ok: false, error: '缺少 up_mid 参数' });
      const r = await biliFetch('/x/v3/fav/folder/created/list-all', { params: { up_mid: mid, type: 0 } });
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/fav/list') {
      const mediaId = q.get('media_id') || '';
      if (!mediaId) return sendJson(res, 400, { ok: false, error: '缺少 media_id 参数' });
      const params = {
        media_id: mediaId,
        pn: q.get('pn') || 1,
        ps: q.get('ps') || 30,
        platform: 'web',
        order: 'mtime',
      };
      if (q.get('keyword')) params.keyword = q.get('keyword');
      const r = await biliFetch('/x/v3/fav/resource/list', { params });
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/history') {
      const keyword = (q.get('keyword') || '').trim();
      if (keyword) {
        const histRes = await searchHistory(keyword, q.get('max') || '', q.get('view_at') || '');
        return sendJson(res, 200, {
          ok: true, code: 0, keyword,
          hasMore: histRes.hasMore, nextMax: histRes.nextMax, nextViewAt: histRes.nextViewAt,
          items: histRes.items,
        });
      }
      const params = { ps: q.get('ps') || 20 };
      if (q.get('max')) params.max = q.get('max');
      if (q.get('view_at')) params.view_at = q.get('view_at');
      const r = await biliFetch('/x/web-interface/history/cursor', { params });
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/login/qr') {
      const r = await qrGenerate();
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, qr: r.qr });
    }

    if (req.method === 'GET' && path === '/api/login/poll') {
      const key = q.get('key') || qrSession?.key;
      if (!key) return sendJson(res, 400, { ok: false, error: '缺少 key，请先获取二维码' });
      const r = await qrPoll(key);
      return sendJson(res, 200, { ok: r.json?.code === 0, loggedIn: r.loggedIn, inner: r.inner, note: r.note, got: r.got, ...r.json });
    }

    if (req.method === 'POST' && path === '/api/login/cookie') {
      const body = await readBody(req);
      const raw = body?.cookie || body?.raw || '';
      console.log(
        '[zhixue-node] login/cookie: len=' + String(raw).length +
        ' hasSESSDATA=' + String(raw).includes('SESSDATA=') +
        ' hasJCT=' + String(raw).includes('bili_jct=')
      );
      if (!raw || !raw.includes('=')) return sendJson(res, 400, { ok: false, error: 'Cookie 格式不正确' });
      setRawCookies(raw);
      const login = await checkLogin();
      console.log('[zhixue-node] login/cookie result: ok=' + login.ok + ' code=' + login.code + ' msg=' + (login.message || ''));
      return sendJson(res, 200, { ok: true, login });
    }

    if (req.method === 'POST' && path === '/api/login/clear') {
      cookieStore.cookies = '';
      cookieStore.updatedAt = new Date().toISOString();
      saveCookies();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && path === '/api/verify') {
      const results = await runVerify();
      return sendJson(res, 200, { ok: true, results });
    }

    if (req.method === 'GET' && path === '/api/comments') {
      const bvid = q.get('bvid') || '';
      const next = parseInt(q.get('next'), 10) || 0;
      if (!bvid) return sendJson(res, 400, { ok: false, error: '缺少 bvid 参数' });
      const view = await biliFetch('/x/web-interface/view', { params: { bvid } });
      const aid = view.json?.data?.aid;
      if (view.json?.code !== 0 || !aid) {
        return sendJson(res, 200, { ok: false, code: view.json?.code, message: view.json?.message || '获取视频 aid 失败' });
      }
      const r = await biliFetch('/x/v2/reply/main', { params: { type: 1, oid: aid, mode: 3, next, ps: 20 } });
      if (r.json?.code !== 0) {
        return sendJson(res, 200, { ok: false, code: r.json?.code, message: r.json?.message, meta: r.meta });
      }
      const d = r.json.data || {};
      return sendJson(res, 200, {
        ok: true, code: 0, bvid, aid,
        next: d.cursor?.next ?? next + 1,
        isEnd: !!d.cursor?.is_end,
        total: d.cursor?.all_count ?? (d.replies || []).length,
        topReplies: (d.top_replies || []).map(normComment),
        replies: (d.replies || []).map(normComment),
        meta: r.meta,
      });
    }

    if (req.method === 'GET' && path === '/api/fav/check') {
      const bvid = q.get('bvid') || '';
      if (!bvid) return sendJson(res, 400, { ok: false, error: '缺少 bvid 参数' });
      const cached = favCheckCache.get(bvid);
      if (cached && Date.now() - cached.at < 3 * 60 * 1000) return sendJson(res, 200, cached.data);
      const view = await biliFetch('/x/web-interface/view', { params: { bvid } });
      const aid = view.json?.data?.aid;
      if (view.json?.code !== 0 || !aid) {
        return sendJson(res, 200, { ok: false, code: view.json?.code, message: view.json?.message || '获取视频 aid 失败' });
      }
      const login = await checkLogin();
      if (!login.ok) return sendJson(res, 200, { ok: false, needsLogin: true, message: '未登录' });
      const foldersRes = await biliFetch('/x/v3/fav/folder/created/list-all', { params: { up_mid: login.mid, type: 0 } });
      const folders = foldersRes.json?.data?.list || [];
      const out = await Promise.all(folders.map(async (f) => {
        const idsRes = await biliFetch('/x/v3/fav/resource/ids', { params: { media_id: f.id, platform: 'web' } });
        const ids = idsRes.json?.data || [];
        return { id: f.id, title: f.title, media_count: f.media_count, has: ids.some((x) => x.id === aid) };
      }));
      const data = { ok: true, code: 0, bvid, aid, folders: out };
      favCheckCache.set(bvid, { at: Date.now(), data });
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST' && path === '/api/fav/deal') {
      const body = await readBody(req);
      const rid = Number(body?.rid || 0);
      const addIds = String(body?.add_media_ids || '');
      const delIds = String(body?.del_media_ids || '');
      if (!rid) return sendJson(res, 400, { ok: false, error: '缺少 rid(aid)' });
      const csrf = (cookieStore.cookies.match(/bili_jct=([^;]+)/) || [])[1] || '';
      if (!csrf) return sendJson(res, 200, { ok: false, error: '缺少 bili_jct，登录状态可能已过期' });
      const r = await biliFetch('/x/v3/fav/resource/deal', {
        method: 'POST',
        form: {
          rid, type: 2, platform: 'web',
          add_media_ids: addIds,
          del_media_ids: delIds,
          csrf, eab_x: 1, ramval: 0, ga: 1,
          gaia_source: 'web_main', from_fts: 0,
        },
      });
      if (r.json?.code === 0) favCheckCache.clear();
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/followings') {
      const vmid = q.get('vmid') || '';
      if (!vmid) return sendJson(res, 400, { ok: false, error: '缺少 vmid 参数' });
      const tagid = q.get('tagid') || '';
      if (q.get('all') === '1') {
        const data = await getAllFollowings(vmid, tagid);
        return sendJson(res, 200, { ok: true, code: 0, list: data.list, total: data.total, meta: { all: true, pages: data.pages } });
      }
      const pn = Math.max(1, parseInt(q.get('pn'), 10) || 1);
      const ps = Math.min(50, Math.max(1, parseInt(q.get('ps'), 10) || 20));
      const r = await biliFetch('/x/relation/followings', { params: { vmid, pn, ps, order: 'desc', ...(tagid ? { tagid } : {}) } });
      const d = r.json?.data;
      return sendJson(res, 200, {
        ok: r.json?.code === 0,
        code: r.json?.code,
        message: r.json?.message,
        list: (d?.list || []).map(normUP),
        total: d?.total || 0,
        meta: r.meta,
      });
    }

    if (req.method === 'GET' && path === '/api/relation/tags') {
      const r = await biliFetch('/x/relation/tags', { params: {} });
      return sendJson(res, 200, { ok: r.json?.code === 0, ...r.json, meta: r.meta });
    }

    if (req.method === 'GET' && path === '/api/user') {
      const mid = q.get('mid') || '';
      if (!mid) return sendJson(res, 400, { ok: false, error: '缺少 mid 参数' });
      const r = await biliFetch('/x/web-interface/card', { params: { mid } });
      const card = r.json?.data?.card;
      return sendJson(res, 200, {
        ok: r.json?.code === 0,
        code: r.json?.code,
        message: r.json?.message,
        data: card ? { mid: card.mid, uname: card.name, face: card.face, sign: card.sign } : null,
        meta: r.meta,
      });
    }

    if (req.method === 'GET' && path === '/api/dynamics/space') {
      const hostMid = q.get('host_mid') || '';
      if (!hostMid) return sendJson(res, 400, { ok: false, error: '缺少 host_mid 参数' });
      const r = await biliFetch('/x/polymer/web-dynamic/v1/feed/space', {
        params: {
          host_mid: hostMid,
          offset: q.get('offset') || '',
          time: q.get('time') || '',
          page: 1,
          platform: 'web',
          web_location: '333.1365',
        },
      });
      return sendJson(res, 200, normalizeDynFeed(r));
    }

    // 查看某 UP 的动态（复刻 B 站网页请求：feed/all + host_mid，触发服务端已读）
    if (req.method === 'GET' && path === '/api/dynamics/up') {
      const hostMid = q.get('host_mid') || '';
      if (!hostMid) return sendJson(res, 400, { ok: false, error: '缺少 host_mid 参数' });
      const r = await biliFetch('/x/polymer/web-dynamic/v1/feed/all', {
        params: {
          host_mid: hostMid,
          offset: q.get('offset') || '',
          time: q.get('time') || '',
          page: 1,
          platform: 'web',
          features:
            'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard,commentsNewVersion,avatarAutoTheme,sunflowerStyle,cardsEnhance,eva3CardOpus,eva3CardVideo,eva3CardComment,eva3CardVote,eva3CardUser',
          web_location: '333.1365',
        },
      });
      return sendJson(res, 200, normalizeDynFeed(r));
    }

    if (req.method === 'GET' && path === '/api/dynamics/all') {
      const r = await biliFetch('/x/polymer/web-dynamic/v1/feed/all', {
        params: { offset: q.get('offset') || '', time: q.get('time') || '' },
      });
      return sendJson(res, 200, normalizeDynFeed(r));
    }

    if (req.method === 'GET' && path === '/api/netcheck') {
      const t0 = Date.now();
      try {
        const up = await fetch(`${BILI_API}/x/frontend/finger/spi`, {
          headers: baseHeaders(),
          signal: AbortSignal.timeout(10000),
        });
        const j = await up.json();
        console.log('[zhixue-node] netcheck: http=' + up.status + ' code=' + j.code + ' time=' + (Date.now() - t0) + 'ms');
        return sendJson(res, 200, {
          ok: j.code === 0,
          http: up.status,
          timeMs: Date.now() - t0,
          code: j.code,
          message: j.message || '',
        });
      } catch (e) {
        console.error('[zhixue-node] netcheck failed:', netDetail(e));
        return sendJson(res, 200, { ok: false, timeMs: Date.now() - t0, error: netDetail(e) });
      }
    }

    sendJson(res, 404, { ok: false, error: '接口不存在' });
  } catch (e) {
    console.error(`[${req.method} ${path}]`, e);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: netDetail(e) });
    } else {
      try {
        res.destroy();
      } catch {}
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`知学 started: http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`局域网访问（同一 WiFi）: http://${ip}:${PORT}`);
  console.log('Cookie 仅保存在本机 data/cookies.json，请勿把该服务暴露到公网。');
});

// Android：接收启动器的局域网开关消息，热切换监听地址
if (process.env.BF_ANDROID === '1') {
  try {
    const bridge = __require('bridge');
    if (bridge && bridge.channel && typeof bridge.channel.addListener === 'function') {
      bridge.channel.addListener('set-lan', (value) => {
        const lan = value === true || value === 'on' || value === '1';
        const host = lan ? '0.0.0.0' : '127.0.0.1';
        console.log('[zhixue-node] set-lan received: ' + String(value) + ' -> bind ' + host);
        try {
          writeFileSync(join(DATA_DIR, 'settings.json'), JSON.stringify({ lan, host }, null, 2));
        } catch {}
        server.close(() => {
          server.listen(PORT, host, () => {
            console.log(`知学 ${lan ? '局域网' : '仅本机'}模式：http://${host}:${PORT}`);
          });
        });
      });
      console.log('知学 Android IPC 就绪（set-lan）');
    }
  } catch {}
}

server.on('error', (e) => {
  console.error('[zhixue-node] server error:', e && e.message ? e.message : e);
});
