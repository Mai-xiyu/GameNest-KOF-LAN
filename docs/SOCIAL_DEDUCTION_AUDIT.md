# 阵营推理候选审计与接入门槛

审计日期：2026-09-24。以下结论以列出的提交源码和本机命令为准；“源码存在”不等于真人联机验收通过。本类别必须包含地图行动类；桌游式游戏只能补充。

## 候选与结论

| 来源 | 固定提交 | 类型与结论 |
| --- | --- | --- |
| [Goose_Goose_Duck_Hack](https://github.com/FrozenFish259/Goose_Goose_Duck_Hack) | `d760c2c8b348d69663944a431e5be3b420114f04` | 用户参考链接；Windows 鹅鸭杀外部辅助工具，不是独立客户端、私服或网页游戏。不得打包进入运行镜像。 |
| [hangyu-feng/onenight-werewolf](https://github.com/hangyu-feng/onenight-werewolf) | `6a60bc96a72c6f93cb10938f970011f733a72df8` | 可构建的桌游式补充候选；仍需身份与重连安全修补、真实玩家验收。不能代替地图行动类。 |
| [opensuspect/opensuspect-legacy](https://github.com/opensuspect/opensuspect-legacy) | `69392f63192f0d0c87429bc5dbb40014a8286258` | 补充筛查：Godot 早期项目；`src/export_presets.cfg` 仅有 Linux／Windows 客户端与 Linux 服务端预设，未发现浏览器导出。不能要求 LAN 玩家安装原生客户端。 |
| [jinhyuk558/web-amongus-clone](https://github.com/jinhyuk558/web-amongus-clone) | `0d49c6199473cc58a218a2fa2cab924349b07f9f` | 补充筛查：Phaser 地图与 Socket.IO 房间、方向同步；`server/index.js` 和 `server/utils/game.js` 未实现身份、任务、淘汰、报告、投票、胜负、重连、结算。作者说明为 incomplete，仅移动原型，不宜接入。 |
| [MindCollaps/swindler](https://github.com/MindCollaps/swindler) | `e18a4564cd6ca84cc13b14f29709bd6b860afcd2` | 补充筛查：README 描述为秘密词、轮流提示、投票的桌游式游戏，不具地图行动；部署使用 PostgreSQL、Redis 与 Compose，不满足轻量单镜像优先要求。此项仅目录／README 筛查，未运行。 |
| [arizkhalid/among-us-clone](https://github.com/arizkhalid/among-us-clone) | `b7c1f357d792d7b52ec6750a0e758e7611560625` | 补充源码筛查：Phaser 地图、房间、身份与投票均有代码，但无鉴权的房间 API 返回 `imposter`，任务／尸体报告／恢复／持久结算缺失；不能直接接入。未构建或运行。 |
| [pd8/among-us-js](https://github.com/pd8/among-us-js) | `b0098130653e4b2b01ed9ebb812e09cebb759bec` | 补充源码筛查：浏览器画面及 WS 移动、攻击、尸体事件；没有房间和阵营／任务／报告投票／胜负等完整流程。未构建或运行。 |
| [saket-gupta99/the-startup-burnout](https://github.com/saket-gupta99/the-startup-burnout) | `2de8f0cfe0e5e5057e5030a1b64b2abb24b8f20d` | 补充筛查：README 宣称任务、阵营、讨论投票；客户端是任务面板而非地图移动游戏。`server/src/utils/libs.ts` 广播含全员角色的完整 `room`。不满足地图行动与隐藏身份条件；未构建或运行。 |
| [syedawais10/starliner-game](https://github.com/syedawais10/starliner-game) | `367f2f33cfff88f6cab6bbd4b6712e2c25aa02cb` | 补充源码／后端预检：本地 Node+WS，单文件地图、任务、报告、会议、投票、胜负均有代码；浏览器经典脚本可解析，但服务端对移动／任务／报告缺少权威校验，也无安全重连或持久结算。只能列为更接近目标的**不可上线原型**。 |
| [FlowMintOfficials/glowship3d](https://github.com/FlowMintOfficials/glowship3d) | `f85528d32c560c5d5c772b74539bdcc971ecb225` | README 声称 3D 地图、3–8 人、任务／报告／投票；`index.html` 从公网载入 PeerJS／Three.js／字体，`js/net.js` 默认公共 PeerJS 信令和 Google／Cloudflare STUN、公共 TURN，房主浏览器主导房间状态。原样不满足离线和服务端权威隐藏身份；未构建、运行或安全审计。 |
| [Snowmonkey5/MYSN-MURDER](https://github.com/Snowmonkey5/MYSN-MURDER) | `675ae0920c0e7c916d1f58b1311097f537d9f6b9` | 有本地 Express+Socket.IO 实现和 Cloudflare Durable Objects 实现，但随仓库提供的 `public/client.js` 连接原生 `/ws/<code>`，与本地 `server.js` 的 Socket.IO 协议不一致；本地 `getPublicState` 在游戏未结束时公开出局者真实身份。无法原样作为单容器离线浏览器游戏；未运行。 |
| [vivandoshi08/among-us-in-3d](https://github.com/vivandoshi08/among-us-in-3d) | `682c2995a9cdcf8b0c4e53e3d045c2aa4449376e` | Colyseus 房间与 3D 位移、按距离淘汰有代码；`backend/source/sessions/models/game-state.ts` 将全体 `role` 放入同步的 Schema，`game-session.ts` 未见任务／报告／投票／结算实现。仅原型；未构建或运行。 |

OpenSuspect 的 `opensuspect_web` 仓库是官网源码，不是游戏 Web 客户端。本次未找到已经由源码和真人对局证明完整、可浏览器本地部署的地图行动替代项目。继续寻找时仍须执行同一功能与安全矩阵；不能把本原型的缺失功能变成新的平台规则引擎开发任务。

## 地图行动候选逐项核验

| 能力 | 源码证据 | 当前判定 |
| --- | --- | --- |
| 房间 | `backend practice/src/controllers/gameController.ts` 实现 `create-room`、密码 `join-room`；房间 ID、昵称由客户端提供，缺少人数上限、房主权限校验 | 基础实现，不可信任的完整房间系统 |
| 身份分配 | `backend practice/src/models/gameState.ts` 随机赋予 `imposter` 及 `task master`、`xyz`、`abc` 等角色；`role-assigned` 单播，但随后 `update-players` 广播含 `role` 的全体对象 | 部分实现，**身份直接泄露** |
| 地图移动 | `frontend/src/Google.tsx` 加载 Tiled 地图、Phaser 本地碰撞和 WASD；`backend practice/src/socket/index.ts` 接受客户端提交的任意玩家位置数组 | 可见地图与同步原型；服务端无身份绑定的位置、速度与穿墙校验 |
| 任务 | README Roadmap 的未勾选项 `Add task completion system`；后端无任务状态机 | 明确待开发 |
| 淘汰 | 后端 `kill` 实现基于位置的邻近淘汰；位置可伪造，死者状态与冷却校验不足 | 部分实现，不可用于可信对局 |
| 报告 | 无尸体报告事件；README Roadmap 的紧急会议也未完成 | 缺失／待开发 |
| 讨论投票 | `polling`/`donePolling` 有计票和淘汰；`pollingArray` 为跨房间全局 Map，重复投票与任意结束未受保护；`msg` 使用 `io.emit` 跨房广播 | 投票原型，讨论阶段与频道隔离未实现 |
| 胜负判定 | 淘汰或投票时按存活人数发 `endGame` 字符串 | 局部实现；无任务胜利、完整阶段状态、终局持久化 |
| 断线重连 | 断线删除 socket 关联玩家；无身份恢复令牌／状态回补 | 缺失 |
| 结算 | 仅向前端发送结局文本；无 match ID、结果签名或幂等落库 | 缺失 |

README 另外宣称“至少 4 人开局”“完整角色对抗”等；后端 `startGame` 未检查最低人数或房主，不能把描述当作已验证行为。README Roadmap 明确列出任务、破坏、正式地图、紧急会议、手机触控、淘汰后观战等未完成项。`frontend/src/App.tsx` 当前渲染 `Google.tsx`；另一份 `Game.tsx` 不是默认入口。`Google.tsx` 把 Socket.IO 固定为 `http://localhost:3000`，局域网手机会连接其自身的 localhost。

本机执行：`backend practice` 中 `npm ci --ignore-scripts && npx tsc --noEmit -p tsconfig.json` 通过；`frontend` 中 `npm ci --ignore-scripts && npm run build` 因 TypeScript 未使用变量及空值错误失败。README 的后端 `npm start`／`npm run build` 与实际 `backend practice/package.json` 脚本不符。未进行完整运行或真人联机测试。当前状态只可用于研究地图渲染和原型交互；如果继续采用，所需角色安全、任务、报告、重连、结算改造已经接近重做玩法，需重新评估复用价值。

### 补充地图候选源码矩阵（未运行）

下表只表示固定提交中的实现线索和缺口，不能当作功能实测。`arizkhalid` 的 README 声称实时多人、房间和会议 UI，但未声称通过下列完整闭环；`pd8` 的依赖和资源目录不等于完整游戏。

| 能力 | `arizkhalid/among-us-clone` | `pd8/among-us-js` |
| --- | --- | --- |
| 房间 | `rooms.manager.js`、`roomEvents.js` 有建房／加入；客户端可提供任意玩家 ID 和房间 ID，未验证所有权 | `server/server.js` 只有全局 `players`，无分房 |
| 角色分配 | `startGame` 随机选 `imposter`；无需身份验证的 `GET /rooms/:roomId` 返回含 `imposter` 的完整对象，`GET /isImposter/` 也按任意传入的玩家 ID 查询，身份泄露 | 无阵营／角色分配 |
| 地图移动 | `frontend/src/game/scenes/Game.js` 加载地图，`gameEvents.js` 同步移动；服务端采信客户端的玩家 ID、坐标 | `client/index.js` 与 `server/server.js` 有 WS 移动／定时同步；未发现地图房间规则 |
| 任务 | 后端没有任务完成事件／状态机 | 无任务状态机 |
| 淘汰 | `player:kill` 直接根据客户端 `playerId` 改存活，缺操作者、距离与阶段授权 | `ATTACK` 有近距离淘汰及 `DEAD_BODY` 通知，无阵营授权 |
| 报告 | 前端有尸体图片，但后端无尸体报告事件 | 有尸体广播，无玩家报告事件 |
| 讨论投票 | `meeting:start`、`meeting:vote`、`meeting:end` 有基础流程；投票身份取客户端 `callerId`，可替人投；消息不具明确生死／频道权限 | 无讨论、会议和投票 |
| 胜负判定 | `checkWin` 按存活人数判定，缺任务胜利 | 无胜负判定 |
| 断线重连 | 断开时移除玩家；没有可信座位恢复 | 断开即从全局列表移除，无恢复 |
| 结算 | `game:ended` 仅向前端发送胜方，无服务端持久比赛记录 | 无结束／比赛记录 |

若选择 `arizkhalid`，需新增任务、报告、会话与行动授权、服务端投影、重连、结算，并补全安全测试；这已超出“少量适配”，不应仅因地图素材现成而承诺复用接入。`pd8` 缺失更多核心规则，不建议继续作为接入候选。`the-startup-burnout` 虽有 `server/src/index.ts` 的任务、淘汰、会议投票和胜负代码，但无地图行动；其 `broadcastRoomState` 对所有房间成员发送完整 `room.players[].role`，且断线删座位，因此不能把 README 的功能描述认定为安全的地图类成品。

### 更接近目标但未达标：Starliner

固定提交 `367f2f33cfff88f6cab6bbd4b6712e2c25aa02cb` 的 `server.js` 可以复用房间、WS 同步、单播角色、阵营／淘汰／投票／胜负的框架，以及 `public/ship_map.png` 和客户端地图素材。`roomSnapshot` 默认将全员 `role` 置为 `unknown`；这是比直接广播真实身份更好的基线，但未涵盖重连和观战的安全性。

| 能力 | 源码和本机判定 |
| --- | --- |
| 房间／角色 | `createRoom`、`join`、`startGame` 与 `role` 单播存在；后端三独立 WS 会话建房、加入、单次开局分出 1 名破坏者的预检通过。进入已开始的房间、房间码枚举与人数上限尚未保护 |
| 地图移动 | `public/client.js` 有地图图片、墙体与触摸按钮；`server.js` 接受客户端绝对坐标，仅限制矩形边界，不校验速度／墙体，位置可伪造；浏览器页面仍未运行 |
| 任务／淘汰 | 前端有任务站与使用键；后端 `taskComplete` 接受任何新字符串作为任务，且不限已分配任务、位置和每人配额，不能作为可信任务胜利。`kill` 检查角色、冷却和距离，但距离以可伪造的坐标为准 |
| 报告／讨论投票 | `report` 或 `callMeeting` 无存活、尸体存在／距离或按钮冷却校验；预检显示任何开局成员可触发会议。会议有存活者文字聊天与计票，三会话全投跳过可恢复行动；无正式讨论／投票计时与出局频道 |
| 胜负／重连／结算 | `checkWin` 覆盖任务、阵营淘汰与人数比；`gameEnded` 仅发胜方。断开即移除席位，无身份恢复、固定 match ID／参与者结果与幂等持久化 |

本机 `npm ci --ignore-scripts` 成功，但输出依赖审计告警；`node --check server.js` 通过。`node --check public/client.js` 因仓库 `type: module` 使用严格模块语境，会在重复函数声明处报 `SyntaxError`；**这不是浏览器解析失败的证据**：`index.html` 用普通 `<script>` 加载，`vm.Script` 在经典脚本语境解析通过。实际在本机浏览器打开 `127.0.0.1:32117`，页面显示 `WS: connected`、地图画面，单浏览器创建房间并加入后显示房间码、玩家和房主 ID。重复声明仍应清理，但页面可启动。另用 Node WS 客户端三独立会话做后端协议预检，得到角色 `sab, crew, crew`，`report` 进入会议，三人跳过投票返回行动；浏览器预检只有一个真人操作的页面，后端协议预检不是三真人、不是地图行动或离线验收，不能证明完整游戏可玩。若后续选用，最小改造至少包括绑定平台会话与座位、服务端位置／任务／报告校验、重连私密状态、阵营／出局通信权限、受控旁观、终局持久回调、同源路由／汉化和反例测试。该工作量不属于只改代理；在通过独立浏览器及真人离线测试前维持 `enabled:false`，不把预检称为完成地图行动接入。

### Starliner 构建期预览适配（运行时门控）

**时序说明：** 本节按实施日期保留当时状态；后文 2026-09-26 “运行时入口与自动入席增量”覆盖早期“入口关闭”的现状表述，但不改变未完成真人验收的结论。

`scripts/prepare-starliner.js` 对固定上游源码做定点补丁，保留其地图素材、角色分配、房间、任务、淘汰、会议与投票逻辑。`deploy/starliner-rules.mjs` 从同一客户端提取墙体／任务站：服务端用累计移动预算限制刷包加速，校验穿墙、任务 ID／位置、报告尸体距离及灯光／氧气修复的设施距离；绑定平台会话 ID，禁止晚加入和中途观战，断线后同一会话可恢复本人角色及已完成任务；会议无人投票时两分钟后按弃票处理。`deploy/starliner-proxy.js` 在同源 `/g/starliner/` 与 `/g/starliner/ws` 代理，剥离浏览器带来的平台 Cookie／Authorization／伪造内部身份头，只注入经过平台会话验证的游戏身份；上游 `Set-Cookie` 不返回浏览器。`server.js` 收到上游终局 IPC 后，按游戏／地图模式／规则版本／实际人数／阵营写入 SQLite，利用匹配 ID 幂等，**只列个人休闲战绩，不进入竞技榜**。任务改为客户端请求开始、服务端检查身份／位置并计时至少两秒、完成时重新检查位置并只向本人确认；离站、死亡、会议或重连会清理进行中任务。但客户端仍可在站点等待计时后直接发送完成消息，服务端不能证明玩家实际按住按钮，不能把它归为服务端验证的竞技成绩。

本机 `tests/starliner-preview.test.js` 以四个独立 WS 会话验证同源代理、伪造身份头被覆盖、开局前和重连快照掩码、晚加入无身份、拒绝远距瞬移／伪造任务／无尸体报告／远程修复；一名会话沿可行地图路径移动至线路站后，服务端接受灯光修复，并沿可行路径依次抵达引擎与护盾站完成氧气双点修复，再验证淘汰、报告／投票与个人休闲结果落库。规则单测确认五个任务站可由出生点沿服务端墙体规则到达，对移动刷包和修复位置做正反例校验。这些是**协议和静态路径预检**，不是四个真人、真实浏览器地图操作或手机测试。预览仍须显式设置 `ENABLE_STARLINER_PREVIEW=1`；大厅从 `/api/integrations` 读取运行时状态，旧服务兼容路径则探测 `/g/starliner/`。只有本地上游已启用时，卡片才从禁用候选升级为可启动的 `preview`；这不是正式上线标记。未在本机执行 Docker 构建／启动、断公网、不同设备与真人闭环。声音为可选 WebRTC，移除了公网 STUN，不依赖语音开局。房间是内存态，子进程重启会丢失进行中的局，休闲战绩不受影响。

2026-09-25 增量：预览适配在服务端按存活、阵营与阶段分别授权 `public`（会议存活玩家）、`faction`（行动阶段存活破坏者）和 `eliminated`（进行中出局玩家）文字频道；接收者逐人筛选，不把私聊广播后靠界面隐藏。四会话反例涵盖冒充阵营／出局发言及跨频道接收，十会话正例涵盖两名破坏者互通而八名船员不可见。本机单浏览器加两条协议连接，仅确认破坏者输入框、会议公共输入框和消息显示切换；不属于三真人验收。频道不持久化，断线后不补发历史；现场交流依然建议保留，语音仍非开局前提。

同日任务握手增量：四会话测试在地图可达的线路站验证未开始／过早完成被拒、离站／重连／会议撤销进行中任务、服务端计时后只向本人发送任务确认、全体任务进度只增加一次。协议会话还走通氧气左右两站的修复及远程修复拒绝。该测试通过 WS 协议模拟位置与任务命令，不能验证真实触屏长按；距离和计时检查不能替代真人验收或可信竞技反作弊。预览结果使用 `starliner-adapter-v2` 规则版本，与旧休闲记录分组。

终局返回预检：构建期适配清理了上游客户端重复的终局覆盖层函数，覆盖层按钮改为返回统一大厅 `/`。本机一页自动化浏览器加两条独立协议连接完成建房、三席身份分配、紧急会议与投票、船员胜利、按钮返回大厅；大厅显示该浏览器身份的 `starliner-adapter-v2` 个人休闲记录。**三个席位均不计入真人联机验收**，这不是三真人、地图任务实操或离线验收。终局按钮的生成脚本和 HTTP 资源有静态断言，浏览器导航另行实测；正式入口仍关闭。

刷新回席预检：`?room=` 中只保留五位房间码，不含长期凭据；同一浏览器会话重新加载后，WS 打开时主动发送 `join`，服务器按平台会话恢复原座位并仅单播本人的身份，断线时页面提供“重新连接”刷新按钮。本机一页浏览器加两条协议连接开局后，直接刷新，页面自动恢复原房间码、房主 ID、行动阶段及本人角色。未实测断网恢复、子进程崩溃、手机或多真人；服务重启会丢失内存房间，不能称为自动恢复进行中的整局。

窄屏与任务增量预检：在固定 Starliner 提交的预览中，一页自动化浏览器配两条脚本 WS 席位开局，浏览器船员沿地图到达线路站，点击触摸“任务”并在画布按钮持续按住约 2.7 秒，服务端回报 `tasksDone=1`。之后构建期将“返回大厅”链接从固定定位改为页首流式布局，连接状态徽标从标题移至该行，并把上游置于 `</html>` 之后的结算层移回 `body`；去掉上游两处相同的碰撞函数声明。重新生成产物后，服务端和客户端 `node --check` 通过；隔离 Edge 在 390／320 CSS 像素、DPR 3 模拟触摸及 1280 CSS 像素桌面视口建房，截图和 DOM 命中检查确认开局按钮未被链接遮挡、状态徽标不盖标题、没有横向溢出，链接可导航至大厅且无页面异常。本机 `npm run check` 检查 172 个 JS，设置两份固定上游准备产物后 `npm test` 285 项通过、无跳过，`git diff --check` 通过。这些检查**不是实体手机、三真人、容器或阻断公网的 LAN 验收**；单点任务成功也不证明完整任务与会议循环。

**未完成门槛：** 地图行动、任务、淘汰、报告、讨论与结算串成的多真人完整对局（单浏览器任务预检不足以证明）、会议限时／出局权限和私密频道的真人实操、真实手机触控、断线恢复后的 UX、服务崩溃后的房间提示、全量汉化、性能、LAN 阻断 WAN、linux/amd64 容器及至少三真人完整对局（若发布四人配置，还需四真人验收）。若无法补齐，只允许保留显式启用的本地 `preview`，不得将其解释为可发布的鹅鸭杀游戏。

本地协议复测：将固定提交检出至 `SOURCE`，执行 `node scripts/prepare-starliner.js SOURCE DESTINATION`；在 `DESTINATION` 执行 `npm ci --omit=dev --ignore-scripts`，设置 `TEST_STARLINER_DIR=DESTINATION` 后运行 `node --test tests/starliner-preview.test.js tests/starliner-rules.test.js`。预览启动须同时设置 `STARLINER_DIR=DESTINATION` 和 `ENABLE_STARLINER_PREVIEW=1`；仅 `starliner-preview` 镜像目标含候选产物，默认 `final` 镜像不包含它，也不开启预览。实验地址 `/g/starliner/`，邀请为同源 `?room=房间码`，刷新后在同一平台会话下自动尝试回席；新身份在对局中仍被拒绝。运行时卡片可进入该本地预览；**不要把这个开关用于对外正式发布**。

2026-09-26 运行时入口与自动入席增量：静态清单仍把 Starliner 保持为无 `externalEntry` 的 `candidate`；大厅只在服务端返回已启用的本地预览，或旧运行实例实测 `/g/starliner/` 为 200 时，才在当前页面中升级为可启动 `preview`。实测发现上游创建房间后只填充房间码、不自动入席；构建期适配现在收到 `roomCreated` 后调用上游既有“加入房间”处理，不改服务端房间或角色规则。真实浏览器已从大厅卡片进入预览，创建房间 `UF5LD`，并观察到本人 ID、房主 ID 与玩家列表正常出现。这仍是单真实浏览器预检，不计入真人验收人数。固定上游重放后客户端与服务端语法检查通过，Starliner 专项 3 项通过，完整回归 294 项通过。

同日邀请与重连会话增量：在实际 LAN HTTP 地址 `http://10.20.55.74:32123/g/starliner/?room=UF5LD` 点击“复制链接”，页面明确显示“已复制”；邀请 URL 只包含五位房间码，不含平台会话或长期身份凭据。该浏览器操作验证的是当前 Windows LAN 体验，不代表其他设备连通或断 WAN。协议测试进一步要求同一平台身份重连时旧 WebSocket 以 `4001` 关闭，后续动作只能由新连接发送，避免旧页面与刷新后页面同时控制同一座位；更新后的 Starliner 专项 3/3 通过。静态离线反例同时拒绝客户端脚本中的绝对 HTTP(S) 外链、STUN／TURN 地址及 HTML 外链资源，并断言 WebRTC 使用空 `iceServers`；同源协议拼接不属于外链。这只能证明当前构建产物没有显式公网引用，不能替代防火墙阻断 WAN 的运行验收。

同日客户端收口：构建期适配清理玩家列表空态、终局聊天和语音参与者标签中的剩余英文；出局玩家的紧急会议、触摸报告和触摸紧急会议按钮现在与桌面按钮一样立即禁用，服务端原有存活校验继续作为权威边界。固定提交重新生成、安装生产依赖并通过服务端／客户端语法检查及 Starliner 专项 3/3；验证后的客户端已同步到当前 LAN 预览包，HTTP 返回的新脚本包含中文空态和 `canPlay` 存活门控且不含 STUN／TURN。

同日运行时可用性门控：`/api/integrations` 不再把“环境变量已配置”直接等同于“游戏可启动”，而是并行探测对应回环 HTTP 端口，只在配置与实际响应同时成立时返回 `enabled:true`；响应另行区分 `configured` 和 `available`，不暴露本地目录。未配置、Starliner 子服务立即崩溃、固定上游正常运行三种状态共 5 项专项测试通过；子服务失败时大厅仍为 200、游戏路由为 503、卡片保持候选状态。

同日重连可见性与依赖收口：服务端公开投影新增 `connected`，玩家断线时立即向同房成员广播离线状态，同一平台身份回席后恢复在线标记；角色字段在断线、重连及广播中继续保持 `unknown`，只向本人单播角色。客户端玩家列表区分“存活／离线／出局”。房间码和角色洗牌改用 Node `crypto.randomInt` 的系统随机源，比赛 ID 改用内置 `randomUUID`。预览构建不再复制上游旧 `node_modules`，运行时复用大厅锁定的 `express@4.22.3` 与 `ws@8.21.0`，固定产物不再依赖 `uuid`；`npm audit --omit=dev` 在 2026-09-26 返回 0 项已知漏洞。四会话协议测试新增断线广播、在线恢复和掩码反例后仍为 3/3 通过。此处仍只是自动化协议证据，不替代真人、容器或阻断公网验收。

## 桌游式候选核验

`server/src/RoomManager.ts`、`GameStateFactory.ts`、`NightPhaseEngine.ts`、`ResolutionEngine.ts` 中存在房间、服务端配牌、夜间行动、同时投票和胜负计算。`server/src/roles.ts` 限制 **3–10 人**、总牌数为人数加三；这不是对 3–10 台真实设备的容量测试。服务端 `buildBoardSnapshot` 默认不输出未翻开的身份，个人角色使用 `role_assigned` 单播，公开状态与 `privateKnowledge` 分离。上述是源码路径检查，不等于对所有角色、重连、旁观和恶意请求的完整安全审计。

**明确缺口：** `RoomManager.handleJoinRoom` 对掉线座位允许仅凭相同昵称重连，并覆盖原 session token；陌生人可冒用昵称占用他人座位。必须取消昵称恢复、用平台登录／短期会话绑定座位，令旧连接失效并验证重连后的可见数据。重连时 `buildRoomStateSnapshot` 给本人 `privateKnowledge`，但没有重发 `role_assigned`，前端刷新后的本人角色恢复仍需测试／修复。当前无旁观者通道，不得把 `room_state_update` 直接复用为旁观快照。房间在内存中，结果没有平台持久化；未发现内置文字或语音频道，玩法依赖现场交流。README 称手机优先，前端源码有响应式布局，但**手机实际操作未测试**。`Dockerfile` 有单容器构建方案，不代表已验证 Docker 镜像和局域网离线运行。

本机执行：Node `v26.7.0` 下 `npm ci --ignore-scripts`、`npm run typecheck`、`npm run build` 通过；编译后的服务在 `127.0.0.1:30311` 返回 HTTP 200。未完成 WebSocket 真人对局、容器构建、手机验收或断公网验收。其最小复用范围为原房间／夜间规则／结算引擎，加一层身份授权、房间映射和服务端结果回调；不与 GameNest 的规则协议合并。

### 一夜狼人杀构建期预览适配（运行时门控）

2026-09-26 增量：`scripts/prepare-onenight.js` 固定复用 `hangyu-feng/onenight-werewolf@6a60bc96a72c6f93cb10938f970011f733a72df8`，保留上游 `GameStateFactory.ts`、`NightPhaseEngine.ts`、`ResolutionEngine.ts` 和 `roles.ts`，不重写配牌、夜间行动、投票或胜负规则。适配层把浏览器自报昵称／session token 替换为大厅注入的平台 UUID 与昵称；相同昵称的不同平台身份仍是不同座位，同一身份回席会以 `4001` 关闭旧连接。角色只由服务端向本人单播，重连时重发本人原始分配角色和私有知识；新身份在 `gameState` 存在期间（含结算阶段）一律拒绝，未开放旁观。恢复码撤销旧平台会话时，主进程通过 IPC 令子服务关闭该身份现有连接；未入房即断开的 WebSocket 也会清理身份映射。

`deploy/onenight-proxy.js` 提供同源 `/g/onenight/` 与 `/g/onenight/ws`，剥离浏览器 Cookie、Authorization 和伪造身份头后再注入平台身份。前端使用 `/g/onenight` 基础路径、同源 WebSocket、平台昵称、`?room=四位房间码` 自动回席、完整邀请链接和返回大厅入口。大厅只在 `ONENIGHT_DIR`、`ENABLE_ONENIGHT_PREVIEW=1` 且回环服务实际可用时把静态候选升级为可启动预览；默认 `final` 镜像不包含候选。`onenight-preview` 仅包含编译后的服务端与静态导出前端，运行时复用大厅锁定的 `express@4.22.3` 和 `ws@8.21.0`，不携带存在审计告警的 Next.js 构建依赖；`social-preview` 可同时包含 Starliner 与一夜狼人杀，仍需显式目标构建。

本机从固定提交重新生成后，`npm run typecheck` 与 `npm run build` 通过。`tests/onenight-preview.test.js` 通过大厅代理以三个独立平台会话（昵称相同）完成建房、入席、配置六张角色牌、夜间动作、讨论准备、投票和结算，断言每个连接只收到本人一条 `role_assigned`、公开座位无角色字段、新身份晚加入被拒、同身份新连接关闭旧连接并恢复同一角色、恢复码撤销旧连接后仍安全回席。终局由子服务通过 IPC 上报固定比赛 ID、规则配置、最终角色／阵营和胜方，主进程重新校验后按 `social-onenight`、`tabletop`、`onenight-adapter-v1`、人数、排序角色配置及最终 `winStrategy` 记录三名玩家的个人 `casual` 战绩；测试逐人核对参与次数、胜负和阵营，不进入竞技排行榜。`tests/prepare-onenight.test.js` 验证固定提交重放且四个上游规则文件逐字保留；`tests/onenight-failure.test.js` 验证子服务崩溃时大厅保持健康且入口返回 `503`。这些是自动化协议检查，不是三名真人现场讨论、手机、Docker、阻断公网验收；当前没有内置文字／语音，因此仍为默认关闭的桌游式补充预览，不能替代地图行动类需求。

## 上线和隐藏信息门槛

1. 地图行动类先找能够独立部署、保留地图／角色／同步／规则的项目；逐项复测上表十项。少于完整行动、报告讨论和胜负闭环时，仅可标“原型”，不展示为正式游戏。
2. 服务端维护 `internalState`，按 `playerId` 生成 `playerView`、`factionView`、`publicView`。白名单构造响应；未知字段默认不发送。任何 `room_joined`、开始、行动、刷新、重连、返回大厅再进入的响应都走同一投影，不把全体身份发给浏览器再由 UI 隐藏。
3. `public` 讨论对存活玩家开放；`faction` 仅允许仍具权限的阵营成员；`eliminated` 仅出局者。事件订阅和发送端都验证成员、阶段、身份，不以客户端声明的频道作为授权依据。无频道的上游项目先使用现场交流，不伪称具备私聊、文字或语音。
4. 默认禁止中途旁观。以后启用旁观时，仅提供不影响进行中对局的公开投影；终局揭牌要在服务器确定结束后发送。断线座位的恢复权不得由昵称、房间码、URL 参数单独取得。
5. 完成安全反例测试：抓取每类接收者的 WebSocket 帧，搜索其他玩家的 `roleId`／任务目标／阵营通信；尝试跨房间订阅、重复投票、替人移动或淘汰、冒名重连、晚加入、已出局发送行动、终局重复上报。
6. 真人验收至少达到候选规则要求的人数：创建、分配、移动／行动、任务、淘汰及报告、讨论、投票、胜负、结果落库、刷新与断线重连。服务器与每台玩家设备保留 LAN，阻断 WAN，以无缓存浏览器执行。自动脚本和机器人只能作为预检，不能替代这一门槛。

## 详情页的诚实标注

| 候选 | 类型 | 人数 | 手机 | 现场交流 | 内置文字／语音 | 战绩／排行榜 |
| --- | --- | --- | --- | --- | --- | --- |
| Starliner 预览 | 地图行动 | 代码 3–10；四及十会话协议预检、真人未测 | 触控源码存在，实机未测 | 建议现场交流 | 会议公共／破坏者阵营／出局文字频道仅协议预检；可选本地 WebRTC 语音未测 | 预览个人休闲战绩／无竞技榜；运行时门控预览 |
| onenight-werewolf | 桌游式 | 规则校验 3–10，真人未测 | README 声称手机优先，实测待做 | 需要 | 无／无 | 未接入／未接入 |

当前目录只保留 Starliner 与一夜狼人杀候选；此前的 `teerth123/Among-Us` 原型已按用户许可从产品目录、首页和当前候选表移除。历史源码筛查记录仅用于说明拒绝理由，不构成候选或接入入口。上述保留候选均不应标为正式上线；Starliner 只允许在管理员显式启用且本地路由实际可用时显示预览入口，其余保持禁用候选。只有通过对应级别验收才能改为正式卡片。
