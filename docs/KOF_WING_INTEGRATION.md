# 拳皇 Wing 1.85 局域网双人接入

## 当前结论

该接入复用用户提供的拳皇 Wing 1.85 SWF、角色、素材、战斗规则和 Ruffle 运行时，没有重写格斗引擎。平台只新增房间、身份、信令、远程 2P 输入和返回大厅适配。

当前状态为 `preview`：本机两个独立浏览器会话已进入原版“玩家 VS 玩家”战斗，访客方向输入可移动 2P，轻拳输入可映射为 Ruffle 收到的原版数字小键盘事件。该结果不等同于两台真实设备、真人、Docker 或阻断公网验收。

## 资源来源与固定版本

| 项目 | 记录 |
| --- | --- |
| 用户提供目录 | `kof_wing_1.85_html5` |
| 游戏 SWF SHA-256 | `6c45fdc725d4910da5335ed74b66b6540b4bbdeffb74602b7b6c49185bc6e297` |
| Ruffle | `@ruffle-rs/ruffle@0.6.0` |
| Ruffle 许可 | MIT 或 Apache-2.0 |
| 游戏 SWF 许可 | 未提供；默认只允许本地使用，不应公开再分发 |

`scripts/prepare-kof-wing.js` 会校验 SWF、预览图、Ruffle JavaScript 和 WASM 的固定指纹；任一文件不匹配即拒绝生成运行包。生成结果位于被 Git 忽略的 `output/kof-wing`，并写入 `gamenest-source.json`。

## 准备与启动

Windows PowerShell：

```powershell
npm run prepare:kof-wing -- `
  "C:\path\to\kof_wing_1.85_html5" `
  "output\kof-wing"
npm start
```

服务端默认探测 `output/kof-wing`。也可以显式指定绝对路径：

```powershell
$env:KOF_WING_DIR = "C:\absolute\path\to\prepared-kof-wing"
npm start
```

大厅通过 `/api/integrations` 检查资源包是否已配置且可用；资源缺失或指纹错误时不会把候选卡片升级为可启动预览。

Docker 构建上下文必须已经包含准备好的 `output/kof-wing`：

```powershell
docker build --target kof-wing-preview -t gamenest:kof-wing .
docker run --rm -p 3000:3000/tcp -p 3000:3000/udp -v gamenest-data:/data gamenest:kof-wing
```

TCP 提供大厅、资源和 WebSocket；同端口 UDP 提供只响应私有／回环地址的本地 STUN。遗漏 UDP 映射时大厅仍可打开，但跨设备画面可能无法协商。

## 双人网络模型

1. 房主创建 `KOF-XXXXXX` 房间；服务端以平台会话中的稳定玩家 ID 绑定房主席位。
2. 第二名玩家加入后，只有房主可以开始游戏；房间不允许第三人、中途加入或观战。
3. 房主浏览器运行唯一 SWF/Ruffle 实例，并捕获该实例的画面流。
4. 两端通过同源 WebSocket 交换 WebRTC 信令；大厅在同一端口的 UDP 上提供最小本地 STUN，只返回局域网可见地址，不连接公网 STUN/TURN。
5. 访客按键经 WebSocket 发送到房主；服务端只接受当前房间访客身份提交的白名单 2P 按键。
6. 房主页面把输入映射为原版 `Arrow*` 和 `Numpad1`—`Numpad6` 事件。断开连接时服务端要求房主释放全部远程按键，避免粘键。

此模型避免维护两份无法确定性同步的 Flash 实例，但也意味着房主浏览器和局域网链路决定访客画质与输入延迟。

## 操作

| 玩家 | 方向 | 轻拳／轻脚／闪避 | 重拳／重脚／爆气 |
| --- | --- | --- | --- |
| 房主 1P | 原游戏 1P 键位 | 原游戏 1P 键位 | 原游戏 1P 键位 |
| 访客 2P | 方向键或 WASD | `J` / `K` / `L` | `U` / `I` / `O` |

访客页面同时提供触屏按钮，但尚未在实体手机上验收。房主需先点击游戏画面，再在原版菜单中选择双人／玩家 VS 玩家。

## 已验证能力

- 平台身份建房、加入、满房拒绝、房主开局权限和断线回原席位。
- 同源 WebRTC offer/answer/ICE 信令转发，不配置公网 ICE 服务。
- 访客就绪后再生成 offer；页面广播不会重复触发协商，连接失败可手动重新协商。
- Ruffle 固定使用 Canvas 兼容渲染，并提供“重载游戏”按钮处理 Logo 后持续黑屏。
- 只允许访客提交白名单 2P 输入，断线会释放按键。
- 两个独立浏览器会话的局域网画面连接。
- 原版模式选择、角色选择、按键模式确认和实际战斗启动。
- 访客方向输入在房主权威实例中移动 2P；轻拳映射为 `Numpad1` 的 `keydown`/`keyup`。

## 未完成与限制

- 尚未由两名真人在两台局域网设备完成整局验收。
- 尚未在实体手机、Docker 容器和阻断公网条件下验收。
- 访客首期不接收声音，声音只在房主设备播放。
- 房主刷新会重建 SWF，无法恢复进行中的原版战斗状态；只能恢复平台房间席位。
- SWF 没有可靠、受服务端验证的结算接口，因此不记录战绩或排行榜。
- 无观战和中途加入；断线宽限只恢复席位，不恢复 Flash 内部战斗帧。
- WebRTC 在复杂 VLAN、客户端隔离或防火墙环境中可能无法直连；当前不会回退到公网 TURN。

## 相关文件

- `scripts/prepare-kof-wing.js`：资源指纹与本地运行包生成。
- `deploy/kof-wing-integration.js`：房间、身份、信令和输入授权。
- `public/kof-wing/`：房主／访客原生风格页面和控制器。
- `tests/kof-wing-room.test.js`：协议、权限、重连和资源验证回归。
