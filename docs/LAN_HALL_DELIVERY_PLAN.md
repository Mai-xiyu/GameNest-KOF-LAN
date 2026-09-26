# 单镜像局域网游戏大厅：技术方案与阶段交付

更新于 2026-09-26。本文件区分已经落地的基座修改、拟实施的接入协议和尚需真人／Docker 验收的门槛。三国杀、支付和开源协议调研不在范围内。阵营推理专项证据见 [SOCIAL_DEDUCTION_AUDIT.md](SOCIAL_DEDUCTION_AUDIT.md)，开源内置游戏复选与麻将候选证据见 [OPEN_SOURCE_GAME_INTEGRATION_AUDIT.md](OPEN_SOURCE_GAME_INTEGRATION_AUDIT.md)。

## 基座复选（已重新打开）

**GameNest 主要保留为当前可运行的大厅外壳，不再把其全部内置游戏视为正式来源。**固定来源 `absswds/GameNest@c9f1207be23012a8cb278f312ccbd81196a760c3`，当前工作树将台球、MaMahjong 和 Starliner 作为独立上游服务适配；西洋跳棋按用户新增要求，以同一固定上游中已有的规则、AI、渲染、房间和同步模块作为单独复核的 `preview` 例外。内置麻将、斗地主及其他未复核玩法仍从正式大厅移除，服务端默认拒绝创建；只有管理员显式设置 `ENABLE_BUILTIN_PROTOTYPES=1` 时才可用于开发测试。同时复选 `touourin/game-hall` 作为大厅／斗地主来源，`yemaster/mamahjong` 已作为专用麻将上游预览接入。不再增加自写麻将、斗地主或其他复杂规则。

| 维度 | GameNest（当前原型基座） | touourin/game-hall（正式基座复选候选） |
| --- | --- | --- |
| 实际源码 | Node/Express/`ws` 主进程、内存房间、中文清单、斗地主／德州等规则与浏览器渲染；已接入时另启台球子进程 | Python 后端、前端、已有账号／战绩／排行／插件协议、斗地主及桌游式隐藏身份游戏 |
| 本次运行证据 | Windows Node `v26.7.0` 上 `npm ci --ignore-scripts`、`npm run check` 与现有测试通过；localhost HTTP 200。设置台球和 Starliner 的固定准备产物后，当前本机回归 285 项通过、无跳过；仍非跨设备或容器验收 | 只审阅固定提交 `c5119fd8e0eb67302a582d421427ce594ffd823c`，未启动其完整栈 |
| LAN 同步 | 一个 HTTP/WS 端口，`server.listen(..., '0.0.0.0')`；跨设备实测待做 | 房间协议已有实现；真实跨设备验收待做 |
| 运行依赖 | 四个 npm 运行依赖，单 Node 容器；新增内置 SQLite 与 `/data` 身份、比赛存储，但房间仍在内存；镜像未验证 | `compose.yaml` 明确需要 MySQL、Redis、迁移和应用服务；现有部署不满足单容器 |
| 外部游戏接入 | 已新增台球与 MaMahjong 同源 HTTP/WS 代理；Starliner 地图行动候选完成默认关闭的预览适配，赛车、FPS 仍待接入；不强迫独立游戏迁移到 `games/` 模块 | 插件适合其内部协议；独立赛车／FPS／台球仍需路由及适配，其依赖打包范围更大 |
| 单镜像代价 | SQLite 身份与斗地主、台球结果基线及台球子进程已新增；其他隐藏信息审计仍缺；Dockerfile 未构建 | 要么维护多个必需容器（不合格），要么在一个容器中监督 MySQL、Redis、Python、前端并迁移存储与 `/data`，故障和升级耦合较重 |

原选择是为**单镜像优先**而作，但实际游戏质量同样是一期门槛。GameNest 原版斗地主广播完整手牌、入房／重连直接发送原始 `room.state`；本工作树已修复这些路径并加定向测试，但安全修复不能证明其规则和体验达到正式游戏水平。除单独复核并标为预览的西洋跳棋外，GameNest 内置游戏仍标记为原型并从默认大厅隐藏，正式版优先复用上游规则、房间和同步。原版 `suikabattle` 动态请求 `unpkg.com` 的 Matter.js；即使在开发对照模式也不应据此宣称离线可用。

## 保留、修改、新增、待核验

| 状态 | 内容与边界 |
| --- | --- |
| 保留 | GameNest 现有大厅、房间、座位和房间码；未复核内置游戏只作原型与迁移对照。西洋跳棋保留固定上游已有规则、AI、渲染、房间和同步，以平台原生模块预览方式接入；台球等独立上游仍保留各自物理／房间／规则／同步。 |
| 已修改 | `games/doudizhu.js` 玩家投影与单局终局；`games/checkers.js` 英式升王回合边界；`server.js` 入房／重连的稳定身份绑定、每接收者投影、斗地主与西洋跳棋服务端结果记录、健康与终止；`platform/store.js` SQLite 玩家／会话／一次性恢复码／幂等比赛、个人分组战绩及斗地主三真人分阵营榜；首页预览与回归测试、单镜像基础 `Dockerfile`。 |
| 已新增上游适配 | `scripts/prepare-billiards.js` 与 `scripts/prepare-mamahjong.js` 只在固定上游提交上做路径、身份、返回大厅及必要兼容补丁；`deploy/*-proxy.js` 通过回环服务代理同源 HTTP/WS。台球终局 IPC 入库仅列**休闲**战绩；MaMahjong 平台结算尚未接入。两者均是独立子进程，非内置规则模块。 |
| 待新增 | MaMahjong 服务端牌谱结算；赛车、FPS 的独立游戏进程／路由／身份／邀请／结算；Starliner 的真人验收；管理员配置／房间监管、可配置清单／详情、全部游戏私密信息审计。独立游戏数据协议均为**本项目新设计**，不是上游现成接口。 |

2026-09-26 新增拳皇 Wing 1.85 可选接入：用户本地 SWF 与 Ruffle 资源经固定 SHA-256 准备到 `output/kof-wing`，资源不进入 Git；房主浏览器运行唯一权威实例，访客经无公网 ICE 服务的 WebRTC 接收画面，并通过平台身份绑定的 WebSocket 房间回传白名单 2P 输入。两个独立浏览器会话已进入 PVP 战斗并验证访客移动和轻拳按键映射；不换算为真人双设备、Docker、阻断公网或完整对局验收。详见 [KOF_WING_INTEGRATION.md](KOF_WING_INTEGRATION.md)。
| 待核验 | 斗地主三真人及台球两设备完整闭环、赛车两设备、FPS 实际联网、所有内置隐藏信息投影、容器 linux/amd64、断公网、重启持久、手机操作、容器环境的独立服务故障隔离和阵营推理真人闭环。本机子进程退出的 503／大厅 200 预检，以及台球双会话与合成快照预检，均不等于真人或容器验收。 |

## 项目结构与接入分层

已存在：`server.js` 提供原生 HTTP/WS、内置游戏和台球服务的生命周期管理；`games/` 提供规则，`public/js/game-catalog.js` 是当前静态大厅清单，`public/js/room-client.js` 是原生房间客户端，`public/js/lang/` 管理前端语言，`tests/` 是回归测试。下表区分现有路径和拟新增路径：

```text
platform/store.js            # 已新增：身份、SQLite 仓储、斗地主及台球结果；通用房间映射待做
scripts/prepare-billiards.js # 已新增：构建期台球上游补丁
deploy/billiards-*.js|mjs    # 已新增：专用台球子进程与同源代理
scripts/prepare-mamahjong.js # 已新增：构建期 MaMahjong 定点适配
deploy/mamahjong-proxy.js    # 已新增：身份兑换与 HTTP/WS 同源代理
integrations/billiards/      # 构建期生成，不提交上游源码
integrations/mamahjong/      # 构建期生成，不提交上游源码
integrations/<other-id>/     # 拟新增：后续独立游戏适配
data/                 # 容器内 /data；数据库和持久配置仅在这里
```

三类接入：

1. **原生模块**：已有规则游戏继续 `createState`／`handleMove`／`playerView` 与原生 WS，不为统一外观重写。新模块经服务端清单、渲染器、中文资源、权限测试注册。
2. **本地静态游戏**：只适用于无专用后端的单机／休闲项目；不能据此声称真人联机或竞技结果。
3. **独立前后端游戏**：保留原后端协议，改其硬编码地址／资源根路径，由内部代理同源暴露，适配层实现平台身份、映射、邀请、退出和结果。平台房间 ID 与游戏房间码分别存储；不把嵌入式 iframe 当作三级接入。

接入等级：一级本地可运行并能返回大厅；二级加统一身份／邀请／恢复；三级加服务端结果与个人战绩／对应等级榜。类别卡片只能显示经过相应等级验证的游戏。

### 注册清单示例（设计，不是已安装游戏）

```json
{
  "id": "social-onenight",
  "name": "一夜狼人杀",
  "version": "upstream-6a60bc96",
  "category": "阵营推理",
  "subtype": "桌游式",
  "enabled": false,
  "integration": "independent",
  "entry": "/g/social-onenight/",
  "routes": { "http": "/g/social-onenight/", "websocket": "/g/social-onenight/ws" },
  "players": { "min": 3, "max": 10, "source": "server-role-validation", "realDeviceVerified": false },
  "devices": { "desktop": "unverified", "touch": "claimed-unverified" },
  "communication": { "inPersonRequired": true, "textChat": false, "voiceChat": false },
  "language": "en; zh translation pending",
  "runtime": { "server": "Node.js", "externalPublicService": false },
  "assets": "/g/social-onenight/",
  "features": { "room": true, "spectator": false, "reconnect": "unsafe-upstream", "records": false, "leaderboard": false }
}
```

地图行动候选只能在候选清单以 `enabled:false`、`status:prototype` 保存；不能以“鹅鸭杀已接入”出现在正式大厅。详情页必须按实测列出人数、类型、触控、现场交流、文字／语音、战绩／排行，不把“未核验”自动转成“支持”。

## 身份、房间、消息和结算（新设计）

使用 SQLite WAL、外键与事务，数据库写在 `/data/gamenest.sqlite`。当前 `platform/store.js` 已实现玩家／会话／一次性恢复码、斗地主与台球比赛和参与记录（台球结果为休闲级）；下列是其他独立游戏扩展的**目标结构**，通用房间映射、授权兑换及迁移尚未实现：

```text
players(player_id UUID PK, nickname, recovery_hash, created_at)
sessions(session_id_hash PK, player_id FK, expires_at, revoked_at)
rooms(platform_room_id UUID PK, game_id, upstream_room_id, host_player_id,
      status, created_at, UNIQUE(game_id, upstream_room_id))
room_members(platform_room_id, player_id, upstream_seat_id, role, joined_at,
             disconnected_at, PRIMARY KEY(platform_room_id, player_id))
matches(match_id UUID PK, game_id, upstream_match_id, game_version, mode,
        rule_version, configured_player_count, actual_human_count,
        trust_level, winner_faction, started_at, ended_at,
        UNIQUE(game_id, upstream_match_id))
match_participants(match_id, player_id, faction, role_id, won, result_json,
                   PRIMARY KEY(match_id, player_id))
```

游客可立即加入；需要长期战绩的用户用稳定 `player_id` 加本地恢复凭据。昵称／IP 不作身份。恢复凭据只以服务端哈希形式保存；会话经 HttpOnly、SameSite cookie 传递。在 HTTP 的不可信 LAN 上不能保证传输保密，竞技模式应部署 LAN HTTPS 并加访问控制。现有台球适配使用同源代理以平台会话生成固定游戏侧身份，并保留上游邀请令牌、座位和房间同步，不是通用一次性启动授权。**其他独立游戏的目标协议**才是短期限定游戏／房间的启动授权、内部兑换 `player_id` 和席位，不接受浏览器自报身份或结算。重连必须验证平台会话、绑定原座位并失效旧连接。若嵌入时使用 `postMessage`，接收端同时验证 `origin`、`source` 和严格消息结构。

台球与阵营预览的代理使用 `deploy/proxy-headers.js`：不向独立游戏转发平台长期 Cookie、Authorization、客户端伪造的内部身份或转发头，也不将上游 `Set-Cookie` 回传浏览器；代理只注入经平台会话验证的内部玩家标识。本机存根测试覆盖 HTTP 和 WebSocket，请勿将该隔离预检解释为 HTTPS 传输保护或完整安全审计。

事件边界：`launch`、`room_join`、`match_start`、`match_end`、`leave`、`error`、可选 `room_status`。退出 UI 分别表示返回大厅但保留座位、主动离房和认输，不把打开菜单等同弃权。内部服务通过只监听 `127.0.0.1` 的端口工作；只有平台入口对 LAN 开放，游戏服务异常只使其卡片／房间显示错误。

现有比赛以 `match_id` 唯一键去重；服务端在一个事务中写入比赛及全体参与记录，重复提交不再增加参与／胜场。斗地主由服务端规则验证的标准三真人单局可列 `server_validated`，断线／离房等降为 `casual`；台球来自击球端物理快照，只能列 `casual`。目前没有通用 `(game_id, upstream_match_id)` 约束、周期榜或客户端自报成绩入口，均属后续设计。竞技榜只读服务端验证结果，客户端不能写正式成绩。个人 API 按游戏／模式／规则版本／配置／人数／阵营／可信等级分组，不把角色胜率、三人／十人场、台球得分与 FPS 击杀数混合。跨游戏活动积分需要单独、公开、可配置规则。

阵营推理的 `playerView`／`factionView`／`publicView` 在上游游戏服务端产生；平台适配层不能从已向所有人广播的秘密中“补救”泄漏。阵营私聊、公共讨论和出局交流是不同授权通道；首期允许现场交流，无需公网语音。旁观默认关闭，未来只能用公开投影并测试全部重连／返回入口。

## 单镜像部署边界

当前根目录 `Dockerfile` 固定 Node `24.14.1-bookworm-slim`、Rust `1.85.1-bookworm` 与对应镜像 digest，固定台球提交 `ec9a66ac67b3576c74b56aff75fde68895ccdca9`、MaMahjong 提交 `c903603cfefc5786126173b33468e7df001280de`、Starliner 提交 `367f2f33cfff88f6cab6bbd4b6712e2c25aa02cb` 和一夜狼人杀提交 `6a60bc96a72c6f93cb10938f970011f733a72df8`。默认 `final` 目标构建大厅、台球和 MaMahjong，**不依赖两个阵营推理候选的上游可用性**；`starliner-preview`、`onenight-preview` 和同时包含两者的 `social-preview` 才加入对应候选。运行阶段主进程监听 `0.0.0.0:3000`，台球、Starliner、MaMahjong 和一夜狼人杀分别只在回环 `8188`、`8189`、`8190`、`8191` 提供上游服务。两个阵营预览仍分别须显式 `ENABLE_STARLINER_PREVIEW=1`、`ENABLE_ONENIGHT_PREVIEW=1` 才开放。运行不临时安装或拉取源码；`/healthz` 目前仅检查主服务，不能代替各独立子进程的专项检查。**本机没有 Docker，未执行 linux/amd64 构建或运行**。这只是单镜像**代码基线**，不能当成容器验收完成。

2026-09-26 依赖收口：可选 Starliner 构建阶段只生成适配后的源码与静态资源，不再把上游锁定的旧 Express／WS／UUID 依赖复制进镜像；子进程在 `/app/integrations/starliner` 运行时从大厅 `/app/node_modules` 解析同一套锁定依赖。大厅升级到 `express@4.22.3`，锁文件解析 `body-parser@1.20.8`、`qs@6.16.0`，并继续使用 `ws@8.21.0`；本机 `npm ci --omit=dev --ignore-scripts` 后 `npm audit --omit=dev` 为 0 项。该结果不替代尚未执行的 Docker 镜像扫描与 linux/amd64 容器运行验收。

拟在 linux/amd64 Docker 主机执行并验收（以下命令尚未在本机执行）：

```sh
docker build --platform linux/amd64 -t lan-game-hall:local .
docker run --rm --init --name lan-game-hall -p 3000:3000 -v lan-game-data:/data lan-game-hall:local
```

阵营预览的隔离构建命令（**尚未执行**）：地图行动候选使用 `docker build --platform linux/amd64 --target starliner-preview -t lan-game-hall:starliner-preview .`，桌游式候选使用 `docker build --platform linux/amd64 --target onenight-preview -t lan-game-hall:onenight-preview .`，组合预检使用 `docker build --platform linux/amd64 --target social-preview -t lan-game-hall:social-preview .`。只在测试环境运行相应镜像并保留显式预览开关，不得用作已验收发布。

当前唯一对外入口由 `server.js` 提供：`/` 是大厅，`/g/billiards/` 经代理提供 HTTP/WS；可选 `/g/starliner/` 与 `/g/starliner/ws` 仍受 `ENABLE_STARLINER_PREVIEW=1` 控制。静态清单不给 Starliner 写死入口；大厅通过 `/api/integrations` 及旧实例路由探测，只在本地上游实际启用时显示可启动 `preview`，不能视为正式入口。后端仅在回环监听。大厅和独立游戏首页可创建平台会话；其余代理请求需已有会话。后续赛车／FPS 同样须在**同一镜像／容器**内逐项适配资源、网络与身份；不能将未启用的候选入口视为部署完成。健康检查后续应区分主大厅和各子服务状态，故障卡片提示但不能一起崩溃。运行阶段不得下载依赖，不需 Docker socket、MySQL／Redis 容器或公网语音。

拳皇 Wing 入口 `/g/kof-wing/` 和信令 `/g/kof-wing/ws` 只在 `KOF_WING_DIR`（或默认 `output/kof-wing`）通过资源校验时开放。Docker 使用可选 `kof-wing-preview` 目标复制本地准备产物；默认 `final` 不包含未确认再分发许可的游戏 SWF。

## 阶段与验收

**时序说明：** 下列预检记录按日期追加；较新记录覆盖较早记录中有关入口是否开放的现状表述。2026-09-26 后 Starliner 是“管理员显式启用且本地路由可用时才显示的 `preview`”，不是正式发布。

| 阶段 | 交付门槛 | 阵营推理状态 |
| --- | --- | --- |
| 一：大厅／牌／台球 | 保留并审计一个大厅；中文／同 LAN 单镜像；三真人含大小王斗地主；双设备真人台球；稳定 ID、SQLite 结果与一个可信等级明确的榜；大厅→房间→结算→返回完整闭环、重启数据保留 | 不阻塞；候选记录为禁用，不放空入口 |
| 二：独立联机游戏 | 接入跨设备赛车与类 CS FPS；保留引擎，按实际结果可信等级归榜；加入**至少一款完整地图行动类阵营推理**，须先找到合格可复用项目或公开宣布候选不合格及改造成本；桌游式可并行补充 | 房间／角色／地图／任务／淘汰／报告／讨论投票／胜负／重连／结算逐项过门槛 |
| 三：平台完善 | 管理员启停／关房／公告／日志、清单驱动详情／搜索／收藏／最近游玩、故障隔离与新增游戏演练；再考虑活动、赛季、观战／大屏与可选语音 | 依据可见信息安全审计结果决定是否开放观战 |

验收环境：linux/amd64 Docker 主机及满足每个游戏人数的不同真人设备；无缓存浏览器，保留同一 LAN，分别阻断服务器和玩家设备的 WAN。记录硬件、镜像 digest、上游提交、人数、模式、规则版本、时延／帧率的实际采样方法。逐游戏完成建房邀请、真人行动、结束、掉线恢复、结算及重复上报、容器重启、独立游戏崩溃；抓包核查隐藏信息和公网请求。机器人和本机多个页面只能做预检，不得计入真人验收。当前这些门槛**均未声称通过**。

Starliner 的逐步真人流程、重连／旁观反例、断公网证据和记录表见 [STARLINER_LAN_ACCEPTANCE.md](STARLINER_LAN_ACCEPTANCE.md)。该清单不降低本节门槛，也不把当前脚本回归换算为真人数量。

2026-09-24 本机阶段预检：`npm run check` 检查 170 个 JS 文件；同时设置 `TEST_BILLIARDS_DIR` 和 `TEST_STARLINER_DIR` 指向本地固定上游准备产物，`npm test` **281 项全通过、无跳过**。台球测试包含双独立会话、同源邀请／WS 与**合成快照**休闲结算；固定提交的台球上游 `node --test test/server.test.js` 先前 23 项通过。Starliner 固定提交经 `scripts/prepare-starliner.js` 生成、服务端及浏览器经典脚本解析通过；协议测试包含四个独立 WS 会话、伪造身份与隐藏角色反例、房主刷新后入房、淘汰／报告／投票、终局重连及休闲结果入库；规则单测覆盖移动、任务与报告距离。浏览器仅单人页面核查同源 WS、汉化入口、地图、建房及加入。这些都不是 Docker、跨设备真人、断 WAN 或完整物理／地图对局验收。

2026-09-25 增量预检：`npm run check` 检查 172 个 JS 文件；设置同一批固定准备产物后，`npm test` **285 项全通过、无跳过**；`git diff --check` 通过；固定 Starliner 服务端与浏览器经典脚本可解析。新增台球／Starliner 上游 HTTP 与 WS 凭据隔离测试、预览子进程故障隔离预检、五任务站静态路径可达性验证。在固定 Starliner 提交上重建预览：远程修复被拒绝，独立 WS 会话沿地图路径移动到线路站可完成灯光修复，氧气站目前只有规则正反例；为刷包移动增加累计速度预算。完整回归在这些补丁后再次通过；以上均非真人浏览器地图操作。仍无 Docker、真人多设备或断公网验收。

同日新增 Starliner 预览的三类服务端授权文字频道，并用四和十个独立协议会话验证路由和泄漏反例；本机单浏览器配合两条协议连接检查阵营和会议输入切换。浏览器自动化与协议会话都不能计入真人玩家数量。增量后 `npm run check` 检查 172 个 JS，设置两份固定上游准备产物后 `npm test` 285 项通过、无跳过，预览服务端与浏览器经典脚本解析通过，`git diff --check` 通过；正式入口保持禁用。

同日任务握手增量：预览服务器对任务开始和完成分别校验存活船员、任务站位置、未完成状态及至少两秒的服务端经过时间；离站、会议、死亡和重连清理进行中任务。四会话协议测试覆盖未开始／过早／离站／重连／会议／重复完成的拒绝、本人确认与全体进度单次更新，并走通氧气左右站修复及远程修复拒绝。战绩规则版本升级为 `starliner-adapter-v2`，不混合既有规则记录。固定准备产物重建并经服务器、浏览器经典脚本解析，`npm run check` 172 文件、`npm test` 285 项无跳过、`git diff --check` 通过。服务端不能证明真实按住任务按钮，仍只记录休闲结果；本机单浏览器建房／加入／三席开局检查不能代替任务实操、真人或离线验收。

终局 UI 增量：Starliner 上游客户端重复定义终局覆盖层函数，构建期去重并让结算按钮直达统一大厅 `/`。本机浏览器与两条脚本 WS 会话走通创建／加入、分配角色、会议投票、结算覆盖层、按钮导航到大厅和该浏览器的个人休闲记录。脚本席位不是真人，此预检未覆盖地图任务的浏览器操作、三真人、容器或断公网；正式大厅仍无 Starliner 开局入口。

刷新回席增量：预览客户端在同一会话携带的 `?room=` 下，WS 建连后自动加入原座位；断线显示手动刷新入口。单浏览器加两条脚本会话开局后刷新，已观察到原房间、房主 ID、行动阶段与本人角色恢复。没有验证实际网络断开重连或服务崩溃后的房间恢复，房间仍在子进程内存中。不能把该预检算作真人多设备验收。

窄屏任务与布局增量：在隔离浏览器 390 CSS 像素、DPR 3 模拟触控下，以一页浏览器及两条脚本 WS 席位让浏览器船员移动到线路站，按住画布任务按钮约 2.7 秒，服务端报告 `tasksDone=1`；这不是真手机或三真人。随后的定点 HTML 适配把返回大厅链接、连接徽标放入不遮挡标题／开局按钮的正常布局，并把上游结算层移进 `body`。隔离 Edge 以 390／320 CSS 像素、DPR 3 和 1280 桌面视口复查截图、开局按钮命中、无横向溢出及链接返回大厅；构建产物的服务器和客户端 `node --check` 均通过。设置 `TEST_BILLIARDS_DIR`、`TEST_STARLINER_DIR` 后 `npm run check` 172 文件、`npm test` 285 项无跳过、`git diff --check` 通过。正式入口仍禁用，尚缺容器、断 WAN、实体手机和真人联机闭环。

运行时预览入口增量：服务端新增不暴露本地目录的 `/api/integrations`，大厅只在 Starliner 配置开关实际启用时把静态 `candidate` 升级为可点击 `preview`；旧运行实例用同源路由 200 探测兼容。浏览器从大厅进入预览后，暴露了上游“创建后仍需手动加入”的 UX 缺口；构建期补丁收到 `roomCreated` 后调用原有加入处理。复测房间 `UF5LD` 已显示房主 ID、本人 ID 和玩家列表，并保留在 Codex 浏览器供后续真人加入。这仍不是多真人验收。固定上游重放语法检查、Starliner 专项 3 项及完整回归 294 项均通过。

邀请、旧连接与离线静态反例增量：真实 LAN HTTP 页面点击“复制链接”后显示“已复制”；邀请只包含房间码。专项测试要求同一身份重连时旧 WebSocket 以 `4001` 失效，并拒绝客户端脚本中的绝对 HTTP(S) 外链、STUN／TURN 地址及 HTML 外链资源，确认 WebRTC 使用空 `iceServers`；Starliner 专项 3/3 通过。以上仍不能替代不同设备断公网、抓包和真人闭环。

客户端收口增量：构建期补丁消除玩家空态、终局胜方和语音参与者标签的剩余英文，并让出局玩家的桌面／触摸报告及紧急会议按钮立即禁用；服务端存活校验仍是最终授权。固定上游重新生成产物通过客户端／服务端语法检查、Starliner 专项 3/3 和完整回归 294/294，验证后的客户端已用于当前 LAN 预览。

运行时可用性增量：`/api/integrations` 对台球、MaMahjong 和 Starliner 分别公开不含本地路径的 `configured`、`available`、`enabled`；`available` 来自短时回环 HTTP 探测，`enabled` 只有在配置与服务实际响应同时成立时为真。Starliner 子进程崩溃时大厅继续返回 200、代理返回 503、卡片不会升级为可启动预览。未配置、故障和正常三类专项 5/5 通过。

## 新增一款游戏的操作

1. 阅读并固定上游源码提交、构建产物和真正存在的房间／WS／资源路径；用功能矩阵排除示例、规则库、外挂及占位项目。
2. 先独立构建并离线运行，确定真人支持人数、设备、交流方式与结果权威性；不通过就保持清单禁用。
3. 选择原生模块／静态／独立服务方式，保留已有玩法与同步；通过最小适配接入 `player_id`、平台房间映射、邀请和返回大厅。
4. 为独立服务打包固定提交、资源、内部端口和同源代理；验证 WebSocket 升级、Socket.IO `path`、资源根路径、异常隔离及运行时无公网请求。
5. 添加每接收者状态投影和反例测试；接入带匹配 ID 的服务端结算与事务幂等，按可信等级启用个人战绩和分模式榜。
6. 完成真实玩家、断 WAN、重启持久、手机／桌面等该游戏详情宣称的验收后，才启用分类卡片和详情。新增游戏不应要求改动多个原生规则引擎或另起平台账号系统。
