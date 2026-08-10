// 历史记录：按天分组 + 进度 + 标题搜索
export default function renderHistory(container, ctx) {
  const { api, ui, go, setTopbar, showNav } = ctx;
  showNav(true);
  setTopbar({ title: '历史记录', actions: [{ icon: 'refresh', label: '刷新', onClick: () => { state.max = ''; state.viewAt = ''; load(true, true); } }] });

  const state = { max: '', viewAt: '', keyword: '', items: [], hasMore: false, hiddenByImmerse: 0 };

  container.innerHTML = `
    <div class="searchbar" style="margin-top:12px">
      <div class="input-wrap">${ui.icon('search', 17)}<input id="kw" type="search" placeholder="在历史记录中搜索标题"></div>
      <button id="clearKw" class="btn btn-ghost hidden">清除</button>
    </div>
    <div id="histBox" style="margin-top:8px"></div>
    <button id="moreBtn" class="load-more hidden">加载更多</button>
  `;

  const histBox = container.querySelector('#histBox');
  const moreBtn = container.querySelector('#moreBtn');
  const clearBtn = container.querySelector('#clearKw');
  const kwInput = container.querySelector('#kw');

  const norm = (h) => ({
    bvid: h.history?.bvid || h.bvid,
    title: h.title || '',
    cover: h.cover || h.pic || '',
    author: h.author_name || h.author || '',
    tname: h.tname || h.tag_name || '',
    viewAt: h.view_at || 0,
    dur: h.duration ? ui.fmtDur(h.duration) : '',
    progress: h.is_finish ? 100 : h.duration && h.progress != null ? Math.min(100, Math.round((h.progress / h.duration) * 100)) : null,
    finished: !!h.is_finish,
  });

  async function load(replace, force = false) {
    if (replace) histBox.innerHTML = '';
    if (!histBox.children.length) histBox.appendChild(ui.loadBox('加载历史记录…'));
    moreBtn.classList.add('hidden');
    try {
    const r = state.keyword
      ? await api.historySearch(state.keyword, state.max, state.viewAt)
      : await api.history(20, state.max, state.viewAt, { forceRefresh: force });
      if (r.code !== 0) throw new Error(r.message || '历史记录获取失败');
      const raw = r.data?.list || r.items || [];
      const items = raw.map(norm);
      const visible = items.filter(ui.passImmersion);
      state.hiddenByImmerse = items.length - visible.length;
      const c = r.data?.cursor || {};
      state.hasMore = state.keyword ? !!r.hasMore : raw.length >= 20;
      if (state.keyword) {
        state.max = r.nextMax || '';
        state.viewAt = r.nextViewAt || '';
      } else {
        state.max = c.max || '';
        state.viewAt = c.view_at || '';
      }
      state.items = replace ? visible : state.items.concat(visible);
      if (replace) histBox.innerHTML = '';
      renderGroups();
      moreBtn.classList.toggle('hidden', !state.hasMore);
    } catch (e) {
      if (replace) {
        histBox.innerHTML = '';
        histBox.appendChild(ui.errorBox(e.message, () => load(true)));
      } else ui.toast(e.message);
    }
  }

  function renderGroups() {
    histBox.innerHTML = '';
    if (state.hiddenByImmerse > 0) {
      const hint = document.createElement('div');
      hint.className = 'immerse-hint';
      hint.textContent = `沉浸模式已过滤 ${state.hiddenByImmerse} 条非学习内容 · 可在「我的 · 设置」调整`;
      histBox.appendChild(hint);
    }
    if (!state.items.length) {
      histBox.appendChild(ui.stateBox(state.keyword ? '历史记录中没有匹配结果' : '暂无历史记录', 'history'));
      return;
    }
    const groups = new Map();
    state.items.forEach((it) => {
      const key = ui.dayLabel(it.viewAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });
    groups.forEach((list, day) => {
      const head = document.createElement('div');
      head.className = 'sec-head';
      head.innerHTML = `<span class="t" style="font-size:13px;color:var(--muted)">${day}</span>`;
      histBox.appendChild(head);
      list.forEach((it) => {
        const goBtn = document.createElement('button');
        goBtn.className = 'go-btn' + (it.finished ? ' ghost' : '');
        goBtn.textContent = it.finished ? '已看完' : '继续';
        const row = ui.videoRow(it, {
          progress: it.progress,
          action: goBtn,
          onClick: () => go('player', { bvid: it.bvid }),
        });
        row.querySelector('.vm').textContent = `${it.author} · ${ui.fmtTime(it.viewAt)}${it.progress != null ? ' · 学到 ' + it.progress + '%' : ''}`;
        histBox.appendChild(row);
      });
    });
  }

  let kwTimer = null;
  kwInput.addEventListener('input', (e) => {
    clearTimeout(kwTimer);
    kwTimer = setTimeout(() => {
      state.keyword = e.target.value.trim();
      state.max = '';
      state.viewAt = '';
      clearBtn.classList.toggle('hidden', !state.keyword);
      load(true);
    }, 350);
  });
  clearBtn.addEventListener('click', () => {
    kwInput.value = '';
    state.keyword = '';
    clearBtn.classList.add('hidden');
    load(true);
  });
  moreBtn.addEventListener('click', () => load(false));

  load(true);

  // 从后台回来（离开 ≥30 秒）自动硬刷新
  const onResume = () => load(true, true);
  document.addEventListener('app:resume', onResume);
  return () => document.removeEventListener('app:resume', onResume);
}
