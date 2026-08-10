// 启动器：轮询后端就绪 → 显示状态 → 局域网开关 → 打开浏览器
const API_BASE = window.BF_NATIVE ? 'http://127.0.0.1:3210' : '';
const $ = (id) => document.getElementById(id);

async function api(path, timeoutMs = 8000) {
  const res = await fetch(API_BASE + path, { signal: AbortSignal.timeout(timeoutMs) });
  const j = await res.json();
  if (!res.ok && !j) throw new Error('HTTP ' + res.status);
  return j;
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
    $('openBtn').disabled = false;
    renderLan(s);
  } else {
    setBadge('err', '异常');
    $('statusText').textContent = '服务尚未就绪，请稍候…';
  }
}

function renderLan(s) {
  const ips = (s && s.lanIPs) || [];
  const lanOn = !!(s && s.lan);
  $('lanToggle').checked = lanOn;
  const list = $('lanList');
  if (lanOn && ips.length) {
    list.innerHTML = ips.map((ip) => `<li>${ip}:${s.port || 3210}</li>`).join('');
    list.hidden = false;
  } else {
    list.hidden = true;
  }
}

async function boot() {
  if (window.BF_NATIVE) $('bootSplash').hidden = false;
  const deadline = Date.now() + 60000;
  let status = null;
  while (Date.now() < deadline) {
    try {
      status = await api('/api/ping');
      if (status && status.ok) break;
    } catch (e) {
      // 服务尚未就绪
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  $('bootSplash').hidden = true;
  if (status) renderStatus(status);
  else {
    setBadge('err', '启动失败');
    $('statusText').textContent = '本地服务 60 秒内未就绪，请重启应用；若反复失败请在手机上查看应用日志。';
  }
}

$('lanToggle').addEventListener('change', async (e) => {
  const on = e.target.checked;
  try {
    await window.bridgeSend('set-lan', on ? 'on' : 'off');
    setBadge('ok', '已切换');
    $('statusText').textContent = '局域网模式已' + (on ? '开启' : '关闭') + '，正在重启监听…';
    await new Promise((r) => setTimeout(r, 600));
    const s = await api('/api/status');
    if (s) renderStatus(s);
  } catch (err) {
    setBadge('err', '切换失败');
    $('statusText').textContent = '切换失败：' + err.message;
  }
});

$('openBtn').addEventListener('click', () => {
  const base = API_BASE || 'http://127.0.0.1:3210';
  window.openWeb(base);
});

boot();
