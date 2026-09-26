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
      listener.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function waitForClose(socket, label, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} close timeout`)), timeoutMs);
    socket.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

function connectPeer(url, cookie, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Cookie: cookie, Origin: origin } });
    const messages = [];
    const waiters = new Set();
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      messages.push(message);
      for (const waiter of [...waiters]) {
        if (messages.length <= waiter.after || !waiter.predicate(message)) continue;
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve(message);
      }
    });
    socket.once('error', reject);
    socket.once('open', () => {
      resolve({
        socket,
        messages,
        mark: () => messages.length,
        send: message => socket.send(JSON.stringify(message)),
        waitFor(predicate, label, after = 0, timeoutMs = 3000) {
          const existing = messages.slice(after).find(predicate);
          if (existing) return Promise.resolve(existing);
          return new Promise((resolveMessage, rejectMessage) => {
            const waiter = {
              after, predicate, resolve: resolveMessage,
              timer: setTimeout(() => {
                waiters.delete(waiter);
                rejectMessage(new Error(`${label} timeout; received ${JSON.stringify(messages.slice(after))}`));
              }, timeoutMs),
            };
            waiters.add(waiter);
          });
        },
      });
    });
  });
}

test('One Night preview binds seats to platform identity and preserves private roles on reconnect', {
  skip: !process.env.TEST_ONENIGHT_DIR,
  timeout: 20000,
}, async () => {
  const hallPort = await getFreePort();
  const onenightPort = await getFreePort();
  const base = `http://127.0.0.1:${hallPort}`;
  const wsUrl = `${base.replace('http:', 'ws:')}/g/onenight/ws`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-onenight-data-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(hallPort),
      ONENIGHT_PORT: String(onenightPort),
      ONENIGHT_DIR: process.env.TEST_ONENIGHT_DIR,
      ENABLE_ONENIGHT_PREVIEW: '1',
      KOF_WING_DIR: '',
      DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  const peers = [];
  const request = async (url, cookie, method = 'GET', body) => fetch(base + url, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const newSession = async () => {
    const response = await request('/api/session', null, 'POST');
    assert.equal(response.status, 200, logs);
    return {
      cookie: response.headers.get('set-cookie').split(';')[0],
      player: await response.json(),
    };
  };

  try {
    let integration;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await request('/api/integrations');
        if (response.ok) {
          integration = (await response.json()).integrations['social-onenight'];
          if (integration?.enabled) break;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.deepEqual(integration, {
      configured: true,
      available: true,
      enabled: true,
      entry: '/g/onenight/',
      status: 'preview',
    }, logs);

    const sessions = await Promise.all([newSession(), newSession(), newSession(), newSession()]);
    for (let index = 0; index < 3; index++) {
      peers.push(await connectPeer(wsUrl, sessions[index].cookie, base));
    }

    const hostMark = peers[0].mark();
    peers[0].send({ event: 'create_room', nickname: '伪造房主名', sessionToken: 'forged' });
    const hostJoined = await peers[0].waitFor(message => message.event === 'room_joined',
      'host room creation', hostMark);
    assert.equal(hostJoined.playerId, sessions[0].player.playerId);
    assert.equal(hostJoined.nickname, sessions[0].player.nickname);
    assert.notEqual(hostJoined.nickname, '伪造房主名');
    assert.match(hostJoined.roomCode, /^[A-Z0-9]{4}$/);

    const joined = [hostJoined];
    for (let index = 1; index < 3; index++) {
      const mark = peers[index].mark();
      peers[index].send({
        event: 'join_room', roomCode: hostJoined.roomCode,
        nickname: '伪造同名', sessionToken: sessions[0].player.playerId,
      });
      joined.push(await peers[index].waitFor(message => message.event === 'room_joined',
        `player ${index + 1} join`, mark));
    }
    assert.equal(new Set(joined.map(entry => entry.playerId)).size, 3);
    assert.equal(joined.every(entry => entry.nickname === '玩家'), true);

    const roster = await peers[0].waitFor(message => message.event === 'room_state_update' &&
      message.state.players.length === 3, 'three-player roster');
    assert.equal(new Set(roster.state.players.map(player => player.playerId)).size, 3);
    assert.equal(roster.state.players.every(player => player.nickname === '玩家'), true);

    const roleIds = ['WEREWOLF', 'MINION', 'TANNER', 'VILLAGER', 'HUNTER', 'BODYGUARD'];
    const configMark = peers[0].mark();
    peers[0].send({ event: 'update_role_config', roleIds });
    const configured = await peers[0].waitFor(message => message.event === 'room_state_update' &&
      message.state.roleConfigValid === true && message.state.roleConfig.length === roleIds.length,
    'valid role configuration', configMark);
    assert.deepEqual(configured.state.roleConfig, roleIds);

    const startMarks = peers.map(peer => peer.mark());
    const startedPromises = peers.map((peer, index) => peer.waitFor(
      message => message.event === 'game_started', `player ${index + 1} game start`, startMarks[index]));
    const rolePromises = peers.map((peer, index) => peer.waitFor(
      message => message.event === 'role_assigned', `player ${index + 1} private role`, startMarks[index]));
    const dayPromises = peers.map((peer, index) => peer.waitFor(
      message => message.event === 'day_phase_start', `player ${index + 1} day phase`, startMarks[index], 5000));
    const nightHandlers = peers.map(peer => {
      const handler = raw => {
        const message = JSON.parse(raw.toString());
        if (message.event === 'action_window') {
          peer.send({ event: 'night_action', actionType: message.actionType, payload: {} });
        }
      };
      peer.socket.on('message', handler);
      return handler;
    });
    peers[0].send({ event: 'start_game' });
    const starts = await Promise.all(startedPromises);
    const assigned = await Promise.all(rolePromises);
    for (const started of starts) {
      assert.equal(started.seats.some(seat => 'roleId' in seat || 'token' in seat || 'revealedRoleId' in seat), false);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    for (const peer of peers) {
      assert.equal(peer.messages.filter(message => message.event === 'role_assigned').length, 1);
    }
    assert.equal(new Set(assigned.map(message => message.roleId)).size, 3);
    await Promise.all(dayPromises);
    peers.forEach((peer, index) => peer.socket.off('message', nightHandlers[index]));

    const outsider = await connectPeer(wsUrl, sessions[3].cookie, base);
    peers.push(outsider);
    const outsiderMark = outsider.mark();
    outsider.send({ event: 'join_room', roomCode: hostJoined.roomCode,
      nickname: '玩家', sessionToken: 'forged' });
    const lateJoin = await outsider.waitFor(message => message.event === 'error',
      'late join rejection', outsiderMark);
    assert.equal(lateJoin.code, 'GAME_IN_PROGRESS');

    const staleSocket = peers[1].socket;
    const staleClosed = waitForClose(staleSocket, 'stale player connection');
    const replacement = await connectPeer(wsUrl, sessions[1].cookie, base);
    const replacementMark = replacement.mark();
    replacement.send({ event: 'join_room', roomCode: hostJoined.roomCode,
      nickname: '冒用昵称', sessionToken: 'forged' });
    const replacementJoined = await replacement.waitFor(message => message.event === 'room_joined',
      'replacement reconnect', replacementMark);
    const replacementRole = await replacement.waitFor(message => message.event === 'role_assigned',
      'replacement private role restore', replacementMark);
    assert.equal(replacementJoined.playerId, sessions[1].player.playerId);
    assert.equal(replacementRole.roleId, assigned[1].roleId);
    assert.equal((await staleClosed).code, 4001);
    peers[1] = replacement;

    const recoveryResponse = await request('/api/me/recovery-code', sessions[2].cookie, 'POST');
    assert.equal(recoveryResponse.status, 200, logs);
    const { code } = await recoveryResponse.json();
    const revoked = waitForClose(peers[2].socket, 'recovered player old session');
    const recoveredResponse = await request('/api/recover', null, 'POST', { code });
    assert.equal(recoveredResponse.status, 200, logs);
    const recoveredCookie = recoveredResponse.headers.get('set-cookie').split(';')[0];
    assert.equal((await revoked).code, 4002);

    const recoveredPeer = await connectPeer(wsUrl, recoveredCookie, base);
    const recoveredMark = recoveredPeer.mark();
    recoveredPeer.send({ event: 'join_room', roomCode: hostJoined.roomCode,
      nickname: '恢复后伪造昵称', sessionToken: 'forged' });
    const recoveredJoined = await recoveredPeer.waitFor(message => message.event === 'room_joined',
      'recovered session reconnect', recoveredMark);
    const recoveredRole = await recoveredPeer.waitFor(message => message.event === 'role_assigned',
      'recovered session private role', recoveredMark);
    assert.equal(recoveredJoined.playerId, sessions[2].player.playerId);
    assert.equal(recoveredRole.roleId, assigned[2].roleId);
    peers[2] = recoveredPeer;

    const activePeers = peers.slice(0, 3);
    const votingMarks = activePeers.map(peer => peer.mark());
    const votingPromises = activePeers.map((peer, index) => peer.waitFor(
      message => message.event === 'voting_phase_start',
      `player ${index + 1} voting phase`, votingMarks[index], 15000));
    activePeers[0].send({ event: 'toggle_end_day', enabled: true });
    activePeers[1].send({ event: 'toggle_end_day', enabled: true });
    activePeers[2].send({ event: 'toggle_end_day', enabled: true });
    await Promise.all(votingPromises);

    const resultMarks = activePeers.map(peer => peer.mark());
    const resultPromises = activePeers.map((peer, index) => peer.waitFor(
      message => message.event === 'game_over', `player ${index + 1} game result`, resultMarks[index]));
    for (const peer of activePeers) peer.send({ event: 'submit_vote', targetSeatId: 'SEAT_0' });
    const results = await Promise.all(resultPromises);
    assert.deepEqual(results[1].result, results[0].result);
    assert.deepEqual(results[2].result, results[0].result);

    const statsCookies = [sessions[0].cookie, sessions[1].cookie, recoveredCookie];
    for (let index = 0; index < statsCookies.length; index++) {
      let stats = [];
      for (let attempt = 0; attempt < 30; attempt++) {
        stats = (await (await request('/api/me/stats', statsCookies[index])).json()).stats;
        if (stats.length) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(stats.length, 1, logs);
      const record = stats[0];
      const finalSeat = results[0].result.finalBoard.find(entry =>
        entry.occupantPlayerId === sessions[index].player.playerId);
      assert.ok(finalSeat);
      assert.equal(record.gameId, 'social-onenight');
      assert.equal(record.mode, 'tabletop');
      assert.equal(record.ruleVersion, 'onenight-adapter-v1');
      assert.equal(record.playerCount, 3);
      assert.equal(record.faction, finalSeat.winStrategy);
      assert.equal(record.trustLevel, 'casual');
      assert.equal(record.played, 1);
      assert.equal(record.wins, results[0].result.winningTeams.includes(finalSeat.winStrategy) ? 1 : 0);
      assert.deepEqual(JSON.parse(record.configJson), { players: 3, roles: [...roleIds].sort() });
    }
  } finally {
    for (const peer of peers) peer.socket.terminate();
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
    if (dataDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
