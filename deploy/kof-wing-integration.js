const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocket, WebSocketServer } = require('ws');

const expectedSwfHash = '6c45fdc725d4910da5335ed74b66b6540b4bbdeffb74602b7b6c49185bc6e297';
const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomPattern = /^KOF-[A-HJ-NP-Z2-9]{6}$/;
const inputCodes = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6',
]);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function validateKofWingBundle(rootDirectory, options = {}) {
  if (!rootDirectory) return { configured: false, available: false, error: '未配置本地资源目录' };
  const root = path.resolve(rootDirectory);
  const requiredFiles = [
    'game.swf', 'preview.png', 'ruffle/ruffle.js',
    'ruffle/72a20ef1c0b8ceb37720.wasm', 'ruffle/826bb0938097485a2c9d.wasm',
    'ruffle/core.ruffle.c80159b526e567babaf5.js',
    'ruffle/core.ruffle.f000070ea72f8ae4fe3a.js',
  ];
  try {
    for (const relativePath of requiredFiles) {
      if (!fs.statSync(path.join(root, ...relativePath.split('/'))).isFile()) {
        return { configured: true, available: false, error: `资源缺失：${relativePath}` };
      }
    }
    if (!options.skipFingerprint && sha256(path.join(root, 'game.swf')) !== expectedSwfHash) {
      return { configured: true, available: false, error: 'game.swf 与已验证的本地资源版本不一致' };
    }
    return { configured: true, available: true, root, files: requiredFiles };
  } catch (error) {
    return { configured: true, available: false, error: error.message };
  }
}

function normalizeRoomCode(value) {
  const compact = String(value || '').trim().toUpperCase().replaceAll(' ', '');
  const prefixed = /^[A-HJ-NP-Z2-9]{6}$/.test(compact) ? `KOF-${compact}` : compact;
  return roomPattern.test(prefixed) ? prefixed : null;
}

function createRoomCode(existingRooms) {
  for (let attempt = 0; attempt < 100; attempt++) {
    let suffix = '';
    for (let index = 0; index < 6; index++) suffix += roomAlphabet[crypto.randomInt(roomAlphabet.length)];
    const code = `KOF-${suffix}`;
    if (!existingRooms.has(code)) return code;
  }
  throw new Error('Unable to allocate a KOF room code');
}

function acceptedOrigin(request) {
  if (!request.headers.origin) return true;
  try {
    return new URL(request.headers.origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function safeNickname(value) {
  const characters = Array.from(String(value || '玩家').trim())
    .filter(character => !/[\u0000-\u001f\u007f]/.test(character));
  return characters.slice(0, 20).join('') || '玩家';
}

function createKofWingIntegration(options) {
  const sessionFromRequest = options.sessionFromRequest;
  const adapterDirectory = options.adapterDirectory || path.join(__dirname, '..', 'public', 'kof-wing');
  const bundle = validateKofWingBundle(options.assetsDirectory, { skipFingerprint: options.skipFingerprint });
  const rooms = new Map();
  const memberships = new Map();
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const ruffleFiles = new Set(bundle.available
    ? fs.readdirSync(path.join(bundle.root, 'ruffle')).filter(file => /\.(?:js|wasm)$/.test(file))
    : []);

  function send(socket, payload) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  function memberView(member) {
    return member ? {
      playerId: member.playerId,
      nickname: member.nickname,
      connected: Boolean(member.socket && member.socket.readyState === WebSocket.OPEN),
    } : null;
  }

  function roomView(room, playerId) {
    return {
      code: room.code,
      phase: room.phase,
      createdAt: room.createdAt,
      startedAt: room.startedAt,
      streamState: room.streamState,
      role: room.host.playerId === playerId ? 'host' : room.guest?.playerId === playerId ? 'guest' : null,
      host: memberView(room.host),
      guest: memberView(room.guest),
    };
  }

  function publicRooms() {
    return Array.from(rooms.values())
      .filter(room => room.phase === 'waiting' && !room.guest)
      .map(room => ({ code: room.code, host: room.host.nickname, players: 1, capacity: 2, state: '等待中' }))
      .sort((left, right) => right.code.localeCompare(left.code));
  }

  function broadcastLobby() {
    const payload = { type: 'lobby', rooms: publicRooms() };
    for (const client of websocketServer.clients) send(client, payload);
  }

  function broadcastRoom(room) {
    for (const member of [room.host, room.guest]) {
      if (member) send(member.socket, { type: 'room', room: roomView(room, member.playerId) });
    }
    broadcastLobby();
  }

  function cancelDisconnect(member) {
    if (member?.disconnectTimer) clearTimeout(member.disconnectTimer);
    if (member) member.disconnectTimer = null;
  }

  function destroyRoom(room, reason) {
    rooms.delete(room.code);
    for (const member of [room.host, room.guest]) {
      if (!member) continue;
      cancelDisconnect(member);
      memberships.delete(member.playerId);
      send(member.socket, { type: 'room_closed', reason });
      member.roomCode = null;
    }
    broadcastLobby();
  }

  function removeGuest(room, reason) {
    if (!room.guest) return;
    cancelDisconnect(room.guest);
    memberships.delete(room.guest.playerId);
    send(room.guest.socket, { type: 'left_room', reason });
    room.guest.roomCode = null;
    room.guest = null;
    room.phase = 'waiting';
    room.startedAt = null;
    room.streamState = 'idle';
    room.lastInputSequence = 0;
    broadcastRoom(room);
  }

  function leaveCurrentRoom(socket, explicit) {
    const roomCode = memberships.get(socket.player.playerId);
    const room = roomCode && rooms.get(roomCode);
    if (!room) return;
    if (room.host.playerId === socket.player.playerId) {
      if (explicit) destroyRoom(room, '房主已关闭房间');
      return;
    }
    if (room.guest?.playerId === socket.player.playerId && explicit) removeGuest(room, '已离开房间');
  }

  function attachMember(member, socket, room) {
    cancelDisconnect(member);
    if (member.socket && member.socket !== socket && member.socket.readyState === WebSocket.OPEN) {
      member.socket.close(4001, '该身份已在新页面连接');
    }
    member.socket = socket;
    member.nickname = safeNickname(socket.player.nickname);
    member.roomCode = room.code;
    socket.roomCode = room.code;
    memberships.set(member.playerId, room.code);
  }

  function createRoom(socket) {
    leaveCurrentRoom(socket, true);
    const code = createRoomCode(rooms);
    const host = {
      playerId: socket.player.playerId,
      nickname: safeNickname(socket.player.nickname),
      socket,
      roomCode: code,
      disconnectTimer: null,
    };
    const room = {
      code,
      host,
      guest: null,
      phase: 'waiting',
      streamState: 'idle',
      createdAt: Date.now(),
      startedAt: null,
      lastInputSequence: 0,
    };
    rooms.set(code, room);
    memberships.set(host.playerId, code);
    socket.roomCode = code;
    send(socket, { type: 'room_created', room: roomView(room, host.playerId) });
    broadcastRoom(room);
  }

  function joinRoom(socket, value) {
    const code = normalizeRoomCode(value);
    if (!code) return send(socket, { type: 'error', code: 'INVALID_ROOM', message: '房间码格式无效' });
    const room = rooms.get(code);
    if (!room) return send(socket, { type: 'error', code: 'ROOM_NOT_FOUND', message: '房间不存在或已关闭' });
    const playerId = socket.player.playerId;
    if (room.host.playerId === playerId) {
      attachMember(room.host, socket, room);
    } else if (room.guest?.playerId === playerId) {
      attachMember(room.guest, socket, room);
    } else {
      if (room.phase !== 'waiting') {
        return send(socket, { type: 'error', code: 'GAME_IN_PROGRESS', message: '对局已经开始，不允许中途加入或观战' });
      }
      if (room.guest) return send(socket, { type: 'error', code: 'ROOM_FULL', message: '房间已满' });
      leaveCurrentRoom(socket, true);
      room.guest = {
        playerId,
        nickname: safeNickname(socket.player.nickname),
        socket,
        roomCode: code,
        disconnectTimer: null,
      };
      memberships.set(playerId, code);
      socket.roomCode = code;
    }
    send(socket, { type: 'room_joined', room: roomView(room, playerId) });
    broadcastRoom(room);
  }

  function startGame(socket) {
    const room = rooms.get(socket.roomCode);
    if (!room || room.host.playerId !== socket.player.playerId) {
      return send(socket, { type: 'error', code: 'HOST_ONLY', message: '只有房主可以开始' });
    }
    if (!room.guest || !memberView(room.guest).connected) {
      return send(socket, { type: 'error', code: 'GUEST_REQUIRED', message: '等待第二名玩家连接' });
    }
    if (room.phase !== 'waiting') return;
    room.phase = 'playing';
    room.startedAt = Date.now();
    room.streamState = 'starting';
    broadcastRoom(room);
    send(room.host.socket, { type: 'game_started', role: 'host' });
    send(room.guest.socket, { type: 'game_started', role: 'guest' });
  }

  function relaySignal(socket, message) {
    const room = rooms.get(socket.roomCode);
    if (!room || room.phase !== 'playing' || !['offer', 'answer', 'ice'].includes(message.kind)) return;
    const senderIsHost = room.host.playerId === socket.player.playerId;
    const senderIsGuest = room.guest?.playerId === socket.player.playerId;
    if (!senderIsHost && !senderIsGuest) return;
    const payload = message.payload;
    if (!payload || JSON.stringify(payload).length > 48 * 1024) return;
    const target = senderIsHost ? room.guest : room.host;
    const negotiationId = typeof message.negotiationId === 'string' && /^[a-f0-9-]{1,64}$/i.test(message.negotiationId)
      ? message.negotiationId : null;
    send(target?.socket, { type: 'signal', kind: message.kind, payload, negotiationId });
  }

  function relayPeerState(socket, type) {
    const room = rooms.get(socket.roomCode);
    if (!room || room.phase !== 'playing') return;
    if (type === 'peer_ready' && room.guest?.playerId === socket.player.playerId) {
      send(room.host.socket, { type: 'peer_ready' });
    } else if (type === 'peer_probe' && room.host.playerId === socket.player.playerId) {
      send(room.guest?.socket, { type: 'peer_probe' });
    }
  }

  function relayInput(socket, message) {
    const room = rooms.get(socket.roomCode);
    if (!room || room.phase !== 'playing' || room.guest?.playerId !== socket.player.playerId) return;
    if (!inputCodes.has(message.code) || !['down', 'up'].includes(message.action) ||
        !Number.isSafeInteger(message.sequence) || message.sequence <= room.lastInputSequence) return;
    room.lastInputSequence = message.sequence;
    send(room.host.socket, {
      type: 'remote_input', action: message.action, code: message.code, sequence: message.sequence,
    });
  }

  function updateStreamState(socket, value) {
    const room = rooms.get(socket.roomCode);
    if (!room || room.host.playerId !== socket.player.playerId || room.phase !== 'playing') return;
    if (!['starting', 'ready', 'failed'].includes(value)) return;
    room.streamState = value;
    broadcastRoom(room);
  }

  function handleMessage(socket, raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(socket, { type: 'error', code: 'INVALID_JSON', message: '消息格式无效' });
    }
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'create_room') createRoom(socket);
    else if (message.type === 'join_room') joinRoom(socket, message.roomCode);
    else if (message.type === 'leave_room') leaveCurrentRoom(socket, true);
    else if (message.type === 'start_game') startGame(socket);
    else if (message.type === 'signal') relaySignal(socket, message);
    else if (message.type === 'peer_ready' || message.type === 'peer_probe') relayPeerState(socket, message.type);
    else if (message.type === 'input') relayInput(socket, message);
    else if (message.type === 'stream_state') updateStreamState(socket, message.value);
  }

  function handleDisconnect(socket) {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const member = room.host.playerId === socket.player.playerId ? room.host
      : room.guest?.playerId === socket.player.playerId ? room.guest : null;
    if (!member || member.socket !== socket) return;
    member.socket = null;
    if (member === room.guest) send(room.host.socket, { type: 'remote_input', action: 'release_all' });
    member.disconnectTimer = setTimeout(() => {
      if (member.socket) return;
      if (member === room.host) destroyRoom(room, '房主连接超时，房间已关闭');
      else removeGuest(room, '第二名玩家连接超时');
    }, 60000);
    member.disconnectTimer.unref?.();
    broadcastRoom(room);
  }

  websocketServer.on('connection', (socket, request, player) => {
    socket.player = player;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', raw => handleMessage(socket, raw));
    socket.on('close', () => handleDisconnect(socket));
    send(socket, { type: 'hello', player, rooms: publicRooms() });
  });

  const heartbeat = setInterval(() => {
    for (const socket of websocketServer.clients) {
      if (!socket.isAlive) socket.terminate();
      else {
        socket.isAlive = false;
        socket.ping();
      }
    }
  }, 30000);
  heartbeat.unref?.();

  function sendFile(response, filePath, cacheControl = 'no-cache') {
    response.setHeader('Cache-Control', cacheControl);
    response.sendFile(filePath, error => {
      if (error && !response.headersSent) response.sendStatus(error.statusCode || 404);
    });
  }

  function request(requestObject, response) {
    const player = sessionFromRequest(requestObject);
    if (!player) return response.status(401).json({ error: 'Platform session required' });
    if (!bundle.available) return response.status(503).json({ error: bundle.error || 'KOF Wing integration unavailable' });
    const requestPath = requestObject.path || '/';
    if (requestObject.method === 'GET' && (requestPath === '/' || requestPath === '/index.html')) {
      return sendFile(response, path.join(adapterDirectory, 'index.html'), 'no-store');
    }
    if (requestObject.method === 'GET' && requestPath === '/app.js') {
      return sendFile(response, path.join(adapterDirectory, 'app.js'), 'no-store');
    }
    if (requestObject.method === 'GET' && requestPath === '/style.css') {
      return sendFile(response, path.join(adapterDirectory, 'style.css'), 'no-store');
    }
    if (requestObject.method === 'GET' && requestPath === '/source/game.swf') {
      return sendFile(response, path.join(bundle.root, 'game.swf'), 'public, max-age=86400');
    }
    if (requestObject.method === 'GET' && requestPath === '/source/preview.png') {
      return sendFile(response, path.join(bundle.root, 'preview.png'), 'public, max-age=86400');
    }
    const ruffleMatch = requestPath.match(/^\/source\/ruffle\/([^/]+)$/);
    if (requestObject.method === 'GET' && ruffleMatch && ruffleFiles.has(ruffleMatch[1])) {
      return sendFile(response, path.join(bundle.root, 'ruffle', ruffleMatch[1]), 'public, max-age=31536000, immutable');
    }
    if (requestObject.method === 'GET' && requestPath === '/api/rooms') {
      response.setHeader('Cache-Control', 'no-store');
      return response.json({ rooms: publicRooms() });
    }
    return response.sendStatus(404);
  }

  function upgrade(requestObject, socket, head) {
    const player = sessionFromRequest(requestObject);
    if (!bundle.available) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!player || !acceptedOrigin(requestObject)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    websocketServer.handleUpgrade(requestObject, socket, head, websocket => {
      websocketServer.emit('connection', websocket, requestObject, player);
    });
  }

  function close() {
    clearInterval(heartbeat);
    for (const room of rooms.values()) destroyRoom(room, '服务正在关闭');
    for (const socket of websocketServer.clients) socket.close(1001, 'Server shutting down');
    websocketServer.close();
  }

  return { bundle, close, request, rooms, upgrade, websocketServer };
}

module.exports = {
  createKofWingIntegration,
  expectedSwfHash,
  normalizeRoomCode,
  validateKofWingBundle,
};
