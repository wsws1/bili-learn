// 登录：二维码扫码 / 粘贴 Cookie
export default function renderLogin(container, ctx) {
  const { api, ui, go, hideTopbar, showNav } = ctx;
  hideTopbar();
  showNav(false);

  container.innerHTML = `
    <div class="login-wrap">
      <div class="login-brand">知学 <span>·</span> B 站学习播放器</div>
      <div class="login-sub">本地运行 · 无推荐流 · Cookie 仅保存在本机<br>扫码登录后即可同步收藏夹、关注动态与历史记录</div>
      <div class="qr-box">
        <canvas id="qrCanvas" width="200" height="200"></canvas>
        <div id="qrStatus" class="login-sub" style="margin-top:10px;max-width:220px">正在生成二维码…</div>
      </div>
      <div style="display:flex;gap:8px">
        <button id="qrRefresh" class="btn">${ui.icon('refresh', 16)}刷新二维码</button>
        <button id="qrCopy" class="btn btn-ghost">复制登录链接</button>
        <button id="netCheck" class="btn btn-ghost">网络自检</button>
      </div>
      <div class="login-divider">或者</div>
      <form id="cookieForm" class="cookie-form">
        <textarea id="cookieInput" placeholder="从浏览器复制 B 站 Cookie（含 SESSDATA、bili_jct）粘贴到这里"></textarea>
        <button class="btn btn-primary btn-block" type="submit">使用 Cookie 登录</button>
      </form>
      <div class="login-sub" style="font-size:11.5px">仅限本机与可信局域网使用，请勿部署到公网。</div>
    </div>
  `;

  const canvas = container.querySelector('#qrCanvas');
  const statusEl = container.querySelector('#qrStatus');
  let pollTimer = null;
  let stopped = false;

  const setStatus = (msg) => {
    statusEl.textContent = msg;
  };

  const drawQR = async (url) => {
    try {
      const QRCode = await ui.loadQR();
      QRCode.toCanvas(canvas, url, {
        width: 200,
        height: 200,
        margin: 1,
        color: { dark: '#1a1c22', light: '#ffffff' },
      });
      return true;
    } catch {
      container.querySelector('#qrCopy').classList.remove('hidden');
      setStatus('二维码渲染失败，可复制链接在手机 B 站打开');
      return false;
    }
  };

  const startPoll = (key) => {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (stopped) return;
      try {
        const r = await api.loginPoll(key);
        if (r.loggedIn) {
          clearInterval(pollTimer);
          await ctx.refreshUser();
          ui.toast('登录成功');
          go('home');
          return;
        }
        if (r.inner === 86038) {
          clearInterval(pollTimer);
          setStatus('二维码已失效，请点击刷新');
          return;
        }
        if (r.inner === 86090) setStatus('已扫码，请在手机上确认');
        else setStatus('请用 B 站 App 扫码登录');
      } catch (e) {
        setStatus('轮询失败：' + e.message);
      }
    }, 2500);
  };

  const loadQR = async () => {
    setStatus('正在生成二维码…');
    try {
      const r = await api.loginQr();
      if (r.code !== 0 || !r.qr) {
        setStatus('二维码生成失败：' + (r.message || '未知错误'));
        return;
      }
      await drawQR(r.qr.url);
      setStatus('请用 B 站 App 扫码登录');
      startPoll(r.qr.key);
    } catch (e) {
      setStatus('网络错误：' + e.message);
    }
  };

  container.querySelector('#qrRefresh').addEventListener('click', loadQR);
  container.querySelector('#netCheck').addEventListener('click', async () => {
    setStatus('正在检测到 B 站 API 的连通性…');
    try {
      const r = await api.netcheck();
      if (r.ok) setStatus(`网络正常：B 站 API 可达（${r.timeMs}ms），可以扫码或粘贴 Cookie 登录`);
      else setStatus('网络异常：' + (r.error || r.message || '未知错误') + '。请检查网络 / 代理，或在有网络的终端里运行 node server.mjs');
    } catch (e) {
      setStatus('网络自检失败：' + e.message);
    }
  });
  container.querySelector('#qrCopy').addEventListener('click', async () => {
    try {
      const r = await api.loginQr();
      if (r.qr?.url) {
        await navigator.clipboard.writeText(r.qr.url);
        ui.toast('登录链接已复制');
      }
    } catch {}
  });

  container.querySelector('#cookieForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = container.querySelector('#cookieInput').value.trim();
    if (!raw) {
      ui.toast('请先粘贴 Cookie');
      return;
    }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '验证中…';
    try {
      const r = await api.loginCookie(raw);
      if (r.login?.ok) {
        await ctx.refreshUser();
        ui.toast('登录成功');
        go('home');
      } else {
        setStatus(r.login?.message || 'Cookie 无效或已过期，请重新复制');
        btn.disabled = false;
        btn.textContent = '使用 Cookie 登录';
      }
    } catch (err) {
      setStatus('登录失败：' + err.message);
      btn.disabled = false;
      btn.textContent = '使用 Cookie 登录';
    }
  });

  loadQR();

  return () => {
    stopped = true;
    clearInterval(pollTimer);
  };
}
