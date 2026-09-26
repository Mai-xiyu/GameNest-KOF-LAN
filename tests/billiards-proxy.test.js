const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForMessage(socket, predicate, label, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`${label} timeout`));
    }, timeoutMs);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    }
    socket.on('message', onMessage);
  });
}

async function sendAndWait(socket, message, expectedType = 'ACK') {
  const response = waitForMessage(socket,
    item => item.action_id === message.action_id && item.type === expectedType,
    `${message.type} ${expectedType}`);
  socket.send(JSON.stringify(message));
  return response;
}

test('prepared billiards service shares platform identity and same-origin invite/WS', { skip: !process.env.TEST_BILLIARDS_DIR }, async () => {
  const hallPort = await getFreePort();
  const billiardsPort = await getFreePort();
  const base = `http://127.0.0.1:${hallPort}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-billiards-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(hallPort), BILLIARDS_PORT: String(billiardsPort), DATA_DIR: dataDir,
      BILLIARDS_DIR: process.env.TEST_BILLIARDS_DIR, KOF_WING_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  const sockets = [];
  const request = async (url, cookie, method = 'GET', body) => fetch(base + url, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    let health;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { health = await request('/g/billiards/healthz'); if (health.status === 401) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(health?.status, 401, logs);
    let page;
    for (let attempt = 0; attempt < 80; attempt++) {
      page = await request('/g/billiards/');
      if (page.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(page.status, 200, logs);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    const billiardsHtml = await page.text();
    assert.match(billiardsHtml, /\/g\/billiards\/api\/rooms/);
    assert.doesNotMatch(billiardsHtml, /crypto\.randomUUID/);
    assert.match(billiardsHtml, /globalThis\.crypto\?\.getRandomValues/);
    assert.match(billiardsHtml, /matchMedia\("\(pointer: coarse\)"\)/);
    assert.doesNotMatch(billiardsHtml, /any-pointer: coarse|maxTouchPoints > 0/);
    assert.match(billiardsHtml, /在球桌上拖动鼠标/);
    assert.match(billiardsHtml, /sendOnline\("AIM_STATE"/);
    assert.match(billiardsHtml, /sendOnline\("ROOM_SETTINGS"/);
    assert.match(billiardsHtml, /globalAimAssistEnabled/);
    assert.match(billiardsHtml, /addEventListener\("wheel"/);
    assert.match(billiardsHtml, /e\.deltaY < 0 \? 5 : -5/);
    assert.match(billiardsHtml, /\.mobile-controls \{ display: grid; grid-template-columns: minmax\(0,1fr\) 92px;/);
    assert.match(billiardsHtml, /#focusBtn \{ display: none;/);
    assert.match(billiardsHtml, /activePointer === null && \(e\.pointerType !== "mouse" \|\| state !== "placement"\)/);
    assert.doesNotMatch(billiardsHtml, /e\.pointerType === "mouse" && state === "charge"/);
    const cookieOne = page.headers.get('set-cookie').split(';')[0];
    assert.match((await (await request('/g/billiards/api/session', cookieOne)).json()).authenticated.toString(), /true/);
    const playerTwo = await request('/api/session', null, 'POST');
    const cookieTwo = playerTwo.headers.get('set-cookie').split(';')[0];
    const first = await request('/g/billiards/api/rooms', cookieOne, 'POST', { nickname: '甲', mode: 'eight' });
    assert.equal(first.status, 201, await first.text().catch(() => logs));
    const room = (await (await request('/g/billiards/api/session', cookieOne)).json()).room;
    assert.equal(room.me.role, 'PLAYER_1');
    const joined = await request('/g/billiards/api/rooms/join', cookieTwo, 'POST', {
      nickname: '乙', invite_token: room.invite.token,
    });
    assert.equal(joined.status, 200, logs);
    const joinedRoom = (await joined.json()).room;
    assert.equal(joinedRoom.me.role, 'PLAYER_2');
    assert.equal(joinedRoom.room_id, room.room_id);

    const connect = cookie => new Promise((resolve, reject) => {
      const ws = new WebSocket(base.replace('http:', 'ws:') + `/g/billiards/ws?room_id=${room.room_id}`,
        { headers: { Cookie: cookie, Origin: base } });
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
    const firstSocket = await connect(cookieOne);
    sockets.push(firstSocket);
    let secondSocket = await connect(cookieTwo);
    sockets.push(secondSocket);
    assert.equal(firstSocket.readyState, WebSocket.OPEN);
    assert.equal(secondSocket.readyState, WebSocket.OPEN);
    const outsider = await request('/api/session', null, 'POST');
    const cookieThree = outsider.headers.get('set-cookie').split(';')[0];
    assert.equal((await request(`/g/billiards/api/rooms/${room.room_id}`, cookieThree)).status, 404);

    const guestSettings = await sendAndWait(secondSocket, {
      type: 'ROOM_SETTINGS', action_id: 'test-settings-guest',
      payload: { aim_assist_enabled: false },
    }, 'ERROR');
    assert.equal(guestSettings.error.code, 'HOST_REQUIRED');
    const settingsSeen = waitForMessage(secondSocket,
      message => message.type === 'ROOM_STATE' && message.room.aim_assist_enabled === false,
      'host aim-assist setting');
    await sendAndWait(firstSocket, {
      type: 'ROOM_SETTINGS', action_id: 'test-settings-host',
      payload: { aim_assist_enabled: false },
    });
    assert.equal((await settingsSeen).room.aim_assist_enabled, false);

    let current = (await (await request(`/g/billiards/api/rooms/${room.room_id}`, cookieOne)).json()).room;
    assert.equal(current.aim_assist_enabled, false);
    assert.equal(current.turn, 'PLAYER_1');
    assert.equal(current.turn_sequence, 1);

    const firstAimSeen = waitForMessage(secondSocket,
      message => message.type === 'ROOM_STATE' && message.room.aim_state?.revision === 1,
      'player one aim state');
    await sendAndWait(firstSocket, {
      type: 'AIM_STATE', action_id: 'test-aim-001',
      payload: { rack_id: current.rack_id, turn_sequence: current.turn_sequence,
        revision: 1, angle: 0.25, power: 0.5 },
    });
    const firstAimRoom = (await firstAimSeen).room;
    assert.deepEqual({ by: firstAimRoom.aim_state.by, angle: firstAimRoom.aim_state.angle,
      power: firstAimRoom.aim_state.power }, { by: 'PLAYER_1', angle: 0.25, power: 0.5 });

    const staleAim = await sendAndWait(firstSocket, {
      type: 'AIM_STATE', action_id: 'test-aim-stale',
      payload: { rack_id: current.rack_id, turn_sequence: current.turn_sequence,
        revision: 1, angle: 0.4, power: 0.6 },
    }, 'ERROR');
    assert.equal(staleAim.error.code, 'STALE_AIM_STATE');
    const unconfirmedShot = await sendAndWait(firstSocket, {
      type: 'SHOT', action_id: 'test-shot-unconfirmed',
      payload: { rack_id: current.rack_id, turn_sequence: current.turn_sequence,
        aim_revision: 1, angle: 0.25, power: 0.6 },
    }, 'ERROR');
    assert.equal(unconfirmedShot.error.code, 'AIM_NOT_CONFIRMED');
    await sendAndWait(firstSocket, {
      type: 'SHOT', action_id: 'test-shot-001',
      payload: { rack_id: current.rack_id, turn_sequence: current.turn_sequence,
        aim_revision: 1, angle: 0.25, power: 0.5 },
    });

    const settled = {
      schema_version: 1, rack_id: current.rack_id, shot_action_id: 'test-shot-001',
      mode: 'eight', balls: Array.from({ length: 16 }, (_, index) => ({
        n: index, x: 100 + index * 20, y: 200, potted: false,
      })),
      players: [{ score: 0, group: null, fouls: 0 }, { score: 0, group: null, fouls: 0 }],
      turn: 1, is_break: false, snooker_target: 'red', clearance_index: -1,
      rack_breaker: 0, placement: null, game_state: 'aim', winner: null,
      kitchen_restriction: false, shots: 1, next_turn: 'PLAYER_2',
    };
    const turnTwoSeen = waitForMessage(secondSocket,
      message => message.type === 'ROOM_STATE' && message.room.turn === 'PLAYER_2' &&
        message.room.turn_sequence === 2,
      'player two turn');
    await sendAndWait(firstSocket, {
      type: 'SNAPSHOT', action_id: 'test-snapshot-001', payload: settled,
    });
    current = (await turnTwoSeen).room;
    assert.equal(current.aim_state, null);

    const oldTurnAim = await sendAndWait(firstSocket, {
      type: 'AIM_STATE', action_id: 'test-aim-old-turn',
      payload: { rack_id: current.rack_id, turn_sequence: 1,
        revision: 2, angle: 0.1, power: 0.4 },
    }, 'ERROR');
    assert.equal(oldTurnAim.error.code, 'NOT_YOUR_TURN');

    const secondAimSeen = waitForMessage(firstSocket,
      message => message.type === 'ROOM_STATE' && message.room.aim_state?.by === 'PLAYER_2' &&
        message.room.aim_state.revision === 1,
      'player two aim state');
    await sendAndWait(secondSocket, {
      type: 'AIM_STATE', action_id: 'test-aim-002',
      payload: { rack_id: current.rack_id, turn_sequence: current.turn_sequence,
        revision: 1, angle: -0.4, power: 0.7 },
    });
    assert.equal((await secondAimSeen).room.aim_state.power, 0.7);

    const closed = new Promise(resolve => secondSocket.once('close', resolve));
    secondSocket.close();
    await closed;
    const reconnectedState = new Promise((resolve, reject) => {
      const socket = new WebSocket(base.replace('http:', 'ws:') +
        `/g/billiards/ws?room_id=${room.room_id}`, { headers: { Cookie: cookieTwo, Origin: base } });
      const timer = setTimeout(() => reject(new Error('Reconnect state timeout')), 3000);
      socket.on('message', raw => {
        const message = JSON.parse(raw.toString());
        if (!['CONNECTED', 'ROOM_STATE'].includes(message.type) ||
            message.room?.aim_state?.by !== 'PLAYER_2') return;
        clearTimeout(timer);
        resolve({ socket, room: message.room });
      });
      socket.once('error', reject);
    });
    const restored = await reconnectedState;
    secondSocket = restored.socket;
    sockets.push(secondSocket);
    assert.equal(restored.room.aim_state.angle, -0.4);
    assert.equal(restored.room.aim_assist_enabled, false);

    await sendAndWait(secondSocket, {
      type: 'SHOT', action_id: 'test-shot-002',
      payload: { rack_id: current.rack_id, turn_sequence: current.turn_sequence,
        aim_revision: 1, angle: -0.4, power: 0.7 },
    });
    const finished = {
      ...settled, shot_action_id: 'test-shot-002', turn: 0, next_turn: 'PLAYER_1',
      shots: 2, game_state: 'over', winner: 0, match_status: 'FINISHED',
    };
    const snapshot = await sendAndWait(secondSocket, {
      type: 'SNAPSHOT', action_id: 'test-snapshot-002', payload: finished,
    });
    assert.equal(snapshot.type, 'ACK', JSON.stringify(snapshot));
    let personal;
    for (let attempt = 0; attempt < 30; attempt++) {
      personal = (await (await request('/api/me/stats', cookieOne)).json()).stats;
      if (personal.length) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(personal.length, 1, logs);
    assert.equal(personal[0].gameId, 'billiards');
    assert.equal(personal[0].trustLevel, 'casual');
    assert.equal(personal[0].wins, 1);
    const opponentStats = (await (await request('/api/me/stats', cookieTwo)).json()).stats;
    assert.equal(opponentStats[0].wins, 0);
  } finally {
    for (const socket of sockets) socket.terminate();
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
    if (dataDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
