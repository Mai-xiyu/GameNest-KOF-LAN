const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const WebSocket = require('ws');
const {
  createKofWingIntegration,
  normalizeRoomCode,
  validateKofWingBundle,
} = require('../deploy/kof-wing-integration');

function fakeBundle() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-kof-wing-'));
  const files = [
    'game.swf', 'preview.png', 'ruffle/ruffle.js',
    'ruffle/72a20ef1c0b8ceb37720.wasm', 'ruffle/826bb0938097485a2c9d.wasm',
    'ruffle/core.ruffle.c80159b526e567babaf5.js',
    'ruffle/core.ruffle.f000070ea72f8ae4fe3a.js',
  ];
  for (const relativePath of files) {
    const filePath = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, relativePath);
  }
  return root;
}

function waitFor(socket, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('WebSocket message timeout'));
    }, timeout);
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

function openSocket(base, token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/g/kof-wing/ws', {
      headers: { Cookie: `test_session=${token}`, Origin: base },
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

test('KOF room service binds two platform identities and only relays guest 2P input', async () => {
  const assetsDirectory = fakeBundle();
  const players = new Map([
    ['host-token', { playerId: '11111111-1111-4111-8111-111111111111', nickname: '房主甲' }],
    ['guest-token', { playerId: '22222222-2222-4222-8222-222222222222', nickname: '访客乙' }],
    ['other-token', { playerId: '33333333-3333-4333-8333-333333333333', nickname: '旁观丙' }],
  ]);
  const sessionFromRequest = request => {
    const match = String(request.headers.cookie || '').match(/(?:^|;\s*)test_session=([^;]+)/);
    return match ? players.get(match[1]) || null : null;
  };
  const integration = createKofWingIntegration({
    assetsDirectory,
    sessionFromRequest,
    skipFingerprint: true,
  });
  const app = express();
  app.use('/g/kof-wing', (request, response) => integration.request(request, response));
  const server = http.createServer(app);
  server.on('upgrade', (request, socket, head) => integration.upgrade(request, socket, head));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const sockets = [];

  try {
    assert.equal((await fetch(base + '/g/kof-wing/')).status, 401);
    const page = await fetch(base + '/g/kof-wing/', { headers: { Cookie: 'test_session=host-token' } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /同一局域网，双人对战/);
    assert.equal((await fetch(base + '/g/kof-wing/source/game.swf', {
      headers: { Cookie: 'test_session=host-token' },
    })).status, 200);

    const host = await openSocket(base, 'host-token');
    const guest = await openSocket(base, 'guest-token');
    const outsider = await openSocket(base, 'other-token');
    sockets.push(host, guest, outsider);

    const createdPromise = waitFor(host, message => message.type === 'room_created');
    host.send(JSON.stringify({ type: 'create_room' }));
    const created = await createdPromise;
    assert.match(created.room.code, /^KOF-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(created.room.role, 'host');

    const joinedPromise = waitFor(guest, message => message.type === 'room_joined');
    guest.send(JSON.stringify({ type: 'join_room', roomCode: created.room.code.slice(4).toLowerCase() }));
    const joined = await joinedPromise;
    assert.equal(joined.room.code, created.room.code);
    assert.equal(joined.room.role, 'guest');
    assert.equal(joined.room.host.nickname, '房主甲');

    const fullPromise = waitFor(outsider, message => message.code === 'ROOM_FULL');
    outsider.send(JSON.stringify({ type: 'join_room', roomCode: created.room.code }));
    assert.equal((await fullPromise).message, '房间已满');

    const guestStartError = waitFor(guest, message => message.code === 'HOST_ONLY');
    guest.send(JSON.stringify({ type: 'start_game' }));
    await guestStartError;

    const hostStarted = waitFor(host, message => message.type === 'game_started');
    const guestStarted = waitFor(guest, message => message.type === 'game_started');
    host.send(JSON.stringify({ type: 'start_game' }));
    assert.equal((await hostStarted).role, 'host');
    assert.equal((await guestStarted).role, 'guest');

    const offerSeen = waitFor(guest, message => message.type === 'signal' && message.kind === 'offer');
    host.send(JSON.stringify({ type: 'signal', kind: 'offer', payload: { type: 'offer', sdp: 'test-sdp' } }));
    assert.equal((await offerSeen).payload.sdp, 'test-sdp');

    const inputSeen = waitFor(host, message => message.type === 'remote_input' && message.code === 'Numpad1');
    guest.send(JSON.stringify({ type: 'input', action: 'down', code: 'Numpad1', sequence: 1 }));
    assert.equal((await inputSeen).action, 'down');

    const releaseSeen = waitFor(host, message => message.type === 'remote_input' && message.action === 'release_all');
    guest.close();
    await releaseSeen;
    const reconnect = await openSocket(base, 'guest-token');
    sockets.push(reconnect);
    const resumedPromise = waitFor(reconnect, message => message.type === 'room_joined');
    reconnect.send(JSON.stringify({ type: 'join_room', roomCode: created.room.code }));
    const resumed = await resumedPromise;
    assert.equal(resumed.room.role, 'guest');
    assert.equal(resumed.room.phase, 'playing');
  } finally {
    for (const socket of sockets) socket.terminate();
    integration.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(assetsDirectory, { recursive: true, force: true });
  }
});

test('KOF bundle validation is fingerprinted and room codes are normalized', () => {
  const assetsDirectory = fakeBundle();
  try {
    assert.equal(validateKofWingBundle('').configured, false);
    assert.equal(validateKofWingBundle(assetsDirectory).available, false);
    assert.equal(validateKofWingBundle(assetsDirectory, { skipFingerprint: true }).available, true);
    assert.equal(normalizeRoomCode(' abC234 '), 'KOF-ABC234');
    assert.equal(normalizeRoomCode('KOF-ABC234'), 'KOF-ABC234');
    assert.equal(normalizeRoomCode('KOF-IO1000'), null);
  } finally {
    fs.rmSync(assetsDirectory, { recursive: true, force: true });
  }
});
