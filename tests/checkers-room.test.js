const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const PORT = 3197;

function waitFor(socket, type, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 5000);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type === 'error') {
        clearTimeout(timer);
        socket.off('message', onMessage);
        reject(new Error(`Server error while waiting for ${type}: ${message.code || ''} ${message.message || ''}`));
        return;
      }
      if (message.type !== type || !predicate(message)) return;
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

async function newSession() {
  const response = await fetch(`http://127.0.0.1:${PORT}/api/session`, { method: 'POST' });
  assert.equal(response.status, 200);
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    player: await response.json(),
  };
}

function openSocket(cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}`, {
      headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` },
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

test('pinned Checkers preview supports two sessions, reconnect, and casual result recording', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-checkers-room-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      ENABLE_BUILTIN_PROTOTYPES: '',
      BILLIARDS_DIR: '',
      MAMAHJONG_DIR: '',
      STARLINER_DIR: '',
      ONENIGHT_DIR: '',
      KOF_WING_DIR: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverErrors = '';
  server.stderr.on('data', chunk => { serverErrors += chunk; });
  const sockets = [];

  try {
    let health;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        health = await fetch(`http://127.0.0.1:${PORT}/healthz`);
        if (health.ok) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(health?.status, 200, serverErrors);

    const hostSession = await newSession();
    const guestSession = await newSession();
    assert.notEqual(hostSession.player.playerId, guestSession.player.playerId);

    let host = await openSocket(hostSession.cookie);
    const guest = await openSocket(guestSession.cookie);
    sockets.push(host, guest);

    const createdPromise = waitFor(host, 'room_created');
    send(host, 'create_room', { game: 'checkers', lang: 'zh' });
    const created = await createdPromise;
    assert.equal(created.game, 'checkers');
    assert.equal(created.maxPlayers, 2);

    const joinedPromise = waitFor(guest, 'room_joined');
    send(guest, 'join_room', { roomId: created.roomId, lang: 'zh' });
    const joined = await joinedPromise;
    assert.equal(joined.playerIndex, 1);

    let update = waitFor(host, 'room_update');
    send(host, 'player_ready');
    await update;
    update = waitFor(host, 'room_update');
    send(guest, 'player_ready');
    await update;

    const starts = [waitFor(host, 'game_started'), waitFor(guest, 'game_started')];
    send(host, 'start_game');
    let views = await Promise.all(starts);
    assert.equal(views[0].state.legalMoves.length, 7);
    assert.equal(views[1].state.legalMoves.length, 0);

    for (const expected of [
      { actor: 0, from: { row: 5, col: 0 }, to: { row: 4, col: 1 } },
      { actor: 1, from: { row: 2, col: 1 }, to: { row: 3, col: 0 } },
    ]) {
      const next = [waitFor(host, 'game_state'), waitFor(guest, 'game_state')];
      send(expected.actor === 0 ? host : guest, 'game_move', { from: expected.from, to: expected.to });
      views = await Promise.all(next);
      assert.equal(views[0].state.currentPlayer, 1 - expected.actor);
    }

    host.terminate();
    await new Promise(resolve => host.once('close', resolve));
    host = await openSocket(hostSession.cookie);
    sockets[0] = host;
    const resumedPromise = waitFor(host, 'room_joined');
    send(host, 'join_room', { roomId: created.roomId, resumeToken: created.resumeToken, lang: 'zh' });
    const resumed = await resumedPromise;
    assert.equal(resumed.playerIndex, 0);
    assert.equal(resumed.phase, 'playing');
    assert.equal(resumed.state.board[4][1].side, 0);
    assert.equal(resumed.state.board[3][0].side, 1);
    views[0] = resumed;

    for (let turn = 0; turn < 100 && views[0].state.winner === null; turn++) {
      const actor = views[0].state.currentPlayer;
      const move = views[actor].state.legalMoves[0];
      assert.ok(move, `missing legal move for player ${actor}`);
      const next = [waitFor(host, 'game_state'), waitFor(guest, 'game_state')];
      send(actor === 0 ? host : guest, 'game_move', { from: move.from, to: move.to });
      views = await Promise.all(next);
    }
    assert.notEqual(views[0].state.winner, null, 'deterministic legal moves should finish the game');

    const statsResponse = await fetch(`http://127.0.0.1:${PORT}/api/me/stats`, {
      headers: { Cookie: hostSession.cookie },
    });
    assert.equal(statsResponse.status, 200);
    const stats = (await statsResponse.json()).stats;
    const checkers = stats.find(row => row.gameId === 'checkers');
    assert.ok(checkers, JSON.stringify(stats));
    assert.equal(checkers.mode, 'english-draughts-8x8');
    assert.equal(checkers.ruleVersion, 'checkers-c9f1207-v1');
    assert.equal(checkers.playerCount, 2);
    assert.equal(checkers.trustLevel, 'casual');
    assert.equal(checkers.played, 1);
  } finally {
    for (const socket of sockets) socket?.terminate();
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
    if (dataDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
