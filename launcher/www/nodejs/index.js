// 知学 Android 内嵌 Node 入口（含启动日志，logcat 可查）
// @jadejr/capacitor-nodejs 会把本目录（launcher/www/nodejs）复制到应用数据目录后执行
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

console.log('[zhixue-node] boot start, node=' + process.version + ' platform=' + process.platform + ' arch=' + process.arch);

let bridge = null;
try {
  bridge = require('bridge');
  console.log('[zhixue-node] bridge ok, getDataPath=' + typeof bridge.getDataPath);
} catch (e) {
  console.error('[zhixue-node] bridge require FAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
}

const getDataPath = bridge.getDataPath;

// 持久数据目录（App 更新后仍保留），Cookie 等数据存到这里
process.env.BF_ANDROID = '1';
process.env.BF_DATA_DIR = getDataPath();
process.env.PORT = process.env.PORT || '3210';
// 完整网页前端（内嵌后端静态目录）：与 server.js 同级目录 app/
process.env.BF_PUBLIC_DIR = join(__dirname, 'app');
console.log('[zhixue-node] dataDir=' + process.env.BF_DATA_DIR);
console.log('[zhixue-node] publicDir=' + process.env.BF_PUBLIC_DIR);

// 局域网开关持久化：data/settings.json（由启动器 IPC 写入）
const settingsFile = join(getDataPath(), 'settings.json');
let lan = false;
try {
  if (existsSync(settingsFile)) lan = !!(JSON.parse(readFileSync(settingsFile, 'utf8')).lan);
} catch {}
process.env.BF_HOST = lan ? '0.0.0.0' : '127.0.0.1';
console.log('[zhixue-node] lan=' + lan + ' host=' + process.env.BF_HOST);

try {
  require('./server.js');
  console.log('[zhixue-node] server module loaded');
} catch (e) {
  console.error('[zhixue-node] server load FAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
}
