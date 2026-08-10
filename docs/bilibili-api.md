## 0. 通用约定

- API 基础域名：`https://api.bilibili.com`；登录域名：`https://passport.bilibili.com`
- 所有请求统一携带：
  - `User-Agent`：Chrome 126 / Windows UA（缺了容易被风控）
  - `Referer`：`https://www.bilibili.com/`（播放流等接口防盗链必需）
  - `Cookie`：登录后含 `SESSDATA`、`bili_jct`；未登录也必须有 `buvid3`/`buvid4`
    （项目通过 `/x/frontend/finger/spi` 自动补齐）
- WBI 签名：需要签名的接口，查询串需带 `wts`（秒级时间戳）与 `w_rid`（MD5）。
  key 来自 `nav` 的 `data.wbi_img.img_url / sub_url` 的文件名（imgKey、subKey），
  拼接后按固定重排表取前 32 位得 mixin key；参数按键名字典序排序、值去掉 `!'()*`
  后拼接，`md5(query + mixinKey)`。签名失效（-403/-352）时刷新 key 重试一次。
- 常见业务码：
  - `-101` 未登录
  - `-352` WBI 签名校验失败（本项目自动刷新 key 重试一次）
  - `-412` 请求被风控（缺 buvid、数据中心 IP、频率过高）
  - `-400` 参数错误
  - `-403` 权限不足 / 签名过期

## 1. 登录与账号

### 1.1 登录状态 / 用户信息 / WBI 密钥

- 接口：`GET /x/web-interface/nav`
- 用途：检查登录态；拿 mid / uname / face；**顺带拿 WBI 密钥**（`data.wbi_img`）
- 参数：无；`code === 0` 视为已登录（未登录通常返回 `-101`）
- 示例：
  ```bash
  curl 'https://api.bilibili.com/x/web-interface/nav' \
    -H 'User-Agent: <UA>' -H 'Referer: https://www.bilibili.com/' \
    -H 'Cookie: SESSDATA=...'
  ```
- 本地代理：`GET /api/nav`、`GET /api/status`

### 1.2 匿名设备标识 buvid

- 接口：`GET /x/frontend/finger/spi`
- 用途：新环境先拿 `buvid3` / `buvid4` 写进本地 Cookie，避免 `-412`
- 响应：`data.b_3`、`data.b_4`

### 1.3 二维码登录（生成）

- 接口：`GET /x/passport-login/web/qrcode/generate`
- Referer 用 `https://passport.bilibili.com/login`
- 注意：2026-08 实测 generate 为 GET、无参数（早期文档有 POST 版本）
- 返回：`data.qrcode_key`（轮询用）、`data.url`（二维码内容）

### 1.4 二维码登录（轮询）

- 接口：`GET /x/passport-login/web/qrcode/poll?qrcode_key={key}`
- 外层 `code === 0`，内层 `data.code`：
  - `0` 扫码确认成功，此时 `data.url` 是登录跳转链接，需跟随 302 抓 `Set-Cookie`
  - `86101` 未扫码；`86090` 已扫未确认；`86038` 二维码失效
- 注意：项目用 `redirect: manual` 手动跟随最多 5 次 302 拼接 Cookie，直到拿到 `SESSDATA`

## 2. 搜索

### 2.1 全站视频搜索

- 接口：`GET /x/web-interface/wbi/search/type`（WBI）
- 参数：
  - `search_type=video` 固定
  - `keyword`、`page`（从 1 起）、`page_size`（项目用 20）
- 响应：`data.result[]`（bvid / title / pic / author / play / duration），`data.numResults` 总数
- 示例：
  ```bash
  curl 'https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=video&keyword=%E6%95%99%E7%A8%8B&page=1&page_size=20&wts=<ts>&w_rid=<md5>' \
    -H 'User-Agent: <UA>' -H 'Referer: https://www.bilibili.com/' -H 'Cookie: buvid3=...'
  ```
- 本地代理：`GET /api/search?keyword=&scope=all&page=`

### 2.2 聚合搜索（仅验证台探针）

- `GET /x/web-interface/search/all/v2?keyword=教程`（WBI），只用于验证接口连通性

### 2.3 收藏夹内搜索

- 没有独立接口，复用收藏内容列表接口并传 `keyword`（见 6.2）

### 2.4 历史记录搜索

- 官方没有“历史搜索”接口；项目做法：用历史游标接口翻页拉取，按标题本地过滤
  （最多翻 10 页 / 凑满 20 条）

## 3. 视频信息

- 接口：`GET /x/web-interface/view?bvid={bvid}`
- 用途：cid、aid、标题、UP 主、分 P `pages`、合集 `ugc_season` / `pgc_season`、播放/点赞数
- 注意：评论、收藏校验、播放都要先通过它拿 `aid` / `cid`
- 本地代理：`GET /api/video?bvid=`

## 4. 播放流

- 接口：`GET /x/player/wbi/playurl`（WBI）
- 参数：
  - `bvid`、`cid` 必填
  - `fnval`：`4048` = DASH（多编码）；`1` = MP4/FLV 单文件（最高 720P）
  - `fourk=1` 允许返回 4K
  - `qn` 档位：16=360P、32=480P、64=720P、74=720P60、80=1080P、112=1080P+、
    116=1080P60、120=4K、125/126=杜比、127=8K；无权限时 B 站自动降级
- 注意：
  - `dash.video[]/audio[]` 每条含 `baseUrl`、`codecs`（avc1/hvc1/av01）、`bandwidth`、
    `segment_base.initialization/index_range`（动态生成 MPD 必需）
  - 流地址有时效（约 2 小时）且防盗链；项目用 `/api/stream/{token}` 代理（60 分钟 TTL）
    转发 Range 请求，避免直连跨域/过期
  - 播放策略：先 DASH，成功则按 codec（auto→avc→hevc→av1）过滤并生成 MPD；
    DASH 不可用回退 `fnval=1` 单文件
- 本地代理：`GET /api/playurl`、`GET /api/play`、`GET /api/play.mpd`、`GET /api/stream/{token}`

## 5. 观看进度上报（让官网进度同步）

- 接口：`POST /x/click-interface/web/heartbeat`（表单 `application/x-www-form-urlencoded`）
- 参数：
  - `aid`、`bvid`、`cid`、`mid` 必填
  - `csrf` = Cookie `bili_jct` 的值（写操作必需）
  - `played_time` 累计播放秒数；`realtime` **当前看到第几秒**
  - `start_ts` 开始播放的秒级时间戳
  - `type=3`、`dt=2`、`play_type`（0~4）
- 注意：`realtime` 才是官网进度来源，本项目曾把两者语义弄反导致进度偏差；
  前端每 15 秒心跳一次，离开播放页时补报一次
- 本地代理：`POST /api/play/report`

## 6. 收藏

### 6.1 收藏夹列表

- `GET /x/v3/fav/folder/created/list-all?up_mid={mid}&type=0`
- 返回 `data.list[]`（id / title / media_count）
- 本地代理：`GET /api/fav/folders?up_mid=`

### 6.2 收藏夹内容（含收藏夹内搜索）

- `GET /x/v3/fav/resource/list`
- 参数：`media_id` 必填；`pn`、`ps`、`platform=web`、`order=mtime`（按收藏时间）；
  `keyword` 可选（收藏夹内搜索）
- 本地代理：`GET /api/fav/list?media_id=&pn=&ps=&keyword=`

### 6.3 检查是否已收藏

- `GET /x/v3/fav/resource/ids?media_id={id}&platform=web`
- 返回该收藏夹内**全部视频的 aid 列表**（`data[]` 每项含 `id=aid`），用于比对
- 注意：返回全量 aid，收藏夹很大时较重；项目对每个 bvid 做了 3 分钟内存缓存
- 本地代理：`GET /api/fav/check?bvid=`

### 6.4 收藏 / 取消收藏

- `POST /x/v3/fav/resource/deal`（表单）
- 参数：
  - `rid` 视频 aid（不是 bvid）；`type=2`（视频）；`platform=web`
  - `add_media_ids` / `del_media_ids`：逗号分隔的收藏夹 id，按需传一个
  - `csrf` 必填
  - 风控附带参数：`eab_x=1`、`ramval=0`、`ga=1`、`gaia_source=web_main`、`from_fts=0`
- 本地代理：`POST /api/fav/deal`

## 7. 历史记录

- 接口：`GET /x/web-interface/history/cursor`
- 参数：`ps`（每页，项目 20）、`max`、`view_at`（游标，翻页用上一页返回值；第一页不传）
- 注意：`data.list[]` 的 `progress` 是秒数，需除以 `duration` 得百分比；
  `is_finish` 表示已看完；分页是游标式而非页码式
- 本地代理：`GET /api/history?ps=&max=&view_at=&keyword=`

## 8. 我的投稿

- 接口：`GET /x/space/wbi/arc/search`（WBI）
- 参数：`mid`、`pn`、`ps`、`order=pubdate`
- 本地代理：`GET /api/upload?mid=&pn=&ps=`

## 9. 评论

- 接口：`GET /x/v2/reply/main`
- 参数：
  - `type=1`（视频评论）
  - `oid` = 视频 **aid**（不是 bvid）
  - `mode=3` 按时间排序（`2` 按热度）
  - `next` 分页游标（第一页 0，翻页用 `data.cursor.next`）；`ps=20`
- 响应：`data.top_replies[]`（置顶）、`data.replies[]`、`data.cursor.{next,is_end,all_count}`
- 本地代理：`GET /api/comments?bvid=&next=`

## 10. 关注 / UP 主

### 10.1 关注列表

- `GET /x/relation/followings?vmid={mid}&pn=&ps=&order=desc&tagid=`
- `order=desc` 按关注时间倒序；`tagid` 可选按分组过滤；返回 `data.total` / `data.list[]`
- 注意：项目 `all=1` 模式循环最多 20 页 × 50 人拉全量（上限 1000），
  用于常用博主设置、关注页全量搜索
- 本地代理：`GET /api/followings?vmid=&all=1`

### 10.2 关注分组

- `GET /x/relation/tags`，返回 `data[]`（tagid / name）
- 注意：特别关注组靠组名匹配（含“特别关注”），没有可靠的“默认分组”字段
- 本地代理：`GET /api/relation/tags`

### 10.3 用户卡片

- `GET /x/web-interface/card?mid={mid}`，取 `data.card.{mid,name,face,sign}`
- 本地代理：`GET /api/user?mid=`

## 11. 动态

- 某 UP：`GET /x/polymer/web-dynamic/v1/feed/space?host_mid={mid}&offset=&time=`
- 全部关注：`GET /x/polymer/web-dynamic/v1/feed/all?offset=&time=`
- 注意：`offset` + `time` 为翻页游标；响应 `data.has_more` / `data.offset` /
  `data.update_baseline`；项目只保留 `MAJOR_TYPE_ARCHIVE`（视频投稿），过滤图文/转发
- 本地代理：`GET /api/dynamics/space`、`GET /api/dynamics/all`

## 12. 本地代理速查（前端只调这些）

| 本地接口 | 转发的 B 站接口 | 认证 |
| --- | --- | --- |
| `GET /api/status` | nav + 状态汇总 | Cookie |
| `GET /api/nav` | `/x/web-interface/nav` | Cookie |
| `GET /api/search` | search/type（all）、fav/resource/list（fav）、history/cursor（history） | WBI/Cookie |
| `GET /api/video` | `/x/web-interface/view` | 公开 |
| `GET /api/play` | `/x/player/wbi/playurl` | WBI |
| `GET /api/play.mpd` | `/x/player/wbi/playurl` → 动态 MPD | WBI |
| `GET /api/stream/{token}` | 视频流 Range 代理 | 本地 token |
| `POST /api/play/report` | `/x/click-interface/web/heartbeat` | Cookie + csrf |
| `GET /api/history` | `/x/web-interface/history/cursor` | Cookie |
| `GET /api/fav/folders` | `/x/v3/fav/folder/created/list-all` | Cookie |
| `GET /api/fav/list` | `/x/v3/fav/resource/list` | Cookie |
| `GET /api/fav/check` | view + fav/folder + fav/resource/ids | Cookie |
| `POST /api/fav/deal` | `/x/v3/fav/resource/deal` | Cookie + csrf |
| `GET /api/upload` | `/x/space/wbi/arc/search` | WBI |
| `GET /api/comments` | view + `/x/v2/reply/main` | 公开 |
| `GET /api/followings` | `/x/relation/followings` | Cookie |
| `GET /api/relation/tags` | `/x/relation/tags` | Cookie |
| `GET /api/user` | `/x/web-interface/card` | 公开 |
| `GET /api/dynamics/space` | `/x/polymer/web-dynamic/v1/feed/space` | 公开 |
| `GET /api/dynamics/all` | `/x/polymer/web-dynamic/v1/feed/all` | Cookie |
| `GET /api/login/qr` | passport qrcode/generate | 无 |
| `GET /api/login/poll` | passport qrcode/poll + 302 链 | 无 |
| `POST /api/login/cookie` | 粘贴 Cookie → nav 校验 | 无 |
| `POST /api/login/clear` | 清空本地 Cookie | 无 |
| `GET /api/verify` | 上述接口逐一探针 | - |
