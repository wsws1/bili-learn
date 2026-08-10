// 播放页：DASH / MP4 / FLV + 分P + 合集 + 收藏状态 + 笔记 + 评论 + 进度上报与续播
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('播放器组件加载失败'));
    document.head.appendChild(s);
  });
}

const QN_TO_HEIGHT = { 16:360, 32:480, 64:720, 74:720, 80:1080, 112:1080, 116:1080, 120:2160, 125:1080, 126:1080, 127:4320 };
const HEIGHT_LABEL = { 360: '360P', 480: '480P', 720: '720P', 1080: '1080P', 2160: '4K', 4320: '8K' };

// 小窗（画中画）会话：离开播放页后视频继续播放，关闭小窗回到原页面
let pipSession = null;

function cleanupPipSession() {
  if (!pipSession) return;
  const s = pipSession;
  pipSession = null;
  clearInterval(s.hbTimer);
  try {
    if (s.playType === 'dash' && s.player && s.player.reset) s.player.reset();
    else if (s.playType === 'flv' && s.player && s.player.destroy) s.player.destroy();
  } catch {}
  try {
    s.video.remove();
  } catch {}
}

export default function renderPlayer(container, ctx, route) {
  const { api, ui, user, go, hideTopbar, showNav } = ctx;
  cleanupPipSession();
  const bvid0 = route.params.bvid || '';
  const cid0 = route.params.cid || '';
  if (!bvid0) {
    container.appendChild(ui.errorBox('缺少视频参数', () => go('home')));
    return;
  }
  hideTopbar();
  showNav(false);

  const state = {
    bvid: bvid0,
    cid: cid0,
    info: null,
    play: null,
    player: null,
    playedSec: 0,
    lastT: 0,
    startTs: 0,
    hbTimer: null,
    hbBound: false,
    reportFailed: false,
    season: null,
    fav: null, // { folders, aid }
    pendingSeek: null,
    seekApplied: false,
    noteKey: 'zhixue:note:' + bvid0,
    doneKey: 'zhixue:done:' + bvid0,
    qualityHeight: Number(localStorage.getItem('zhixue:quality')) || 0,
  };

  container.innerHTML = `
    <div class="player-wrap">
      <div class="video-box">
        <video id="video" controls playsinline preload="auto"></video>
        <div id="vLoading" class="loading">${ui.icon('refresh', 18)}加载视频中…</div>
        <div id="vError" class="load-error hidden"></div>
      </div>
      <div class="player-ctrl">
        <select id="qualitySel" class="select hidden" aria-label="清晰度"></select>
        <select id="speedSel" class="select" aria-label="播放速度">
          <option value="0.5">0.5×</option>
          <option value="0.75">0.75×</option>
          <option value="1" selected>1.0×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2.0×</option>
        </select>
        <div class="spacer"></div>
        <button id="pipBtn" class="icon-btn" aria-label="画中画" title="画中画">${ui.icon('maximize', 18)}</button>
      </div>
      <div id="codecRow" class="codec-chips hidden" style="margin-top:8px"></div>
    </div>

    <div class="p-info">
      <div id="pTitle" class="title">加载中…</div>
      <div id="pMeta" class="meta"></div>
    </div>

    <div class="p-actions">
      <button id="favBtn">${ui.icon('bookmark', 18)}<span>收藏</span></button>
      <button id="noteBtn">${ui.icon('pen', 18)}<span>记笔记</span></button>
      <button id="doneBtn">${ui.icon('check', 18)}<span>标记已学</span></button>
      <button id="aiBtn">${ui.icon('sparkles', 18)}<span>AI 总结</span></button>
    </div>
    <div id="favSummary" class="fav-summary hidden"></div>

    <div class="tabs" id="tabs"></div>
    <div class="tab-panel" id="panel"></div>
  `;

  const video = container.querySelector('#video');
  const vLoading = container.querySelector('#vLoading');
  const vError = container.querySelector('#vError');
  const panel = container.querySelector('#panel');
  let currentTab = 'parts';

  // ---------- 合集数据规范化 ----------
  function normSeason() {
    const info = state.info;
    if (info.ugc_season?.sections?.length) {
      return {
        kind: 'ugc',
        id: info.ugc_season.id,
        title: info.ugc_season.title,
        sections: info.ugc_season.sections.map((s) => ({
          title: s.title || '',
          episodes: (s.episodes || []).map((ep, i) => ({
            bvid: ep.bvid,
            cid: ep.cid || ep.page?.cid || ep.id,
            aid: ep.aid,
            title: ep.title || '',
            duration: ep.duration || ep.page?.duration || 0,
            pageIndex: i + 1,
          })),
        })),
      };
    }
    if (info.pgc_season?.episodes?.length) {
      return {
        kind: 'pgc',
        id: info.pgc_season.season_id,
        title: info.pgc_season.title,
        sections: [
          {
            title: info.pgc_season.title,
            episodes: (info.pgc_season.episodes || []).map((ep, i) => ({
              bvid: ep.bvid,
              cid: ep.cid,
              aid: ep.aid,
              title: ep.title || ep.long_title || '',
              duration: ep.duration || 0,
              pageIndex: i + 1,
            })),
          },
        ],
      };
    }
    return null;
  }

  // ---------- 视频信息 ----------
  async function loadInfo() {
    try {
      const r = await api.video(state.bvid);
      if (r.code !== 0) throw new Error(r.message || '视频信息获取失败');
      state.info = r.data;
      if (!state.cid) state.cid = r.data.cid;
      // 打开视频即视为该动态已看
      ui.markDynSeen(state.bvid);
      state.season = normSeason();
      state.pendingSeek = null;
      state.seekApplied = false;
      renderInfo();
      renderDone();
      renderTabs();
      renderTab();
      loadPlay();
      loadFavState();
      fetchResume();
    } catch (e) {
      vLoading.classList.add('hidden');
      showError(e.message, () => loadInfo());
    }
  }

  function renderInfo() {
    const d = state.info;
    container.querySelector('#pTitle').textContent = d.title || '';
    const owner = d.owner || {};
    const stat = d.stat || {};
    const seasonNote = state.season ? ` · 合集《${state.season.title}》` : '';
    container.querySelector('#pMeta').textContent =
      `${owner.name || ''} · ${ui.fmtNum(stat.view)} 播放 · ${ui.fmtNum(stat.like)} 赞 · ${ui.fmtNum(stat.favorite)} 收藏${seasonNote}`;
  }

  // ---------- 播放 ----------
  async function loadPlay() {
    vLoading.classList.remove('hidden');
    vError.classList.add('hidden');
    destroyPlayer();
    state.reportFailed = false;
    try {
      const r = await api.play(state.bvid, state.cid);
      if (!r.ok) throw new Error(r.error || '播放流获取失败');
      state.play = r;
      renderQuality(r.acceptQuality || []);
      state.startTs = Math.round(Date.now() / 1000);
      state.playedSec = 0;
      state.lastT = 0;
      if (r.type === 'dash') {
        await loadScript('/vendor/dash.all.min.js');
        if (!window.dashjs) throw new Error('DASH 播放器不可用');
        state.player = window.dashjs.MediaPlayer().create();
        state.player.initialize(video, r.mpdUrl + '&height=' + state.qualityHeight, true);
        renderCodecs(r.codecs, r.codec);
      } else if (r.type === 'flv') {
        await loadScript('/vendor/mpegts.js');
        if (!window.mpegts) throw new Error('FLV 播放器不可用');
        state.player = window.mpegts.createPlayer({ type: 'flv', url: r.streamUrl, isLive: false });
        state.player.attachMediaElement(video);
        state.player.load();
        state.player.play();
      } else {
        video.src = r.streamUrl;
        video.play().catch(() => {});
      }
      vLoading.classList.add('hidden');
      startHeartbeat();
    } catch (e) {
      vLoading.classList.add('hidden');
      showError(e.message, () => loadPlay());
    }
  }

  function renderCodecs(codecs, current) {
    const row = container.querySelector('#codecRow');
    row.innerHTML = '';
    const order = ['avc', 'hevc', 'av1'];
    const names = { avc: 'AVC', hevc: 'HEVC', av1: 'AV1' };
    const list = order.filter((c) => codecs.includes(c));
    if (list.length < 2) return;
    row.classList.remove('hidden');
    list.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip' + (c === current ? ' on' : '');
      b.textContent = names[c];
      b.addEventListener('click', () => {
        destroyPlayer();
        loadPlayWithCodec(c);
      });
      row.appendChild(b);
    });
  }

  // 清晰度：默认 720P，上限取视频支持的最高档（本地记忆）
  function renderQuality(acceptQuality) {
    const sel = container.querySelector('#qualitySel');
    const heights = [...new Set((acceptQuality || []).map((q) => QN_TO_HEIGHT[q]).filter(Boolean))].sort((a, b) => a - b);
    if (!heights.length) {
      sel.classList.add('hidden');
      return;
    }
    let pick = state.qualityHeight;
    if (!heights.includes(pick)) {
      pick = heights.includes(720) ? 720 : heights[heights.length - 1];
      state.qualityHeight = pick;
      localStorage.setItem('zhixue:quality', String(pick));
    }
    sel.classList.remove('hidden');
    sel.innerHTML = heights.map((h) => `<option value="${h}">${HEIGHT_LABEL[h] || h + 'P'}</option>`).join('');
    sel.value = String(pick);
  }

  async function loadPlayWithHeight() {
    const h = state.qualityHeight;
    const cur = state.play;
    if (!cur) return;
    localStorage.setItem('zhixue:quality', String(h));
    vLoading.classList.remove('hidden');
    vError.classList.add('hidden');
    destroyPlayer();
    try {
      const qn = Number(Object.keys(QN_TO_HEIGHT).find((k) => QN_TO_HEIGHT[k] === h)) || 64;
      const r = await api.play(state.bvid, state.cid, qn, cur.codec || 'auto');
      if (!r.ok) throw new Error(r.error || '播放流获取失败');
      state.play = r;
      state.startTs = Math.round(Date.now() / 1000);
      state.playedSec = 0;
      state.lastT = 0;
      if (r.type === 'dash') {
        await loadScript('/vendor/dash.all.min.js');
        state.player = window.dashjs.MediaPlayer().create();
        state.player.initialize(video, r.mpdUrl + '&height=' + h, true);
        renderCodecs(r.codecs, r.codec);
      } else if (r.type === 'flv') {
        await loadScript('/vendor/mpegts.js');
        state.player = window.mpegts.createPlayer({ type: 'flv', url: r.streamUrl, isLive: false });
        state.player.attachMediaElement(video);
        state.player.load();
        state.player.play();
      } else {
        video.src = r.streamUrl;
        video.play().catch(() => {});
      }
      vLoading.classList.add('hidden');
    } catch (e) {
      vLoading.classList.add('hidden');
      showError(e.message, () => loadPlayWithHeight());
    }
  }

  async function loadPlayWithCodec(codec) {
    vLoading.classList.remove('hidden');
    try {
      const r = await api.play(state.bvid, state.cid, 80, codec);
      if (!r.ok) throw new Error(r.error || '播放流获取失败');
      state.play = r;
      state.startTs = Math.round(Date.now() / 1000);
      state.playedSec = 0;
      state.lastT = 0;
      await loadScript('/vendor/dash.all.min.js');
      state.player = window.dashjs.MediaPlayer().create();
      state.player.initialize(video, r.mpdUrl + '&height=' + state.qualityHeight, true);
      renderCodecs(r.codecs, r.codec);
      vLoading.classList.add('hidden');
    } catch (e) {
      vLoading.classList.add('hidden');
      showError(e.message, () => loadPlayWithCodec(codec));
    }
  }

  function destroyPlayer() {
    if (state.player) {
      try {
        if (state.play?.type === 'dash' && state.player.reset) state.player.reset();
        else if (state.play?.type === 'flv' && state.player.destroy) state.player.destroy();
      } catch {}
      state.player = null;
    }
    video.removeAttribute('src');
    video.load();
  }

  function showError(msg, retry) {
      vError.innerHTML = `${ui.esc(msg)}<br>` + (retry ? '<button class="btn" style="margin-top:10px">重试</button>' : '');
      vError.classList.remove('hidden');
      const btn = vError.querySelector('button');
      if (btn && retry) {
        btn.addEventListener('click', () => {
          vError.classList.add('hidden');
          retry();
        });
      }
    }

  // ---------- 切换视频（分P / 合集集数） ----------
  function switchVideo(bvid2, cid2) {
    if (bvid2 === state.bvid && String(cid2) === String(state.cid)) return;
    report(true);
    clearInterval(state.hbTimer);
    state.bvid = bvid2;
    state.cid = cid2;
    state.noteKey = 'zhixue:note:' + bvid2;
    state.doneKey = 'zhixue:done:' + bvid2;
    commentState.items = [];
    commentState.next = 0;
    commentState.isEnd = false;
    loadInfo();
  }

  // ---------- 进度心跳上报 ----------
  function report(final = false) {
    const info = state.info;
    if (!info || !video.duration) return;
    if (final && video.currentTime < 1) return;
    api.report({
      aid: info.aid,
      bvid: state.bvid,
      cid: state.cid,
      mid: user?.mid,
      // 实测语义：played_time=当前播放位置（官网进度来源），realtime=累计播放时长
      played_time: Math.max(0, Math.round(video.currentTime || 0)),
      realtime: Math.round(state.playedSec),
      start_ts: state.startTs,
      play_type: 2,
    }).catch((e) => {
      if (!state.reportFailed) {
        state.reportFailed = true;
        console.warn('[zhixue-web] 进度上报失败：' + e.message);
      }
    });
  }

  function startHeartbeat() {
    clearInterval(state.hbTimer);
    if (!state.hbBound) {
      video.addEventListener('timeupdate', () => {
        if (!state.lastT) state.lastT = video.currentTime;
        const delta = video.currentTime - state.lastT;
        if (delta > 0 && delta < 5) state.playedSec += delta;
        state.lastT = video.currentTime;
      });
      video.addEventListener('pause', () => report(true));
      video.addEventListener('ended', () => report(true));
      window.addEventListener('pagehide', onPageHide);
      state.hbBound = true;
    }
    state.hbTimer = setInterval(() => report(), 15000);
  }

  function onPageHide() {
    report(true);
  }

  // ---------- 续播：从历史记录恢复进度 ----------
  async function fetchResume() {
    try {
      let max = '';
      let viewAt = '';
      for (let i = 0; i < 3; i++) {
        const r = await api.history(20, max, viewAt);
        if (r.code !== 0) break;
        const list = r.data?.list || [];
        const found = list.find((h) => (h.history?.bvid || h.bvid) === state.bvid);
        if (found && !found.is_finish && found.progress > 0 && found.duration && found.progress < found.duration - 3) {
          state.pendingSeek = found.progress;
          break;
        }
        const c = r.data?.cursor || {};
        if (!c.max || !list.length) break;
        max = c.max;
        viewAt = c.view_at;
      }
    } catch {}
  }

  function trySeek() {
    if (state.pendingSeek == null || state.seekApplied) return;
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const t = state.pendingSeek;
    state.pendingSeek = null;
    if (t > 3 && video.duration - t > 5) {
      video.currentTime = t;
      state.seekApplied = true;
      ui.toast('已续播到 ' + ui.fmtDur(t));
    }
  }
  video.addEventListener('loadedmetadata', trySeek);
  video.addEventListener('durationchange', trySeek);
  video.addEventListener('canplay', trySeek);

  // ---------- 播放速度 / 画中画 ----------
  container.querySelector('#speedSel').addEventListener('change', (e) => {
    video.playbackRate = Number(e.target.value);
  });
  container.querySelector('#qualitySel').addEventListener('change', (e) => {
    state.qualityHeight = Number(e.target.value);
    loadPlayWithHeight();
  });
  container.querySelector('#pipBtn').addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (video.requestPictureInPicture) await video.requestPictureInPicture();
      else ui.toast('当前浏览器不支持画中画');
    } catch (e) {
      ui.toast('画中画失败：' + e.message);
    }
  });

  // ---------- 收藏状态 ----------
  async function loadFavState() {
    try {
      const r = await api.favCheck(state.bvid);
      if (r.needsLogin || !r.ok) return;
      state.fav = { folders: r.folders, aid: r.aid, bvid: state.bvid };
      renderFavState();
    } catch {}
  }

  function renderFavState() {
    const fav = state.fav;
    const has = fav && fav.bvid === state.bvid && (fav.folders || []).some((f) => f.has);
    const btn = container.querySelector('#favBtn');
    btn.classList.toggle('on', !!has);
    btn.querySelector('span').textContent = has ? '已收藏' : '收藏';
    const sum = container.querySelector('#favSummary');
    if (!has || !fav) {
      sum.classList.add('hidden');
      return;
    }
    const names = fav.folders.filter((f) => f.has).map((f) => f.title);
    sum.textContent =
      '已收藏到' + names.slice(0, 2).map((n) => `「${n}」`).join('') + (names.length > 2 ? ` 等 ${names.length} 个收藏夹` : '');
    sum.classList.remove('hidden');
  }

  container.querySelector('#favBtn').addEventListener('click', async () => {
    let folders = state.fav && state.fav.bvid === state.bvid ? state.fav.folders : null;
    if (!folders) {
      try {
        const r = await api.favCheck(state.bvid);
        if (r.needsLogin) return ui.toast('请先登录');
        if (!r.ok) throw new Error(r.message || '收藏状态获取失败');
        state.fav = { folders: r.folders, aid: r.aid, bvid: state.bvid };
        folders = r.folders;
        renderFavState();
      } catch (e) {
        return ui.toast(e.message);
      }
    }
    ui.sheet({
      title: '收藏到',
      note: '点击切换收藏状态',
      searchable: false,
      rows: folders.map((f) => ({ data: f, el: folderCheckRow(f) })),
      onClose: () => renderFavState(),
    });
  });

  function folderCheckRow(f) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'creator-row';
    row.innerHTML = `
      <span class="avatar" style="width:34px;height:34px;font-size:12px;flex:none">${ui.icon('folder', 17)}</span>
      <span class="name">${ui.esc(f.title)}</span>
      <span class="meta">${f.media_count ?? ''} 个</span>
      <span class="star-btn ${f.has ? 'on' : ''}" style="pointer-events:none">${ui.icon('check', 18)}</span>
    `;
    row.addEventListener('click', async () => {
      const star = row.querySelector('.star-btn');
      star.style.pointerEvents = 'none';
      try {
        const res = await api.favDeal(state.info.aid, f.has ? '' : String(f.id), f.has ? String(f.id) : '');
        if (!res.ok) throw new Error(res.message || '操作失败');
        f.has = !f.has;
        star.classList.toggle('on', f.has);
        ui.toast(f.has ? '已加入「' + f.title + '」' : '已移出「' + f.title + '」');
      } catch (e) {
        ui.toast(e.message);
      } finally {
        star.style.pointerEvents = '';
      }
    });
    return row;
  }

  // ---------- 标记已学 ----------
  function renderDone() {
    const done = JSON.parse(localStorage.getItem(state.doneKey) || 'false');
    const b = container.querySelector('#doneBtn');
    b.classList.toggle('on', done);
    b.querySelector('span').textContent = done ? '已标记' : '标记已学';
  }
  container.querySelector('#doneBtn').addEventListener('click', () => {
    const cur = JSON.parse(localStorage.getItem(state.doneKey) || 'false');
    localStorage.setItem(state.doneKey, JSON.stringify(!cur));
    renderDone();
    ui.toast(cur ? '已取消标记' : '已标记为学完');
  });

  container.querySelector('#aiBtn').addEventListener('click', () => ui.toast('AI 总结：请在下一版本接入大模型'));

  // ---------- Tabs ----------
  function renderTabs() {
    const tabsEl = container.querySelector('#tabs');
    const defs = [
      { id: 'parts', label: '分P' },
      ...(state.season ? [{ id: 'season', label: '合集' }] : []),
      { id: 'notes', label: '笔记' },
      { id: 'comments', label: '评论' },
    ];
    if (!defs.some((d) => d.id === currentTab)) currentTab = 'parts';
    tabsEl.innerHTML = '';
    defs.forEach((d) => {
      const b = document.createElement('button');
      b.className = d.id === currentTab ? 'on' : '';
      b.dataset.tab = d.id;
      b.textContent = d.label;
      b.addEventListener('click', () => {
        currentTab = d.id;
        renderTabs();
        renderTab();
      });
      tabsEl.appendChild(b);
    });
  }

  function renderTab() {
    panel.innerHTML = '';
    if (currentTab === 'parts') renderParts();
    else if (currentTab === 'season') renderSeason();
    else if (currentTab === 'notes') renderNotes();
    else renderComments();
  }

  // ---------- 分P ----------
  function renderParts() {
    panel.innerHTML = '';
    const pages = state.info?.pages || [];
    if (!pages.length) {
      panel.appendChild(ui.stateBox('该视频无分P', 'video'));
      return;
    }
    const box = document.createElement('div');
    box.className = 'card';
    pages.forEach((p) => {
      const d = document.createElement('div');
      d.className = 'ol-item' + (p.cid === state.cid ? ' cur' : '');
      d.innerHTML = `<span>${p.page}. ${ui.esc(p.part || '')}</span><span class="d">${ui.fmtDur(p.duration)}</span>`;
      d.addEventListener('click', () => {
        if (p.cid === state.cid) return;
        state.cid = p.cid;
        renderParts();
        loadPlay();
      });
      box.appendChild(d);
    });
    panel.appendChild(box);
  }

  // ---------- 合集 ----------
  function flatEpisodes() {
    const out = [];
    state.season?.sections?.forEach((s) => {
      s.episodes.forEach((ep) => out.push({ ...ep, section: s.title }));
    });
    return out;
  }

  function renderSeason() {
    panel.innerHTML = '';
    if (!state.season) {
      panel.appendChild(ui.stateBox('该视频没有合集', 'video'));
      return;
    }
    const head = document.createElement('div');
    head.className = 'sec-head';
    head.innerHTML = `<span class="t">${ui.esc(state.season.title)}</span>`;
    panel.appendChild(head);

    state.season.sections.forEach((sec) => {
      if (state.season.sections.length > 1) {
        const sh = document.createElement('div');
        sh.className = 'sec-head';
        sh.style.marginTop = '6px';
        sh.innerHTML = `<span class="t" style="font-size:13px;color:var(--muted)">${ui.esc(sec.title)}</span>`;
        panel.appendChild(sh);
      }
      const box = document.createElement('div');
      box.className = 'card';
      sec.episodes.forEach((ep) => {
        const cur = ep.bvid === state.bvid;
        const d = document.createElement('div');
        d.className = 'ol-item' + (cur ? ' cur' : '');
        d.innerHTML = `<span style="flex:none">${ep.pageIndex}</span><span class="ep-title">${ui.esc(ep.title)}</span><span class="d">${ui.fmtDur(ep.duration)}</span>`;
        d.addEventListener('click', () => switchVideo(ep.bvid, ep.cid));
        box.appendChild(d);
      });
      panel.appendChild(box);
    });

    const eps = flatEpisodes();
    const idx = eps.findIndex((e) => e.bvid === state.bvid);
    if (idx >= 0) {
      const nav = document.createElement('div');
      nav.className = 'season-nav';
      const hasPrev = idx > 0;
      const hasNext = idx < eps.length - 1;
      nav.innerHTML = `
        <button class="btn" ${hasPrev ? '' : 'disabled'}>${ui.icon('back', 16)}上一集</button>
        <button class="btn" ${hasNext ? '' : 'disabled'}>下一集${ui.icon('right', 16)}</button>`;
      if (hasPrev) {
        nav.querySelector('button:first-child').addEventListener('click', () => switchVideo(eps[idx - 1].bvid, eps[idx - 1].cid));
      }
      if (hasNext) {
        nav.querySelector('button:last-child').addEventListener('click', () => switchVideo(eps[idx + 1].bvid, eps[idx + 1].cid));
      }
      panel.appendChild(nav);
    }
  }

  // ---------- 笔记 ----------
  function renderNotes() {
    panel.innerHTML = '';
    const notes = JSON.parse(localStorage.getItem(state.noteKey) || '[]');
    const editor = document.createElement('div');
    editor.className = 'note-editor';
    editor.innerHTML = `<textarea id="noteInput" placeholder="记录这节课的想法…"></textarea><button id="saveNote" class="btn btn-primary" style="margin-top:8px">保存笔记</button>`;
    editor.querySelector('#saveNote').addEventListener('click', () => {
      const text = editor.querySelector('#noteInput').value.trim();
      if (!text) return ui.toast('笔记内容为空');
      notes.unshift({ ts: Date.now() / 1000, text });
      localStorage.setItem(state.noteKey, JSON.stringify(notes));
      renderNotes();
      ui.toast('笔记已保存到本机');
    });
    panel.appendChild(editor);
    if (!notes.length) {
      panel.appendChild(ui.stateBox('还没有笔记，写一条吧', 'pen'));
      return;
    }
    notes.forEach((n) => {
      const d = document.createElement('div');
      d.className = 'note-item';
      d.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${ui.fmtTime(n.ts)}</div>${ui.esc(n.text)}`;
      panel.appendChild(d);
    });
  }

  // ---------- 评论 ----------
  const commentState = { next: 0, isEnd: false, items: [] };
  async function renderComments(replace = true) {
    if (replace) {
      panel.innerHTML = '';
      panel.appendChild(ui.loadBox('加载评论…'));
      commentState.items = [];
      commentState.next = 0;
      commentState.isEnd = false;
    }
    try {
      const r = await api.comments(state.bvid, commentState.next);
      if (!r.ok) throw new Error(r.message || '评论获取失败');
      commentState.next = r.next || 0;
      commentState.isEnd = !!r.isEnd;
      commentState.items = commentState.items.concat(r.topReplies || []).concat(r.replies || []);
      panel.innerHTML = '';
      if (!commentState.items.length) {
        panel.appendChild(ui.stateBox('暂无评论', 'comment'));
        return;
      }
      commentState.items.forEach((c) => {
        panel.appendChild(commentEl(c));
      });
      if (!commentState.isEnd) {
        const b = document.createElement('button');
        b.className = 'load-more';
        b.textContent = '加载更多评论';
        b.addEventListener('click', () => renderComments(false));
        panel.appendChild(b);
      }
    } catch (e) {
      if (replace) {
        panel.innerHTML = '';
        panel.appendChild(ui.errorBox(e.message, () => renderComments(true)));
      }
    }
  }

  function commentEl(c) {
    const d = document.createElement('div');
    d.className = 'comment-item';
    d.innerHTML = `
      <div class="cava">${c.avatar ? `<img src="${ui.esc(c.avatar)}" alt="" referrerpolicy="no-referrer">` : ''}</div>
      <div style="min-width:0">
        <div class="cname">${ui.esc(c.uname)}</div>
        <div class="cmsg">${ui.esc(c.message)}</div>
        <div class="cmeta">${ui.fmtTime(c.ctime)} · ${c.like ? c.like + ' 赞' : ''}</div>
      </div>
    `;
    return d;
  }

  // ---------- 启动 ----------
  renderTabs();
  renderTab();
  loadInfo();

  function onPipLeave() {
    if (!pipSession) return;
    const s = pipSession;
    const pbvid = s.state.bvid;
    const pcid = s.state.cid;
    window.removeEventListener('visibilitychange', onPipVisible);
    cleanupPipSession();
    go('player', { bvid: pbvid, cid: pcid });
  }

  function onPipVisible() {
    if (document.visibilityState === 'visible' && pipSession && document.pictureInPictureElement === pipSession.video) {
      onPipLeave();
    }
  }

  return () => {
    const inPip = document.pictureInPictureElement === video;
    if (inPip) {
      // 小窗播放中：把视频移到离屏容器继续播放，心跳继续上报
      pipSession = { state, video, player: state.player, playType: state.play?.type, hbTimer: state.hbTimer };
      let host = document.getElementById('pipHost');
      if (!host) {
        host = document.createElement('div');
        host.id = 'pipHost';
        host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;';
        document.body.appendChild(host);
      }
      host.appendChild(video);
      ui.toast('小窗播放中，关闭小窗可回到本视频');
      video.addEventListener('leavepictureinpicture', onPipLeave, { once: true });
      window.addEventListener('visibilitychange', onPipVisible);
      return;
    }
    clearInterval(state.hbTimer);
    report(true);
    window.removeEventListener('pagehide', onPageHide);
    destroyPlayer();
  };
}
