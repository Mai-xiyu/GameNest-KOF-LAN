const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const WebSocket = require('ws');
const { createBilliardsProxy } = require('../deploy/billiards-proxy');
const { createStarlinerProxy } = require('../deploy/starliner-proxy');
const { createOnenightProxy } = require('../deploy/onenight-proxy');

const player = { playerId: 'ca8478b3-7623-448f-85bf-9b97d937683b', nickname: '玩家甲' };

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function noCredentials(headers) {
  for (const key of ['cookie', 'authorization', 'proxy-authorization', 'forwarded',
    'x-forwarded-host', 'x-gamenest-role']) {
    assert.equal(headers[key], undefined, `${key} leaked into game service`);
  }
}

for (const game of [
  { name: 'billiards', prefix: '/g/billiards', wsPath: '/ws?room_id=ABCDE',
    create: (port, session, link) => createBilliardsProxy(port, session, link) },
  { name: 'starliner', prefix: '/g/starliner', wsPath: '/ws',
    create: (port, session) => createStarlinerProxy(port, session) },
  { name: 'onenight', prefix: '/g/onenight', wsPath: '/ws',
    create: (port, session) => createOnenightProxy(port, session) },
]) {
  test(`${game.name} proxy never forwards platform credentials or spoofed identity`, async () => {
    const upstreamSockets = new Set();
    const upstream = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'gn_session=forged; Path=/');
      res.end(JSON.stringify({ headers: req.headers, path: req.url }));
    });
    const wss = new WebSocket.Server({ noServer: true });
    wss.on('headers', headers => headers.push('Set-Cookie: gn_session=forged; Path=/'));
    upstream.on('upgrade', (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, connection => {
        upstreamSockets.add(connection);
        connection.once('close', () => upstreamSockets.delete(connection));
        connection.send(JSON.stringify({ headers: req.headers, path: req.url }));
      });
    });
    const upstreamPort = await listen(upstream);
    const links = [];
    const session = req => req.headers.cookie === 'gn_session=secret' ? player : null;
    const proxy = game.create(upstreamPort, session, (...args) => links.push(args));
    const app = express();
    app.use(game.prefix, proxy.request);
    const gateway = http.createServer(app);
    gateway.on('upgrade', proxy.upgrade);
    const port = await listen(gateway);
    const base = `http://127.0.0.1:${port}`;
    const headers = { Cookie: 'gn_session=secret', Authorization: 'Bearer private',
      'Proxy-Authorization': 'Basic private', Forwarded: 'for=private',
      'X-Forwarded-Host': 'private.example', 'X-Gamenest-Player': 'forged',
      'X-Gamenest-Role': 'sab', Origin: base };
    let client;
    let upgradeHeaders;
    try {
      const httpResponse = await fetch(base + game.prefix + '/', { headers });
      assert.equal(httpResponse.status, 200);
      assert.equal(httpResponse.headers.get('set-cookie'), null);
      const receivedHttp = await httpResponse.json();
      noCredentials(receivedHttp.headers);
      assert.notEqual(receivedHttp.headers['x-gamenest-player'], 'forged');
      assert.equal((await fetch(base + game.prefix + '/', {
        headers: { Cookie: 'gn_session=invalid' },
      })).status, game.name === 'billiards' ? 401 : 403);
      const receivedWs = await new Promise((resolve, reject) => {
        client = new WebSocket(base.replace('http:', 'ws:') + game.prefix + game.wsPath, { headers });
        client.once('upgrade', response => { upgradeHeaders = response.headers; });
        client.once('message', raw => resolve(JSON.parse(raw.toString())));
        client.once('error', reject);
      });
      noCredentials(receivedWs.headers);
      assert.equal(upgradeHeaders['set-cookie'], undefined);
      assert.equal(receivedWs.headers['x-gamenest-player'], receivedHttp.headers['x-gamenest-player']);
      assert.equal(receivedWs.path, game.wsPath);
      if (game.name !== 'billiards') {
        assert.equal(receivedWs.headers['x-gamenest-player'], player.playerId);
        assert.equal(Buffer.from(receivedWs.headers['x-gamenest-name'], 'base64url').toString(), player.nickname);
      } else {
        assert.notEqual(receivedWs.headers['x-gamenest-player'], player.playerId);
        assert.ok(links.some(([externalId, playerId]) =>
          externalId === receivedWs.headers['x-gamenest-player'] && playerId === player.playerId));
      }
    } finally {
      client?.terminate();
      for (const socket of upstreamSockets) socket.terminate();
      gateway.closeAllConnections();
      upstream.closeAllConnections();
      await Promise.all([
        new Promise(resolve => gateway.close(resolve)),
        new Promise(resolve => upstream.close(resolve)),
        new Promise(resolve => wss.close(resolve)),
      ]);
    }
  });
}
