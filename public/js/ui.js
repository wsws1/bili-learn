// 知学前端基础工具：图标、格式化、toast、状态组件、弹层
export const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  back10: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M9 16v-4.5l-1.5 1"/><path d="M14 16v-5"/><path d="M12 11h4"/>',
  fwd10: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M15 16v-4.5l-1.5 1"/><path d="M10 16v-5"/><path d="M8 11h4"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  comment: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

export function icon(name, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  if (x >= 1e8) return (x / 1e8).toFixed(1) + '亿';
  if (x >= 1e4) return (x / 1e4).toFixed(1) + '万';
  return String(x);
}

export function fmtDur(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return String(sec ?? '');
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtTime(ts) {
  const t = Number(ts);
  if (!t) return '';
  const diff = (Date.now() / 1000 - t);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 2) return '昨天';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  const d = new Date(t * 1000);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function dayLabel(ts) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return '今天';
  if (same(d, y)) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ---------- 沉浸模式（分区/关键词排除） ----------
export const IMMERSE_PARTITIONS = ['游戏', '影视', '娱乐', '生活', '音乐', '舞蹈', '时尚', '美食', '动物圈', '鬼畜'];

export function getImmersion() {
  try {
    const f = JSON.parse(localStorage.getItem('zhixue:immerse'));
    if (f && typeof f === 'object') {
      return { on: !!f.on, partitions: f.partitions || [], keywords: f.keywords || [] };
    }
  } catch {}
  return { on: false, partitions: [], keywords: [] };
}

export function saveImmersion(cfg) {
  localStorage.setItem('zhixue:immerse', JSON.stringify(cfg));
}

export function passImmersion(item) {
  const f = getImmersion();
  if (!f.on) return true;
  const title = String(item.title || '').toLowerCase();
  const kws = (f.keywords || []).filter(Boolean).map((k) => k.toLowerCase());
  if (kws.some((k) => title.includes(k))) return false;
  const tag = String(item.tname || item.tag_name || item.tag || '').toLowerCase();
  const parts = (f.partitions || []).map((p) => p.toLowerCase());
  if (tag && parts.some((p) => tag.includes(p) || p.includes(tag))) return false;
  return true;
}

// ---------- 常用收藏夹 ----------
export function getCommonFavs() {
  try {
    const list = JSON.parse(localStorage.getItem('zhixue:commonFavs'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function toggleCommonFav(id, title) {
  let list = getCommonFavs();
  const hit = list.find((x) => String(x.id) === String(id));
  if (hit) list = list.filter((x) => String(x.id) !== String(id));
  else list.unshift({ id: String(id), title });
  localStorage.setItem('zhixue:commonFavs', JSON.stringify(list));
  return !hit;
}

export function touchRecentFav(id, title) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem('zhixue:recentFavs')) || [];
  } catch {}
  list = [{ id: String(id), title, ts: Date.now() }, ...list.filter((x) => String(x.id) !== String(id))].slice(0, 8);
  localStorage.setItem('zhixue:recentFavs', JSON.stringify(list));
}

// ---------- 动态已读（打开视频才算已看） ----------
const SEEN_KEY = 'zhixue:dynSeen';

export function getSeenSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(SEEN_KEY));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function isDynSeen(bvid) {
  if (!bvid) return false;
  return getSeenSet().has(String(bvid));
}

// 未看新动态：未打开过，且发生在最近 7 天内（避免无限累积历史）
export function isUnseenDyn(d) {
  if (!d || !d.bvid) return false;
  if (isDynSeen(d.bvid)) return false;
  return Date.now() / 1000 - (d.pubTime || 0) < 7 * 86400;
}

export function markDynSeen(bvid) {
  if (!bvid) return;
  const set = getSeenSet();
  const key = String(bvid);
  if (set.has(key)) return;
  set.add(key);
  const arr = [...set];
  if (arr.length > 500) arr.splice(0, arr.length - 500);
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function stateBox(msg, iconName = 'video') {
  const d = document.createElement('div');
  d.className = 'state-box';
  d.innerHTML = icon(iconName, 34) + `<div>${esc(msg)}</div>`;
  return d;
}

export function loadBox(msg = '加载中…') {
  const d = document.createElement('div');
  d.className = 'state-box';
  d.innerHTML = `<div>${esc(msg)}</div>`;
  return d;
}

export function errorBox(msg, retry) {
  const d = document.createElement('div');
  d.className = 'state-box';
  d.innerHTML = `<div>${esc(msg)}</div>`;
  if (retry) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.style.marginTop = '12px';
    b.textContent = '重试';
    b.onclick = retry;
    d.appendChild(b);
  }
  return d;
}

export function thumbHtml(cover, dur) {
  const img = cover
    ? `<img src="${esc(cover)}" loading="lazy" alt="" referrerpolicy="no-referrer">`
    : '';
  return `<div class="thumb">${img}${dur ? `<span class="dur">${esc(dur)}</span>` : ''}</div>`;
}

export function videoRow(v, opts = {}) {
  const row = document.createElement('div');
  row.className = 'video-row';
  row.innerHTML = thumbHtml(v.cover, v.dur) +
    `<div class="vmain">` +
    `<div class="vt">${esc(v.title)}</div>` +
    `<div class="vm">${esc(v.author || '')}${v.play ? ` · ${fmtNum(v.play)} 播放` : ''}</div>` +
    (opts.progress != null
      ? `<div class="progress" style="margin-top:3px"><i class="${opts.progress >= 100 ? 'done' : ''}" style="width:${Math.min(100, opts.progress)}%"></i></div>`
      : '') +
    `</div>`;
  if (opts.action) row.appendChild(opts.action);
  row.addEventListener('click', () => opts.onClick && opts.onClick(v));
  return row;
}

export function folderCard(f, alt = false, opts = {}) {
  const d = document.createElement('div');
  d.className = 'folder';
  d.innerHTML =
    `<div class="cover ${alt ? 'g' : ''}">${icon('folder', 18)}${esc(f.title.slice(0, 1) || '藏')}` +
    (opts.star != null ? `<button class="star-toggle ${opts.star ? 'on' : ''}" aria-label="设为常用收藏夹">${icon('star', 15)}</button>` : '') +
    `</div>` +
    `<div class="fn">${esc(f.title)}</div>` +
    `<div class="fm">${f.media_count ?? ''} 个视频</div>`;
  if (opts.onStar) {
    d.querySelector('.star-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onStar();
    });
  }
  return d;
}

export function feedItem(d, opts = {}) {
  const row = document.createElement('div');
  row.className = 'feed-item';
  const left = opts.thumb
    ? thumbHtml(d.cover, d.duration)
    : `<div class="fava">${d.face ? `<img src="${esc(d.face)}" alt="" referrerpolicy="no-referrer">` : esc((d.author || '?').slice(0, 1))}</div>`;
  row.innerHTML =
    left +
    `<div class="fmain">` +
    `<div class="fname"><span class="author">${esc(d.author || '')}</span>${opts.tag ? `<span class="badge">${esc(opts.tag)}</span>` : ''}</div>` +
    `<div class="ftitle">${esc(d.title || '')}</div>` +
    `<div class="ftime">${fmtTime(d.pubTime)} · ${esc(d.duration || '')}</div>` +
    `</div>` +
    (opts.unread ? '<span class="dot"></span>' : '');
  if (opts.onAuthor) {
    const authorEl = row.querySelector('.author');
    authorEl.style.cursor = 'pointer';
    authorEl.style.color = 'var(--accent)';
    authorEl.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onAuthor(d);
    });
  }
  row.addEventListener('click', () => opts.onClick && opts.onClick(d));
  return row;
}

export function sheet({ title, note, searchable = true, rows, onSearch, onPick, onClose }) {
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const box = document.createElement('div');
  box.className = 'sheet';
  box.innerHTML =
    `<div class="shead"><span class="t">${esc(title)}</span><span class="n">${esc(note || '')}</span>` +
    `<button class="icon-btn" style="margin-left:auto" aria-label="关闭">${icon('x', 18)}</button></div>` +
    (searchable
      ? `<div class="searchbar" style="padding:0 16px 10px"><div class="input-wrap">${icon('search', 16)}<input type="search" placeholder="搜索…"></div></div>`
      : '') +
    `<div class="slist"></div>`;
  const close = () => {
    mask.remove();
    box.remove();
    if (typeof onClose === 'function') onClose();
  };
  box.querySelector('.shead .icon-btn').addEventListener('click', close);
  mask.addEventListener('click', close);
  const listEl = box.querySelector('.slist');
  const render = () => {
    listEl.innerHTML = '';
    const items = onSearch ? onSearch(box.querySelector('input')?.value || '') : rows;
    if (!items.length) {
      listEl.appendChild(stateBox('没有匹配结果', 'search'));
      return;
    }
    items.forEach((r) => {
      listEl.appendChild(r.el);
      r.el.addEventListener('click', () => {
        close();
        onPick && onPick(r.data);
      });
    });
  };
  if (searchable) {
    box.querySelector('input').addEventListener('input', render);
  }
  render();
  document.body.appendChild(mask);
  document.body.appendChild(box);
  return { close };
}

let qrPromise = null;
export function loadQR() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (qrPromise) return qrPromise;
  qrPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
    s.onload = () => resolve(window.QRCode);
    s.onerror = () => reject(new Error('二维码库加载失败'));
    document.head.appendChild(s);
  });
  return qrPromise;
}
