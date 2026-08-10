# 知学 · Android 启动器

本分支（`android-launcher`）把「本地 Node 后端 + 网页前端」打包成独立 Android App。
这一次的定位是**启动器**，不做内嵌 WebView：

- App 启动时在后台拉起内嵌 Node 服务（仅 arm64，监听 3210）；
- 启动器里可以开关「允许局域网访问」；
- 点「打开网页版」跳转到系统浏览器使用完整网页（扫码/粘贴 Cookie 登录）。

## 架构

```
桌面:  node server.mjs ──> http://localhost:3210（0.0.0.0，局域网可访问）

Android 启动器:
  Capacitor WebView（启动器界面：状态 / 局域网开关 / 打开浏览器）
        │  fetch http://127.0.0.1:3210/api/status（CORS）
        ▼
  @jadejr/capacitor-nodejs（内嵌 Node 24，仅 arm64）
        └─ nodejs/index.js ──> bridge.getDataPath() 数据目录
        └─ nodejs/server.js ──> 监听 127.0.0.1:3210（或 0.0.0.0 局域网模式）
        └─ nodejs/app/       ──> 完整网页前端（启动器打开浏览器访问）
```

局域网开关通过插件 IPC（`channel`）实时切换监听地址，并写入
`getDataPath()/settings.json`，重启后保持。

## 目录结构

```
bili-learn/
├── server.mjs                # 桌面入口（同时被打包进 APK）
├── public/                   # 完整网页前端（被打包进 APK 的 nodejs/app）
├── launcher/
│   └── www/                  # Capacitor webDir：启动器界面
│       ├── index.html / app.js / style.css
│       ├── native.js         # 由 src/native-boot.js 打包（CI 生成）
│       ├── src/native-boot.js
│       └── nodejs/           # 内嵌后端（被打进 APK）
│           ├── index.js / package.json
│           ├── server.js     # 由 server.mjs 打包（CI 生成）
│           └── app/          # public 的同步副本（CI 生成）
├── android/                  # npx cap add android 生成（已提交 + 打补丁）
├── tools/
│   ├── build-native.mjs      # native-boot.js -> native.js
│   ├── build-backend.mjs     # server.mjs -> nodejs/server.js（CJS）
│   └── sync-app.mjs          # public -> nodejs/app
└── .github/workflows/build-apk.yml
```

## 本地构建

需要 Node 22；APK 本体由 GitHub Actions 构建（本地无 JDK/SDK 也能改代码）。

```bash
npm install
npm run android:build     # 生成 native.js / nodejs/server.js / nodejs/app
npx cap add android       # 首次生成 android/（已提交过可跳过）
npx cap sync android      # 把启动器 + 内嵌后端同步进 android 工程
```

桌面快速验证内嵌后端：

```bash
# 完整网页为根目录（模拟 Android 内嵌形态）
$env:BF_PUBLIC_DIR = "$PWD\launcher\www\nodejs\app"
$env:BF_DATA_DIR = "$env:TEMP\zhixue-test-data"
node launcher/www/nodejs/server.js
```

## 构建 APK（GitHub Actions）

推送到 GitHub 的 `android-launcher` 分支即自动构建（也可手动触发
`workflow_dispatch`）：

```bash
git remote add origin <你的仓库地址>
git push -u origin android-launcher
```

构建产物在 Actions 页面 Artifacts 下载：`zhixue-apk / app-debug.apk`。

工作流要点（和旧项目一致的经验）：

- JDK 21（Capacitor 7 原生库要求，17 会报 invalid source release: 21）；
- 仅打包 `arm64-v8a`（内嵌 Node 只有 arm64 构建）；
- `AndroidManifest` 已开 `usesCleartextTraffic`（回环 127.0.0.1 明文）；
- 后端已回 CORS 头（含 Range），浏览器/启动器跨域访问正常。

## 已知限制

- 仅支持 arm64 设备（2020 年后的主流手机）；
- 登录：粘贴 Cookie，或打开网页版后用另一台设备扫码；
- Cookie 等数据存在应用私有数据目录（App 更新不丢），卸载才会清除；
- 局域网模式依赖手机与电脑处于同一 WiFi，且路由器未开启 AP 隔离。

## 局域网 / 容器环境排障（鸿蒙 · 卓易通）

- 开启「允许局域网访问」后，App 会把内嵌 Node 的监听地址从 `127.0.0.1` 切到
  `0.0.0.0`，并在启动器里显示局域网链接（来自系统网卡枚举）。
- 如果「容器外的浏览器」打不开：卓易通这类 Android 容器有独立的网络命名空间，
  容器内网卡 IP 与鸿蒙宿主机实际 IP 可能不一致。请：
  1. 在鸿蒙设置/路由器后台确认手机在 WiFi 下的真实 IP；
  2. 用 `http://<真实IP>:3210` 访问；
  3. 若仍不通，检查卓易通是否有网络/端口放行设置，或改用「本机浏览器」直接访问
     `http://127.0.0.1:3210`。
- 抓日志：`adb logcat | grep -iE "zhixue|CapacitorNodeJS|nodejs"`，
  里面能看到 `[zhixue-node]` 的启动、登录、局域网切换记录。
