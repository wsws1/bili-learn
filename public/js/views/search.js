// 搜索：全站 / 收藏夹 / 历史记录 三范围
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

  container.querySelectorAll('#scopeChips .chip').forEach((c) => {
    c.addEventListener('click', () => {
      state.scope = c.dataset.scope;
      markScope();
      if (state.keyword) run(true);
    });
  });

  function runSearch() {
    state.keyword = kwInput.value.trim();
    if (!state.keyword) return;
    saveRecent(state.keyword);
    state.page = 1;
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

  async function run(replace) {
    resultBox.innerHTML = '';
    resultBox.appendChild(ui.loadBox('搜索中…'));
    moreBtn.classList.add('hidden');
    recentBox.innerHTML = '';
    try {
      let r;
      if (state.scope === 'fav') r = await api.searchFav(state.keyword, state.page);
      else if (state.scope === 'history') {
        r = await api.searchHistory(state.keyword, state.nextMax, state.nextViewAt);
        state.nextMax = r.nextMax || '';
        state.nextViewAt = r.nextViewAt || '';
      } else r = await api.searchAll(state.keyword, state.page);

      if (!r.ok && r.code !== 0) throw new Error(r.message || '搜索失败');
      const items = r.items || [];
      resultBox.querySelector('.state-box')?.remove();
      if (!items.length && state.page === 1) {
        resultBox.appendChild(ui.stateBox('没有找到「' + state.keyword + '」' + (state.scope === 'fav' ? ' 的收藏内容' : state.scope === 'history' ? ' 的历史记录' : ''), 'search'));
        return;
      }
      state.items = replace ? items : state.items.concat(items);
      if (replace) resultBox.innerHTML = '';
      state.items.forEach((v) => {
        resultBox.appendChild(ui.videoRow(v, {
          progress: v.progress,
          onClick: () => go('player', { bvid: v.bvid }),
        }));
      });
      if (state.scope === 'all') state.hasMore = r.hasMore;
      else if (state.scope === 'fav') state.hasMore = r.hasMore;
      else state.hasMore = !!state.nextMax;
      moreBtn.classList.toggle('hidden', !state.hasMore);
    } catch (e) {
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
  if (state.keyword) {
    kwInput.value = state.keyword;
    run(true);
  }
}
