const http = require('node:http');
const crypto = require('node:crypto');
const { gameRequestHeaders, gameResponseHeaders } = require('./proxy-headers');

const prefix = '/g/billiards';

function platformIdentity(playerId) {
  return crypto.createHash('sha256').update(playerId).digest('base64url').slice(0, 32);
}

function createBilliardsProxy(port, sessionFromRequest, linkPlayer) {
  function headers(req, playerId) {
    const externalId = platformIdentity(playerId);
    linkPlayer(externalId, playerId);
    return { ...gameRequestHeaders(req), 'x-gamenest-player': externalId };
  }

  function request(req, res) {
    const player = sessionFromRequest(req);
    if (!player) { res.status(401).json({ error: 'Platform session required' }); return; }
    const origin = req.headers.origin;
    if (origin && origin !== `${req.protocol}://${req.headers.host}`) { res.sendStatus(403); return; }
    const upstream = http.request({ hostname: '127.0.0.1', port,
      path: req.originalUrl.slice(prefix.length) || '/', method: req.method,
      headers: headers(req, player.playerId), timeout: 10000,
    }, response => {
      const responseHeaders = gameResponseHeaders(response.headers);
      if (String(responseHeaders['content-type'] || '').startsWith('text/html')) {
        responseHeaders['cache-control'] = 'no-store';
        delete responseHeaders.etag;
        delete responseHeaders['last-modified'];
      }
      res.writeHead(response.statusCode, responseHeaders);
      response.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('Billiards service timed out')));
    upstream.on('error', () => {
      if (!res.headersSent) res.status(503).send('台球服务暂不可用');
      else res.destroy();
    });
    req.pipe(upstream);
  }

  function upgrade(req, clientSocket, head) {
    const player = sessionFromRequest(req);
    const origin = req.headers.origin;
    if (!player || (origin && origin !== `http://${req.headers.host}`)) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const upstream = http.request({ hostname: '127.0.0.1', port,
      path: req.url.slice(prefix.length), method: 'GET', headers: headers(req, player.playerId),
      timeout: 10000,
    });
    upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      const responseHeaders = Object.entries(gameResponseHeaders(response.headers))
        .map(([key, value]) => `${key}: ${value}`).join('\r\n');
      clientSocket.write(`HTTP/1.1 101 Switching Protocols\r\n${responseHeaders}\r\n\r\n`);
      if (head.length) upstreamSocket.write(head);
      if (upstreamHead.length) clientSocket.write(upstreamHead);
      clientSocket.pipe(upstreamSocket).pipe(clientSocket);
      clientSocket.on('error', () => upstreamSocket.destroy());
      upstreamSocket.on('error', () => clientSocket.destroy());
    });
    upstream.on('response', response => {
      clientSocket.end(`HTTP/1.1 ${response.statusCode} ${http.STATUS_CODES[response.statusCode]}\r\nConnection: close\r\n\r\n`);
      response.resume();
    });
    upstream.on('timeout', () => upstream.destroy(new Error('Billiards service timed out')));
    upstream.on('error', () => clientSocket.destroy());
    upstream.end();
  }

  return { request, upgrade };
}

module.exports = { createBilliardsProxy };
