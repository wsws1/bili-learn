// 收藏夹：列表 / 详情（含夹内搜索）
export default function renderFav(container, ctx, route) {
  const { api, ui, user, go, setTopbar, showNav } = ctx;
  showNav(true);
  if (route.id) return renderDetail(container, ctx, route.id);
  return renderList(container, ctx);
}

function renderList(container, ctx) {
  const { api, ui, user, go, setTopbar } = ctx;
  setTopbar({ title: '收藏夹', actions: [{ icon: 'refresh', label: '刷新', onClick: () => load(true) }] });
  const allFolders = [];
  let showAll = false;
  const box = document.createElement('div');
  box.className = 'folder-grid';
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'load-more hidden';
  toggleBtn.id = 'showAllBtn';
  toggleBtn.textContent = '显示全部';
  container.appendChild(ui.loadBox('加载收藏夹…'));
  container.appendChild(box);
  container.appendChild(toggleBtn);

  function render() {
    const common = ui.getCommonFavs();
    const commonList = allFolders.filter((f) => common.some((c) => String(c.id) === String(f.id)));
    const list = showAll ? allFolders : commonList;
    box.innerHTML = '';
    if (!list.length) {
      box.appendChild(ui.stateBox(
        showAll ? '还没有收藏夹' : '还没有常用收藏夹\n点卡片右上角星标设置，或点击下方显示全部',
        'bookmark'
      ));
      toggleBtn.textContent = `显示全部 ${allFolders.length} 个`;
      toggleBtn.classList.remove('hidden');
      return;
    }
    list.forEach((f, i) => {
      const card = ui.folderCard(f, i % 2 === 1, {
        star: common.some((c) => String(c.id) === String(f.id)),
        onStar: () => {
          ui.toggleCommonFav(f.id, f.title);
          ui.toast(ui.getCommonFavs().some((c) => String(c.id) === String(f.id)) ? '已设为常用收藏夹' : '已取消常用收藏夹');
          render();
        },
      });
      card.addEventListener('click', () => go('fav', { id: f.id }));
      box.appendChild(card);
    });
    const hiddenCount = allFolders.length - commonList.length;
    if (showAll) {
      toggleBtn.textContent = '收起 · 只显示常用';
      toggleBtn.classList.remove('hidden');
    } else if (hiddenCount > 0) {
      toggleBtn.textContent = `显示全部 ${allFolders.length} 个`;
      toggleBtn.classList.remove('hidden');
    } else {
      toggleBtn.classList.add('hidden');
    }
  }

  async function load(force = false) {
    container.querySelector(':scope > .state-box')?.remove();
    box.innerHTML = '';
    try {
      const r = await api.favFolders(user?.mid, { forceRefresh: force });
      if (r.code !== 0) throw new Error(r.message || '收藏夹获取失败');
      const list = r.data?.list || [];
      allFolders.length = 0;
      allFolders.push(...list);
      render();
    } catch (e) {
      container.appendChild(ui.errorBox(e.message, load));
    }
  }
  toggleBtn.addEventListener('click', () => {
    showAll = !showAll;
    render();
  });
  load();
}

function renderDetail(container, ctx, mediaId) {
  const { api, ui, go, setTopbar } = ctx;
  const state = { pn: 1, keyword: '', items: [], hasMore: false };

  setTopbar({ title: '收藏夹', back: true });
  container.innerHTML = `
    <div class="searchbar" style="margin-top:12px">
      <div class="input-wrap">${ui.icon('search', 17)}<input id="kw" type="search" placeholder="在收藏夹内搜索"></div>
    </div>
    <div id="listBox"></div>
    <button id="more" class="load-more hidden">加载更多</button>
  `;
  const listBox = container.querySelector('#listBox');
  const moreBtn = container.querySelector('#more');

  api.favFolders(ctx.user?.mid).then((r) => {
    const f = (r.data?.list || []).find((x) => String(x.id) === String(mediaId));
    ui.touchRecentFav(mediaId, f?.title || '收藏夹');
    setTopbar({
      title: f ? f.title : '收藏夹',
      back: true,
      actions: [{ icon: 'refresh', label: '刷新', onClick: () => { state.pn = 1; load(true); } }],
    });
  }).catch(() => setTopbar({ title: '收藏夹', back: true }));

  let kwTimer = null;
  container.querySelector('#kw').addEventListener('input', (e) => {
    clearTimeout(kwTimer);
    kwTimer = setTimeout(() => {
      state.keyword = e.target.value.trim();
      state.pn = 1;
      load(true);
    }, 350);
  });

  async function load(replace = false) {
    if (replace) listBox.innerHTML = '';
    if (!listBox.children.length) listBox.appendChild(ui.loadBox('加载中…'));
    moreBtn.classList.add('hidden');
    try {
      const r = await api.favList(mediaId, state.pn, state.keyword);
      if (r.code !== 0) throw new Error(r.message || '收藏内容获取失败');
      const items = (r.data?.medias || []).map((m) => ({
        bvid: m.bvid || m.bv_id,
        title: m.title || '',
        cover: m.cover || '',
        author: m.upper?.name || '',
        play: m.cnt_info?.play,
        dur: m.duration ? ui.fmtDur(m.duration) : '',
      }));
      listBox.querySelector('.state-box')?.remove();
      if (!items.length && state.pn === 1) {
        listBox.appendChild(ui.stateBox(state.keyword ? '收藏夹内没有匹配结果' : '收藏夹是空的', state.keyword ? 'search' : 'bookmark'));
        return;
      }
      state.hasMore = !!r.data?.has_more;
      state.items = replace ? items : state.items.concat(items);
      if (replace) listBox.innerHTML = '';
      state.items.forEach((v) => {
        listBox.appendChild(ui.videoRow(v, { onClick: () => go('player', { bvid: v.bvid }) }));
      });
      moreBtn.classList.toggle('hidden', !state.hasMore);
    } catch (e) {
      if (replace) {
        listBox.innerHTML = '';
        listBox.appendChild(ui.errorBox(e.message, () => load(true)));
      } else {
        ui.toast(e.message);
      }
    }
  }

  moreBtn.addEventListener('click', () => {
    state.pn += 1;
    load();
  });

  load(true);
}
