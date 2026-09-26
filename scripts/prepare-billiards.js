const fs = require('node:fs');
const path = require('node:path');

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node prepare-billiards.js SOURCE DESTINATION');

function replaceExact(text, before, after, count) {
  const occurrences = text.split(before).length - 1;
  if (occurrences !== count) throw new Error(`Upstream changed: expected ${count} occurrences of ${before}, got ${occurrences}`);
  return text.replaceAll(before, after);
}

const sourceHtml = fs.readFileSync(path.join(source, 'billiards.html'), 'utf8');
const sourceEol = sourceHtml.includes('\r\n') ? '\r\n' : '\n';
const sourceBlock = text => text.replaceAll('\n', sourceEol);
let html = replaceExact(sourceHtml, '/api/', '/g/billiards/api/', 9);
html = replaceExact(html, '/ws?room_id=', '/g/billiards/ws?room_id=', 1);
html = replaceExact(html, '</body>', '<a href="/" style="position:fixed;top:8px;left:8px;z-index:9999;background:#173222;color:white;padding:8px;border-radius:8px">返回大厅</a></body>', 1);
html = replaceExact(html, '@media (any-pointer: coarse)', '@media (pointer: coarse)', 3);
html = replaceExact(html, 'const coarseQuery = matchMedia("(any-pointer: coarse)");', 'const coarseQuery = matchMedia("(pointer: coarse)");', 1);
html = replaceExact(html, 'coarseQuery.matches || navigator.maxTouchPoints > 0', 'coarseQuery.matches', 2);
html = replaceExact(html,
  '  .mobile-controls { display: none; }',
  '  .mobile-controls { display: grid; grid-template-columns: minmax(0,1fr) 92px; gap: 8px; align-items: center; padding: 8px 0; }', 1);
html = replaceExact(html,
  '  #focusBtn { border: 1px solid rgba(216,180,90,.4);',
  '  #focusBtn { display: none; border: 1px solid rgba(216,180,90,.4);', 1);
html = replaceExact(html,
  '    .desktop-hint { display: none; }',
  `    #focusBtn { display: block; }
    .desktop-hint { display: none; }`, 1);
html = replaceExact(html,
  'function actionId(prefix) { return `${prefix}-${crypto.randomUUID().replaceAll("-", "")}`; }',
  `function actionId(prefix) {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  return prefix + "-" + Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}`, 1);
html = replaceExact(html,
  '<em>移动鼠标</em> 瞄准 · <em>按住左键</em> 蓄力（来回摆动）· <em>松开</em> 出杆',
  '<em>在球桌上拖动鼠标</em> 调整并锁定角度 · <em>调节力度</em> · 点击 <em>击球</em>', 2);
html = replaceExact(html,
  '<em>Move the mouse</em> to aim · <em>Hold the left button</em> for power · <em>Release</em> to shoot',
  '<em>Drag on the table</em> to set and lock aim · <em>choose power</em> · press <em>Shoot</em>', 1);
html = replaceExact(html,
  '  if (activePointer === null && e.pointerType !== "mouse") return;',
  '  if (activePointer === null && (e.pointerType !== "mouse" || state !== "placement")) return;', 1);
html = replaceExact(html,
  '      if (state === "aim" || state === "charge") aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);',
  '      if (state === "aim") aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);', 1);
html = replaceExact(html,
  '  if (e.pointerType === "mouse" && state === "aim") { state = "charge"; charging = true; chargeDir = 1; power = 0; }',
  '  if (e.pointerType === "mouse" && state === "aim") { mouse = toLocal(e); aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x); }', 1);
html = replaceExact(html,
  [
    '  if (e.pointerType === "mouse" && state === "charge") {',
    '    charging = false;',
    '    if (power > 0.05) { state = "aim"; requestShot(); }',
    '    else state = "aim";',
    '  }',
    '',
  ].join(sourceEol), '', 1);
html = replaceExact(html,
  'const online = { room: null, ws: null, retry: 0, retryTimer: 0, replayTimer: 0, reconnectUntil: 0, pending: new Map(), rackId: null, appliedSnapshot: "", appliedEvents: new Set(), inputLocked: false, placementSending: false, placementNotice: "", leaveSubmitting: false, authorityShotId: null, queuedSnapshot: null, snapshotSending: false, decisionId: null, intentionalClose: false, pauseUntil: 0 };',
  'const online = { room: null, ws: null, retry: 0, retryTimer: 0, replayTimer: 0, reconnectUntil: 0, pending: new Map(), rackId: null, appliedSnapshot: "", appliedEvents: new Set(), inputLocked: false, placementSending: false, placementNotice: "", leaveSubmitting: false, authorityShotId: null, queuedSnapshot: null, snapshotSending: false, decisionId: null, intentionalClose: false, pauseUntil: 0, aimTurnKey: "", aimRevision: 0, appliedAimRevision: 0, aimTimer: 0, aimInFlight: null, aimDirty: false, lastAimSignature: "" };', 1);
html = replaceExact(html,
  '  if (coarsePointer && applyToCue) power = mobilePower;',
  '  if (applyToCue) power = mobilePower;', 1);
html = replaceExact(html,
  '  cuePotted = false; power = coarsePointer ? mobilePower : 0; charging = false;',
  '  cuePotted = false; power = mobilePower; charging = false;', 1);
html = replaceExact(html,
  '    clearTimeout(online.replayTimer); online.appliedEvents.clear(); online.inputLocked = false; online.placementSending = false; online.placementNotice = ""; online.authorityShotId = null; online.queuedSnapshot = null; online.snapshotSending = false;',
  '    clearTimeout(online.replayTimer); resetAimSync(); online.appliedEvents.clear(); online.inputLocked = false; online.placementSending = false; online.placementNotice = ""; online.authorityShotId = null; online.queuedSnapshot = null; online.snapshotSending = false;', 1);
html = replaceExact(html,
  '  if (room?.latest_snapshot) applySnapshot(room.latest_snapshot);',
  `  if (room?.latest_snapshot) applySnapshot(room.latest_snapshot);
  syncAimTurn(room);
  if (room?.aim_state) applyAimState(room.aim_state);`, 1);
html = replaceExact(html,
  '  online.pending.clear(); online.room = null; online.rackId = null; online.appliedSnapshot = ""; online.appliedEvents.clear(); online.inputLocked = false; online.placementSending = false; online.placementNotice = ""; online.leaveSubmitting = false; online.authorityShotId = null; online.queuedSnapshot = null; online.snapshotSending = false; online.decisionId = null;',
  '  online.pending.clear(); resetAimSync(); online.room = null; online.rackId = null; online.appliedSnapshot = ""; online.appliedEvents.clear(); online.inputLocked = false; online.placementSending = false; online.placementNotice = ""; online.leaveSubmitting = false; online.authorityShotId = null; online.queuedSnapshot = null; online.snapshotSending = false; online.decisionId = null;', 1);
html = replaceExact(html,
  '  if (event.type === "SHOT") {',
  `  if (event.type === "AIM_STATE") {
    applyAimState(event.payload);
  } else if (event.type === "SHOT") {`, 1);
html = replaceExact(html,
  'function renderOnlineLobby() {',
  `function globalAimAssistEnabled() { return !online.room || online.room.aim_assist_enabled !== false; }
function aimAssistControl() {
  const enabled = globalAimAssistEnabled();
  const isHost = online.room?.me.role === "PLAYER_1";
  const control = document.createElement(isHost ? "button" : "div");
  control.className = isHost ? "online-primary" : "waiting-line";
  control.textContent = settings.language === "en" ? "Global aim guide: " + (enabled ? "shown" : "hidden") : "全局辅助线：" + (enabled ? "显示" : "隐藏");
  if (isHost) control.onclick = () => runButtonAction(control, () => setGlobalAimAssist(!enabled));
  return control;
}
async function setGlobalAimAssist(enabled) {
  if (!online.room || online.room.me.role !== "PLAYER_1") throw new Error("只有房主可以修改全局辅助线");
  await sendOnline("ROOM_SETTINGS", { payload: { aim_assist_enabled: Boolean(enabled) } });
}
function renderOnlineLobby() {`, 1);
html = replaceExact(html,
  '    root.append(meta, vs, tools, shares, wait, cancel); return;',
  '    root.append(meta, vs, tools, shares, aimAssistControl(), wait, cancel); return;', 1);
html = replaceExact(html,
  '  root.append(roster, close, leave);',
  '  root.append(roster, aimAssistControl(), close, leave);', 1);
html = replaceExact(html,
  sourceBlock(`function schedulePendingShotReplay(pending) {
  clearTimeout(online.replayTimer);
  online.replayTimer = setTimeout(() => { if (online.room?.pending_shot?.action_id === pending.action_id) replayPendingShot(pending); }, 80);
}
async function requestShot() {
  if (!online.room) { shoot(); return; }
  if (!onlineCanAct() || state !== "aim") { showToast("等待服务器确认轮次或对手重连"); return; }
  const angle = Math.atan2(Math.sin(aimAngle), Math.cos(aimAngle)), shotPower = Math.max(.05, Math.min(1, power));
  online.inputLocked = true; syncMobileControls();
  try { await sendOnline("SHOT", { payload: { angle, power: shotPower } }); }
  catch (e) { if (!online.room?.pending_shot && state !== "roll") online.inputLocked = false; charging = false; if (state === "charge") state = "aim"; showToast(e.message); refreshHud(); }
}`),
  sourceBlock(`function schedulePendingShotReplay(pending) {
  clearTimeout(online.replayTimer);
  online.replayTimer = setTimeout(() => { if (online.room?.pending_shot?.action_id === pending.action_id) replayPendingShot(pending); }, 80);
}
function resetAimSync() {
  clearTimeout(online.aimTimer);
  online.aimTimer = 0; online.aimTurnKey = ""; online.aimRevision = 0; online.appliedAimRevision = 0;
  online.aimInFlight = null; online.aimDirty = false; online.lastAimSignature = "";
}
function syncAimTurn(room = online.room) {
  const key = room?.rack_id && Number.isInteger(room.turn_sequence) ? room.rack_id + ":" + room.turn_sequence + ":" + room.turn : "";
  if (key === online.aimTurnKey) return;
  clearTimeout(online.aimTimer); online.aimTimer = 0; online.aimTurnKey = key; online.aimRevision = 0;
  online.appliedAimRevision = 0; online.aimInFlight = null; online.aimDirty = false; online.lastAimSignature = "";
}
function applyAimState(aim) {
  if (!aim || !online.room || aim.rack_id !== online.room.rack_id || aim.turn_sequence !== online.room.turn_sequence || aim.by !== online.room.turn || !Number.isInteger(aim.revision) || aim.revision <= online.appliedAimRevision || !Number.isFinite(aim.angle) || aim.angle < -Math.PI || aim.angle > Math.PI || !Number.isFinite(aim.power) || aim.power < .05 || aim.power > 1) return;
  syncAimTurn(); online.appliedAimRevision = aim.revision; online.aimRevision = Math.max(online.aimRevision, aim.revision);
  aimAngle = aim.angle; setMobilePower(Math.round(aim.power * 100), true); refreshHud();
}
function scheduleAimState(immediate = false) {
  if (!online.room || !onlineCanAct() || state !== "aim") return;
  online.aimDirty = true;
  if (online.aimTimer) return;
  online.aimTimer = setTimeout(() => { online.aimTimer = 0; void sendAimState(false); }, immediate ? 0 : 50);
}
async function sendAimState(force) {
  if (!online.room || !onlineCanAct() || state !== "aim") throw new Error("当前不能调整瞄准");
  syncAimTurn();
  if (online.aimInFlight) {
    online.aimDirty = true;
    try { await online.aimInFlight; } catch (e) { if (force) throw e; }
    if (force || online.aimDirty) return sendAimState(force);
    return online.aimRevision;
  }
  clearTimeout(online.aimTimer); online.aimTimer = 0;
  const angle = Math.atan2(Math.sin(aimAngle), Math.cos(aimAngle));
  const shotPower = Math.max(.05, Math.min(1, power || mobilePower));
  const signature = angle.toFixed(6) + ":" + shotPower.toFixed(3);
  if (!force && !online.aimDirty && signature === online.lastAimSignature) return online.aimRevision;
  online.aimDirty = false;
  const revision = Math.max(online.aimRevision, online.appliedAimRevision) + 1;
  online.aimRevision = revision;
  const request = sendOnline("AIM_STATE", { payload: { rack_id: online.room.rack_id, turn_sequence: online.room.turn_sequence, revision, angle, power: shotPower } });
  online.aimInFlight = request;
  try {
    await request;
    online.lastAimSignature = signature;
    return revision;
  } finally {
    if (online.aimInFlight === request) online.aimInFlight = null;
    if (online.aimDirty && !force) scheduleAimState(true);
  }
}
async function requestShot() {
  if (!online.room) { shoot(); return; }
  if (!onlineCanAct() || state !== "aim") { showToast("等待服务器确认轮次或对手重连"); return; }
  try {
    const aimRevision = await sendAimState(true);
    const angle = Math.atan2(Math.sin(aimAngle), Math.cos(aimAngle)), shotPower = Math.max(.05, Math.min(1, power || mobilePower));
    online.inputLocked = true; syncMobileControls();
    await sendOnline("SHOT", { payload: { rack_id: online.room.rack_id, turn_sequence: online.room.turn_sequence, aim_revision: aimRevision, angle, power: shotPower } });
  } catch (e) { if (!online.room?.pending_shot && state !== "roll") online.inputLocked = false; charging = false; if (state === "charge") state = "aim"; showToast(e.message); refreshHud(); }
}`),
  1);
html = replaceExact(html,
  '  slider.addEventListener("input", () => setMobilePower(slider.value));',
  '  slider.addEventListener("input", () => { setMobilePower(slider.value); scheduleAimState(); });', 1);
html = replaceExact(html,
  '      if (state === "aim") aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x);',
  '      if (state === "aim") { aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x); scheduleAimState(); }', 1);
html = replaceExact(html,
  '      aimAngle += (e.clientX - lastPointerX) * 0.0045;',
  '      aimAngle += (e.clientX - lastPointerX) * 0.0045; scheduleAimState();', 1);
html = replaceExact(html,
  '  if (e.pointerType === "mouse" && state === "aim") { mouse = toLocal(e); aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x); }',
  '  if (e.pointerType === "mouse" && state === "aim") { mouse = toLocal(e); aimAngle = Math.atan2(mouse.y - cue.y, mouse.x - cue.x); scheduleAimState(true); }', 1);
html = replaceExact(html,
  'cv.addEventListener("contextmenu", e => e.preventDefault());',
  `cv.addEventListener("wheel", e => {
  if (state !== "aim" || !onlineCanAct()) return;
  e.preventDefault();
  const next = Math.round(Math.max(5, Math.min(100, mobilePower * 100 + (e.deltaY < 0 ? 5 : -5))));
  setMobilePower(next); scheduleAimState(true);
}, { passive: false });
cv.addEventListener("contextmenu", e => e.preventDefault());`, 1);
html = replaceExact(html,
  '  if (settings.aimAssist !== "off") {',
  '  if (settings.aimAssist !== "off" && globalAimAssistEnabled()) {', 1);

let server = fs.readFileSync(path.join(source, 'server.js'), 'utf8').replaceAll('\r\n', '\n');
server = replaceExact(server, '${req.headers.host}/?invite=', '${req.headers.host}/g/billiards/?invite=', 1);
const identityStart = server.indexOf('  function identity(req, res) {');
const identityEnd = server.indexOf('\n  function roleFor(', identityStart);
if (identityStart < 0 || identityEnd < 0 || server.slice(identityStart, identityEnd).split('return userId;').length !== 2) {
  throw new Error('Upstream identity implementation changed');
}
server = server.slice(0, identityStart) + `  function identity(req) {
    const userId = req.headers['x-gamenest-player'];
    if (typeof userId !== 'string' || !USER_RE.test(userId)) {
      throw apiError(401, 'IDENTITY_REQUIRED', 'Platform identity is required');
    }
    return userId;
  }
` + server.slice(identityEnd);
server = replaceExact(server,
  '      state_version: room.stateVersion,\n      turn: room.turn,',
  '      state_version: room.stateVersion,\n      turn: room.turn,\n      turn_sequence: room.turnSequence,\n      aim_assist_enabled: room.aimAssistEnabled,\n      aim_state: room.aimState,', 1);
server = replaceExact(server,
  '      stateVersion: room.stateVersion, turn: room.turn, rackBreaker: room.rackBreaker, players: room.players,\n      pendingRequest: room.pendingRequest, pendingShot: room.pendingShot, latestSnapshot: room.latestSnapshot,',
  '      stateVersion: room.stateVersion, turn: room.turn, turnSequence: room.turnSequence, aimAssistEnabled: room.aimAssistEnabled, rackBreaker: room.rackBreaker, players: room.players,\n      pendingRequest: room.pendingRequest, pendingShot: room.pendingShot, latestSnapshot: room.latestSnapshot, aimState: room.aimState,', 1);
server = replaceExact(server,
  `      if (room.pendingRequest && (!DECISIONS.has(room.pendingRequest.kind) || !ROLES.includes(room.pendingRequest.role) || !ROLES.includes(room.pendingRequest.opener))) room.pendingRequest = null;
      if (room.pendingShot && (!ACTION_RE.test(room.pendingShot.actionId || '') || !ROLES.includes(room.pendingShot.role) || room.pendingShot.rackId !== room.rackId || !Number.isFinite(room.pendingShot.payload?.angle) || !Number.isFinite(room.pendingShot.payload?.power) || !Number.isInteger(room.pendingShot.preSnapshotVersion))) room.pendingShot = null;`,
  `      if (room.pendingRequest && (!DECISIONS.has(room.pendingRequest.kind) || !ROLES.includes(room.pendingRequest.role) || !ROLES.includes(room.pendingRequest.opener))) room.pendingRequest = null;
      if (!Number.isInteger(room.turnSequence) || room.turnSequence < 0) room.turnSequence = room.rackId ? 1 : 0;
      if (typeof room.aimAssistEnabled !== 'boolean') room.aimAssistEnabled = true;
      if (room.aimState && (room.aimState.rackId !== room.rackId || room.aimState.turnSequence !== room.turnSequence || room.aimState.by !== room.turn || !Number.isInteger(room.aimState.revision) || !Number.isFinite(room.aimState.angle) || !Number.isFinite(room.aimState.power))) room.aimState = null;
      if (room.pendingShot && (!ACTION_RE.test(room.pendingShot.actionId || '') || !ROLES.includes(room.pendingShot.role) || room.pendingShot.rackId !== room.rackId || !Number.isInteger(room.pendingShot.turnSequence) || !Number.isInteger(room.pendingShot.aimRevision) || !Number.isFinite(room.pendingShot.payload?.angle) || !Number.isFinite(room.pendingShot.payload?.power) || !Number.isInteger(room.pendingShot.preSnapshotVersion))) room.pendingShot = null;`, 1);
server = replaceExact(server,
  "      stateVersion: 1, turn: null, rackBreaker: 'PLAYER_1',",
  "      stateVersion: 1, turn: null, turnSequence: 0, aimAssistEnabled: true, rackBreaker: 'PLAYER_1',", 1);
server = replaceExact(server,
  '      pendingRequest: null, pendingShot: null, latestSnapshot: null, actions: new Map(), createdAt: now, updatedAt: now,',
  '      pendingRequest: null, pendingShot: null, latestSnapshot: null, aimState: null, actions: new Map(), createdAt: now, updatedAt: now,', 1);
server = replaceExact(server,
  `    room.status = 'PLAYING';
    room.turn = 'PLAYER_1';`,
  `    room.status = 'PLAYING';
    room.turn = 'PLAYER_1';
    room.turnSequence = 1;
    room.aimState = null;`, 1);
server = replaceExact(server,
  `    room.turn = null;
    room.pendingShot = null;`,
  `    room.turn = null;
    room.aimState = null;
    room.pendingShot = null;`, 1);
server = replaceExact(server,
  `    let event;
    if (message.type === 'SHOT' || message.type === 'PLACEMENT') {`,
  `    let event;
    if (message.type === 'ROOM_SETTINGS') {
      if (role !== 'PLAYER_1') throw apiError(403, 'HOST_REQUIRED', 'Only the room host may change room settings');
      if (!message.payload || typeof message.payload.aim_assist_enabled !== 'boolean') throw apiError(400, 'INVALID_ROOM_SETTINGS', 'aim_assist_enabled must be boolean');
      room.aimAssistEnabled = message.payload.aim_assist_enabled;
      room.stateVersion += 1;
      event = { type: 'ROOM_SETTINGS', action_id: message.action_id, by: role, payload: { aim_assist_enabled: room.aimAssistEnabled }, state_version: room.stateVersion };
    } else if (message.type === 'AIM_STATE') {
      if (room.status !== 'PLAYING') throw apiError(409, 'INVALID_STATE', 'The match is not playing');
      if (room.turn !== role) throw apiError(403, 'NOT_YOUR_TURN', 'It is not your turn');
      if (room.pendingShot) throw apiError(409, 'SHOT_PENDING', 'The accepted shot has not settled');
      if (!ROLES.every((item) => room.players[item]?.present)) throw apiError(409, 'PEER_OFFLINE', 'Both players must be connected');
      const payload = message.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.rack_id !== room.rackId || payload.turn_sequence !== room.turnSequence || !Number.isInteger(payload.revision) || payload.revision < 1 || payload.revision > 1_000_000_000 || !Number.isFinite(payload.angle) || payload.angle < -Math.PI || payload.angle > Math.PI || !Number.isFinite(payload.power) || payload.power < 0.05 || payload.power > 1) {
        throw apiError(400, 'INVALID_AIM_STATE', 'Aim state does not match the current rack and turn');
      }
      if (room.aimState && payload.revision <= room.aimState.revision) throw apiError(409, 'STALE_AIM_STATE', 'Aim state revision is stale');
      room.aimState = { rackId: room.rackId, rack_id: room.rackId, turnSequence: room.turnSequence, turn_sequence: room.turnSequence, revision: payload.revision, by: role, angle: payload.angle, power: payload.power };
      room.stateVersion += 1;
      event = { type: 'AIM_STATE', action_id: message.action_id, by: role, payload: room.aimState, state_version: room.stateVersion };
    } else if (message.type === 'SHOT' || message.type === 'PLACEMENT') {`, 1);
server = replaceExact(server,
  `      if (message.type === 'SHOT' && (!Number.isFinite(message.payload.angle) || message.payload.angle < -Math.PI || message.payload.angle > Math.PI || !Number.isFinite(message.payload.power) || message.payload.power < 0.05 || message.payload.power > 1)) {
        throw apiError(400, 'INVALID_PAYLOAD', 'Shot angle or power is outside the allowed range');
      }`,
  `      if (message.type === 'SHOT' && (!Number.isFinite(message.payload.angle) || message.payload.angle < -Math.PI || message.payload.angle > Math.PI || !Number.isFinite(message.payload.power) || message.payload.power < 0.05 || message.payload.power > 1 || message.payload.rack_id !== room.rackId || message.payload.turn_sequence !== room.turnSequence || !Number.isInteger(message.payload.aim_revision))) {
        throw apiError(400, 'INVALID_PAYLOAD', 'Shot parameters do not match the current rack and turn');
      }
      if (message.type === 'SHOT' && (!room.aimState || room.aimState.by !== role || room.aimState.revision !== message.payload.aim_revision || room.aimState.angle !== message.payload.angle || room.aimState.power !== message.payload.power)) {
        throw apiError(409, 'AIM_NOT_CONFIRMED', 'Final shot parameters were not confirmed by the server');
      }`, 1);
server = replaceExact(server,
  `      const payload = message.type === 'SHOT'
        ? { angle: message.payload.angle, power: message.payload.power }
        : { x: message.payload.x, y: message.payload.y, scope: room.latestSnapshot.placement.scope };
      if (message.type === 'SHOT') room.pendingShot = { actionId: message.action_id, role, payload, preSnapshotVersion: room.stateVersion, rackId: room.rackId };`,
  `      const payload = message.type === 'SHOT'
        ? { angle: message.payload.angle, power: message.payload.power, aim_revision: message.payload.aim_revision, turn_sequence: message.payload.turn_sequence, rack_id: message.payload.rack_id }
        : { x: message.payload.x, y: message.payload.y, scope: room.latestSnapshot.placement.scope };
      if (message.type === 'SHOT') room.pendingShot = { actionId: message.action_id, role, payload, aimRevision: message.payload.aim_revision, turnSequence: room.turnSequence, preSnapshotVersion: room.stateVersion, rackId: room.rackId };`, 1);
server = replaceExact(server,
  `          kitchen_restriction: payload.scope === 'kitchen',
        };
      }`,
  `          kitchen_restriction: payload.scope === 'kitchen',
        };
        room.turnSequence += 1;
        room.aimState = null;
      }`, 1);
server = replaceExact(server,
  `        room.reason = 'MATCH_FINISHED';
        room.turn = null;
      } else room.turn = snapshot.next_turn;`,
  `        room.reason = 'MATCH_FINISHED';
        room.turn = null;
      } else {
        room.turn = snapshot.next_turn;
        room.turnSequence += 1;
      }
      room.aimState = null;`, 1);
server = replaceExact(server,
  `      room.pendingShot = null;
      room.latestSnapshot = null;
      room.rackId = randomUUID();`,
  `      room.pendingShot = null;
      room.latestSnapshot = null;
      room.aimState = null;
      room.turnSequence += 1;
      room.rackId = randomUUID();`, 1);
server = replaceExact(server, "        room.reason = 'MATCH_FINISHED';", `        room.reason = 'MATCH_FINISHED';
        if (process.send) process.send({
          type: 'billiards-finished', matchId: room.matchId, roomId: room.roomId,
          mode: room.mode, winner: snapshot.winner, startedAt: Date.parse(room.createdAt),
          players: [room.players.PLAYER_1, room.players.PLAYER_2].map(player => ({
            userId: player.userId, nickname: player.nickname,
          })),
        });`, 1);

fs.mkdirSync(path.join(destination, 'public'), { recursive: true });
fs.writeFileSync(path.join(destination, 'public/billiards.html'), html);
fs.writeFileSync(path.join(destination, 'server.js'), server);
for (const name of ['package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(source, name), path.join(destination, name));
}
