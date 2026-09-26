const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const WebSocket = require('ws');
const {
  createMamahjongProxy,
  externalPath,
  platformCredentials,
  safeNickname,
} = require('../deploy/mamahjong-proxy');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

test('MaMahjong public paths map to the untouched upstream route layout', () => {
  assert.equal(externalPath('/g/mamahjong/'), '/game/');
  assert.equal(externalPath('/g/mamahjong/assets/app.js?v=1'), '/game/assets/app.js?v=1');
  assert.equal(externalPath('/g/mamahjong/api/v1/rooms'), '/api/v1/rooms');
  assert.equal(externalPath('/g/mamahjong/user-assets/avatar.png'), '/user-assets/avatar.png');
  assert.equal(externalPath('/g/mamahjong/#lobby'), '/game/#lobby');
});

test('platform credentials are deterministic, scoped, and never derived from nicknames', () => {
  const secret = Buffer.alloc(32, 7);
  const first = platformCredentials(secret, 'player-one');
  const repeated = platformCredentials(secret, 'player-one');
  const other = platformCredentials(secret, 'player-two');

  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, other);
  assert.match(first.loginName, /^gn_[0-9a-f]{24}$/);
  assert.ok(first.password.length >= 40);
  assert.equal(safeNickname('A'), '玩家A');
  assert.equal(Array.from(safeNickname('一二三四五六七八九十一二三四五六七八九十二三四五六')).length, 24);
});

test('MaMahjong proxy bridges platform identity and strips platform credentials', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-mamahjong-proxy-'));
  const upstreamRequests = [];
  const links = [];
  let account = null;
  const token = 'upstream_session_token_1234567890';
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      upstreamRequests.push({ path: req.url, method: req.method, headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'gn_session=forged; Path=/');
      if (req.url === '/api/v1/registrations' && req.method === 'POST') {
        if (account) {
          res.statusCode = 409;
          res.end(JSON.stringify({ code: 'auth.login_name_taken' }));
          return;
        }
        account = {
          id: 'mm-user-1', login_name: body.login_name,
          profile: { nickname: body.nickname },
        };
        res.statusCode = 201;
        res.end(JSON.stringify({ user: account, session: { token, token_type: 'Bearer' } }));
        return;
      }
      if (req.url === '/api/v1/sessions' && req.method === 'POST') {
        res.end(JSON.stringify({ user: account, session: { token, token_type: 'Bearer' } }));
        return;
      }
      if (req.url === '/api/v1/users/me' && req.headers.authorization === `Bearer ${token}`) {
        res.end(JSON.stringify(account));
        return;
      }
      if (req.url === '/api/v1/users/me/profile' && req.method === 'PATCH') {
        account = { ...account, profile: { ...account.profile, nickname: body.nickname } };
        res.end(JSON.stringify(account));
        return;
      }
      res.end(JSON.stringify({ path: req.url, headers: req.headers }));
    });
  });
  const wss = new WebSocket.Server({ noServer: true });
  const sockets = new Set();
  upstream.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, connection => {
      sockets.add(connection);
      connection.once('close', () => sockets.delete(connection));
      connection.send(JSON.stringify({ path: req.url, headers: req.headers }));
    });
  });
  const upstreamPort = await listen(upstream);
  const player = { playerId: 'ca8478b3-7623-448f-85bf-9b97d937683b', nickname: '局域网玩家' };
  const session = req => req.headers.cookie === 'gn_session=secret' ? player : null;
  const proxy = createMamahjongProxy(upstreamPort, session,
    (externalId, playerId) => links.push([externalId, playerId]), dataDir);
  const app = express();
  app.use('/g/mamahjong', proxy.request);
  const gateway = http.createServer(app);
  gateway.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/g/mamahjong/')) proxy.upgrade(req, socket, head);
    else socket.destroy();
  });
  const port = await listen(gateway);
  const base = `http://127.0.0.1:${port}`;
  const headers = {
    Cookie: 'gn_session=secret',
    Origin: base,
    Authorization: 'Bearer upstream_session_token_1234567890',
    'X-Gamenest-Player': 'forged',
  };
  let client;
  try {
    const bridged = await fetch(`${base}/g/mamahjong/api/v1/platform-session`, {
      method: 'POST', headers,
    });
    assert.equal(bridged.status, 200);
    assert.equal(bridged.headers.get('set-cookie'), null);
    const auth = await bridged.json();
    assert.equal(auth.user.id, 'mm-user-1');
    assert.equal(auth.user.profile.nickname, player.nickname);
    assert.equal(auth.session.token, token);
    assert.deepEqual(links.at(-1), ['mm-user-1', player.playerId]);
    const registration = upstreamRequests.find(request => request.path === '/api/v1/registrations');
    assert.equal(registration.headers.cookie, undefined);
    assert.equal(registration.headers.authorization, undefined);
    assert.notEqual(registration.body.login_name, player.playerId);
    assert.equal(registration.body.nickname, player.nickname);

    const page = await fetch(`${base}/g/mamahjong/`, { headers });
    const pageBody = await page.json();
    assert.equal(pageBody.path, '/game/');
    assert.equal(pageBody.headers.cookie, undefined);
    assert.equal(pageBody.headers['x-gamenest-player'], undefined);
    assert.equal(pageBody.headers.authorization, headers.Authorization);
    assert.equal(page.headers.get('set-cookie'), null);

    const asset = await fetch(`${base}/g/mamahjong/assets/app.js?v=1`, { headers });
    assert.equal((await asset.json()).path, '/game/assets/app.js?v=1');
    const blockedLogin = await fetch(`${base}/g/mamahjong/api/v1/sessions`, {
      method: 'POST', headers,
    });
    assert.equal(blockedLogin.status, 403);
    const missingPlatform = await fetch(`${base}/g/mamahjong/`);
    assert.equal(missingPlatform.status, 401);

    const wsMessage = await new Promise((resolve, reject) => {
      client = new WebSocket(`ws://127.0.0.1:${port}/g/mamahjong/api/v1/ws?ticket=ticket-1`, { headers });
      client.once('message', raw => resolve(JSON.parse(raw.toString())));
      client.once('error', reject);
    });
    assert.equal(wsMessage.path, '/api/v1/ws?ticket=ticket-1');
    assert.equal(wsMessage.headers.cookie, undefined);
    assert.equal(wsMessage.headers['x-gamenest-player'], undefined);
  } finally {
    client?.terminate();
    for (const socket of sockets) socket.terminate();
    gateway.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise(resolve => gateway.close(resolve)),
      new Promise(resolve => upstream.close(resolve)),
      new Promise(resolve => wss.close(resolve)),
    ]);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
