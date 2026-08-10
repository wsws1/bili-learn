# 知学（bili-learn）

本地运行、无推荐流的 B 站学习视频播放器 Web 应用。

前端按此前确定的「极简克制」设计规范重写；后端为零依赖 Node 服务，完整实现你提供的旧版 API 文档中的全部本地代理接口：WBI 签名、buvid、二维码登录、搜索（全站/收藏夹/历史）、收藏夹、历史记录、关注动态（含特别关注分组）、DASH/MP4/FLV 播放流、观看进度心跳上报、评论等。

## 运行

```bash
cd bili-learn
node server.mjs
```

- 需要 Node 18+（推荐 22+），零 npm 依赖
- 打开 http://localhost:3210
- 手机（同一 WiFi）打开启动日志里的 `http://<电脑局域网IP>:3210`
- 换端口：`PORT=3000 node server.mjs`

## 功能

- 登录：B 站 App 扫码（二维码）或粘贴 Cookie；Cookie 仅保存在本机 `data/cookies.json`
- 首页（学习工作台）：继续学习（取历史中未看完的最近一条）、快捷入口、关注更新预览、收藏夹预览
- 收藏夹：收藏夹列表、夹内浏览、夹内搜索
- 关注更新：全部 / 常用 / 特别关注 / 其他 四类切换；博主 chips 一键锁定只看 TA；800 人分类可搜索筛选；时间范围（1/3/7 天）过滤
  - 「常用」是你手动用星标标记的博主（存本机 localStorage），「特别关注」按 B 站关注分组自动识别
- 搜索：全站（WBI 签名）/ 收藏夹 / 历史记录 三范围，结果分页
- 历史记录：按天分组、进度条、标题搜索、继续播放
- 播放页：DASH（dash.js，动态 MPD，本地流代理）优先，回退 MP4 / FLV（mpegts.js）；倍速、编码切换（AVC/HEVC/AV1）、画中画；分 P 列表；收藏到任意收藏夹；本地笔记；评论；标记已学
- 播放进度每 15 秒心跳上报 B 站（离开页面前补报），官网历史记录会同步
- 一键 API 验证台：打开登录页后访问 `http://localhost:3210/api/verify` 可逐个探测接口

## 设计规范

- 色彩：中性底色 #F7F8FA（深色 #0F1115）；唯一强调色 #4F46E5（深色 #818CF8），仅用于操作、进度、选中态；完成态绿 #059669
- 字阶：17 / 14 / 12.5 / 11；字重仅 400 / 500；系统字体栈
- 间距：4pt 网格；圆角 10 / 14 / 20；图标线性 1.5px；动效 120–200ms
- 深色模式跟随系统（`prefers-color-scheme`）

## 目录结构

```
bili-learn/
├── server.mjs              # Node 本地服务：B 站 API 代理 + WBI 签名 + 登录 + 流代理 + MPD
├── data/cookies.json       # 登录 Cookie（仅本机，不入库）
├── docs/bilibili-api.md    # 你提供的旧版 API 文档
└── public/
    ├── index.html          # SPA 骨架
    ├── css/app.css         # 设计系统
    ├── js/
    │   ├── app.js          # 路由 + 登录门禁 + 导航
    │   ├── api.js          # /api 客户端
    │   ├── ui.js           # 图标 / 格式化 / toast / 弹层
    │   └── views/          # login home fav follow search history player
    └── vendor/             # dash.js、mpegts.js（本地化，无 CDN 依赖）
```

## 后端接口速查

| 本地接口 | 转发的 B 站接口 | 认证 |
| --- | --- | --- |
| `GET /api/status`、`/api/nav` | nav（登录态 + WBI 密钥） | Cookie |
| `GET /api/search?scope=all/fav/history` | search/type、fav/resource/list、history/cursor | WBI/Cookie |
| `GET /api/video` | /x/web-interface/view | 公开 |
| `GET /api/play`、`/api/play.mpd` | /x/player/wbi/playurl（DASH/单文件） | WBI |
| `GET /api/stream/{token}` | 视频流 Range 代理（令牌 60 分钟） | 本地令牌 |
| `POST /api/play/report` | /x/click-interface/web/heartbeat | Cookie+csrf |
| `GET /api/history` | /x/web-interface/history/cursor | Cookie |
| `GET /api/fav/folders`、`/api/fav/list` | 收藏夹列表 / 内容 | Cookie |
| `GET /api/fav/check`、`POST /api/fav/deal` | 收藏状态校验 / 收藏操作 | Cookie+csrf |
| `GET /api/followings`、`/api/relation/tags` | 关注列表（全量分页）/ 分组 | Cookie |
| `GET /api/dynamics/all`、`/api/dynamics/space` | 关注动态流 / 单 UP 动态 | Cookie/公开 |
| `GET /api/comments` | /x/v2/reply/main | 公开 |
| `GET /api/login/qr`、`/api/login/poll` | passport 二维码登录 | 无 |
| `POST /api/login/cookie`、`/api/login/clear` | 粘贴 Cookie / 登出 | 无 |

## 注意

- 仅供学习与个人使用；请控制请求频率，避免触发风控（-412 / -352）
- WBI key 缓存 12 小时，遇 -403/-352 自动刷新重试一次
- 流地址有时效，走本地代理（带 Referer 防盗链头），令牌 60 分钟有效
- 服务监听 `0.0.0.0:3210`，仅限可信局域网使用，**不要部署到公网**
- 二维码库（qrcode）运行时从 jsdelivr CDN 加载；dash.js / mpegts.js 已本地化

## 常见问题

### 登录/请求报 `fetch failed`

说明运行 `node server.mjs` 的那个进程**无法访问 B 站**（网络被限制或不可达），
和 Cookie 内容无关。请按顺序检查：

1. 关掉旧的 `node server.mjs` 进程（占用 3210 端口的那个）；
2. 在电脑上**新建一个普通终端**（PowerShell 或 CMD），不要从受限/沙箱终端启动：
   ```bash
   cd C:\Users\wanshuang\Desktop\代码\bili-learn
   node server.mjs
   ```
3. 打开 http://localhost:3210 ，登录页点「网络自检」：应显示「网络正常：B 站 API 可达」。
   如果仍异常，说明本机无法直连 `api.bilibili.com` / `passport.bilibili.com`
   （代理、防火墙、DNS），请放行后再试。

### Cookie 安全

Cookie 是敏感凭据，仅保存在本机 `data/cookies.json`，不要发到聊天或公开场合。
如担心泄露，可在 B 站重新登录以刷新 Cookie。

## 与旧版 bili-focus 的关系

本项目后端实现与你提供的旧版软件 API 文档一致，并参考了旧版 `bili-focus` 已验证的接口语义（WBI 重排表、动态 MPD 结构、二维码 302 链、心跳字段）。前端按新的极简设计与学习工作台信息架构完全重写。
