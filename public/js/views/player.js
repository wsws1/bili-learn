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
    if (s.pauseFn) s.video.removeEventListener('pause', s.pauseFn);
    if (s.playFn) s.video.removeEventListener('play', s.playFn);
  } catch {}
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
    disposed: false,
    seekRetries: 0,
    canMse: typeof window.MediaSource !== 'undefined' && !!window.MediaSource,
    dashPlayed: false,
    dashStallTimer: null,
  };

  container.innerHTML = `
    <div class="player-wrap" id="playerWrap">
      <div class="video-box">
        <video id="video" controls playsinline preload="auto"></video>
        <div id="vLoading" class="loading">${ui.icon('refresh', 18)}加载视频中…</div>
        <div id="vError" class="load-error hidden"></div>
        <div id="vTapPlay" class="load-error hidden">点击播放</div>
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
        <button id="fsBtn" class="icon-btn" aria-label="全屏" title="全屏">${ui.icon('maximize', 18)}</button>
        <button id="pipBtn" class="icon-btn" aria-label="画中画" title="画中画">${ui.icon('pip', 18)}</button>
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
  const playerWrap = container.querySelector('#playerWrap');
  const vLoading = container.querySelector('#vLoading');
  const vError = container.querySelector('#vError');
  const vTapPlay = container.querySelector('#vTapPlay');
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
    state.disposed = false;
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
      state.resumeToast = undefined;
      state.resumePlay = undefined;
      renderInfo();
      renderDone();
      renderTabs();
      renderTab();
      // 先确定续播进度，再启动播放器（否则视频已从 0 开始播放，seek 不生效）
      await fetchResume();
      loadPlay();
      loadFavState();
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
  async function loadPlay(forceNoDash = false) {
    vLoading.classList.remove('hidden');
    vError.classList.add('hidden');
    vTapPlay.classList.add('hidden');
    destroyPlayer();
    state.reportFailed = false;
    state.dashPlayed = false;
    clearTimeout(state.dashStallTimer);
    try {
      // 浏览器不支持 MSE（MediaSource）时直接走单文件播放，dash 无法出流
      const r = await api.play(state.bvid, state.cid, 80, 'auto', forceNoDash || !state.canMse);
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
        // 保留更多已播放缓冲：回拖已看过的区域不重新加载分片
        try {
          state.player.updateSettings({ streaming: { buffer: { bufferToKeep: 120, bufferAheadToKeep: 60 } } });
        } catch {}
        state.player.initialize(video, r.mpdUrl + '&height=' + state.qualityHeight, !state.pendingSeek);
        renderCodecs(r.codecs, r.codec);
        // 看门狗：dash 8 秒未出画面 → 判断是“没拉到数据”还是“自动播放被拦截”
        state.dashStallTimer = setTimeout(() => {
          if (state.disposed) return;
          if (video.paused && video.currentTime === 0 && !state.dashPlayed) {
            // videoWidth 为 0 说明连视频元数据都没拿到（init 分片都没拉到）→ 回退；
            // 已拿到元数据只是没播放 → 自动播放被拦截，提示点击播放
            if (video.videoWidth === 0 && video.videoHeight === 0) {
              console.log('[zhixue-web] dash 未拉到数据，回退单文件播放');
              ui.toast('切换兼容播放模式…');
              loadPlay(true);
            } else {
              vTapPlay.classList.remove('hidden');
            }
          }
        }, 8000);
      } else if (r.type === 'flv') {
        await loadScript('/vendor/mpegts.js');
        if (!window.mpegts) throw new Error('FLV 播放器不可用');
        state.player = window.mpegts.createPlayer({ type: 'flv', url: r.streamUrl, isLive: false });
        state.player.attachMediaElement(video);
        state.player.load();
        if (!state.pendingSeek) safePlay();
      } else {
        video.src = r.streamUrl;
        if (!state.pendingSeek) safePlay();
      }
      vLoading.classList.add('hidden');
      scheduleResumeSeek();
      startHeartbeat();
      // 外部浏览器可能拦截自动播放：1.5s 后仍未播放且已就绪 → 提示点击播放
      setTimeout(() => {
        if (state.disposed) return;
        if (video.paused && video.readyState >= 2) {
          vTapPlay.classList.remove('hidden');
        }
      }, 1500);
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
    prepareSwitchResume();
    localStorage.setItem('zhixue:quality', String(h));
    vLoading.classList.remove('hidden');
    vError.classList.add('hidden');
    clearTimeout(state.dashStallTimer);
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
        try {
          state.player.updateSettings({ streaming: { buffer: { bufferToKeep: 120, bufferAheadToKeep: 60 } } });
        } catch {}
        state.player.initialize(video, r.mpdUrl + '&height=' + h, !state.pendingSeek);
        renderCodecs(r.codecs, r.codec);
      } else if (r.type === 'flv') {
        await loadScript('/vendor/mpegts.js');
        state.player = window.mpegts.createPlayer({ type: 'flv', url: r.streamUrl, isLive: false });
        state.player.attachMediaElement(video);
        state.player.load();
        if (!state.pendingSeek) state.player.play();
      } else {
        video.src = r.streamUrl;
        if (!state.pendingSeek) safePlay();
      }
      vLoading.classList.add('hidden');
      scheduleResumeSeek();
    } catch (e) {
      vLoading.classList.add('hidden');
      showError(e.message, () => loadPlayWithHeight());
    }
  }

  async function loadPlayWithCodec(codec) {
    prepareSwitchResume();
    destroyPlayer();
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
      try {
        state.player.updateSettings({ streaming: { buffer: { bufferToKeep: 120, bufferAheadToKeep: 60 } } });
      } catch {}
      state.player.initialize(video, r.mpdUrl + '&height=' + state.qualityHeight, !state.pendingSeek);
      renderCodecs(r.codecs, r.codec);
      vLoading.classList.add('hidden');
      scheduleResumeSeek();
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
      // 彻底静音：暂停 + 清空 src + 卸载，避免标签页残留小喇叭
      try {
        video.pause();
        video.src = '';
        video.removeAttribute('src');
        video.load();
      } catch {}
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
    // 暂停时周期性心跳不发（小窗里暂停后不再后台上报进度）
    if (!final && video.paused) return;
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
  // 切清晰度/编码前调用：保留当前播放位置与播放状态，切换后不从头播
  function prepareSwitchResume() {
    const d = video.duration || 0;
    const t = video.currentTime || 0;
    const wasPlaying = !video.paused && !video.ended;
    if (d > 0 && isFinite(t) && t >= 1 && t < d - 1) {
      state.pendingSeek = t;
      state.seekApplied = false;
      state.resumeToast = false; // 切换清晰度不弹“已续播”
      state.resumePlay = wasPlaying;
    } else {
      state.pendingSeek = null;
      state.seekApplied = false;
      state.resumeToast = undefined;
      state.resumePlay = undefined;
    }
  }

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
        // 分P：同一 bvid 下多个 cid，必须匹配 cid；上次看的是别的 P 则切过去再续播
        const hcid = found.history?.cid || found.cid;
        if (hcid && String(hcid) !== String(state.cid)) {
          console.log('[zhixue-web] 续播切P: cid ' + state.cid + ' -> ' + hcid);
          state.cid = hcid;
          try {
            renderTabs();
            renderTab();
          } catch {}
        }
        state.pendingSeek = found.progress;
        state.resumeToast = true;
        state.resumePlay = true;
        console.log('[zhixue-web] 续播命中: bvid=' + state.bvid + ' cid=' + state.cid
          + ' 进度=' + found.progress + '/' + found.duration);
        break;
      }
        const c = r.data?.cursor || {};
        if (!c.max || !list.length) break;
        max = c.max;
        viewAt = c.view_at;
      }
    } catch {}
    if (state.pendingSeek == null) console.log('[zhixue-web] 续播未命中: ' + state.bvid);
  }

  // 续播：播放器就绪后直接 seek + 播放（不依赖 may 不触发的 canplay/seekable 事件）
  function scheduleResumeSeek() {
    if (state.disposed || state.pendingSeek == null) return;
    const go = () => {
      if (state.disposed || state.seekApplied || state.pendingSeek == null) return;
      applySeek(state.pendingSeek);
    };
    video.addEventListener('loadedmetadata', go, { once: true });
    setTimeout(go, 800); // 兜底：元数据事件已错过或不来
  }

  function applySeek(t) {
    if (state.disposed || state.seekApplied) return;
    console.log('[zhixue-web] 续播执行 seek: ' + t + 's type=' + (state.play?.type || ''));
    state.pendingSeek = null;
    const doPlay = () => {
      if (state.disposed || state.seekApplied) return;
      state.seekApplied = true;
      if (state.resumeToast !== false) ui.toast('已续播到 ' + ui.fmtDur(t));
      if (video.paused && state.resumePlay !== false) safePlay();
    };
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      doPlay();
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    try {
      if (state.play?.type === 'dash' && state.player && typeof state.player.seek === 'function') {
        state.player.seek(t);
      } else {
        video.currentTime = t;
      }
    } catch {
      try {
        video.currentTime = t;
      } catch {}
    }
    // 立即播放，让 dash 从 seek 位置缓冲
    if (video.paused && state.resumePlay !== false) safePlay();
    // 兜底：2.5 秒内未触发 seeked 也标记完成
    setTimeout(doPlay, 2500);
  }

  // ---------- 播放速度 / 画中画 ----------
  container.querySelector('#speedSel').addEventListener('change', (e) => {
    video.playbackRate = Number(e.target.value);
  });
  container.querySelector('#qualitySel').addEventListener('change', (e) => {
    state.qualityHeight = Number(e.target.value);
    loadPlayWithHeight();
  });
  const pipBtn = container.querySelector('#pipBtn');
  // 浏览器原生画中画 API：桌面 Chrome 全支持；安卓 Chrome/Edge、Opera、新版 Samsung Internet 也已支持。
  // 不支持的浏览器（如安卓 Firefox、安卓 WebView）不再自绘浮层，改为引导用户走浏览器自带入口。
  const pipSupported =
    typeof document.pictureInPictureEnabled === 'boolean' &&
    document.pictureInPictureEnabled &&
    typeof video.requestPictureInPicture === 'function';

  // 自动播放被浏览器拦截时（外部浏览器常见），显示“点击播放”让用户手动开始
  function safePlay() {
    const p = video.play();
    if (p && p.catch) {
      p.catch((e) => {
        if (e && e.name === 'NotAllowedError') {
          vTapPlay.classList.remove('hidden');
        }
      });
    }
  }
  vTapPlay.addEventListener('click', () => {
    vTapPlay.classList.add('hidden');
    safePlay();
  });
  video.addEventListener('playing', () => {
    state.dashPlayed = true;
    vTapPlay.classList.add('hidden');
  });
  // 通知原生 WebView 视频宽高比，全屏时据此选择横屏/竖屏（竖版视频不能强制横屏）
  function syncVideoRatio() {
    if (window.AndroidPip && typeof window.AndroidPip.setVideoRatio === 'function') {
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;
      if (w > 0 && h > 0) {
        try {
          window.AndroidPip.setVideoRatio(w, h);
        } catch {}
      }
    }
  }
  video.addEventListener('loadedmetadata', syncVideoRatio);

  // 小窗按钮：未播放时置灰禁用
  function updatePipBtn() {
    pipBtn.disabled = video.paused;
    pipBtn.classList.toggle('disabled', video.paused);
  }
  updatePipBtn();
  video.addEventListener('play', updatePipBtn);
  video.addEventListener('pause', updatePipBtn);

  pipBtn.addEventListener('click', async () => {
    // 应用内 WebView：先触发视频全屏，再进系统小窗（否则小窗会截取整页右上角）
    if (window.AndroidPip && typeof window.AndroidPip.supports === 'function' && window.AndroidPip.supports()) {
      if (video.paused) {
        ui.toast('请先播放再开启小窗');
        return;
      }
      syncVideoRatio();
      const doEnter = () => {
        try {
          window.AndroidPip.enter();
        } catch {}
      };
      try {
        if (document.fullscreenElement) {
          doEnter();
        } else {
          await playerWrap.requestFullscreen();
          // 等全屏视频视图渲染一帧再进系统小窗，避免小窗截到整页画面（看起来像首页）
          await new Promise((r) => setTimeout(r, 150));
          doEnter();
        }
      } catch (e) {
        // 全屏没成功就不要硬进小窗，否则小窗会显示整个网页
        ui.toast('请先全屏再开启小窗');
      }
      return;
    }
    if (pipSupported) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          return;
        }
        await video.requestPictureInPicture();
        return;
      } catch (e) {
        console.warn('[zhixue-web] 浏览器画中画不可用：' + (e && e.message));
      }
    }
    // 浏览器不支持原生画中画：不自绘浮层，引导用户走浏览器自带入口
    ui.toast('当前浏览器不支持小窗，请全屏播放后按 Home 键，或长按视频选择小窗');
  });

  // ---------- 全屏：全屏整个播放器容器（保留控制条） ----------
  const fsBtn = container.querySelector('#fsBtn');
  function updateFsBtn() {
    if (fsBtn) fsBtn.innerHTML = ui.icon(document.fullscreenElement ? 'minimize' : 'maximize', 18);
  }
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (playerWrap && playerWrap.requestFullscreen) {
      playerWrap.requestFullscreen().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', updateFsBtn);

  // ---------- 手机/平板：在视频表面横向滑动调整进度（滑动过程实时预览帧） ----------
  function seekTo(t) {
    const d = video.duration || 0;
    if (!d || !isFinite(d)) return;
    t = Math.max(0, Math.min(t, d));
    try {
      // 统一走 video.currentTime：dash.js 也会监听媒体元素 seek 事件，
      // 比反复调用 player.seek() 更轻，滑动预览帧更跟手
      video.currentTime = t;
    } catch (e) {}
  }

  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  const videoBox = container.querySelector('.video-box');
  if (isTouchDevice && videoBox) {
    let g = null;
    // 监听容器而不是 video 本身：部分 WebView 会把 video 上的触摸直接吞掉
    videoBox.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      // 跳过“点击播放”等浮层
      if (e.target !== video && e.target !== videoBox) return;
      const d = video.duration || 0;
      if (!d || !isFinite(d)) return;
      const r = videoBox.getBoundingClientRect();
      const t0 = e.touches[0];
      // 避开底部约 28% 的原生控件区域（那里是原生进度条/播放按钮）
      if (r.height > 0 && t0.clientY - r.top > r.height * 0.72) return;
      g = { startX: t0.clientX, startTime: video.currentTime, lastApply: 0, active: false };
    }, { passive: true });
    videoBox.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const t0 = e.touches[0];
      if (!g) {
        // touchstart 可能被原生控件吞掉（首次触摸用于显示控制条），从当前触点补启动手势
        const d = video.duration || 0;
        if (!d || !isFinite(d)) return;
        const rr = videoBox.getBoundingClientRect();
        if (rr.height > 0 && t0.clientY - rr.top > rr.height * 0.72) return;
        g = { startX: t0.clientX, startTime: video.currentTime, lastApply: 0, active: false };
        return;
      }
      const dx = t0.clientX - g.startX;
      if (!g.active && Math.abs(dx) < 10) return;
      g.active = true;
      if (dx !== 0) e.preventDefault();
      const r = videoBox.getBoundingClientRect();
      const d = video.duration || 0;
      const target = Math.max(0, Math.min(d, g.startTime + (dx / Math.max(1, r.width)) * d));
      const now = performance.now();
      // 节流：约 120ms 一次，给浏览器留出渲染新帧的时间，帧跟随更稳
      if (now - g.lastApply > 120) {
        g.lastApply = now;
        seekTo(target);
      }
    }, { passive: false });
    const endTouch = (e) => {
      if (!g) return;
      if (g.active) {
        const ch = e.changedTouches && e.changedTouches[0];
        if (ch) {
          const r = videoBox.getBoundingClientRect();
          const d = video.duration || 0;
          const target = Math.max(0, Math.min(d, g.startTime + ((ch.clientX - g.startX) / Math.max(1, r.width)) * d));
          seekTo(target);
        }
      }
      g = null;
    };
    videoBox.addEventListener('touchend', endTouch);
    videoBox.addEventListener('touchcancel', endTouch);
  }

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
    const inPip = document.pictureInPictureElement === video && !video.paused;
    if (inPip) {
      console.log('[zhixue-web] 小窗转移（后台续播）: ' + state.bvid);
      // 小窗播放中：把视频移到离屏容器继续播放，心跳继续上报
      pipSession = { state, video, player: state.player, playType: state.play?.type, hbTimer: state.hbTimer, report };
      // 小窗暂停时停掉心跳，恢复播放再继续上报
      pipSession.pauseFn = () => {
        clearInterval(state.hbTimer);
      };
      pipSession.playFn = () => {
        if (!pipSession) return;
        clearInterval(state.hbTimer);
        state.hbTimer = setInterval(() => report(false), 15000);
      };
      video.addEventListener('pause', pipSession.pauseFn);
      video.addEventListener('play', pipSession.playFn);
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
    if (document.pictureInPictureElement === video) {
      console.log('[zhixue-web] 小窗已暂停，离开即停止');
    }
    state.disposed = true;
    try {
      video.pause();
    } catch {}
    clearInterval(state.hbTimer);
    report(true);
    window.removeEventListener('pagehide', onPageHide);
    destroyPlayer();
  };
}
