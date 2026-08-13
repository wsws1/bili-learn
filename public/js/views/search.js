// 搜索：全站 / 收藏夹 / 历史记录 三范围
import { getCache, setCache } from './view-cache.js';

const RECENT_KEY = 'zhixue:recent';

export default function renderSearch(container, ctx, route) {
  const { api, ui, go, setTopbar, showNav } = ctx;
  showNav(true);
  setTopbar({ title: '搜索' });

  const state = {
    keyword: route.params.q || '',
    scope: route.params.scope || 'all',
    page: 1,
    items: [],
    hasMore: false,
    nextMax: '',
    nextViewAt: '',
  };

  container.innerHTML = `
    <div class="searchbar" style="margin-top:12px">
      <div class="input-wrap">${ui.icon('search', 17)}<input id="kw" type="search" placeholder="搜索视频、收藏夹内容、历史记录" value="${ui.esc(state.keyword)}"></div>
      <button id="goBtn" class="btn">搜索</button>
    </div>
    <div class="chips" style="margin-top:12px" id="scopeChips">
      <button class="chip" data-scope="all">全站</button>
      <button class="chip" data-scope="fav">收藏夹</button>
      <button class="chip" data-scope="history">历史记录</button>
    </div>
    <div id="recentBox"></div>
    <div id="resultBox" style="margin-top:10px"></div>
    <button id="moreBtn" class="load-more hidden">加载更多</button>
  `;

  const kwInput = container.querySelector('#kw');
  const resultBox = container.querySelector('#resultBox');
  const moreBtn = container.querySelector('#moreBtn');
  const recentBox = container.querySelector('#recentBox');

  function markScope() {
    container.querySelectorAll('#scopeChips .chip').forEach((c) => {
      c.classList.toggle('on', c.dataset.scope === state.scope);
    });
  }

  // 把关键词/范围写进 URL（不触发路由重渲染），返回本页时能精确恢复
  function syncUrl() {
    try {
      const qs = new URLSearchParams({ q: state.keyword, scope: state.scope });
      history.replaceState(null, '', '#/search?' + qs.toString());
    } catch {}
  }

  function cacheKey() {
    return 'search:' + state.scope + ':' + state.keyword;
  }

  function saveCache() {
    setCache(cacheKey(), {
      keyword: state.keyword,
      scope: state.scope,
      page: state.page,
      items: state.items,
      hasMore: state.hasMore,
      nextMax: state.nextMax,
      nextViewAt: state.nextViewAt,
      scrollTop: window.scrollY,
    });
  }

  container.querySelectorAll('#scopeChips .chip').forEach((c) => {
    c.addEventListener('click', () => {
      state.scope = c.dataset.scope;
      markScope();
      syncUrl();
      if (state.keyword) run(true);
    });
  });

  function runSearch() {
    state.keyword = kwInput.value.trim();
    if (!state.keyword) return;
    saveRecent(state.keyword);
    state.page = 1;
    syncUrl();
    run(true);
  }

  container.querySelector('#goBtn').addEventListener('click', runSearch);
  kwInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });

  function saveRecent(kw) {
    let list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    list = [kw, ...list.filter((x) => x !== kw)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  }

  function renderRecent() {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    recentBox.innerHTML = '';
    if (!list.length) return;
    const head = document.createElement('div');
    head.className = 'sec-head';
    head.innerHTML = `<span class="t">最近搜索</span>`;
    recentBox.appendChild(head);
    const chips = document.createElement('div');
    chips.className = 'chips';
    list.forEach((kw) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = kw;
      b.addEventListener('click', () => {
        kwInput.value = kw;
        runSearch();
      });
      chips.appendChild(b);
    });
    recentBox.appendChild(chips);
  }

  let runId = 0;
  async function run(replace) {
    const id = ++runId;
    if (replace) {
      resultBox.innerHTML = '';
      resultBox.appendChild(ui.loadBox('搜索中…'));
      recentBox.innerHTML = '';
    }
    moreBtn.classList.add('hidden');
    try {
      let r;
      if (state.scope === 'fav') r = await api.searchFav(state.keyword, state.page);
      else if (state.scope === 'history') {
        r = await api.searchHistory(state.keyword, state.nextMax, state.nextViewAt);
        state.nextMax = r.nextMax || '';
        state.nextViewAt = r.nextViewAt || '';
      } else r = await api.searchAll(state.keyword, state.page);

      if (id !== runId) return; // 过期响应（已发起更新的搜索/已切页）直接丢弃
      if (!r.ok && r.code !== 0) throw new Error(r.message || '搜索失败');
      const items = r.items || [];
      resultBox.querySelector('.state-box')?.remove();
      if (!items.length && state.page === 1 && replace) {
        if (id !== runId) return;
        resultBox.innerHTML = '';
        resultBox.appendChild(ui.stateBox('没有找到「' + state.keyword + '」' + (state.scope === 'fav' ? ' 的收藏内容' : state.scope === 'history' ? ' 的历史记录' : ''), 'search'));
        state.items = [];
        state.hasMore = false;
        return;
      }
      // 加载更多只追加新增条目（按 bvid 去重），不清空结果、不重置滚动
      const newItems = replace ? items : items.filter((it) => !state.items.some((o) => o.bvid === it.bvid));
      state.items = replace ? items : state.items.concat(newItems);
      if (replace) resultBox.innerHTML = '';
      if (id !== runId) return;
      const renderList = replace ? state.items : newItems;
      renderList.forEach((v) => {
        resultBox.appendChild(ui.videoRow(v, { progress: v.progress, onClick: () => go('player', { bvid: v.bvid }) }));
      });
      if (state.scope === 'all') state.hasMore = r.hasMore;
      else if (state.scope === 'fav') state.hasMore = r.hasMore;
      else state.hasMore = !!state.nextMax;
      moreBtn.classList.toggle('hidden', !state.hasMore);
      saveCache();
    } catch (e) {
      if (id !== runId) return; // 被新搜索/切页取代的旧请求，错误也丢弃
      resultBox.innerHTML = '';
      resultBox.appendChild(ui.errorBox(e.message, () => run(true)));
    }
  }

  moreBtn.addEventListener('click', () => {
    state.page += 1;
    run(false);
  });

  markScope();
  renderRecent();
  // 有缓存先恢复（同一关键词+范围），返回本页不重新搜索、不跳动
  const saved = getCache(cacheKey());
  if (saved && saved.keyword === state.keyword && saved.scope === state.scope) {
    state.page = saved.page || 1;
    state.items = saved.items || [];
    state.hasMore = !!saved.hasMore;
    state.nextMax = saved.nextMax || '';
    state.nextViewAt = saved.nextViewAt || '';
    state.items.forEach((v) => {
      resultBox.appendChild(ui.videoRow(v, { progress: v.progress, onClick: () => go('player', { bvid: v.bvid }) }));
    });
    moreBtn.classList.toggle('hidden', !state.hasMore);
    if (saved.scrollTop) requestAnimationFrame(() => window.scrollTo(0, saved.scrollTop));
  } else if (state.keyword) {
    kwInput.value = state.keyword;
    run(true);
  }

  // 从后台回来（离开 ≥30 秒）自动重新搜索，避免结果陈旧
  const onResume = () => {
    if (state.keyword) run(true);
  };
  document.addEventListener('app:resume', onResume);
  return () => {
    document.removeEventListener('app:resume', onResume);
    saveCache();
  };
}
