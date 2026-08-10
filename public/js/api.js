// 知学前端 API 客户端：只调本地 /api 代理
// 正在进行的请求注册表：离开页面时统一取消，立即释放浏览器连接（避免连接池占满连锁阻塞）
const activeControllers = new Set();

export function abortAll() {
  for (const c of activeControllers) {
    try {
      c.abort();
    } catch {}
  }
  activeControllers.clear();
}

async function request(path, options = {}) {
  const { method = 'GET', params, body, timeoutMs = 6000, retries = 0 } = options;
  let url = path;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += '?' + qs;
  }
  const init = { method, headers: {} };
  if (body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  // 网络失败自动重试（手机网络抖动时自动恢复，避免频繁手动重试）
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    activeControllers.add(ctrl);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
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
    } finally {
      clearTimeout(timer);
      activeControllers.delete(ctrl);
    }
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(`接口返回异常: HTTP ${res.status}`);
    }
    if (!res.ok && json && json.error) throw new Error(json.error);
    return json;
  }
  throw lastErr;
}

export const api = {
  status: () => request('/api/status'),
  nav: () => request('/api/nav'),
  verify: () => request('/api/verify'),
  netcheck: () => request('/api/netcheck'),

  searchAll: (keyword, page = 1) => request('/api/search', { params: { keyword, scope: 'all', page } }),
  searchFav: (keyword, page = 1) => request('/api/search', { params: { keyword, scope: 'fav', page } }),
  searchHistory: (keyword, max = '', viewAt = '') =>
    request('/api/search', { params: { keyword, scope: 'history', max, view_at: viewAt } }),

  video: (bvid) => request('/api/video', { params: { bvid }, timeoutMs: 10000 }),
  play: (bvid, cid, qn = 80, codec = 'auto') => request('/api/play', { params: { bvid, cid, qn, codec }, timeoutMs: 10000 }),
  report: (body) => request('/api/play/report', { method: 'POST', body }),

  favFolders: (mid) => request('/api/fav/folders', { params: { up_mid: mid } }),
  favList: (mediaId, pn = 1, keyword = '') => request('/api/fav/list', { params: { media_id: mediaId, pn, ps: 30, keyword } }),
  favCheck: (bvid) => request('/api/fav/check', { params: { bvid }, timeoutMs: 15000, retries: 0 }),
  favDeal: (rid, addIds = '', delIds = '') =>
    request('/api/fav/deal', { method: 'POST', body: { rid, add_media_ids: addIds, del_media_ids: delIds } }),

  history: (ps = 20, max = '', viewAt = '') => request('/api/history', { params: { ps, max, view_at: viewAt } }),
  historySearch: (keyword, max = '', viewAt = '') => request('/api/history', { params: { keyword, max, view_at: viewAt } }),

  followings: (mid, all = false, tagid = '') =>
    request('/api/followings', { params: { vmid: mid, all: all ? 1 : '', tagid }, timeoutMs: 30000, retries: 0 }),
  relationTags: () => request('/api/relation/tags'),
  user: (mid) => request('/api/user', { params: { mid } }),
  dynamicsAll: (offset = '', time = '') => request('/api/dynamics/all', { params: { offset, time } }),
  dynamicsSpace: (mid, offset = '', time = '') => request('/api/dynamics/space', { params: { host_mid: mid, offset, time } }),
  dynamicsUp: (mid, offset = '', time = '') => request('/api/dynamics/up', { params: { host_mid: mid, offset, time } }),

  comments: (bvid, next = 0) => request('/api/comments', { params: { bvid, next } }),
  upload: (mid, pn = 1, ps = 20) => request('/api/upload', { params: { mid, pn, ps } }),

  loginQr: () => request('/api/login/qr'),
  loginPoll: (key) => request('/api/login/poll', { params: { key } }),
  loginCookie: (cookie) => request('/api/login/cookie', { method: 'POST', body: { cookie } }),
  loginClear: () => request('/api/login/clear', { method: 'POST', body: {} }),
};
