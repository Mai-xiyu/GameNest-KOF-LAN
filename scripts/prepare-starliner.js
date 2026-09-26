const fs = require('node:fs');
const path = require('node:path');

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node prepare-starliner.js SOURCE DESTINATION');

function replaceExact(text, before, after, count = 1) {
  const occurrences = text.split(before).length - 1;
  if (occurrences !== count) throw new Error(`Upstream changed: expected ${count} occurrences of ${before}, got ${occurrences}`);
  return text.replaceAll(before, after);
}

const sourceClient = fs.readFileSync(path.join(source, 'public/client.js'), 'utf8').replaceAll('\r\n', '\n');
const walls = sourceClient.match(/^const walls = \[[\s\S]*?^\];/m)?.[0];
const tasks = sourceClient.match(/^const tasks = \[[\s\S]*?^\];/m)?.[0];
if (!walls || !tasks || tasks.split('id:').length !== 6) throw new Error('Upstream map geometry changed');

let client = replaceExact(sourceClient, `
// Simple circle-rect collision
function circleRectCollide(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx, dy = cy - ny;
  return (dx*dx + dy*dy) <= r*r;
}
`, '');
client = replaceExact(client,
  "new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host)",
  "new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/g/starliner/ws')");
client = replaceExact(client, "const nameInput = $('#name');", `const nameInput = $('#name');
nameInput.readOnly = true;
fetch('/api/session', { method: 'POST' })
  .then(response => response.json())
  .then(player => { nameInput.value = player.nickname || ''; })
  .catch(() => {});`);
client = replaceExact(client, "const roomInput = $('#room');",
  "const roomInput = $('#room');\nroomInput.value = new URLSearchParams(location.search).get('room') || '';");
client = replaceExact(client, "const roomIdEl  = $('#roomId');", `const roomIdEl  = $('#roomId');
const inviteRow = $('#inviteRow');
const inviteLink = $('#inviteLink');
const copyInvite = $('#copyInvite');
const copyInviteStatus = $('#copyInviteStatus');`);
client = replaceExact(client, "statusBadge.style.marginLeft = '8px';\nstatusBadge.textContent = 'WS: connecting…';\ndocument.querySelector('h1')?.appendChild(statusBadge);",
  "statusBadge.textContent = 'WS: connecting…';\ndocument.querySelector('#connectionStatus').appendChild(statusBadge);");
client = replaceExact(client, "ws.addEventListener('open',  updateWsBadge);", `ws.addEventListener('open', () => {
  updateWsBadge();
  const roomId = new URLSearchParams(location.search).get('room');
  if (roomId && /^[A-Z0-9]{5}$/i.test(roomId)) {
    ws.send(JSON.stringify({ type: 'join', payload: { roomId } }));
  }
});`);
client = replaceExact(client, "ws.addEventListener('close', updateWsBadge);", `const reconnectButton = document.createElement('button');
reconnectButton.textContent = '重新连接';
reconnectButton.style.display = 'none';
reconnectButton.onclick = () => location.reload();
statusBadge.after(reconnectButton);
ws.addEventListener('close', () => {
  updateWsBadge();
  reconnectButton.style.display = 'inline-block';
});`);
client = replaceExact(client, "const chatInput = $('#chatInput');", `const chatInput = $('#chatInput');
const privateChat = $('#privateChat');
const privateChatTitle = $('#privateChatTitle');
const privateChatLog = $('#privateChatLog');
const privateChatInput = $('#privateChatInput');`);
client = replaceExact(client, "    roomIdEl.textContent = currentRoomId;", `    roomIdEl.textContent = currentRoomId;
    history.replaceState(null, '', '?room=' + encodeURIComponent(currentRoomId));
    const inviteURL = new URL(location.href);
    inviteURL.search = '';
    inviteURL.searchParams.set('room', currentRoomId);
    inviteLink.value = inviteURL.toString();
    inviteRow.hidden = false;`);
client = replaceExact(client, "  if (type === 'roomCreated') {", "  if (type === 'joinRejected') { taskHintEl.textContent = payload.message; }\n\n  if (type === 'roomCreated') {");
client = replaceExact(client, `  if (type === 'roomCreated') {
    roomInput.value = payload.roomId;
    roomIdEl.textContent = payload.roomId;
  }`, `  if (type === 'roomCreated') {
    roomInput.value = payload.roomId;
    roomIdEl.textContent = payload.roomId;
    btnJoin.click();
  }`);
client = replaceExact(client, "    const snap = payload.snapshot || {};", `    myCompletedTasks.clear();
    for (const taskId of payload.completedTasks || []) myCompletedTasks.add(taskId);
    doingTask = null;
    pendingTaskId = null;
    pointerHolding = false;
    const snap = payload.snapshot || {};`);
client = replaceExact(client, "    showGameArea(true);\n    if (phase === 'meeting') { buildVoteList(); showMeeting(true); stopVoice(); }",
  "    showGameArea(true);\n    if (phase === 'meeting') { buildVoteList(); showMeeting(true); stopVoice(); }\n    if (phase === 'ended' && snap.winner) showVictory(snap.winner);");
client = replaceExact(client, "iceServers:[{ urls:'stun:stun.l.google.com:19302' }]", 'iceServers:[]');
for (const [before, after] of [
  ['WS: connecting…', '连接中…'],
  ['WS: connected', '已连接'],
  ['WS: closing…', '连接关闭中…'],
  ['WS: closed', '连接已断开'],
  ["myRole==='sab'?'Saboteur':'Crew'", "myRole==='sab'?'破坏者':'船员'"],
  ['Dead players cannot chat', '出局玩家不能发送公共消息'],
  ['Type to chat…', '输入讨论消息…'],
  ['No one in kill range.', '附近没有可淘汰的玩家。'],
  ['Press E to do task: ', '按 E 执行任务：'],
  ['Attempting kill on ', '尝试淘汰：'],
  ["startsWith('Attempting kill')", "startsWith('尝试淘汰：')"],
  ['Connecting to server…', '正在连接服务器…'],
  ['Enter a room code', '请输入房间码'],
  ['Mic permission denied', '无法使用麦克风'],
  ["Type 'lights' or 'o2' to sabotage:", '破坏类型：lights 或 o2'],
  ["Fix O₂: type 'left' or 'right'", '修复氧气：输入 left 或 right'],
  ['Game Over:', '对局结束：'],
  ['System: ', '系统：'],
  [' win.', '获胜。'],
  ['🎉 Crew Victory!', '🎉 船员获胜！'],
  ['💀 Saboteurs Win!', '💀 破坏者获胜！'],
  ['All tasks were completed or all saboteurs were eliminated.', '所有任务完成或破坏者全部出局。'],
  ['Saboteurs reached parity or a sabotage succeeded.', '破坏者人数达到优势或破坏行动成功。'],
  ['Return to Lobby', '返回游戏首页'],
  ['Game Over', '对局结束'],
  ['Thanks for playing!', '感谢参与。'],
  ["'Mute'", "'静音'"],
  ["'Unmute'", "'取消静音'"],
  ['HOLDING…', '进行中…'],
  ['HOLD', '按住'],
  [' was ejected.', '被投票出局。'],
  ["p.alive?'alive':'dead'", "p.alive?'存活':'出局'"],
  ["p.alive?'':'(dead)'", "p.alive?'':'（出局）'"],
  ['Task: ${doingTask.label} — Hold E or press and hold the button', '任务：${doingTask.label} — 按住 E 或触摸按钮'],
]) {
  if (!client.includes(before)) throw new Error(`Upstream client text changed: ${before}`);
  client = replaceExact(client, before, after, client.split(before).length - 1);
}
client = replaceExact(client,
  "  appendChat(`🏁 对局结束： ${payload.winner.toUpperCase()}获胜。`);",
  "  appendChat(`🏁 对局结束：${payload.winner === 'crew' ? '船员' : '破坏者'}获胜。`);");
client = replaceExact(client, "playersEl.textContent='none';", "playersEl.textContent='暂无';");
client = replaceExact(client,
  "p.alive?'存活':'出局'",
  "p.alive ? (p.connected === false ? '离线' : '存活') : '出局'");
client = replaceExact(client, "tag.textContent='Voice: '+", "tag.textContent='语音：'+");
client = replaceExact(client, "btnEmergency.disabled = !(phase==='playing');", 'btnEmergency.disabled = !canPlay;');
client = replaceExact(client, "btnTouchReport.disabled = !(phase==='playing');", 'btnTouchReport.disabled = !canPlay;');
client = replaceExact(client, "btnTouchEmergency.disabled = !(phase==='playing');", 'btnTouchEmergency.disabled = !canPlay;');
client = replaceExact(client, "phaseEl.textContent = phase;", "phaseEl.textContent = ({ lobby: '等待', playing: '行动', meeting: '讨论投票', ended: '已结束' })[phase] || phase;", 2);
client = replaceExact(client, "phaseEl.textContent = 'ended';", "phaseEl.textContent = '已结束';");
client = replaceExact(client, "    phase = payload.phase || phase;", `    phase = payload.phase || phase;
    if (phase !== 'playing') { doingTask = null; pendingTaskId = null; pointerHolding = false; }`);
client = replaceExact(client, "  phase = 'ended';", "  phase = 'ended';\n  doingTask = null; pendingTaskId = null; pointerHolding = false;");
client = replaceExact(client,
  "  if (type === 'killed') { const p = players.get(payload.targetId); if (p) p.alive = false; refreshHudButtons(); }",
  "  if (type === 'killed') { const p = players.get(payload.targetId); if (p) p.alive = false; if (payload.targetId === myId) { doingTask = null; pendingTaskId = null; pointerHolding = false; } refreshHudButtons(); }");
client = replaceExact(client, "  if (type === 'tasks') {", `  if (type === 'taskStarted' && phase === 'playing' && payload.taskId === pendingTaskId) {
    const task = tasks.find(entry => entry.id === payload.taskId);
    pendingTaskId = null;
    if (task) {
      doingTask = {
        id: task.id, label: task.label, type: 'hold', neededMs: 2000,
        heldMs: 0, lastTs: performance.now(),
        button: { x: VIEW_W/2 - 120, y: VIEW_H/2 + 16, w: 240, h: 56 },
      };
      pointerHolding = false;
    }
  }
  if (type === 'taskRejected') {
    pendingTaskId = null; doingTask = null; pointerHolding = false;
    taskHintEl.textContent = '任务未被服务端确认，请靠近任务站重试。';
  }
  if (type === 'taskAccepted' && typeof payload.taskId === 'string') {
    myCompletedTasks.add(payload.taskId);
    pendingTaskId = null;
  }
  if (type === 'tasks') {`);
client = replaceExact(client, "let pointerHolding = false;", "let pointerHolding = false;\nlet pendingTaskId = null;");
client = replaceExact(client, `  if (!t || myCompletedTasks.has(t.id)) return;

  // open a "hold" task that needs exactly 2000ms of holding
doingTask = {
  id: t.id,
  label: t.label,
  type: 'hold',
  neededMs: 2000,
  heldMs: 0,
  lastTs: performance.now(),             // ← NEW: per-frame time anchor
  button: { x: VIEW_W/2 - 120, y: VIEW_H/2 + 16, w: 240, h: 56 }
};

  // reset any leftover pointer state
  pointerHolding = false;`, `  if (!t || myCompletedTasks.has(t.id) || doingTask || pendingTaskId) return;
  pendingTaskId = t.id;
  ws.send(JSON.stringify({ type: 'beginTask', payload: { taskId: t.id } }));`);
client = replaceExact(client, "    myCompletedTasks.add(doingTask.id);\n    ws.send(JSON.stringify({ type:'taskComplete', payload:{ taskId: doingTask.id } }));",
  "    pendingTaskId = doingTask.id;\n    ws.send(JSON.stringify({ type:'taskComplete', payload:{ taskId: doingTask.id } }));");
client = replaceExact(client, 'ctx.fillRect(0,0,canvas.width,canvas.height);',
  'ctx.fillRect(0,0,VIEW_W,VIEW_H);');
client = replaceExact(client, 'canvas.width/2, canvas.height/2 - 40',
  'VIEW_W/2, VIEW_H/2 - 40');
client = replaceExact(client,
  'const bw = 420, bh = 16, bx = canvas.width/2 - bw/2, by = canvas.height/2 - 6;',
  'const bw = 420, bh = 16, bx = VIEW_W/2 - bw/2, by = VIEW_H/2 - 6;');
client = replaceExact(client, `  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top)  * (canvas.height / rect.height);`,
  '  const { x: px, y: py } = toViewXY(e);');
client = replaceExact(client, 'VIEW_SCALE * (window.devicePixelRatio || 1)',
  'VIEW_SCALE * Math.max(1, Math.min(3, window.devicePixelRatio || 1))', 2);
client = replaceExact(client,
  "  if (type === 'chat') appendChat(`<b>${escapeHtml(payload.from)}:</b> ${escapeHtml(payload.text)}`);",
  `  if (type === 'chat') {
    const target = phase === 'meeting' ? chatBox : privateChatLog;
    const label = { public: '讨论', faction: '阵营', eliminated: '出局' }[payload.channel];
    if (!label) return;
    const line = document.createElement('div');
    line.textContent = '[' + label + '] ' + payload.from + ': ' + payload.text;
    target.appendChild(line);
    target.scrollTop = target.scrollHeight;
  }`);
client = replaceExact(client, `chatInput?.addEventListener('keydown', e => {
  if (e.key==='Enter' && phase==='meeting' && isMeAlive()) {
    const t = chatInput.value.trim(); chatInput.value = '';
    if (t) ws.send(JSON.stringify({ type:'chat', payload:{ text:t } }));
  }
});`, `chatInput?.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || phase !== 'meeting' || !players.has(myId)) return;
  const text = chatInput.value.trim(); chatInput.value = '';
  if (text) ws.send(JSON.stringify({ type: 'chat', payload: {
    channel: isMeAlive() ? 'public' : 'eliminated', text,
  } }));
});
privateChatInput?.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || phase !== 'playing' || !players.has(myId)) return;
  const text = privateChatInput.value.trim(); privateChatInput.value = '';
  if (text) ws.send(JSON.stringify({ type: 'chat', payload: {
    channel: isMeAlive() ? 'faction' : 'eliminated', text,
  } }));
});`);
client = replaceExact(client, `  chatInput.disabled = !(phase==='meeting' && meAlive);
  chatInput.placeholder = (phase==='meeting' && !meAlive) ? '出局玩家不能发送公共消息' : '输入讨论消息…';`, `  chatInput.disabled = !(phase === 'meeting' && players.has(myId));
  chatInput.placeholder = meAlive ? '输入公共讨论消息…' : '输入出局玩家消息…';
  voteSkip.disabled = !(phase === 'meeting' && meAlive);
  const channel = phase === 'playing' && players.has(myId) ?
    (meAlive && myRole === 'sab' ? 'faction' : !meAlive ? 'eliminated' : null) : null;
  privateChat.style.display = channel ? 'block' : 'none';
  privateChatTitle.textContent = channel === 'faction' ? '破坏者阵营频道' : '出局玩家频道';
  privateChatInput.disabled = !channel;`);
client = replaceExact(client, `btnFix.onclick = () => {
  if (phase!=='playing' || !sabotage.type) return;
  if (sabotage.type==='lights') ws.send(JSON.stringify({ type:'fixSabotage' }));
  else if (sabotage.type==='o2') {
    const side = prompt("修复氧气：输入 left 或 right", "left");
    ws.send(JSON.stringify({ type:'fixSabotage', payload:{ side: (side||'left').toLowerCase()==='right'?'right':'left' } }));
  }
};`, `btnFix.onclick = () => {
  if (phase!=='playing' || !sabotage.type) return;
  const me = players.get(myId);
  const stationId = me ? nearestTask(me.x, me.y, 40)?.id : null;
  if (sabotage.type==='lights') {
    if (stationId !== 'wires-upper-left') return alert('请前往左上方线路站修复灯光。');
    ws.send(JSON.stringify({ type:'fixSabotage' }));
    return;
  }
  const side = stationId === 'engine-lower-left' ? 'left' :
    stationId === 'shields-lower-right' ? 'right' : null;
  if (!side) return alert('请前往左下方引擎或右下方护盾站修复氧气。');
  ws.send(JSON.stringify({ type:'fixSabotage', payload:{ side } }));
};`);
for (const [before, after] of [
  ['Fix Wiring', '修复线路'],
  ['Align Navigation', '校准导航'],
  ['Medbay Scan', '医疗扫描'],
  ['Calibrate Engine', '校准引擎'],
  ['Prime Shields', '启动护盾'],
]) client = replaceExact(client, before, after);
client = replaceExact(client, `/* ===== UI ===== */
btnCreate.onclick = () => {`, `/* ===== UI ===== */
copyInvite.onclick = async () => {
  if (!inviteLink.value) return;
  try {
    if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(inviteLink.value);
    } else {
      inviteLink.focus();
      inviteLink.select();
      if (!document.execCommand('copy')) throw new Error('copy unavailable');
    }
    copyInviteStatus.textContent = '已复制';
  } catch {
    inviteLink.focus();
    inviteLink.select();
    copyInviteStatus.textContent = '请手动复制';
  }
};
btnCreate.onclick = () => {`);
client = replaceExact(client,
  'window.location.href = window.location.origin + window.location.pathname;',
  "window.location.assign('/');");
const duplicateOverlayStart = client.indexOf('function ensureVictoryOverlay() {');
const uiStart = client.indexOf('/* ===== UI ===== */', duplicateOverlayStart);
if (duplicateOverlayStart < 0 || uiStart < 0 ||
    client.split('function ensureVictoryOverlay() {').length !== 3 ||
    client.split('function showVictory(winner)').length !== 3) {
  throw new Error('Upstream victory overlay implementation changed');
}
client = client.slice(0, duplicateOverlayStart) + client.slice(uiStart);

let html = fs.readFileSync(path.join(source, 'public/index.html'), 'utf8').replaceAll('\r\n', '\n');
html = replaceExact(html, '  <div class="wrap">\n    <h1>', `  <div class="wrap">
    <div class="row" style="justify-content:space-between">
      <span id="connectionStatus"></span>
      <a href="/" style="color:#e5e7eb;padding:8px 12px;border:1px solid rgba(255,255,255,.15);border-radius:8px">返回大厅</a>
    </div>
    <h1>`);
html = replaceExact(html, '  <script src="./client.js"></script>\n</body>\n</html>\n\n<!-- Victory overlay -->', '  <!-- Victory overlay -->');
if (!html.endsWith('</div>\n')) throw new Error('Upstream victory overlay markup changed');
html += '  <script src="./client.js"></script>\n</body>\n</html>\n';
html = replaceExact(html, 'Meeting ends when everyone alive has voted.', 'Meeting ends when everyone alive votes or after two minutes.');
for (const [before, after] of [
  ['<html>', '<html lang="zh-CN">'],
  ['Starliner: Trust No One', 'Starliner：谁是破坏者'],
  ['Pick a color/hat/skin, create/join a room, and start. Voice only during meetings.', '选择外观，创建或加入房间。语音仅在会议期间可用，且不是开局必需项。'],
  ['<label>Name</label>', '<label>昵称（以大厅身份为准）</label>'],
  ['placeholder="Awais"', 'placeholder="使用大厅身份"'],
  ['<label>Room</label>', '<label>房间码</label>'],
  ['<label>Color</label>', '<label>颜色</label>'],
  ['<label>Hat</label>', '<label>帽子</label>'],
  ['<label>Skin</label>', '<label>服装</label>'],
  ['>None</option>', '>无</option>'],
  ['>Cap</option>', '>鸭舌帽</option>'],
  ['>Crown</option>', '>皇冠</option>'],
  ['>Flower</option>', '>花朵</option>'],
  ['>Extra Visor</option>', '>护目镜</option>'],
  ['>Stripe</option>', '>条纹</option>'],
  ['>Overalls</option>', '>背带裤</option>'],
  ['>Suit</option>', '>西装</option>'],
  ['>Create Room</button>', '>创建房间</button>'],
  ['>Join Room</button>', '>加入房间</button>'],
  ['>Start Game (Host)</button>', '>房主开始游戏</button>'],
  ['Room ID:', '房间码：'],
  ['Your ID:', '我的 ID：'],
  ['Host ID:', '房主 ID：'],
  ['Phase:', '阶段：'],
  ['Your Role:', '我的身份：'],
  ['Tasks:', '任务：'],
  ['Players:', '玩家：'],
  ['>Report</button>', '>报告尸体</button>'],
  ['>Emergency</button>', '>紧急会议</button>'],
  ['>Kill</button>', '>淘汰</button>'],
  ['>Sabotage</button>', '>破坏</button>'],
  ['>Fix</button>', '>修复</button>'],
  ['Move with WASD. Press <b>E</b> to do tasks at yellow stations. Collision enabled.', '使用 WASD 移动，靠近黄色任务站按 <b>E</b> 完成任务。灯光在线路站、氧气在引擎和护盾站修复。'],
  ['>Task</button>', '>任务</button>'],
  ['Emergency Meeting', '紧急会议'],
  ['Type to chat…', '输入讨论消息…'],
  ['>Join Voice</button>', '>加入语音</button>'],
  ['>Mute</button>', '>静音</button>'],
  ['>Leave</button>', '>离开语音</button>'],
  ['>Skip</button>', '>弃票</button>'],
  ['Meeting ends when everyone alive votes or after two minutes.', '所有存活玩家投票后结束；两分钟无人完成则按弃票处理。'],
  ['>Game Over</h2>', '>对局结束</h2>'],
  ['Thanks for playing!', '感谢参与。'],
  ['>Return to Lobby</button>', '>返回大厅</button>'],
]) {
  if (!html.includes(before)) throw new Error(`Upstream HTML text changed: ${before}`);
  html = replaceExact(html, before, after, html.split(before).length - 1);
}
html = replaceExact(html, '<b id="phase">lobby</b>', '<b id="phase">等待</b>');
html = replaceExact(html, '<b id="role">unknown</b>', '<b id="role">未分配</b>');
html = replaceExact(html, '<span id="players" class="muted">none</span>', '<span id="players" class="muted">暂无</span>');
html = replaceExact(html, '<div>房间码： <b id="roomId">-</b></div>', `<div>房间码： <b id="roomId">-</b></div>
      <div id="inviteRow" hidden style="margin-top:8px">
        <label for="inviteLink">邀请链接</label>
        <input id="inviteLink" type="text" readonly style="width:min(100%,520px)" />
        <button id="copyInvite" type="button">复制链接</button>
        <span id="copyInviteStatus" class="muted" aria-live="polite"></span>
      </div>`);
html = replaceExact(html, '<!-- Mobile controls (shown on phones) -->', `<div id="privateChat" class="box" style="display:none;max-width:940px;margin:8px auto">
  <b id="privateChatTitle"></b>
  <div id="privateChatLog" style="height:100px;overflow:auto"></div>
  <input id="privateChatInput" type="text" maxlength="240" style="width:95%" placeholder="输入消息后按回车发送" />
</div>
<!-- Mobile controls (shown on phones) -->`);

let server = fs.readFileSync(path.join(source, 'server.js'), 'utf8').replaceAll('\r\n', '\n');
server = replaceExact(server, "import { v4 as uuid } from 'uuid';", "import { randomInt, randomUUID } from 'node:crypto';\nimport { validMove, validTask, nearBody, validRepair, tasksPerCrew } from './starliner-rules.mjs';");
server = replaceExact(server, "app.listen(PORT, () => {", "app.listen(PORT, '127.0.0.1', () => {");
server = replaceExact(server, 'new WebSocketServer({ server })', "new WebSocketServer({ server, path: '/ws', maxPayload: 16384 })");
server = replaceExact(server, 'function roomSnapshot(room, maskRoles = true) {', 'function roomSnapshot(room) {');
server = replaceExact(server, "role: maskRoles ? 'unknown' : p.role", "role: 'unknown'");
server = replaceExact(server,
  "      skin: p.skin,\n      role: 'unknown'",
  "      skin: p.skin,\n      connected: Boolean(p.ws && p.ws.readyState === 1),\n      role: 'unknown'");
server = replaceExact(server, `function assignRoles(room) {
  const ids = [...room.players.keys()];
  const sabCount = Math.max(1, Math.floor(ids.length / 5));
  const shuffled = ids.sort(() => Math.random() - 0.5);
  for (const id of ids) room.players.get(id).role = 'crew';
  for (let i = 0; i < sabCount; i++) room.players.get(shuffled[i]).role = 'sab';
}`, `function assignRoles(room) {
  const shuffled = [...room.players.keys()];
  const sabCount = Math.max(1, Math.floor(shuffled.length / 5));
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  for (const player of room.players.values()) player.role = 'crew';
  for (let index = 0; index < sabCount; index++) room.players.get(shuffled[index]).role = 'sab';
}`);
server = replaceExact(server, "    const { type, payload } = msg;", "    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;\n    const { type, payload } = msg;");
server = replaceExact(server, "      const kind = (payload?.kind || '').toLowerCase();",
  "      const kind = typeof payload?.kind === 'string' ? payload.kind.toLowerCase() : '';");

server = replaceExact(server, "  room.phase = 'ended';\n  broadcast(room, 'gameEnded', { winner });", `  room.phase = 'ended';
  room.winner = winner;
  broadcast(room, 'gameEnded', { winner });
  if (process.send && room.matchId) process.send({
    type: 'starliner-finished', matchId: room.matchId, roomId: room.roomId,
    startedAt: room.startedAt, winner,
    players: [...room.players.values()].map(player => ({
      playerId: player.id, nickname: player.name, faction: player.role,
    })),
  });`);
server = replaceExact(server, "    phase: room.phase,\n    sabotage: room.sabotage,",
  "    phase: room.phase,\n    winner: room.phase === 'ended' ? room.winner : undefined,\n    sabotage: room.sabotage,");
server = replaceExact(server, "wss.on('connection', (ws) => {", `function finishMeeting(room) {
  if (room.phase !== 'meeting') return;
  for (const player of room.players.values()) {
    if (player.alive && !room.votes.has(player.id)) room.votes.set(player.id, null);
  }
  const out = tallyVotes(room);
  if (out !== 'skip') {
    const expelled = room.players.get(out);
    if (expelled) expelled.alive = false;
    broadcast(room, 'expelled', { playerId: out, name: expelled?.name || 'Unknown' });
    const win = checkWin(room); if (win) { endGame(room, win); return; }
  }
  room.phase = 'playing';
  broadcast(room, 'phase', roomSnapshot(room));
}

wss.on('connection', (ws) => {`);
server = replaceExact(server, "wss.on('connection', (ws) => {\n  const playerId = uuid();", `wss.on('connection', (ws, request) => {
  const playerId = request.headers['x-gamenest-player'];
  const encodedName = request.headers['x-gamenest-name'];
  if (typeof playerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(playerId) ||
      typeof encodedName !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(encodedName)) {
    ws.close(1008, 'Platform session required');
    return;
  }
  const displayName = Buffer.from(encodedName, 'base64url').toString('utf8');`);
server = replaceExact(server, `      const rid = (Math.random().toString(36).slice(2, 7)).toUpperCase();
      ensureRoom(rid);
      send('roomCreated'`, `      if (joinedRoomId || createdRoomId) return;
      let rid;
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      do { rid = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(rid));
      const created = ensureRoom(rid);
      created.roomId = rid;
      created.hostId = playerId;
      created.createdAt = Date.now();
      createdRoomId = rid;
      send('roomCreated'`);
server = replaceExact(server, '  let joinedRoomId = null;', '  let joinedRoomId = null;\n  let createdRoomId = null;');

const joinStart = server.indexOf("    if (type === 'join') {");
const joinEnd = server.indexOf("\n    const room = joinedRoomId ?", joinStart);
if (joinStart < 0 || joinEnd < 0) throw new Error('Upstream join implementation changed');
server = server.slice(0, joinStart) + `    if (type === 'join') {
      const { roomId, color, hat, skin } = payload || {};
      if (typeof roomId !== 'string' || !/^[A-Z0-9]{5}$/.test(roomId.toUpperCase())) {
        send('joinRejected', { message: '房间码格式无效' });
        return;
      }
      const rid = roomId.toUpperCase();
      const room = rooms.get(rid);
      if (!room || (joinedRoomId && joinedRoomId !== rid) ||
          (createdRoomId && createdRoomId !== rid)) {
        send('joinRejected', { message: '房间不存在或当前连接已进入其他房间' });
        return;
      }
      const existing = room.players.get(playerId);
      if (room.phase !== 'lobby' && !existing) {
        send('joinRejected', { message: '对局已开始，不能中途加入或观战' });
        return;
      }
      if (existing) {
       if (existing.ws && existing.ws !== ws) existing.ws.close(4001, 'Reconnected elsewhere');
       existing.ws = ws;
       existing.disconnectedAt = null;
       existing.activeTask = null;
       joinedRoomId = rid;
        send('joined', { roomId: rid, playerId, isHost: room.hostId === playerId,
          completedTasks: [...existing.doneTasks], snapshot: roomSnapshot(room) });
        if (room.phase !== 'lobby') send('role', { role: existing.role });
        broadcast(room, 'players', roomSnapshot(room));
        return;
      }
      if (room.players.size >= 10) {
        send('joinRejected', { message: '房间已满' });
        return;
      }
      const validHex = value => typeof value === 'string' && /^#?[0-9a-fA-F]{6}$/.test(value);
      const normHex = (value, fallback) => validHex(value) ? (value[0] === '#' ? value : '#' + value) : fallback;
      room.players.set(playerId, {
        id: playerId, name: displayName.slice(0, 18), x: 400, y: 300,
        alive: true, role: 'crew', color: normHex(color, '#7dd3fc'),
        hat: ['none','cap','crown','flower','visor'].includes(hat) ? hat : 'none',
        skin: ['none','stripe','overalls','suit'].includes(skin) ? skin : 'none',
        killReadyAt: Date.now(), doneTasks: new Set(), lastMoveAt: Date.now(),
        meetingsCalled: 0, ws,
      });
      joinedRoomId = rid;
      send('joined', { roomId: rid, playerId, isHost: room.hostId === playerId,
        completedTasks: [], snapshot: roomSnapshot(room) });
      broadcast(room, 'players', roomSnapshot(room));
      return;
    }
` + server.slice(joinEnd);

server = replaceExact(server, "    if (!room) return;\n\n    if (type === 'startGame')", "    if (!room || room.players.get(playerId)?.ws !== ws) return;\n\n    if (type === 'startGame')");
server = replaceExact(server, "      if (room.players.size < 3) return;", "      if (room.phase !== 'lobby' || room.players.size < 3 || [...room.players.values()].some(player => !player.ws)) return;");
server = replaceExact(server, "      const tasksPerPlayer = 2;\n      room.totalTasks = tasksPerPlayer * room.players.size;", "      room.totalTasks = tasksPerCrew * [...room.players.values()].filter(player => player.role === 'crew').length;\n      room.bodies = [];\n      room.matchId = randomUUID();\n      room.startedAt = Date.now();");
server = replaceExact(server, "        p.doneTasks = new Set();", "        p.doneTasks = new Set();\n        p.activeTask = null;\n        p.meetingsCalled = 0;");
server = replaceExact(server, `      if (typeof x !== 'number' || typeof y !== 'number') return;
      p.x = Math.max(20, Math.min(980, x));
      p.y = Math.max(20, Math.min(580, y));`, `      const now = Date.now();
      if (!validMove(p, x, y, now)) {
        send('pos', { id: playerId, x: p.x, y: p.y });
        return;
      }
       p.x = x;
       p.y = y;
       p.lastMoveAt = now;
       if (p.activeTask && !validTask(p, p.activeTask.id)) p.activeTask = null;`);
server = replaceExact(server, "      if (!victim || !victim.alive) return;", "      if (!victim || !victim.alive || victim.role === 'sab') return;");
server = replaceExact(server, "      victim.alive = false;\n      killer.killReadyAt", "      victim.alive = false;\n      victim.activeTask = null;\n      room.bodies.push({ x: victim.x, y: victim.y });\n      killer.killReadyAt");
server = replaceExact(server, "      if (!room.sabotage.type) return;", "      const fixer = room.players.get(playerId);\n      if (!fixer?.alive || !validRepair(fixer, room.sabotage.type, payload?.side)) return;");
server = replaceExact(server, "        const side = payload?.side === 'right' ? 'right' : 'left';", "        const side = payload.side;");
server = replaceExact(server, `    if ((type === 'report' || type === 'callMeeting') && room.phase === 'playing') {
      room.phase = 'meeting';
      room.votes = new Map();
      broadcast(room, 'phase', roomSnapshot(room));
      return;
    }`, `    if ((type === 'report' || type === 'callMeeting') && room.phase === 'playing') {
      const player = room.players.get(playerId);
      if (!player?.alive) return;
      if (type === 'report' && !nearBody(player, room.bodies)) return;
      if (type === 'callMeeting' && player.meetingsCalled >= 1) return;
       if (type === 'callMeeting') player.meetingsCalled++;
       for (const participant of room.players.values()) participant.activeTask = null;
       room.bodies = [];
      room.phase = 'meeting';
      room.meetingEndsAt = Date.now() + 120000;
      room.votes = new Map();
      broadcast(room, 'phase', roomSnapshot(room));
      return;
    }`);
server = replaceExact(server, "      if (targetId && !room.players.has(targetId)) return;", "      if (targetId && !room.players.get(targetId)?.alive) return;\n      if (room.votes.has(playerId)) return;");
server = replaceExact(server, `    // Meeting chat — alive only
    if (type === 'chat' && room.phase === 'meeting') {
      const sender = room.players.get(playerId);
      if (!sender || !sender.alive) return;
      const text = (payload?.text || '').toString().slice(0, 240);
      if (text.trim()) broadcast(room, 'chat', { from: sender.name, text });
      return;
    }`, `    if (type === 'chat') {
      const sender = room.players.get(playerId);
      const channel = payload?.channel ?? 'public';
      const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 240) : '';
      if (!sender || !text || Date.now() - (sender.lastChatAt || 0) < 500) return;
      if (channel === 'public' && (room.phase !== 'meeting' || !sender.alive)) return;
      if (channel === 'faction' && (room.phase !== 'playing' || !sender.alive || sender.role !== 'sab')) return;
      if (channel === 'eliminated' && ((room.phase !== 'playing' && room.phase !== 'meeting') || sender.alive)) return;
      if (!['public', 'faction', 'eliminated'].includes(channel)) return;
      sender.lastChatAt = Date.now();
      const packet = JSON.stringify({ type: 'chat', payload: { channel, from: sender.name, text } });
      for (const recipient of room.players.values()) {
        if (channel === 'public' && !recipient.alive) continue;
        if (channel === 'faction' && (!recipient.alive || recipient.role !== 'sab')) continue;
        if (channel === 'eliminated' && recipient.alive) continue;
        if (recipient.ws?.readyState === 1) recipient.ws.send(packet);
      }
      return;
    }`);
server = replaceExact(server, `      const aliveIds = [...room.players.values()].filter(p => p.alive).map(p => p.id);
      if (room.votes.size >= aliveIds.length) {
        const out = tallyVotes(room);
        if (out !== 'skip') {
          const expelled = room.players.get(out);
          if (expelled) expelled.alive = false;
          broadcast(room, 'expelled', { playerId: out, name: expelled?.name || 'Unknown' });
          const win = checkWin(room); if (win) { endGame(room, win); return; }
        }
        room.phase = 'playing';
        broadcast(room, 'phase', roomSnapshot(room));
      }`, `      const aliveCount = [...room.players.values()].filter(player => player.alive).length;
      if (room.votes.size >= aliveCount) finishMeeting(room);`);
server = replaceExact(server, "    if (room.phase !== 'playing') continue;\n    if (room.sabotage?.type === 'o2'", "    if (room.phase === 'meeting' && now >= room.meetingEndsAt) finishMeeting(room);\n    if (room.phase !== 'playing') continue;\n    if (room.sabotage?.type === 'o2'");
server = replaceExact(server, "    // ===== Tasks =====", `    if (type === 'beginTask' && room.phase === 'playing') {
      const player = room.players.get(playerId);
      const taskId = payload?.taskId;
      if (!player?.alive || player.role !== 'crew' ||
          typeof taskId !== 'string' || !validTask(player, taskId)) {
        send('taskRejected', { taskId });
        return;
      }
      player.activeTask = { id: taskId, startedAt: Date.now() };
      send('taskStarted', { taskId });
      return;
    }

    // ===== Tasks =====`);
server = replaceExact(server, `      const id = (payload?.taskId || '').toString();
      if (!id || p.doneTasks.has(id)) return;`, `      const id = payload?.taskId;
      if (typeof id !== 'string' || !validTask(p, id) ||
          p.activeTask?.id !== id || Date.now() - p.activeTask.startedAt < 2000) {
        p.activeTask = null;
        send('taskRejected', { taskId: id });
        return;
      }`);
server = replaceExact(server, "      p.doneTasks.add(id);", "      p.activeTask = null;\n      p.doneTasks.add(id);\n      send('taskAccepted', { taskId: id });");

const closeStart = server.indexOf("  ws.on('close', () => {");
const closeEnd = server.indexOf("\n});\n\n// O₂ timeout", closeStart);
if (closeStart < 0 || closeEnd < 0) throw new Error('Upstream disconnect implementation changed');
server = server.slice(0, closeStart) + `  ws.on('close', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    const player = room?.players.get(playerId);
    if (!player || player.ws !== ws) return;
    player.ws = null;
    player.disconnectedAt = Date.now();
    if (room.phase === 'lobby') {
      if (room.hostId === playerId) room.hostId = [...room.players.values()].find(entry => entry.ws)?.id || playerId;
    }
    broadcast(room, 'players', roomSnapshot(room));
  });` + server.slice(closeEnd);
server = replaceExact(server, '// O₂ timeout', `process.on('message', message => {
  if (message?.type !== 'revoke-player') return;
  for (const room of rooms.values()) room.players.get(message.playerId)?.ws?.close(4001, 'Session revoked');
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.phase === 'playing' || room.phase === 'meeting') continue;
    let changed = false;
    for (const [id, player] of room.players) {
      if (!player.ws && now - player.disconnectedAt > 300000) {
        room.players.delete(id);
        changed = true;
      }
    }
    if (changed) {
      if (!room.players.has(room.hostId)) room.hostId = [...room.players.keys()][0] || null;
      broadcast(room, 'players', roomSnapshot(room));
    }
    if (!room.players.size && now - room.createdAt > 300000) rooms.delete(roomId);
  }
}, 60000).unref();

// O₂ timeout`);

fs.mkdirSync(path.join(destination, 'public'), { recursive: true });
fs.writeFileSync(path.join(destination, 'geometry.mjs'),
  `${walls.replace('const walls', 'export const walls')}\n${tasks.replace('const tasks', 'export const tasks')}\n`);
fs.copyFileSync(path.join(__dirname, '../deploy/starliner-rules.mjs'), path.join(destination, 'starliner-rules.mjs'));
fs.writeFileSync(path.join(destination, 'server.js'), server);
fs.writeFileSync(path.join(destination, 'public/client.js'), client);
fs.writeFileSync(path.join(destination, 'public/index.html'), html);
for (const name of ['ship_map.png']) fs.copyFileSync(path.join(source, 'public', name), path.join(destination, 'public', name));
fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({
  name: 'gamenest-starliner-adapter',
  version: '1.0.0',
  private: true,
  type: 'module',
  engines: { node: '>=24' },
}, null, 2) + '\n');
