// 知学：入口 + 路由 + 全局壳
import { api, abortStale } from './api.js';
import * as ui from './ui.js';
import renderLogin from './views/login.js';
import renderHome from './views/home.js';
import renderFav from './views/fav.js';
import renderFollow from './views/follow.js';
import renderSearch from './views/search.js';
import renderHistory from './views/history.js';
import renderPlayer from './views/player.js';
import renderMe from './views/me.js';

const viewEl = document.getElementById('view');
const topbarEl = document.getElementById('topbar');
const backBtn = document.getElementById('backBtn');
const topTitle = document.getElementById('topTitle');
const topActions = document.getElementById('topActions');
const navEl = document.getElementById('bottomnav');

export const state = {
  user: null,
  route: null,
  statusOk: false,
};

// 版本号：升级后更新，方便在「我的」页面确认手机运行的是哪个构建
export const APP_VERSION = '2026.08.11.1';

const NAV = [
  { route: 'home', label: '首页', icon: 'home' },
  { route: 'fav', label: '收藏夹', icon: 'bookmark' },
  { route: 'follow', label: '关注', icon: 'users' },
  { route: 'search', label: '搜索', icon: 'search' },
  { route: 'history', label: '历史', icon: 'history' },
];

function renderNav() {
  navEl.innerHTML = NAV.map(
    (n) =>
      `<a href="#/${n.route}" data-route="${n.route}">${ui.icon(n.icon, 21)}<span>${n.label}</span></a>`
  ).join('');
}

function setNavActive(route) {
  navEl.querySelectorAll('a').forEach((a) => {
    const active = a.getAttribute('data-route') === route;
    a.classList.toggle('active', active);
  });
}

export function setTopbar({ title, back = false, onBack, actions = [] }) {
  topbarEl.classList.remove('hidden');
  topTitle.textContent = title || '知学';
  backBtn.classList.toggle('hidden', !back);
  backBtn.onclick = () => (onBack ? onBack() : history.back());
  topActions.innerHTML = '';
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.className || 'icon-btn';
    b.setAttribute('aria-label', a.label || '');
    b.innerHTML = a.html || ui.icon(a.icon, 19);
    if (a.onClick) b.onclick = a.onClick;
    topActions.appendChild(b);
  });
}

export function hideTopbar() {
  topbarEl.classList.add('hidden');
}

export function showNav(show = true) {
  navEl.classList.toggle('hidden', !show);
}

export function go(route, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const q = qs.toString();
  location.hash = '#/' + route + (q ? '?' + q : '');
}

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = hash.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const params = {};
  if (queryPart) new URLSearchParams(queryPart).forEach((v, k) => (params[k] = v));
  return { name: segs[0] || 'home', id: segs[1] || params.id || '', params };
}

async function refreshUser() {
  try {
    const s = await api.status();
    state.user = s.login;
    state.statusOk = true;
  } catch {
    state.user = { ok: false, unknown: true };
    state.statusOk = false;
  }
}

function ctx() {
  return {
    api,
    ui,
    version: APP_VERSION,
    user: state.user,
    go,
    setTopbar,
    hideTopbar,
    showNav,
    refreshUser: async () => {
      await refreshUser();
      return state.user;
    },
    toast: ui.toast,
  };
}

const VIEWS = {
  login: renderLogin,
  home: renderHome,
  fav: renderFav,
  follow: renderFollow,
  search: renderSearch,
  history: renderHistory,
  player: renderPlayer,
  me: renderMe,
};

let cleanup = null;

async function route() {
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch {}
    cleanup = null;
  }
  // 离开页面只取消长时间未完成的慢请求（>2s），快速请求让其自然完成，避免连接池抖动占满
  abortStale();
  const r = parseRoute();
  state.route = r;
  const c = ctx();
  setNavActive(r.name);

  if (state.user === null) {
    viewEl.innerHTML = '';
    viewEl.appendChild(ui.loadBox('正在检查登录状态…'));
    await refreshUser();
    c.user = state.user;
  }

  // 登录门禁：只有确认“未登录”（状态查询成功且返回未登录）才跳登录页；
  // 状态查询失败（网络异常）时继续渲染页面，避免误判需要重新登录
  const definitelyLoggedOut = state.user && state.user.ok === false && !state.user.unknown;
  if (definitelyLoggedOut && r.name !== 'login') {
    location.replace('#/login');
    return;
  }
  if (state.user?.ok && r.name === 'login') {
    location.replace('#/home');
    return;
  }

  const view = VIEWS[r.name] || renderHome;
  viewEl.innerHTML = '';
  try {
    cleanup = (await view(viewEl, c, r)) || null;
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = '';
    viewEl.appendChild(ui.errorBox('页面加载失败：' + e.message, () => route()));
    cleanup = null;
  }
}

async function boot() {
  renderNav();
  await refreshUser();
  window.addEventListener('hashchange', route);
  route();
}

boot();
