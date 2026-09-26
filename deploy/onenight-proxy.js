const http = require('node:http');
const { gameRequestHeaders, gameResponseHeaders } = require('./proxy-headers');

const prefix = '/g/onenight';

function createOnenightProxy(port, sessionFromRequest) {
  function authorize(req) {
    const player = sessionFromRequest(req);
    const origin = req.headers.origin;
    if (!player || (origin && origin !== `http://${req.headers.host}`)) return null;
    return {
      ...gameRequestHeaders(req),
      'x-gamenest-player': player.playerId,
      'x-gamenest-name': Buffer.from(player.nickname, 'utf8').toString('base64url'),
    };
  }

  function request(req, res) {
    const headers = authorize(req);
    if (!headers) { res.sendStatus(403); return; }
    const upstream = http.request({
      hostname: '127.0.0.1', port,
      path: req.originalUrl.slice(prefix.length) || '/',
      method: req.method, headers, timeout: 10000,
    }, response => {
      res.writeHead(response.statusCode, gameResponseHeaders(response.headers));
      response.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('One Night Werewolf timed out')));
    upstream.on('error', () => {
      if (!res.headersSent) res.status(503).send('一夜狼人杀预览服务暂不可用');
      else res.destroy();
    });
    req.pipe(upstream);
  }

  function upgrade(req, clientSocket, head) {
    const headers = authorize(req);
    if (!headers) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const upstream = http.request({
      hostname: '127.0.0.1', port, path: '/ws',
      method: 'GET', headers, timeout: 10000,
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
    upstream.on('timeout', () => upstream.destroy(new Error('One Night Werewolf timed out')));
    upstream.on('error', () => clientSocket.destroy());
    upstream.end();
  }

  return { request, upgrade };
}

module.exports = { createOnenightProxy };
