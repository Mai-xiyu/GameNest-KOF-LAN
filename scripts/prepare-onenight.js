const fs = require('node:fs');
const path = require('node:path');

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node prepare-onenight.js SOURCE DESTINATION');

function replaceExact(text, before, after, count = 1) {
  const occurrences = text.split(before).length - 1;
  if (occurrences !== count) {
    throw new Error(`Upstream changed: expected ${count} occurrences of ${before}, got ${occurrences}`);
  }
  return text.replaceAll(before, after);
}

function patch(relativePath, transform) {
  const filename = path.join(destination, relativePath);
  const sourceText = fs.readFileSync(filename, 'utf8').replaceAll('\r\n', '\n');
  fs.writeFileSync(filename, transform(sourceText));
}

fs.cpSync(source, destination, {
  recursive: true,
  filter: filename => !['.git', 'node_modules', '.next', 'out', 'dist'].includes(path.basename(filename)),
});

patch('server/src/index.ts', text => {
  text = replaceExact(text, "wss.on('connection', (ws: WebSocket) => {", `wss.on('connection', (ws: WebSocket, request) => {
  const playerId = request.headers['x-gamenest-player'];
  const encodedName = request.headers['x-gamenest-name'];
  if (typeof playerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(playerId) ||
      typeof encodedName !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(encodedName)) {
    ws.close(1008, 'Platform session required');
    return;
  }
  const nickname = Buffer.from(encodedName, 'base64url').toString('utf8').trim().slice(0, 32);
  if (!nickname) {
    ws.close(1008, 'Platform nickname required');
    return;
  }
  manager.registerConnection(ws, playerId, nickname);`);
  return replaceExact(text,
    'server.listen(PORT, () => {',
    "server.listen(PORT, '127.0.0.1', () => {");
});

patch('server/src/RoomManager.ts', text => {
  text = replaceExact(text,
    "import WebSocket from 'ws';",
    "import { randomUUID } from 'node:crypto';\nimport WebSocket from 'ws';");
  text = replaceExact(text, "import { v4 as uuidv4 } from 'uuid';\n", '');
  text = replaceExact(text,
    "import { generateRoomCode, normalizeNickname } from './utils';",
    "import { generateRoomCode } from './utils';");
  text = replaceExact(text,
    '  private connections = new Map<WebSocket, { playerId: string; roomCode: string }>();',
    `  private connections = new Map<WebSocket, { playerId: string; roomCode: string }>();
  private identities = new Map<WebSocket, { playerId: string; nickname: string }>();`);
  text = replaceExact(text, `  constructor() {
    setInterval(() => this.gcRooms(), ROOM_GC_INTERVAL_MS);
  }`, `  constructor() {
    setInterval(() => this.gcRooms(), ROOM_GC_INTERVAL_MS);
  }

  registerConnection(ws: WebSocket, playerId: string, nickname: string): void {
    this.identities.set(ws, { playerId, nickname });
  }

  revokePlayer(playerId: string): void {
    for (const [ws, identity] of this.identities) {
      if (identity.playerId !== playerId) continue;
      this.handleDisconnect(ws);
      ws.close(4002, 'Platform session revoked');
    }
  }`);
  text = replaceExact(text,
    "      case 'create_room':\n        this.handleCreateRoom(ws, msg.nickname, msg.sessionToken);",
    "      case 'create_room':\n        if (!conn) this.handleCreateRoom(ws);");
  text = replaceExact(text,
    "      case 'join_room':\n        this.handleJoinRoom(ws, msg.roomCode, msg.nickname, msg.sessionToken);",
    "      case 'join_room':\n        if (!conn) this.handleJoinRoom(ws, msg.roomCode);");
  text = replaceExact(text,
    `  handleDisconnect(ws: WebSocket): void {
    const conn = this.connections.get(ws);
    if (!conn) return;`,
    `  handleDisconnect(ws: WebSocket): void {
    this.identities.delete(ws);
    const conn = this.connections.get(ws);
    if (!conn) return;`);
  text = replaceExact(text,
    '  private handleCreateRoom(ws: WebSocket, nickname: string, sessionToken: string): void {',
    `  private handleCreateRoom(ws: WebSocket): void {
    const identity = this.identities.get(ws);
    if (!identity) return;`);
  text = replaceExact(text,
    `    const playerId = uuidv4();
    const player: Player = {
      playerId,
      sessionToken,
      nickname: nickname.trim(),`,
    `    const playerId = identity.playerId;
    const player: Player = {
      playerId,
      sessionToken: playerId,
      nickname: identity.nickname,`);
  text = replaceExact(text,
    `      lastActivityAt: Date.now(),
      hostDisconnectTimer: null,
    };`,
    `      lastActivityAt: Date.now(),
      hostDisconnectTimer: null,
      matchId: null,
      matchStartedAt: null,
      resultReported: false,
    };`);

  const joinStart = text.indexOf('  private handleJoinRoom(');
  const reconnectStart = text.indexOf('  // Reconnect an existing player', joinStart);
  if (joinStart < 0 || reconnectStart < 0) throw new Error('Upstream join implementation changed');
  text = text.slice(0, joinStart) + `  private handleJoinRoom(ws: WebSocket, roomCode: string): void {
    const identity = this.identities.get(ws);
    if (!identity) return;
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) {
      this.send(ws, { event: 'error', code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
      return;
    }

    const existing = room.players.get(identity.playerId);
    if (existing) return this.reconnectPlayer(ws, room, existing);

    if (room.gameState) {
      this.send(ws, { event: 'error', code: 'GAME_IN_PROGRESS', message: 'A game is already in progress.' });
      return;
    }
    if (room.players.size >= 10) {
      this.send(ws, { event: 'error', code: 'ROOM_FULL', message: 'Room is full.' });
      return;
    }

    const playerId = identity.playerId;
    const seatId = \`SEAT_\${room.players.size}\`;
    const player: Player = {
      playerId,
      sessionToken: playerId,
      nickname: identity.nickname,
      seatId,
      isHost: false,
      isConnected: true,
      clockSkew: 0,
      privateKnowledge: [],
      dayPhaseVote: null,
      bodyguardProtectTarget: null,
      joinedAt: Date.now(),
    };

    room.players.set(playerId, player);
    room.lastActivityAt = Date.now();
    this.connections.set(ws, { playerId, roomCode: room.roomCode });
    this.send(ws, { event: 'room_joined', roomCode: room.roomCode, playerId, seatId, nickname: identity.nickname });
    this.broadcastRoomState(room);
  }

  // ============================================================
` + text.slice(reconnectStart);

  text = replaceExact(text,
    '  private reconnectPlayer(ws: WebSocket, room: Room, player: Player): void {\n    player.isConnected = true;',
    `  private reconnectPlayer(ws: WebSocket, room: Room, player: Player): void {
    for (const [existingSocket, connection] of this.connections) {
      if (existingSocket !== ws && connection.playerId === player.playerId && connection.roomCode === room.roomCode) {
        this.connections.delete(existingSocket);
        this.identities.delete(existingSocket);
        existingSocket.close(4001, 'Reconnected elsewhere');
      }
    }
    player.isConnected = true;`);
  text = replaceExact(text,
    `    // Re-send private knowledge
    if (player.privateKnowledge.length > 0) {`,
    `    if (player.assignedRoleId) {
      this.send(ws, { event: 'role_assigned', roleId: player.assignedRoleId, seatId: player.seatId });
    }

    // Re-send private knowledge
    if (player.privateKnowledge.length > 0) {`);
  text = replaceExact(text,
    `      if (ws) {
        this.send(ws, { event: 'role_assigned', roleId: seat.token.roleId, seatId: p.seatId });
      }`,
    `      p.assignedRoleId = seat.token.roleId;
      if (ws) {
        this.send(ws, { event: 'role_assigned', roleId: p.assignedRoleId, seatId: p.seatId });
      }`);
  text = replaceExact(text,
    `    room.gameState = createGameState(room);
    room.lastActivityAt = Date.now();`,
    `    room.gameState = createGameState(room);
    room.matchId = randomUUID();
    room.matchStartedAt = Date.now();
    room.resultReported = false;
    room.lastActivityAt = room.matchStartedAt;`);
  text = replaceExact(text,
    `    this.broadcastToRoom(room, { event: 'game_over', result });`,
    `    this.broadcastToRoom(room, { event: 'game_over', result });
    if (!room.resultReported) {
      if (room.matchId && room.matchStartedAt && process.send) {
        process.send({
          type: 'onenight-finished',
          matchId: room.matchId,
          roomId: room.roomCode,
          startedAt: room.matchStartedAt,
          roleConfig: room.roleConfig,
          winningTeams: result.winningTeams,
          players: result.finalBoard
            .filter(entry => typeof entry.occupantPlayerId === 'string' && typeof entry.occupantNickname === 'string')
            .map(entry => ({
              playerId: entry.occupantPlayerId,
              nickname: entry.occupantNickname,
              roleId: entry.roleId,
              faction: entry.winStrategy,
            })),
        });
      }
      room.resultReported = true;
    }`);
  text = replaceExact(text,
    '      p.privateKnowledge = [];\n      p.dayPhaseVote = null;',
    '      p.privateKnowledge = [];\n      p.assignedRoleId = undefined;\n      p.dayPhaseVote = null;');
  return text;
});

patch('server/src/types.ts', text => {
  text = replaceExact(text,
    '  privateKnowledge: KnowledgeEvent[];',
    '  privateKnowledge: KnowledgeEvent[];\n  assignedRoleId?: RoleId;');
  return replaceExact(text,
    '  hostDisconnectTimer: ReturnType<typeof setTimeout> | null;\n}',
    '  hostDisconnectTimer: ReturnType<typeof setTimeout> | null;\n  matchId: string | null;\n  matchStartedAt: number | null;\n  resultReported: boolean;\n}');
});

patch('server/src/index.ts', text => replaceExact(text,
  `server.listen(PORT, '127.0.0.1', () => {`,
  `process.on('message', (message: unknown) => {
  if (!message || typeof message !== 'object') return;
  const payload = message as { type?: unknown; playerId?: unknown };
  if (payload.type === 'revoke-player' && typeof payload.playerId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(payload.playerId)) {
    manager.revokePlayer(payload.playerId);
  }
});

server.listen(PORT, '127.0.0.1', () => {`));

patch('server/src/utils.ts', text => {
  text = `import { randomInt } from 'node:crypto';\n\n` + text;
  text = replaceExact(text,
    'ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]',
    'ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)]');
  text = replaceExact(text,
    'const j = Math.floor(Math.random() * (i + 1));',
    'const j = randomInt(i + 1);');
  return replaceExact(text,
    'return array[Math.floor(Math.random() * array.length)];',
    'return array[randomInt(array.length)];');
});

patch('frontend/next.config.js', text => replaceExact(text,
  "  output: 'export',",
  "  output: 'export',\n  basePath: '/g/onenight',"));

patch('frontend/src/lib/useWebSocket.ts', text => {
  text = replaceExact(text,
    "? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`",
    "? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/g/onenight/ws`");
  return replaceExact(text,
    `        ws.send(JSON.stringify({ event: 'sync_time', clientSendTime: Date.now() }));`,
    `        ws.send(JSON.stringify({ event: 'sync_time', clientSendTime: Date.now() }));
        const roomCode = new URLSearchParams(window.location.search).get('room');
        if (roomCode && /^[A-Z0-9]{4}$/i.test(roomCode)) {
          fetch('/api/session', { method: 'POST', credentials: 'same-origin' })
            .then(response => response.json())
            .then(player => ws.send(JSON.stringify({
              event: 'join_room', roomCode: roomCode.toUpperCase(),
              nickname: player.nickname || '', sessionToken: 'platform',
            })))
            .catch(() => {});
        }`);
});

patch('frontend/src/components/HomeScreen.tsx', text => {
  text = replaceExact(text, "import { useState } from 'react';", "import { useEffect, useState } from 'react';");
  const tokenStart = text.indexOf('  const getSessionToken = () => {');
  const createStart = text.indexOf('  const handleCreate = () => {', tokenStart);
  if (tokenStart < 0 || createStart < 0) throw new Error('Upstream session-token UI changed');
  text = text.slice(0, tokenStart) + `  useEffect(() => {
    fetch('/api/session', { method: 'POST', credentials: 'same-origin' })
      .then(response => response.json())
      .then(player => setNickname(player.nickname || ''))
      .catch(() => {});
    const invitedRoom = new URLSearchParams(window.location.search).get('room');
    if (invitedRoom && /^[A-Z0-9]{4}$/i.test(invitedRoom)) {
      setRoomCode(invitedRoom.toUpperCase());
      setMode('join');
    }
  }, []);

` + text.slice(createStart);
  text = replaceExact(text, "sessionToken: getSessionToken()", "sessionToken: 'platform'", 2);
  return replaceExact(text, '                onChange={e => setNickname(e.target.value)}', '                readOnly', 2);
});

patch('frontend/src/components/LobbyScreen.tsx', text => {
  text = replaceExact(text, "import { useState } from 'react';", "import { useEffect, useState } from 'react';");
  text = replaceExact(text,
    '  const isHost = myPlayerId === roomState.hostPlayerId;',
    `  const isHost = myPlayerId === roomState.hostPlayerId;

  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', roomState.roomCode);
    history.replaceState(null, '', url);
  }, [roomState.roomCode]);`);
  return replaceExact(text, `  const handleCopyCode = () => {
    navigator.clipboard?.writeText(roomState.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };`, `  const handleCopyCode = async () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', roomState.roomCode);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url.toString());
    } catch {
      const input = document.createElement('textarea');
      input.value = url.toString();
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };`);
});

patch('frontend/src/app/layout.tsx', text => {
  text = replaceExact(text, "  title: 'One Night Werewolf',", "  title: '一夜狼人杀',");
  text = replaceExact(text, "  manifest: '/manifest.json',", "  manifest: '/g/onenight/manifest.json',");
  text = replaceExact(text, '<html lang="en">', '<html lang="zh-CN">');
  return replaceExact(text, '<body>{children}</body>', `<body>
        <a href="/" style={{ position: 'fixed', top: 8, left: 8, zIndex: 100, padding: '8px 12px', borderRadius: 8, background: '#1f2937', color: 'white' }}>返回大厅</a>
        {children}
      </body>`);
});
