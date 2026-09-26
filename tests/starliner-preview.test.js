const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const base = 'http://127.0.0.1:3191';

function track(socket) {
  const messages = [];
  const waiters = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex(waiter => waiter.type === message.type && waiter.predicate(message.payload));
    if (index < 0) messages.push(message);
    else waiters.splice(index, 1)[0].resolve(message.payload);
  });
  return {
    socket,
    send(type, payload) { socket.send(JSON.stringify({ type, payload })); },
    next(type, predicate = () => true, timeoutMs = 3000) {
      const index = messages.findIndex(message => message.type === type && predicate(message.payload));
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0].payload);
      return new Promise((resolve, reject) => {
        const waiter = { type, predicate, resolve: payload => { clearTimeout(timer); resolve(payload); } };
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`Timed out waiting for ${type}`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    received(type, predicate = () => true) {
      return messages.some(message => message.type === type && predicate(message.payload));
    },
  };
}

test('Starliner preview enforces identity and masked reconnect, then records casual result',
  { skip: !process.env.TEST_STARLINER_DIR, timeout: 60000 }, async () => {
    const preparedServer = fs.readFileSync(path.join(process.env.TEST_STARLINER_DIR, 'server.js'), 'utf8');
    const preparedPackage = JSON.parse(fs.readFileSync(
      path.join(process.env.TEST_STARLINER_DIR, 'package.json'), 'utf8'));
    assert.match(preparedServer, /import \{ randomInt, randomUUID \} from 'node:crypto'/);
    assert.doesNotMatch(preparedServer, /from 'uuid'|Math\.random/);
    assert.equal(preparedPackage.type, 'module');
    assert.equal(preparedPackage.private, true);
    assert.equal(preparedPackage.dependencies, undefined);
    assert.equal(fs.existsSync(path.join(process.env.TEST_STARLINER_DIR, 'package-lock.json')), false);
    assert.equal(fs.existsSync(path.join(process.env.TEST_STARLINER_DIR, 'node_modules')), false);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-starliner-'));
    const server = spawn(process.execPath, ['server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: '3191', STARLINER_PORT: '8191', DATA_DIR: dataDir,
        STARLINER_DIR: process.env.TEST_STARLINER_DIR, ENABLE_STARLINER_PREVIEW: '1', KOF_WING_DIR: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    server.stdout.on('data', chunk => { logs += chunk; });
    server.stderr.on('data', chunk => { logs += chunk; });
    const connections = [];
    const cookies = [];
    const request = (url, cookie, method = 'GET') => fetch(base + url, {
      method, headers: cookie ? { Cookie: cookie } : {},
    });
    const connect = cookie => new Promise((resolve, reject) => {
      const socket = new WebSocket(base.replace('http:', 'ws:') + '/g/starliner/ws', {
        headers: { Cookie: cookie, Origin: base, 'x-gamenest-player': 'forged' },
      });
      const client = track(socket);
      socket.once('open', () => { connections.push(socket); resolve(client); });
      socket.once('error', reject);
    });
    try {
      let page;
      for (let attempt = 0; attempt < 80; attempt++) {
        try { page = await request('/g/starliner/'); if (page.status === 200) break; } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(page?.status, 200, logs);
      const integrations = await (await request('/api/integrations')).json();
      assert.deepEqual(integrations.integrations['social-starliner'], {
        configured: true,
        available: true,
        enabled: true,
        entry: '/g/starliner/',
        status: 'preview',
      });
      const previewHtml = await page.text();
      assert.match(previewHtml, /<div class="wrap">\s*<div class="row" style="justify-content:space-between">\s*<span id="connectionStatus"><\/span>\s*<a href="\/"[^>]*>返回大厅<\/a>/);
      assert.equal((previewHtml.match(/<a href="\/"/g) || []).length, 1);
      assert.match(previewHtml, /id="btnPlayAgain">返回大厅<\/button>/);
      assert.ok(previewHtml.indexOf('id="victory"') < previewHtml.lastIndexOf('</body>'));
      assert.match(previewHtml, /<script src="\.\/client\.js"><\/script>\s*<\/body>\s*<\/html>\s*$/);
      assert.equal((await request('/g/starliner/client.js')).status, 403);
      const previewClient = await request('/g/starliner/client.js', page.headers.get('set-cookie').split(';')[0]);
      const previewScript = await previewClient.text();
      assert.match(previewScript, /\/g\/starliner\/ws/);
      assert.match(previewScript, /window\.location\.assign\('\/'\)/);
      assert.match(previewScript, /reconnectButton\.onclick = \(\) => location\.reload\(\)/);
      assert.match(previewScript, /document\.querySelector\('#connectionStatus'\)\.appendChild\(statusBadge\)/);
      assert.match(previewScript, /const \{ x: px, y: py \} = toViewXY\(e\)/);
      assert.doesNotMatch(previewScript, /canvas\.width\/2|canvas\.height\/2/);
      assert.equal((previewScript.match(/function showVictory\(winner\)/g) || []).length, 1);
      assert.equal((previewScript.match(/function circleRectCollide\(/g) || []).length, 1);
      assert.match(previewScript, /roomIdEl\.textContent = payload\.roomId;\s+btnJoin\.click\(\);/);
      assert.match(previewScript, /inviteURL\.searchParams\.set\('room', currentRoomId\)/);
      assert.match(previewScript, /document\.execCommand\('copy'\)/);
      assert.match(previewScript, /iceServers:\[\]/);
      assert.doesNotMatch(previewScript, /\b(?:https?:\/\/|stun:|turn:)/i);
      assert.doesNotMatch(previewHtml, /(?:src|href)=["']https?:/i);
      assert.match(previewScript, /对局结束：\$\{payload\.winner === 'crew' \? '船员' : '破坏者'\}获胜/);
      assert.match(previewScript, /playersEl\.textContent='暂无'/);
      assert.match(previewScript, /p\.connected === false \? '离线' : '存活'/);
      assert.match(previewScript, /tag\.textContent='语音：'\+/);
      assert.match(previewScript, /btnEmergency\.disabled = !canPlay/);
      assert.match(previewScript, /btnTouchReport\.disabled = !canPlay/);
      assert.match(previewScript, /btnTouchEmergency\.disabled = !canPlay/);
      assert.doesNotMatch(previewScript, /Game Over:|Voice: |playersEl\.textContent='none'/);
      assert.match(previewHtml, /id="inviteLink"[^>]+readonly/);
      assert.match(previewHtml, /id="copyInvite"[^>]*>复制链接/);
      assert.equal((await request('/g/starliner/ship_map.png', 'gn_session=bad')).status, 403);
      for (let index = 0; index < 4; index++) {
        const response = await request('/api/session', null, 'POST');
        cookies.push(response.headers.get('set-cookie').split(';')[0]);
      }
      const clients = await Promise.all(cookies.map(connect));
      clients[0].socket.send('null');
      clients[0].send('sabotage', { kind: 1 });
      clients[0].send('createRoom');
      const { roomId } = await clients[0].next('roomCreated');
      const creator = clients[0].socket;
      const creatorClosed = new Promise(resolve => creator.once('close', resolve));
      creator.close();
      await creatorClosed;
      clients[0] = await connect(cookies[0]);
      for (const client of clients) client.send('join', { roomId, name: 'forged-name' });
      const joined = await Promise.all(clients.map(client => client.next('joined')));
      const ids = joined.map(message => message.playerId);
      assert.equal(new Set(ids).size, 4);
      assert.ok(joined.every(message => message.snapshot.players.every(player => player.role === 'unknown')));
      assert.ok(joined.every(message => message.snapshot.players.every(player => player.connected === true)));
      assert.ok(joined.every(message => message.snapshot.players.every(player => player.name !== 'forged-name')));
      const disconnectedClient = clients[3];
      const disconnected = new Promise(resolve => disconnectedClient.socket.once('close', resolve));
      disconnectedClient.socket.close();
      await disconnected;
      const offlineView = await clients[0].next('players', snapshot =>
        snapshot.players.some(player => player.id === ids[3] && player.connected === false));
      assert.equal(offlineView.players.find(player => player.id === ids[3]).role, 'unknown');
      clients[3] = await connect(cookies[3]);
      clients[3].send('join', { roomId });
      const rejoinedBeforeStart = await clients[3].next('joined');
      assert.equal(rejoinedBeforeStart.playerId, ids[3]);
      assert.ok(rejoinedBeforeStart.snapshot.players.every(player => player.connected === true));
      const onlineView = await clients[0].next('players', snapshot =>
        snapshot.players.some(player => player.id === ids[3] && player.connected === true));
      assert.ok(onlineView.players.every(player => player.role === 'unknown'));
      clients[0].send('startGame');
      const roles = await Promise.all(clients.map(client => client.next('role')));
      const phases = await Promise.all(clients.map(client => client.next('phase', snapshot => snapshot.phase === 'playing')));
      assert.ok(phases.every(snapshot => snapshot.players.every(player => player.role === 'unknown')));
      assert.equal(roles.filter(role => role.role === 'sab').length, 1);
      const sabIndex = roles.findIndex(role => role.role === 'sab');
      const crewIndices = roles.map((role, index) => role.role === 'crew' ? index : -1).filter(index => index >= 0);
      clients[sabIndex].send('chat', { channel: 'faction', text: 'secret-sab-message' });
      assert.equal((await clients[sabIndex].next('chat')).channel, 'faction');
      clients[crewIndices[0]].send('chat', { channel: 'faction', text: 'forged-sab-message' });
      clients[crewIndices[0]].send('chat', { channel: 'eliminated', text: 'forged-dead-message' });
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(!crewIndices.some(index => clients[index].received('chat')));
      assert.ok(!clients[sabIndex].received('chat'));
      clients[sabIndex].send('sabotage', { kind: 'lights' });
      await Promise.all(clients.map(client => client.next('sabotage', state => state.type === 'lights')));
      clients[crewIndices[0]].send('fixSabotage');
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(!clients.some(client => client.received('sabotage')));
      let walker = clients[crewIndices[2]];
      let positionX = 400;
      let positionY = 300;
      for (const [targetX, targetY] of [[100, 300], [100, 240], [160, 240], [160, 140]]) {
        const steps = Math.ceil(Math.hypot(targetX - positionX, targetY - positionY) / 5);
        for (let step = 1; step <= steps; step++) {
          walker.send('move', {
            x: Math.round(positionX + (targetX - positionX) * step / steps),
            y: Math.round(positionY + (targetY - positionY) * step / steps),
          });
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        positionX = targetX;
        positionY = targetY;
      }
      assert.ok(!walker.received('pos'));
      walker.send('fixSabotage');
      await Promise.all(clients.map(client => client.next('sabotage', state => state.type === null)));
      const taskId = 'wires-upper-left';
      walker.send('taskComplete', { taskId });
      assert.equal((await walker.next('taskRejected')).taskId, taskId);
      walker.send('beginTask', { taskId });
      assert.equal((await walker.next('taskStarted')).taskId, taskId);
      walker.send('taskComplete', { taskId });
      assert.equal((await walker.next('taskRejected')).taskId, taskId);
      walker.send('beginTask', { taskId });
      await walker.next('taskStarted');
      for (let step = 1; step <= 11; step++) {
        walker.send('move', { x: 160, y: 140 + step * 5 });
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      walker.send('taskComplete', { taskId });
      assert.equal((await walker.next('taskRejected')).taskId, taskId);
      for (let step = 10; step >= 0; step--) {
        walker.send('move', { x: 160, y: 140 + step * 5 });
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      assert.ok(!walker.received('pos'));
      walker.send('beginTask', { taskId });
      await walker.next('taskStarted');
      const staleWalker = walker;
      const staleWalkerClosed = new Promise(resolve => staleWalker.socket.once('close', resolve));
      const reconnectedWalker = await connect(cookies[crewIndices[2]]);
      reconnectedWalker.send('join', { roomId });
      const rejoinedWalker = await reconnectedWalker.next('joined');
      assert.equal(await staleWalkerClosed, 4001);
      assert.deepEqual(rejoinedWalker.completedTasks, []);
      assert.equal((await reconnectedWalker.next('role')).role, 'crew');
      clients[crewIndices[2]] = walker = reconnectedWalker;
      walker.send('taskComplete', { taskId });
      assert.equal((await walker.next('taskRejected')).taskId, taskId);
      walker.send('beginTask', { taskId });
      assert.equal((await walker.next('taskStarted')).taskId, taskId);
      clients[crewIndices[0]].send('callMeeting');
      await Promise.all(clients.map(client => client.next('phase', state => state.phase === 'meeting')));
      for (const client of clients) client.send('vote', {});
      await Promise.all(clients.map(client => client.next('phase', state => state.phase === 'playing')));
      await new Promise(resolve => setTimeout(resolve, 2100));
      walker.send('taskComplete', { taskId });
      assert.equal((await walker.next('taskRejected')).taskId, taskId);
      walker.send('beginTask', { taskId });
      assert.equal((await walker.next('taskStarted')).taskId, taskId);
      await new Promise(resolve => setTimeout(resolve, 2100));
      walker.send('taskComplete', { taskId });
      assert.equal((await walker.next('taskAccepted')).taskId, taskId);
      const taskUpdates = await Promise.all(clients.map(client => client.next('tasks')));
      assert.ok(taskUpdates.every(update => update.tasksDone === 1 && update.totalTasks === 15));
      assert.ok(clients.every((client, index) => index === crewIndices[2] || !client.received('taskAccepted')));
      walker.send('taskComplete', { taskId });
      assert.equal((await walker.next('taskRejected')).taskId, taskId);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(clients.every(client => !client.received('tasks')));
      clients[sabIndex].send('sabotage', { kind: 'o2' });
      await Promise.all(clients.map(client => client.next('sabotage', state => state.type === 'o2')));
      walker.send('fixSabotage', { side: 'left' });
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(clients.every(client => !client.received('sabotageUpdate')));
      const walkTo = async points => {
        let [originX, originY] = points[0];
        for (const [targetX, targetY] of points.slice(1)) {
          const steps = Math.ceil(Math.hypot(targetX - originX, targetY - originY) / 5);
          for (let step = 1; step <= steps; step++) {
            walker.send('move', {
              x: Math.round(originX + (targetX - originX) * step / steps),
              y: Math.round(originY + (targetY - originY) * step / steps),
            });
            await new Promise(resolve => setTimeout(resolve, 40));
          }
          originX = targetX;
          originY = targetY;
        }
      };
      await walkTo([[160, 140], [150, 140], [150, 235], [105, 235], [105, 495], [205, 495], [205, 445]]);
      assert.ok(!walker.received('pos'));
      walker.send('fixSabotage', { side: 'left' });
      const leftUpdates = await Promise.all(clients.map(client => client.next('sabotageUpdate')));
      assert.ok(leftUpdates.every(state => state.data.left && !state.data.right));
      await walkTo([[205, 445], [205, 495], [725, 495], [725, 445]]);
      assert.ok(!walker.received('pos'));
      walker.send('fixSabotage', { side: 'right' });
      await Promise.all(clients.map(client => client.next('sabotage', state => state.type === null)));
      clients[crewIndices[0]].send('move', { x: 900, y: 100 });
      const correction = await clients[crewIndices[0]].next('pos', position => position.id === ids[crewIndices[0]]);
      assert.equal(correction.x, 400);
      clients[crewIndices[0]].send('taskComplete', { taskId: 'forged-task' });
      clients[crewIndices[0]].send('report');
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(!clients.some(client => client.received('tasks') || client.received('phase')));
      const staleRecovered = clients[crewIndices[0]];
      const staleRecoveredClosed = new Promise(resolve => staleRecovered.socket.once('close', resolve));
      const recovered = await connect(cookies[crewIndices[0]]);
      recovered.send('join', { roomId });
      const recoveredState = await recovered.next('joined');
      assert.equal(await staleRecoveredClosed, 4001);
      assert.equal(recoveredState.playerId, ids[crewIndices[0]]);
      assert.equal(recoveredState.snapshot.phase, 'playing');
      assert.ok(recoveredState.snapshot.players.every(player => player.role === 'unknown'));
      assert.equal((await recovered.next('role')).role, 'crew');
      clients[crewIndices[0]] = recovered;
      const outsider = await connect((await request('/api/session', null, 'POST')).headers.get('set-cookie').split(';')[0]);
      outsider.send('join', { roomId });
      assert.match((await outsider.next('joinRejected')).message, /已开始/);
      assert.ok(!outsider.received('joined') && !outsider.received('role'));
      await new Promise(resolve => setTimeout(resolve, 15200));
      clients[sabIndex].send('kill', { targetId: ids[crewIndices[1]] });
      await clients[crewIndices[0]].next('killed', event => event.targetId === ids[crewIndices[1]]);
      clients[crewIndices[0]].send('report');
      await clients[crewIndices[0]].next('phase', snapshot => snapshot.phase === 'meeting');
      clients[crewIndices[1]].send('chat', { text: 'dead-channel-leak' });
      clients[crewIndices[1]].send('chat', { channel: 'eliminated', text: 'dead-only-message' });
      assert.equal((await clients[crewIndices[1]].next('chat')).channel, 'eliminated');
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(![sabIndex, crewIndices[0], crewIndices[2]].some(index => clients[index].received('chat')));
      clients[crewIndices[0]].send('chat', { text: 'public-discussion' });
      assert.equal((await clients[crewIndices[2]].next('chat', payload => payload.text === 'public-discussion')).channel, 'public');
      assert.ok(!clients[crewIndices[1]].received('chat', payload => payload.channel === 'public'));
      assert.ok(!clients[crewIndices[2]].received('chat'));
      assert.ok(!outsider.received('phase') && !outsider.received('role'));
      for (const index of [sabIndex, crewIndices[0], crewIndices[2]]) {
        clients[index].send('vote', { targetId: ids[sabIndex] });
      }
      await clients[crewIndices[0]].next('gameEnded', payload => payload.winner === 'crew');
      const afterMatch = await connect(cookies[crewIndices[0]]);
      afterMatch.send('join', { roomId });
      const finalView = await afterMatch.next('joined');
      assert.equal(finalView.snapshot.phase, 'ended');
      assert.equal(finalView.snapshot.winner, 'crew');
      assert.ok(finalView.snapshot.players.every(player => player.role === 'unknown'));
      assert.equal((await afterMatch.next('role')).role, 'crew');
      let stats;
      for (let attempt = 0; attempt < 40; attempt++) {
        stats = (await (await request('/api/me/stats', cookies[crewIndices[0]])).json()).stats;
        if (stats.some(entry => entry.gameId === 'starliner')) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const result = stats.find(entry => entry.gameId === 'starliner');
      assert.equal(result?.trustLevel, 'casual', logs);
      assert.equal(result?.ruleVersion, 'starliner-adapter-v2');
      assert.equal(result?.wins, 1);
      assert.equal(result?.playerCount, 4);
      const factionCookies = await Promise.all(Array.from({ length: 10 }, async () => {
        const response = await request('/api/session', null, 'POST');
        return response.headers.get('set-cookie').split(';')[0];
      }));
      const factionClients = await Promise.all(factionCookies.map(connect));
      factionClients[0].send('createRoom');
      const factionRoom = (await factionClients[0].next('roomCreated')).roomId;
      for (const client of factionClients) client.send('join', { roomId: factionRoom });
      await Promise.all(factionClients.map(client => client.next('joined')));
      factionClients[0].send('startGame');
      const factionRoles = await Promise.all(factionClients.map(client => client.next('role')));
      const saboteurs = factionRoles.flatMap((role, index) => role.role === 'sab' ? [index] : []);
      assert.equal(saboteurs.length, 2);
      factionClients[saboteurs[0]].send('chat', { channel: 'faction', text: 'two-sab-secret' });
      assert.equal((await factionClients[saboteurs[1]].next('chat')).channel, 'faction');
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(factionClients.every((client, index) =>
        saboteurs.includes(index) || !client.received('chat')));
    } finally {
      for (const socket of connections) socket.terminate();
      server.kill();
      if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
      if (dataDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
