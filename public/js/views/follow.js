// 关注动态：分类（常用 / 特别关注 / 其他）+ 只看更新（打开视频才算已看）+ 博主锁定 + 时间范围
const COMMON_KEY = 'zhixue:common';

export default function renderFollow(container, ctx) {
  const { api, ui, user, go, setTopbar, showNav } = ctx;
  showNav(true);
  setTopbar({
    title: '关注更新',
    actions: [
      { icon: 'refresh', label: '刷新', onClick: () => { state.dyn = []; state.dynOffset = ''; state.dynTime = ''; loadDyn(true); } },
      {
        html: `<label class="unseen-pill top">只看更新<input id="unseenToggle" type="checkbox" checked><i class="mini-track"></i></label>`,
        label: '只看更新',
        className: 'topbar-switch',
      },
    ],
  });

  const state = {
    followings: [],
    byMid: new Map(),
    specialMids: new Set(),
    commonMids: new Set(JSON.parse(localStorage.getItem(COMMON_KEY) || '[]')),
    otherList: [],
    otherMids: new Set(),
    category: 'all',
    locked: null, // { mid, uname }
    windowDays: 0,
    unseenOnly: true,
    autoLoads: 0,
    dyn: [],
    dynOffset: '',
    dynTime: '',
    dynHasMore: false,
    spItems: [],
    spOffset: '',
    spTime: '',
    spHasMore: false,
  };

  container.innerHTML = `
    <div class="chips" id="catChips" style="margin-top:12px"></div>
    <div class="creator-chips" id="creatorChips" style="margin-top:10px"></div>
    <div id="lockBanner" class="lock-banner hidden">${ui.icon('user', 16)}<span id="lockName"></span><button id="unlockBtn">清除</button></div>
    <div class="chips" style="margin-top:10px" id="timeChips">
      <button class="chip on" data-days="0">全部</button>
      <button class="chip" data-days="1">1 天内</button>
      <button class="chip" data-days="3">3 天内</button>
      <button class="chip" data-days="7">7 天内</button>
    </div>
    <div id="feedBox" style="margin-top:8px"></div>
    <button id="moreBtn" class="load-more hidden">加载更多</button>
  `;

  const feedBox = container.querySelector('#feedBox');
  const moreBtn = container.querySelector('#moreBtn');

  // ---------- 分类 ----------
  function categorize() {
    // 特别关注以 B 站关注列表的 special=1 字段识别（tagid 分组接口实测不生效）
    const special = new Set(
      state.followings.filter((u) => u.special === 1).map((u) => String(u.mid))
    );
    state.specialMids = special;
    const others = [];
    state.followings.forEach((u) => {
      const m = String(u.mid);
      if (!special.has(m) && !state.commonMids.has(m)) others.push(u);
    });
    state.otherList = others;
    state.otherMids = new Set(others.map((u) => String(u.mid)));
  }

  function matchesCat(d, cat) {
    if (cat === 'all') return true;
    const m = String(d.mid);
    if (cat === 'common') return state.commonMids.has(m);
    if (cat === 'special') return state.specialMids.has(m);
    if (cat === 'other') return state.otherMids.has(m);
    return true;
  }

  function isUnseen(d) {
    return ui.isUnseenDyn(d);
  }

  // ---------- 渲染分类 chips（数字 = 未看新动态数） ----------
  function unseenCountFor(cat) {
    const pool = state.locked ? state.spItems : state.dyn;
    return pool.filter((d) => matchesCat(d, cat) && isUnseen(d)).length;
  }

  function renderCats() {
    const cats = [
      { id: 'all', label: '全部' },
      { id: 'common', label: '常用' },
      { id: 'special', label: '特别关注' },
      { id: 'other', label: '其他' },
    ];
    const el = container.querySelector('#catChips');
    el.innerHTML = '';
    cats.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip' + (state.category === c.id ? ' on' : '');
      b.dataset.tab = c.id;
      b.innerHTML = `${c.label}<em>${unseenCountFor(c.id)}</em>`;
      b.addEventListener('click', () => {
        state.category = c.id;
        state.locked = null;
        state.autoLoads = 0;
        render();
      });
      el.appendChild(b);
    });
  }

  // ---------- 渲染博主 chips / 筛选 ----------
  function creatorEl(u, on = false) {
    const b = document.createElement('button');
    b.className = 'creator-chip' + (on ? ' on' : '');
    b.innerHTML = `<span class="mini">${u.face ? `<img src="${ui.esc(u.face)}" alt="" referrerpolicy="no-referrer">` : ui.esc((u.uname || '?').slice(0, 1))}</span><span>${ui.esc(u.uname || '')}</span>`;
    b.addEventListener('click', () => lock(u));
    return b;
  }

  function renderCreators() {
    const el = container.querySelector('#creatorChips');
    el.innerHTML = '';
    if (state.category === 'other') {
      const recent = recentCreators(2);
      if (recent.length) {
        const lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:11.5px;color:var(--muted);flex:none';
        lbl.textContent = '最近常看';
        el.appendChild(lbl);
        recent.forEach((u) => el.appendChild(creatorEl(u)));
      }
      const fb = document.createElement('button');
      fb.className = 'filter-btn';
      fb.innerHTML = ui.icon('filter', 15) + '筛选 ' + state.otherList.length + ' 位博主';
      fb.addEventListener('click', () => openSheet('other'));
      el.appendChild(fb);
      return;
    }

    const common = state.followings.filter((u) => state.commonMids.has(String(u.mid)));
    const special = state.followings.filter((u) => state.specialMids.has(String(u.mid)) && !state.commonMids.has(String(u.mid)));
    let list = state.category === 'common' ? common : state.category === 'special' ? special : common.concat(special);
    if (list.length < 6) {
      const rest = state.otherList.filter((u) => !list.includes(u));
      list = list.concat(rest).slice(0, 6);
    }
    const set = catSet(state.category);
    const total = state.category === 'all' ? state.followings.length : (set ? set.size : 0);
    if (!list.length) {
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:12px;color:var(--muted)';
      lbl.textContent = '该分类暂无博主';
      el.appendChild(lbl);
      return;
    }
    list.forEach((u) => el.appendChild(creatorEl(u)));
    if (total > list.length) {
      const fb = document.createElement('button');
      fb.className = 'filter-btn';
      fb.innerHTML = ui.icon('filter', 15) + `筛选 ${total} 位`;
      fb.addEventListener('click', () => openSheet(state.category));
      el.appendChild(fb);
    }
  }

  function catSet(cat) {
    if (cat === 'common') return new Set(state.commonMids);
    if (cat === 'special') return state.specialMids;
    if (cat === 'other') return state.otherMids;
    return null;
  }

  function recentCreators(n) {
    const seen = new Set();
    const out = [];
    const pool = state.locked ? state.spItems : state.dyn;
    for (const d of pool) {
      const u = state.byMid.get(String(d.mid));
      if (u && !seen.has(d.mid)) {
        seen.add(d.mid);
        out.push(u);
        if (out.length >= n) break;
      }
    }
    return out;
  }

  // ---------- 锁定 ----------
  function lock(u) {
    state.locked = { mid: String(u.mid), uname: u.uname };
    state.spItems = [];
    state.spOffset = '';
    state.spTime = '';
    state.spHasMore = false;
    render();
    feedBox.innerHTML = '';
    feedBox.appendChild(ui.loadBox('加载该 UP 的动态…'));
    loadDyn(true);
  }

  container.querySelector('#unlockBtn').addEventListener('click', () => {
    state.locked = null;
    render();
  });

  // ---------- 只看更新开关 ----------
  document.getElementById('unseenToggle').addEventListener('change', (e) => {
    state.unseenOnly = e.target.checked;
    state.autoLoads = 0;
    render();
  });

  // ---------- 时间范围 ----------
  container.querySelectorAll('#timeChips .chip').forEach((b) => {
    b.addEventListener('click', () => {
      container.querySelectorAll('#timeChips .chip').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      state.windowDays = Number(b.dataset.days);
      renderFeed();
    });
  });

  // ---------- 动态加载 ----------
  function withinWindow(pubTs) {
    if (!state.windowDays) return true;
    return Date.now() / 1000 - pubTs < state.windowDays * 86400;
  }

  function visibleItems() {
    const pool = state.locked ? state.spItems : state.dyn;
    const set = state.locked ? null : catSet(state.category);
    return pool.filter((d) => {
      if (!ui.passImmersion(d)) return false;
      if (state.locked && d.mid !== state.locked.mid) return false;
      if (set && !set.has(String(d.mid))) return false;
      // 锁定查看某 UP 时显示其全部动态（查看即已读）
      if (!state.locked && state.unseenOnly && !isUnseen(d)) return false;
      return withinWindow(d.pubTime);
    });
  }

  function renderFeed() {
    const items = visibleItems();
    feedBox.innerHTML = '';
    if (!items.length) {
      const msg = state.locked
        ? '该博主最近没有新视频'
        : state.unseenOnly
          ? '暂无未看新动态 · 可关闭「只看更新」查看全部'
          : '当前筛选下暂无新动态';
      feedBox.appendChild(ui.stateBox(msg, state.locked ? 'user' : 'users'));
      const hasMore = state.locked ? state.spHasMore : state.dynHasMore;
      moreBtn.classList.toggle('hidden', !hasMore);
      return;
    }
    items.forEach((d) => {
      feedBox.appendChild(ui.feedItem(d, {
        thumb: true,
        onClick: () => go('player', { bvid: d.bvid }),
        onAuthor: () => {
          const u = state.byMid.get(String(d.mid));
          if (u) lock(u);
        },
      }));
    });
    moreBtn.classList.toggle('hidden', !(state.locked ? state.spHasMore : state.dynHasMore));
  }

  async function loadDyn(replace = false) {
    const locked = state.locked;
    const params = locked
      ? { mid: locked.mid, offset: state.spOffset, time: state.spTime }
      : { offset: state.dynOffset, time: state.dynTime };
    try {
      const r = locked ? await api.dynamicsUp(params.mid, params.offset, params.time) : await api.dynamicsAll(params.offset, params.time);
      if (!r.ok) throw new Error(r.message || '动态获取失败');
      if (locked) {
        // 查看该 UP 动态 = B 站服务端已读机制；本地同步清零该 UP 的未看
        r.items.forEach((d) => {
          if (d.bvid) ui.markDynSeen(d.bvid);
        });
        if (replace) ui.toast(`已查看「${locked.uname}」的动态，未看已清零`);
        state.spItems = replace ? r.items : state.spItems.concat(r.items);
        state.spOffset = r.offset;
        state.spTime = r.updateBaseline || state.spTime;
        state.spHasMore = r.hasMore;
      } else {
        state.dyn = replace ? r.items : state.dyn.concat(r.items);
        state.dynOffset = r.offset;
        state.dynTime = r.updateBaseline || state.dynTime;
        state.dynHasMore = r.hasMore;
      }
      renderFeed();
      renderCats();
    } catch (e) {
      if (replace) {
        feedBox.innerHTML = '';
        feedBox.appendChild(ui.errorBox(e.message, () => loadDyn(true)));
      } else {
        ui.toast(e.message);
      }
    }
  }

  moreBtn.addEventListener('click', () => loadDyn(false));

  // ---------- 博主筛选弹层 ----------
  function openSheet(cat) {
    const list = cat === 'other' ? state.otherList : state.followings.filter((u) => !catSet(cat) || catSet(cat).has(String(u.mid)));
    ui.sheet({
      title: '筛选博主',
      note: cat === 'other' ? `其他分类 · 共 ${list.length} 位` : '点击博主可只看 TA 的动态',
      rows: list.map((u) => ({ data: u, el: creatorSheetRow(u) })),
      onSearch: (q) => {
        const kw = q.toLowerCase();
        return list
          .filter((u) => (u.uname || '').toLowerCase().includes(kw))
          .map((u) => ({ data: u, el: creatorSheetRow(u) }));
      },
      onPick: (u) => lock(u),
    });
  }

  function creatorSheetRow(u) {
    const row = document.createElement('button');
    row.type = 'button';
    const isCommon = state.commonMids.has(String(u.mid));
    row.className = 'creator-row';
    row.innerHTML = `
      <span class="avatar" style="width:34px;height:34px;font-size:12px;flex:none">${u.face ? `<img src="${ui.esc(u.face)}" alt="" referrerpolicy="no-referrer">` : ui.esc((u.uname || '?').slice(0, 1))}</span>
      <span class="name">${ui.esc(u.uname || '')}</span>
      <span class="meta">${isCommon ? '常用' : state.specialMids.has(String(u.mid)) ? '特别关注' : ''}</span>
      <span class="star-btn ${isCommon ? 'on' : ''}" data-mid="${u.mid}" aria-label="设为常用">${ui.icon('star', 18)}</span>
    `;
    row.querySelector('.star-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const m = String(u.mid);
      if (state.commonMids.has(m)) state.commonMids.delete(m);
      else state.commonMids.add(m);
      localStorage.setItem(COMMON_KEY, JSON.stringify([...state.commonMids]));
      categorize();
      renderCats();
      renderCreators();
      const star = row.querySelector('.star-btn');
      star.classList.toggle('on', state.commonMids.has(m));
      row.querySelector('.meta').textContent = state.commonMids.has(m) ? '常用' : state.specialMids.has(String(u.mid)) ? '特别关注' : '';
    });
    return row;
  }

  // ---------- 整体渲染 ----------
  function render() {
    renderCats();
    renderCreators();
    container.querySelector('#lockBanner').classList.toggle('hidden', !state.locked);
    if (state.locked) container.querySelector('#lockName').textContent = '正在看：' + state.locked.uname;
    renderFeed();
  }

  async function boot() {
    feedBox.appendChild(ui.loadBox('加载关注与动态…'));
    try {
      const fRes = await api.followings(user?.mid, true);
      if (fRes.code !== 0) throw new Error(fRes.message || '关注列表获取失败');
      state.followings = fRes.list || [];
      state.byMid = new Map(state.followings.map((u) => [String(u.mid), u]));
      categorize();
      renderCats();
      renderCreators();
      loadDyn(true);
    } catch (e) {
      feedBox.innerHTML = '';
      feedBox.appendChild(ui.errorBox(e.message, boot));
    }
  }

  boot();
  return () => {};
}
