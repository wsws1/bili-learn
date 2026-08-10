// 我的 / 设置：常用博主、常用收藏夹、沉浸模式、退出登录
const COMMON_KEY = 'zhixue:common';

export default function renderMe(container, ctx) {
  const { api, ui, user, go, setTopbar, showNav } = ctx;
  showNav(true);
  setTopbar({ title: '我的 · 设置', back: true });

  const commonMids = new Set(JSON.parse(localStorage.getItem(COMMON_KEY) || '[]'));

  container.innerHTML = `
    <div class="me-sec card">
      <div class="me-head"><span>常用博主</span><em id="upCount">0</em></div>
      <div class="searchbar"><div class="input-wrap">${ui.icon('search', 16)}<input id="upKw" type="search" placeholder="搜索博主昵称"></div></div>
      <div id="upList"></div>
    </div>

    <div class="me-sec card">
      <div class="me-head"><span>常用收藏夹</span><em id="favCount">0</em></div>
      <div class="searchbar"><div class="input-wrap">${ui.icon('search', 16)}<input id="favKw" type="search" placeholder="搜索收藏夹名称"></div></div>
      <div id="favList"></div>
    </div>

    <div class="me-sec card">
      <div class="me-head">
        <span>沉浸模式</span>
        <label class="switch"><input id="immerseOn" type="checkbox"><span class="track"></span></label>
      </div>
      <div class="me-desc">开启后，历史记录、首页继续学习、关注动态会过滤掉以下分区与关键词的内容（仅本地生效）。</div>
      <div id="partBox" class="me-desc hidden">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">排除分区（点选切换）</div>
        <div class="chips" id="partChips" style="flex-wrap:wrap"></div>
      </div>
      <div id="kwBox" class="me-desc hidden">
        <div style="font-size:12px;color:var(--muted);margin:10px 0 6px">自定义排除关键词（匹配标题）</div>
        <div class="chips" id="kwChips" style="flex-wrap:wrap;margin-bottom:8px"></div>
        <form id="kwForm" class="kw-form">
          <input id="kwInput" type="text" placeholder="如：直播、vlog、实况">
          <button class="btn" type="submit">添加</button>
        </form>
      </div>
    </div>

    <button id="logoutBtn" class="btn btn-block" style="margin-top:14px;color:var(--danger);border-color:var(--border)">退出登录</button>
  `;

  const upList = container.querySelector('#upList');
  const favList = container.querySelector('#favList');
  let upData = [];
  let favData = [];

  // ---------- 常用博主 ----------
  api.followings(user?.mid, true).then((r) => {
    if (r.code !== 0) throw new Error(r.message || '关注列表获取失败');
    upData = r.list || [];
    renderUps('');
  }).catch((e) => {
    upList.appendChild(ui.errorBox(e.message));
  });

  function renderUps(kw) {
    const q = kw.toLowerCase();
    const list = upData.filter((u) => (u.uname || '').toLowerCase().includes(q));
    container.querySelector('#upCount').textContent = upData.length + ' 关注';
    upList.innerHTML = '';
    if (!list.length) {
      upList.appendChild(ui.stateBox(kw ? '没有匹配的博主' : '还没有常用博主，点右侧星标添加', 'users'));
      return;
    }
    const visible = kw ? list.slice(0, 60) : list.slice(0, 3);
    visible.forEach((u) => {
      const isCommon = commonMids.has(String(u.mid));
      const row = document.createElement('div');
      row.className = 'me-row';
      row.innerHTML = `
        <span class="avatar" style="width:34px;height:34px;font-size:12px">${u.face ? `<img src="${ui.esc(u.face)}" alt="" referrerpolicy="no-referrer">` : ui.esc((u.uname || '?').slice(0, 1))}</span>
        <span class="name">${ui.esc(u.uname || '')}</span>
        <button class="star-btn ${isCommon ? 'on' : ''}" data-mid="${u.mid}" aria-label="设为常用">${ui.icon('star', 18)}</button>`;
      row.querySelector('.star-btn').addEventListener('click', () => {
        const m = String(u.mid);
        if (commonMids.has(m)) commonMids.delete(m);
        else commonMids.add(m);
        localStorage.setItem(COMMON_KEY, JSON.stringify([...commonMids]));
        renderUps(container.querySelector('#upKw').value);
      });
      upList.appendChild(row);
    });
    if (!kw && list.length > 3) {
      const hint = document.createElement('div');
      hint.className = 'me-desc';
      hint.style.cssText = 'margin-top:8px';
      hint.textContent = '输入关键词可搜索全部 ' + list.length + ' 位关注';
      upList.appendChild(hint);
    }
  }
  container.querySelector('#upKw').addEventListener('input', (e) => renderUps(e.target.value));

  // ---------- 常用收藏夹 ----------
  api.favFolders(user?.mid).then((r) => {
    if (r.code !== 0) throw new Error(r.message || '收藏夹获取失败');
    favData = r.data?.list || [];
    renderFavs('');
  }).catch((e) => {
    favList.appendChild(ui.errorBox(e.message));
  });

  function renderFavs(kw) {
    const q = kw.toLowerCase();
    const common = ui.getCommonFavs();
    const list = favData.filter((f) => (f.title || '').toLowerCase().includes(q));
    container.querySelector('#favCount').textContent = common.length + ' 常用 / ' + favData.length + ' 个';
    favList.innerHTML = '';
    if (!list.length) {
      favList.appendChild(ui.stateBox(kw ? '没有匹配的收藏夹' : '还没有常用收藏夹，点右侧星标添加', 'bookmark'));
      return;
    }
    const isCommon = (f) => common.some((x) => String(x.id) === String(f.id));
    const sorted = list.slice().sort((a, b) => (isCommon(b) ? 1 : 0) - (isCommon(a) ? 1 : 0));
    const visible = kw ? sorted : sorted.slice(0, 3);
    visible.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'me-row';
      row.innerHTML = `
        <span class="avatar" style="width:34px;height:34px;font-size:12px">${ui.icon('folder', 16)}</span>
        <span class="name">${ui.esc(f.title)}</span>
        <span class="meta">${f.media_count ?? ''} 个</span>
        <button class="star-btn ${isCommon(f) ? 'on' : ''}" data-id="${f.id}" aria-label="设为常用收藏夹">${ui.icon('star', 18)}</button>`;
      row.querySelector('.star-btn').addEventListener('click', () => {
        ui.toggleCommonFav(f.id, f.title);
        renderFavs(container.querySelector('#favKw').value);
      });
      favList.appendChild(row);
    });
    if (!kw && list.length > 3) {
      const hint = document.createElement('div');
      hint.className = 'me-desc';
      hint.style.cssText = 'margin-top:8px';
      hint.textContent = '输入关键词可搜索全部 ' + list.length + ' 个收藏夹';
      favList.appendChild(hint);
    }
  }
  container.querySelector('#favKw').addEventListener('input', (e) => renderFavs(e.target.value));

  // ---------- 沉浸模式 ----------
  let immerse = ui.getImmersion();
  const partBox = container.querySelector('#partBox');
  const kwBox = container.querySelector('#kwBox');
  const partChips = container.querySelector('#partChips');
  const kwChips = container.querySelector('#kwChips');

  function syncImmerse() {
    container.querySelector('#immerseOn').checked = immerse.on;
    partBox.classList.toggle('hidden', !immerse.on);
    kwBox.classList.toggle('hidden', !immerse.on);
    partChips.innerHTML = '';
    ui.IMMERSE_PARTITIONS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'chip' + (immerse.partitions.includes(p) ? ' on' : '');
      b.textContent = p;
      b.addEventListener('click', () => {
        if (immerse.partitions.includes(p)) immerse.partitions = immerse.partitions.filter((x) => x !== p);
        else immerse.partitions.push(p);
        ui.saveImmersion(immerse);
        syncImmerse();
      });
      partChips.appendChild(b);
    });
    kwChips.innerHTML = '';
    if (!immerse.keywords.length) {
      const s = document.createElement('span');
      s.className = 'me-desc';
      s.style.cssText = 'font-size:12px;color:var(--muted)';
      s.textContent = '还没有自定义关键词';
      kwChips.appendChild(s);
    }
    immerse.keywords.forEach((k) => {
      const b = document.createElement('button');
      b.className = 'chip on';
      b.textContent = k + ' ×';
      b.addEventListener('click', () => {
        immerse.keywords = immerse.keywords.filter((x) => x !== k);
        ui.saveImmersion(immerse);
        syncImmerse();
      });
      kwChips.appendChild(b);
    });
  }

  container.querySelector('#immerseOn').addEventListener('change', (e) => {
    immerse.on = e.target.checked;
    if (immerse.on && !immerse.partitions.length) {
      immerse.partitions = [...ui.IMMERSE_PARTITIONS];
    }
    ui.saveImmersion(immerse);
    syncImmerse();
    ui.toast(immerse.on ? '沉浸模式已开启' : '沉浸模式已关闭');
  });

  container.querySelector('#kwForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = container.querySelector('#kwInput').value.trim();
    if (!v) return;
    if (!immerse.keywords.includes(v)) {
      immerse.keywords.push(v);
      ui.saveImmersion(immerse);
    }
    container.querySelector('#kwInput').value = '';
    syncImmerse();
  });

  syncImmerse();

  // ---------- 退出登录 ----------
  container.querySelector('#logoutBtn').addEventListener('click', async () => {
    if (!confirm('确认退出登录？本地 Cookie 将被清除。')) return;
    try {
      await api.loginClear();
      await ctx.refreshUser();
      location.hash = '#/login';
    } catch {}
  });
}
