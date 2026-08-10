// 知学 Android 内嵌 Node 入口
// @jadejr/capacitor-nodejs 会把本目录（launcher/www/nodejs）复制到应用数据目录后执行
const { getDataPath } = require('bridge');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

// 持久数据目录（App 更新后仍保留），Cookie 等数据存到这里
process.env.BF_ANDROID = '1';
process.env.BF_DATA_DIR = getDataPath();
process.env.PORT = process.env.PORT || '3210';

// 局域网开关持久化：data/settings.json（由启动器 IPC 写入）
const settingsFile = join(getDataPath(), 'settings.json');
let lan = false;
try {
  if (existsSync(settingsFile)) lan = !!(JSON.parse(readFileSync(settingsFile, 'utf8')).lan);
} catch {}
process.env.BF_HOST = lan ? '0.0.0.0' : '127.0.0.1';

require('./server.js');
