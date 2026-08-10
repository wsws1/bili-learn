// 启动器：轮询后端就绪 → 显示状态 → 局域网开关 → 打开浏览器
const API_BASE = window.BF_NATIVE ? 'http://127.0.0.1:3210' : '';
const $ = (id) => document.getElementById(id);

const diagLines = [];
function logDiag(msg) {
  diagLines.push('[' + new Date().toLocaleTimeString() + '] ' + msg);
  const el = $('diag');
  if (el) {
    el.textContent = diagLines.join('\n');
    el.hidden = false;
    el.scrollTop = el.scrollHeight;
  }
  console.log('[zhixue-launcher] ' + msg);
}

window.addEventListener('error', (e) => logDiag('页面错误: ' + (e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => logDiag('未处理异常: ' + (e.reason && e.reason.message || e.reason)));

async function api(path, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API_BASE + path, { signal: ctrl.signal });
    const j = await res.json();
    if (!res.ok && !j) throw new Error('HTTP ' + res.status);
    return j;
  } finally {
    clearTimeout(timer);
  }
}

function setBadge(state, text) {
  const b = $('statusBadge');
  b.textContent = text;
  b.className = 'badge ' + state;
}

function renderStatus(s) {
  if (s && s.ok) {
    setBadge('ok', '运行中');
    $('statusText').textContent = '本地服务运行正常，打开网页版后完成登录即可使用。';
    $('portText').textContent = s.port;
    $('nodeText').textContent = s.node;
    $('biliText').textContent = s.biliOk === false ? '异常（快速失败中）' : '可达';
    $('openBtn').disabled = false;
    renderLan(s);
  } else {
    setBadge('err', '异常');
    $('statusText').textContent = '服务尚未就绪，请稍候…';
  }
}

function renderLan(s) {
  const urls = (s && s.lanIPs) || [];
  const lanOn = !!(s && s.lan);
  $('lanToggle').checked = lanOn;
  const list = $('lanList');
  if (lanOn && urls.length) {
    list.innerHTML = urls.map((u) => `<li>${u}</li>`).join('');
    list.hidden = false;
  } else {
    list.hidden = true;
  }
}

async function boot() {
  logDiag('boot: native=' + !!window.BF_NATIVE + ' apiBase=' + (API_BASE || '(same-origin)'));
  const deadline = Date.now() + 60000;
  let status = null;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      status = await api('/api/ping');
      if (status && status.ok) break;
      logDiag('探测 #' + attempts + ': 未就绪');
    } catch (e) {
      logDiag('探测 #' + attempts + ' 失败: ' + e.message);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (status && status.ok) {
    logDiag('探测成功（第 ' + attempts + ' 次），服务运行中');
    renderStatus(status);
    $('retryBtn').hidden = true;
  } else {
    setBadge('err', '启动失败');
    $('statusText').textContent = '本地服务 60 秒内未就绪。请点「重试启动」，或查看下方诊断信息。';
    $('retryBtn').hidden = false;
    logDiag('启动超时：60 秒内未就绪');
  }
}

$('lanToggle').addEventListener('change', async (e) => {
  const on = e.target.checked;
  try {
    logDiag('切换局域网: ' + (on ? 'on' : 'off'));
    await window.bridgeSend('set-lan', on ? 'on' : 'off');
    setBadge('ok', '已切换');
    $('statusText').textContent = '局域网模式已' + (on ? '开启' : '关闭') + '，正在确认监听状态…';
    let s = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        s = await api('/api/ping', 5000);
      } catch {}
      if (s && !!s.lan === on) break;
    }
    logDiag('监听状态确认: lan=' + (s ? s.lan : 'unknown') + '（期望 ' + on + '）');
    if (s) renderStatus(s);
    else logDiag('监听状态确认失败，请查看 logcat 的 [zhixue-node] 日志');
  } catch (err) {
    setBadge('err', '切换失败');
    $('statusText').textContent = '切换失败：' + err.message;
    logDiag('切换失败: ' + err.message);
  }
});

$('openBtn').addEventListener('click', () => {
  const base = API_BASE || 'http://127.0.0.1:3210';
  logDiag('应用内打开网页版: ' + base);
  window.openWebInApp(base);
});

$('externalBtn').addEventListener('click', () => {
  const base = API_BASE || 'http://127.0.0.1:3210';
  logDiag('外部浏览器打开网页版: ' + base);
  window.openWeb(base);
});

$('retryBtn').addEventListener('click', () => {
  diagLines.length = 0;
  boot();
});

$('logBtn').addEventListener('click', async () => {
  try {
    const r = await api('/api/logs', 8000);
    const lines = (r.logs || []).join('\n');
    logDiag('--- 后端日志（最近 ' + (r.logs || []).length + ' 条）---\n' + (lines || '(空)'));
  } catch (err) {
    logDiag('获取后端日志失败: ' + err.message);
  }
});

// 外部访问地址检测：输入鸿蒙系统 WiFi IP，探测 http://IP:3210 是否可达
$('lanForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ip = $('manualIp').value.trim();
  if (!ip) return;
  const url = ip.startsWith('http') ? ip.replace(/\/+$/, '') : 'http://' + ip + ':3210';
  const out = $('checkResult');
  out.textContent = '正在检测 ' + url + ' …';
  out.className = 'check-result';
  logDiag('检测外部地址: ' + url);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url + '/api/ping', { signal: ctrl.signal });
    clearTimeout(timer);
    const j = await res.json();
    const ok = res.ok && j && j.ok;
    out.textContent = ok ? '可达：' + url + '，服务正常' : '可达但服务异常：' + url;
    out.className = 'check-result ' + (ok ? 'ok' : 'err');
    logDiag('外部地址检测: ' + (ok ? '可达' : '异常') + ' ' + url);
  } catch (err) {
    out.textContent =
      '不可达：' + err.message +
      '。若卓易通是独立网段（NAT），需在卓易通设置里开启「共享宿主机网络」或端口映射，' +
      '或在容器内用 Tailscale 组网后访问虚拟 IP';
    out.className = 'check-result err';
    logDiag('外部地址不可达: ' + url + ' ' + err.message);
  }
});

boot();
