const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const WebSocket = require('ws');

const PORT = 3188;

async function openSocket(cookie) {
  if (!cookie) {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/session`, { method: 'POST' });
    cookie = response.headers.get('set-cookie').split(';')[0];
  }
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}`, { headers: { Cookie: cookie } });
    socket.cookie = cookie;
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitFor(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 5000);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type !== type) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    }
    socket.on('message', onMessage);
  });
}

function send(socket, type, data) {
  socket.send(JSON.stringify({ type, data }));
}

function assertPrivateCards(message) {
  const { state, playerIndex } = message;
  assert.equal(state.board, undefined);
  assert.equal(state.deck, undefined);
  assert.equal(state.hands[playerIndex].length > 0, true);
  assert.equal(state.hands[playerIndex].every(card => card && card.id), true);
  for (let index = 0; index < state.hands.length; index++) {
    if (index === playerIndex) continue;
    assert.equal(state.hands[index].every(card => card === null), true);
  }
  if (state.phase === 'bidding') {
    assert.deepEqual(state.bottomCards, [null, null, null]);
  }
}

async function playToEnd(active, initialViews) {
  let views = initialViews;
  for (let turn = 0; turn < 100 && views[0].state.phase !== 'over'; turn++) {
    const state = views[0].state;
    const actor = state.phase === 'bidding' ? state.currentBidder : state.currentPlayer;
    let move;
    if (state.phase === 'bidding') {
      move = state.callPhase === 'rob' ? { passRob: true } : { call: true };
    } else {
      assert.ok(views[actor]?.state.hands[actor]?.length, JSON.stringify({
        phase: state.phase, actor, landlord: state.landlord, winner: state.winner,
        totalRounds: state.totalRounds, currentRound: state.currentRound,
        hands: views[actor]?.state.hands.map(hand => hand.length),
      }));
      move = state.lastPlay && state.lastPlay.player !== actor
        ? { cards: [] }
        : { cards: [views[actor].state.hands[actor][0].id] };
    }
    const next = active.map(socket => waitFor(socket, 'game_state'));
    send(active[actor], 'game_move', move);
    views = await Promise.all(next);
  }
  assert.equal(views[0].state.phase, 'over', 'match should finish through server moves');
  return views;
}

test('room join, start, and reconnect never send opponents cards', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-private-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ENABLE_BUILTIN_PROTOTYPES: '1', KOF_WING_DIR: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverErrors = '';
  server.stderr.on('data', data => { serverErrors += data; });
  const sockets = [];

  try {
    let host;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        host = await openSocket();
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    assert.ok(host, `Server did not start: ${serverErrors}`);
    sockets.push(host);

    const roomCreated = waitFor(host, 'room_created');
    send(host, 'create_room', { game: 'doudizhu', lang: 'zh' });
    const room = await roomCreated;
    const guests = [];
    for (let index = 0; index < 2; index++) {
      const guest = await openSocket();
      sockets.push(guest);
      const joined = waitFor(guest, 'room_joined');
      send(guest, 'join_room', { roomId: room.roomId });
      const message = await joined;
      assertPrivateCards(message);
      guests.push({ socket: guest, message });
    }

    const hostJoined = waitFor(host, 'room_joined');
    send(host, 'join_room', { roomId: room.roomId });
    assertPrivateCards(await hostJoined);

    const configured = waitFor(host, 'room_update');
    send(host, 'set_option', { key: 'totalRounds', value: 1 });
    await configured;

    for (const socket of sockets) {
      const updated = waitFor(host, 'room_update');
      send(socket, 'player_ready');
      await updated;
    }
    const started = sockets.map(socket => waitFor(socket, 'game_started'));
    send(host, 'start_game');
    const startedMessages = await Promise.all(started);
    for (let index = 0; index < startedMessages.length; index++) {
      assertPrivateCards({ ...startedMessages[index], playerIndex: index });
    }

    const bidderIndex = startedMessages[0].state.currentBidder;
    const updatedViews = sockets.map(socket => waitFor(socket, 'game_state'));
    send(sockets[bidderIndex], 'game_move', { call: true });
    const updatedMessages = await Promise.all(updatedViews);
    for (let index = 0; index < updatedMessages.length; index++) {
      assertPrivateCards({ ...updatedMessages[index], playerIndex: index });
    }

    const stranger = await openSocket();
    sockets.push(stranger);
    const rejected = waitFor(stranger, 'error');
    send(stranger, 'join_room', { roomId: room.roomId, resumeToken: guests[0].message.resumeToken });
    assert.equal((await rejected).code, 'GAME_IN_PROGRESS');

    guests[0].socket.close();
    await new Promise(resolve => guests[0].socket.once('close', resolve));
    const stolen = waitFor(stranger, 'error');
    send(stranger, 'join_room', { roomId: room.roomId, resumeToken: guests[0].message.resumeToken });
    assert.equal((await stolen).code, 'GAME_IN_PROGRESS');
    const returning = await openSocket(guests[0].socket.cookie);
    sockets.push(returning);
    const rejoined = waitFor(returning, 'room_joined');
    send(returning, 'join_room', {
      roomId: room.roomId,
      resumeToken: guests[0].message.resumeToken,
    });
    const restored = await rejoined;
    assertPrivateCards(restored);

    const active = [host, returning, guests[1].socket];
    await playToEnd(active, [updatedMessages[0], restored, updatedMessages[2]]);
    const statsResponse = await fetch(`http://127.0.0.1:${PORT}/api/me/stats`, {
      headers: { Cookie: host.cookie },
    });
    const stats = await statsResponse.json();
    assert.equal(stats.stats.length, 1);
    assert.equal(stats.stats[0].played, 1);
    assert.equal(stats.stats[0].trustLevel, 'casual');
    const boardResponse = await fetch(`http://127.0.0.1:${PORT}/api/leaderboard?faction=${stats.stats[0].faction}`);
    const board = await boardResponse.json();
    assert.equal(board.ranking.some(player => player.playerId === stats.player.playerId), false);
    const backToRoom = waitFor(host, 'room_update');
    send(host, 'return_to_room');
    await backToRoom;
    const ready = [host, returning, guests[1].socket];
    for (const socket of ready) {
      const update = waitFor(host, 'room_update');
      send(socket, 'player_ready');
      await update;
    }
    const nextGames = ready.map(socket => waitFor(socket, 'game_started'));
    send(host, 'start_game');
    const nextViews = await Promise.all(nextGames);
    assertPrivateCards({ ...nextViews[0], playerIndex: 0 });
    await playToEnd(ready, nextViews);
    const finalStats = await (await fetch(`http://127.0.0.1:${PORT}/api/me/stats`, {
      headers: { Cookie: host.cookie },
    })).json();
    assert.equal(finalStats.stats.reduce((count, row) => count + row.played, 0), 2);
    const competitive = finalStats.stats.find(row => row.trustLevel === 'server_validated');
    assert.ok(competitive);
    const ranked = await (await fetch(`http://127.0.0.1:${PORT}/api/leaderboard?faction=${competitive.faction}`)).json();
    assert.equal(ranked.ranking.some(player => player.playerId === finalStats.player.playerId), true);
  } finally {
    for (const socket of sockets) socket.close();
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    if (dataDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
