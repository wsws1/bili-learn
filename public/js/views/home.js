// 首页：学习工作台
export default function renderHome(container, ctx) {
  const { api, ui, user, go, hideTopbar, showNav } = ctx;
  hideTopbar();
  showNav(true);

  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const avatar = user?.face
    ? `<img src="${ui.esc(user.face)}" alt="" referrerpolicy="no-referrer">`
    : ui.esc((user?.uname || '知').slice(0, 1));

  container.innerHTML = `
    <div class="greet">
      <button id="avatarBtn" class="avatar" style="cursor:pointer" aria-label="我的设置">${avatar}</button>
      <div>
        <div class="h">${greet}，${ui.esc(user?.uname || '同学')}</div>
        <div class="s">专注学习 · 无推荐流</div>
      </div>
      <button id="logoutBtn" class="icon-btn" aria-label="退出登录">${ui.icon('logout', 19)}</button>
    </div>

    <button id="searchBar" class="searchbar" style="margin-top:14px;width:100%">
      <div class="input-wrap" style="flex:1">${ui.icon('search', 17)}<span style="color:var(--muted);font-size:13.5px">搜索全站、收藏夹、历史记录</span></div>
    </button>

    <div id="resumeBox" class="section"></div>

    <div class="quick">
      <a href="#/fav">${ui.icon('bookmark', 22)}<span>收藏夹</span><em id="favCount" class="count"></em></a>
      <a href="#/history">${ui.icon('history', 22)}<span>历史记录</span></a>
      <a href="#/follow">${ui.icon('users', 22)}<span>关注更新</span></a>
    </div>

    <section id="dynSection" class="section">
      <div class="sec-head"><span class="t">关注更新</span><span id="dynBadge" class="badge hidden"></span><a class="link" href="#/follow">进入动态 ${ui.icon('right', 14)}</a></div>
      <div id="dynBox"></div>
    </section>

    <section class="section">
      <div class="sec-head"><span class="t" id="favTitle">收藏夹</span><a class="link" href="#/fav">全部 ${ui.icon('right', 14)}</a></div>
      <div id="favBox" class="folder-grid"></div>
    </section>
  `;

  container.querySelector('#avatarBtn').addEventListener('click', () => go('me'));
  container.querySelector('#searchBar').addEventListener('click', () => go('search'));
  container.querySelector('#logoutBtn').addEventListener('click', async () => {
    if (!confirm('确认退出登录？本地 Cookie 将被清除。')) return;
    try {
      await api.loginClear();
      await ctx.refreshUser();
      location.hash = '#/login';
    } catch {}
  });

  const resumeBox = container.querySelector('#resumeBox');
  const dynBox = container.querySelector('#dynBox');
  const favBox = container.querySelector('#favBox');

  // 继续学习：取历史中第一条未看完（受沉浸模式过滤）
  function loadResume() {
  api.history(10).then((r) => {
    if (r.code !== 0) throw new Error(r.message || '历史记录获取失败');
    const list = (r.data?.list || []).map((h) => ({
      bvid: h.history?.bvid || h.bvid,
      title: h.title || '',
      author: h.author_name || '',
      tname: h.tname || h.tag_name || '',
      dur: h.duration || 0,
      progress: h.is_finish ? 100 : h.duration ? Math.min(100, Math.round((h.progress / h.duration) * 100)) : null,
      current: h.progress || 0,
    }));
    const filtered = list.filter(ui.passImmersion);
    const item = filtered.find((x) => x.progress != null && x.progress < 100) || filtered[0] || null;
    if (!item || !item.bvid) {
      resumeBox.appendChild(ui.stateBox(
        ui.getImmersion().on ? '沉浸模式下暂无学习记录\n可到「我的 · 设置」调整过滤' : '还没有学习记录\n去收藏夹或关注动态找一节开始吧',
        'history'
      ));
      return;
    }
    const card = document.createElement('div');
    card.className = 'card resume';
    card.innerHTML = `
      <div class="info">
        <span class="tag">${item.progress === 100 ? '已看完 · 重温' : '继续学习'}</span>
        <div class="h">${ui.esc(item.title)}</div>
        <div class="s">${ui.esc(item.author || '')}${item.tname ? ' · ' + ui.esc(item.tname) : ''}</div>
        <div class="progress"><i style="width:${Math.min(100, item.progress ?? 0)}%"></i></div>
        <div class="s">${item.progress == null ? '' : item.progress === 100 ? '已看完' : `学到 ${ui.fmtDur(item.current)} / ${ui.fmtDur(item.dur)}`}</div>
      </div>
      <button class="play-btn" aria-label="继续播放">${ui.icon('play', 20)}</button>
    `;
    card.querySelector('.play-btn').addEventListener('click', () => go('player', { bvid: item.bvid }));
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.play-btn')) go('player', { bvid: item.bvid });
    });
    resumeBox.appendChild(card);
  }).catch((e) => {
    resumeBox.appendChild(ui.errorBox('继续学习加载失败：' + e.message, loadResume));
  });
  }
  loadResume();

  // 关注更新预览（受沉浸模式关键词过滤）
  function loadDyn() {
  api.dynamicsAll().then((r) => {
    if (!r.ok) throw new Error(r.message || '动态获取失败');
    const all = r.items.filter(ui.passImmersion);
    const unseen = all.filter((d) => ui.isUnseenDyn(d));
    const items = (unseen.length ? unseen : all).slice(0, 3);
    if (!items.length) {
      dynBox.appendChild(ui.stateBox('关注的 UP 主暂无新视频', 'users'));
      return;
    }
    const badge = container.querySelector('#dynBadge');
    if (unseen.length) {
      badge.classList.remove('hidden');
      badge.textContent = `${unseen.length} 条新动态`;
    }
    items.forEach((d) => {
      dynBox.appendChild(ui.feedItem(d, { thumb: true, onClick: () => go('player', { bvid: d.bvid }) }));
    });
  }).catch((e) => {
    dynBox.appendChild(ui.errorBox('动态加载失败：' + e.message, loadDyn));
  });
  }
  loadDyn();

  // 收藏夹预览：常用收藏夹优先，其次最近播放，最多 2 个
  function renderFav() {
    favBox.innerHTML = '';
    const common = ui.getCommonFavs();
    const recent = JSON.parse(localStorage.getItem('zhixue:recentFavs') || '[]');
    const folders = favData || [];
    let show = folders.filter((f) => common.some((c) => String(c.id) === String(f.id))).slice(0, 2);
    const hasCommon = show.length > 0;
    if (show.length < 2) {
      const rec = folders.filter((f) => !show.includes(f) && recent.some((c) => String(c.id) === String(f.id)));
      show = show.concat(rec).slice(0, 2);
    }
    if (show.length < 2) show = show.concat(folders.filter((f) => !show.includes(f))).slice(0, 2);
    container.querySelector('#favTitle').textContent = hasCommon ? '常用收藏夹' : '收藏夹';
    if (!show.length) {
      favBox.appendChild(ui.stateBox('还没有收藏夹', 'bookmark'));
      return;
    }
    show.forEach((f, i) => {
      const card = ui.folderCard(f, i % 2 === 1, {
        star: common.some((c) => String(c.id) === String(f.id)),
        onStar: () => {
          ui.toggleCommonFav(f.id, f.title);
          ui.toast(ui.getCommonFavs().some((c) => String(c.id) === String(f.id)) ? '已设为常用收藏夹' : '已取消常用');
          renderFav();
        },
      });
      card.addEventListener('click', () => go('fav', { id: f.id }));
      favBox.appendChild(card);
    });
  }

  let favData = [];
  function loadFavs() {
  api.favFolders(user?.mid).then((r) => {
    if (r.code !== 0) throw new Error(r.message || '收藏夹获取失败');
    const list = r.data?.list || [];
    const count = container.querySelector('#favCount');
    if (list.length) count.textContent = list.length;
    favData = list;
    renderFav();
  }).catch((e) => {
    favBox.appendChild(ui.errorBox('收藏夹加载失败：' + e.message, loadFavs));
  });
  }
  loadFavs();
}
