// 历史记录：按天分组 + 进度 + 标题搜索
import { getCache, setCache, getWatchResults } from './view-cache.js';

export default function renderHistory(container, ctx) {
  const { api, ui, go, setTopbar, showNav } = ctx;
  showNav(true);
  setTopbar({ title: '历史记录', actions: [{ icon: 'refresh', label: '刷新', onClick: () => { state.max = ''; state.viewAt = ''; load(true, true); } }] });

  const state = { max: '', viewAt: '', keyword: '', items: [], hasMore: false, hiddenByImmerse: 0 };
  const rowMap = new Map(); // bvid -> { row, vm, bar, goBtn }，用于原地更新进度
  let disposed = false;

  function cacheKey() {
    return 'history:' + state.keyword;
  }

  function saveCache() {
    setCache(cacheKey(), {
      keyword: state.keyword,
      max: state.max,
      viewAt: state.viewAt,
      items: state.items,
      hasMore: state.hasMore,
      hiddenByImmerse: state.hiddenByImmerse,
      scrollTop: window.scrollY,
    });
  }

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

  const metaText = (it) =>
    `${it.author} · ${ui.fmtTime(it.viewAt)}${it.progress != null ? ' · 学到 ' + it.progress + '%' : ''}`;

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
      saveCache();
    } catch (e) {
      if (replace) {
        histBox.innerHTML = '';
        histBox.appendChild(ui.errorBox(e.message, () => load(true)));
      } else ui.toast(e.message);
    }
  }

  function renderGroups() {
    histBox.innerHTML = '';
    rowMap.clear();
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
        const vm = row.querySelector('.vm');
        vm.textContent = metaText(it);
        rowMap.set(it.bvid, { row, vm, bar: row.querySelector('.progress i'), goBtn });
        histBox.appendChild(row);
      });
    });
  }

  // 原地更新某一行的进度/完成状态，不重建列表（保持滚动位置）
  function updateRowUI(rd, it) {
    rd.vm.textContent = metaText(it);
    rd.goBtn.textContent = it.finished ? '已看完' : '继续';
    rd.goBtn.classList.toggle('ghost', !!it.finished);
    let bar = rd.bar;
    if (it.progress != null) {
      if (!bar) {
        const wrap = document.createElement('div');
        wrap.className = 'progress';
        wrap.style.marginTop = '3px';
        bar = document.createElement('i');
        wrap.appendChild(bar);
        rd.row.querySelector('.vmain').appendChild(wrap);
        rd.bar = bar;
      }
      bar.className = it.progress >= 100 ? 'done' : '';
      bar.style.width = Math.min(100, it.progress) + '%';
    } else if (bar) {
      bar.closest('.progress')?.remove();
      rd.bar = null;
    }
  }

  // 返回本页：把本次观看的进度/完成状态原地写回列表
  function applyWatchProgress() {
    getWatchResults().forEach((w, bvid) => {
      const it = state.items.find((x) => x.bvid === bvid);
      if (!it) return;
      let changed = false;
      if (w.finished) {
        it.finished = true;
        it.progress = 100;
        changed = true;
      } else if (w.duration > 0 && w.progress != null) {
        const p = Math.min(100, Math.round((w.progress / w.duration) * 100));
        if (p !== it.progress || it.finished) {
          it.progress = p;
          it.finished = false;
          changed = true;
        }
      }
      if (changed) {
        const rd = rowMap.get(bvid);
        if (rd) updateRowUI(rd, it);
      }
    });
  }

  // 安静后台刷新：与服务器进度合并（只更新字段，不重建、不重排），让进度更准
  function quietRefresh() {
    if (state.keyword) return;
    api.history(20, '', '', { forceRefresh: true })
      .then((r) => {
        if (disposed || r.code !== 0) return;
        const byId = new Map(((r.data?.list) || []).map((h) => {
          const n = norm(h);
          return [n.bvid, n];
        }));
        byId.forEach((f, bvid) => {
          const it = state.items.find((x) => x.bvid === bvid);
          if (!it) return;
          let changed = false;
          ['progress', 'duration', 'finished', 'viewAt', 'title', 'author', 'cover', 'tname'].forEach((k) => {
            if (f[k] != null && f[k] !== it[k]) {
              it[k] = f[k];
              changed = true;
            }
          });
          if (changed) {
            const rd = rowMap.get(bvid);
            if (rd) updateRowUI(rd, it);
          }
        });
      })
      .catch(() => {});
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

  // 有缓存先恢复（含滚动位置），再合并本次观看进度
  const saved = getCache(cacheKey());
  if (saved) {
    state.max = saved.max || '';
    state.viewAt = saved.viewAt || '';
    state.keyword = saved.keyword || '';
    state.items = saved.items || [];
    state.hasMore = !!saved.hasMore;
    state.hiddenByImmerse = saved.hiddenByImmerse || 0;
    kwInput.value = state.keyword;
    clearBtn.classList.toggle('hidden', !!state.keyword);
    renderGroups();
    moreBtn.classList.toggle('hidden', !state.hasMore);
    applyWatchProgress();
    if (saved.scrollTop) requestAnimationFrame(() => window.scrollTo(0, saved.scrollTop));
    quietRefresh();
  } else {
    load(true);
  }

  // 从后台回来（离开 ≥30 秒）自动硬刷新
  const onResume = () => load(true, true);
  document.addEventListener('app:resume', onResume);
  return () => {
    document.removeEventListener('app:resume', onResume);
    disposed = true;
    saveCache();
  };
}
