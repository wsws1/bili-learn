// 知学前端 API 客户端：只调本地 /api 代理
// 进行中的请求注册表：记录开始时间。切换页面时只取消“老”请求（超过 2 秒仍未完成），
// 让正常速度的请求自然完成，避免快速切页反复 abort 导致浏览器连接池抖动占满（“集体加载中”的根源）
const activeControllers = new Map(); // AbortController -> startedAt

export function abortStale(maxAgeMs = 2000) {
  const now = Date.now();
  for (const [ctrl, at] of activeControllers) {
    if (now - at > maxAgeMs) {
      try {
        ctrl.abort();
      } catch {}
    }
  }
}

// 响应缓存：命中缓存不再发网络请求，避免快速来回切页重复拉数据（请求风暴）
const respCache = new Map(); // key -> { at, data }
const cacheKey = (method, url) => method + ' ' + url;

// 并发限制：同一时刻最多并发 4 个请求，防止占满浏览器到本地服务器的连接池
const MAX_CONCURRENT = 4;
let inFlight = 0;
const reqQueue = [];

function enqueue(task) {
  return new Promise((resolve, reject) => {
    reqQueue.push({ task, resolve, reject });
    pump();
  });
}

function pump() {
  while (inFlight < MAX_CONCURRENT && reqQueue.length) {
    const { task, resolve, reject } = reqQueue.shift();
    inFlight++;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        inFlight--;
        pump();
      });
  }
}

async function doRequest(path, url, options) {
  const { method = 'GET', timeoutMs = 6000, retries = 0, cacheMs = 0 } = options;
  const init = { method, headers: {} };
  if (options.body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    activeControllers.set(ctrl, Date.now());
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    try {
      let res;
      try {
        res = await fetch(url, { ...init, signal: ctrl.signal });
      } catch (e) {
        lastErr = e.name === 'AbortError'
          ? new Error(timedOut ? `请求超时（${timeoutMs}ms）：${path}` : '已取消（页面切换）')
          : new Error('网络错误：' + e.message + '（' + path + '）');
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        throw lastErr;
      }
      let json;
      try {
        // 超时与页面切换取消覆盖整个响应读取，避免服务端响应体卡住时前端永远停在“加载中”
        json = await res.json();
      } catch (e) {
        if (e && e.name === 'AbortError') {
          throw timedOut ? new Error(`请求超时（${timeoutMs}ms）：${path}`) : new Error('已取消（页面切换）');
        }
        throw new Error(`接口返回异常: HTTP ${res.status}`);
      }
      if (!res.ok && json && json.error) throw new Error(json.error);
      if (cacheMs > 0) respCache.set(cacheKey(method, url), { at: Date.now(), data: json });
      return json;
    } finally {
      clearTimeout(timer);
      activeControllers.delete(ctrl);
    }
  }
  throw lastErr;
}

function request(path, options = {}) {
  const { method = 'GET', params, cacheMs = 0 } = options;
  let url = path;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += '?' + qs;
  }
  const key = cacheKey(method, url);
  if (cacheMs > 0) {
    const hit = respCache.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return Promise.resolve(hit.data);
  }
  return enqueue(() => doRequest(path, url, options));
}

export const api = {
  status: () => request('/api/status'),
  nav: () => request('/api/nav'),
  verify: () => request('/api/verify'),
  netcheck: () => request('/api/netcheck'),

  searchAll: (keyword, page = 1) => request('/api/search', { params: { keyword, scope: 'all', page }, timeoutMs: 15000 }),
  searchFav: (keyword, page = 1) => request('/api/search', { params: { keyword, scope: 'fav', page }, timeoutMs: 15000 }),
  searchHistory: (keyword, max = '', viewAt = '') =>
    request('/api/search', { params: { keyword, scope: 'history', max, view_at: viewAt }, timeoutMs: 15000 }),

  video: (bvid) => request('/api/video', { params: { bvid }, timeoutMs: 10000 }),
  play: (bvid, cid, qn = 80, codec = 'auto') => request('/api/play', { params: { bvid, cid, qn, codec }, timeoutMs: 10000 }),
  report: (body) => request('/api/play/report', { method: 'POST', body }),

  favFolders: (mid) => request('/api/fav/folders', { params: { up_mid: mid }, cacheMs: 30000 }),
  favList: (mediaId, pn = 1, keyword = '') => request('/api/fav/list', { params: { media_id: mediaId, pn, ps: 30, keyword } }),
  favCheck: (bvid) => request('/api/fav/check', { params: { bvid }, timeoutMs: 15000, retries: 0 }),
  favDeal: (rid, addIds = '', delIds = '') =>
    request('/api/fav/deal', { method: 'POST', body: { rid, add_media_ids: addIds, del_media_ids: delIds } }),

  history: (ps = 20, max = '', viewAt = '') =>
    request('/api/history', { params: { ps, max, view_at: viewAt }, timeoutMs: 15000, cacheMs: 30000 }),
  historySearch: (keyword, max = '', viewAt = '') => request('/api/history', { params: { keyword, max, view_at: viewAt }, timeoutMs: 15000 }),

  followings: (mid, all = false, tagid = '') =>
    request('/api/followings', { params: { vmid: mid, all: all ? 1 : '', tagid }, timeoutMs: 30000, retries: 0 }),
  relationTags: () => request('/api/relation/tags'),
  user: (mid) => request('/api/user', { params: { mid } }),
  dynamicsAll: (offset = '', time = '') =>
    request('/api/dynamics/all', { params: { offset, time }, cacheMs: 30000 }),
  dynamicsSpace: (mid, offset = '', time = '') => request('/api/dynamics/space', { params: { host_mid: mid, offset, time } }),
  dynamicsUp: (mid, offset = '', time = '') => request('/api/dynamics/up', { params: { host_mid: mid, offset, time } }),

  comments: (bvid, next = 0) => request('/api/comments', { params: { bvid, next } }),
  upload: (mid, pn = 1, ps = 20) => request('/api/upload', { params: { mid, pn, ps } }),

  loginQr: () => request('/api/login/qr'),
  loginPoll: (key) => request('/api/login/poll', { params: { key } }),
  loginCookie: (cookie) => request('/api/login/cookie', { method: 'POST', body: { cookie } }),
  loginClear: () => request('/api/login/clear', { method: 'POST', body: {} }),
};
