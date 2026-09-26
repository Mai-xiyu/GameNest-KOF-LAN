const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { gameRequestHeaders, gameResponseHeaders } = require('./proxy-headers');

const prefix = '/g/mamahjong';
const BRIDGE_SECRET_FILE = 'mamahjong-bridge-secret';

function loadBridgeSecret(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, BRIDGE_SECRET_FILE);
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const secret = crypto.randomBytes(32);
  fs.writeFileSync(file, secret, { flag: 'wx', mode: 0o600 });
  return secret;
}

function acceptedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

function externalPath(url) {
  const value = url.startsWith(prefix) ? url.slice(prefix.length) : url;
  const split = value.indexOf('?');
  const pathname = split < 0 ? value : value.slice(0, split);
  const query = split < 0 ? '' : value.slice(split);
  if (!pathname || pathname === '/') return `/game/${query}`;
  if (pathname.startsWith('/api/') || pathname.startsWith('/user-assets/') ||
      pathname.startsWith('/health/')) return pathname + query;
  if (pathname.startsWith('/assets/')) return '/game' + pathname + query;
  return '/game' + pathname + query;
}

function gameHeaders(req) {
  const headers = gameRequestHeaders(req);
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && /^Bearer [A-Za-z0-9_-]{16,512}$/.test(authorization)) {
    headers.authorization = authorization;
  }
  return headers;
}

function requestJson(port, requestPath, method, body, authorization) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const headers = { accept: 'application/json' };
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(payload.length);
    }
    if (authorization) headers.authorization = `Bearer ${authorization}`;
    const request = http.request({
      hostname: '127.0.0.1', port, path: requestPath, method, headers, timeout: 10000,
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) request.destroy(new Error('MaMahjong response too large'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        let parsed = null;
        try { parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null; } catch {}
        resolve({ status: response.statusCode, body: parsed });
      });
    });
    request.on('timeout', () => request.destroy(new Error('MaMahjong service timed out')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function platformCredentials(secret, playerId) {
  const identity = crypto.createHash('sha256').update(playerId).digest('hex').slice(0, 24);
  return {
    loginName: `gn_${identity}`,
    password: crypto.createHmac('sha256', secret).update(`mamahjong:${playerId}`).digest('base64url'),
  };
}

function safeNickname(value) {
  const characters = Array.from(String(value || '').trim()).filter(character => !/[\u0000-\u001f\u007f]/.test(character));
  const nickname = characters.slice(0, 24).join('');
  return Array.from(nickname).length >= 2 ? nickname : `玩家${nickname}`.slice(0, 24);
}

function createMamahjongProxy(port, sessionFromRequest, linkPlayer, dataDir) {
  const secret = loadBridgeSecret(dataDir);
  const cachedSessions = new Map();
  const pendingSessions = new Map();

  async function updateNickname(auth, nickname) {
    if (auth.user?.profile?.nickname === nickname) return auth;
    const updated = await requestJson(port, '/api/v1/users/me/profile', 'PATCH', { nickname }, auth.session.token);
    if (updated.status !== 200 || !updated.body?.id) throw new Error('MaMahjong nickname update failed');
    return { ...auth, user: updated.body };
  }

  async function issueSession(player) {
    const cached = cachedSessions.get(player.playerId);
    if (cached) {
      const current = await requestJson(port, '/api/v1/users/me', 'GET', undefined, cached.session.token);
      if (current.status === 200 && current.body?.id === cached.user.id) {
        const refreshed = await updateNickname({ ...cached, user: current.body }, safeNickname(player.nickname));
        cachedSessions.set(player.playerId, refreshed);
        linkPlayer(refreshed.user.id, player.playerId);
        return refreshed;
      }
      cachedSessions.delete(player.playerId);
    }

    const credentials = platformCredentials(secret, player.playerId);
    const nickname = safeNickname(player.nickname);
    let response = await requestJson(port, '/api/v1/registrations', 'POST', {
      login_name: credentials.loginName,
      password: credentials.password,
      nickname,
    });
    if (response.status === 409 && response.body?.code === 'auth.login_name_taken') {
      response = await requestJson(port, '/api/v1/sessions', 'POST', {
        login_name: credentials.loginName,
        password: credentials.password,
      });
    }
    if (![200, 201].includes(response.status) || !response.body?.session?.token || !response.body?.user?.id) {
      throw new Error(`MaMahjong identity bridge failed (${response.status || 'network'})`);
    }
    const auth = await updateNickname(response.body, nickname);
    cachedSessions.set(player.playerId, auth);
    linkPlayer(auth.user.id, player.playerId);
    return auth;
  }

  function platformSession(req, res, player) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.sendStatus(405); return; }
    let pending = pendingSessions.get(player.playerId);
    if (!pending) {
      pending = issueSession(player).finally(() => pendingSessions.delete(player.playerId));
      pendingSessions.set(player.playerId, pending);
    }
    pending.then(auth => {
      res.setHeader('Cache-Control', 'no-store');
      res.json(auth);
    }).catch(error => {
      console.error(error.message);
      res.status(503).json({ code: 'bridge.unavailable', message: '麻将身份服务暂不可用' });
    });
  }

  function request(req, res) {
    const player = sessionFromRequest(req);
    if (!player) { res.status(401).json({ error: 'Platform session required' }); return; }
    if (!acceptedOrigin(req)) { res.sendStatus(403); return; }
    const pathWithoutQuery = (req.originalUrl || req.url).split('?')[0];
    if (pathWithoutQuery === `${prefix}/api/v1/platform-session`) {
      platformSession(req, res, player);
      return;
    }
    if (req.method === 'POST' && (pathWithoutQuery === `${prefix}/api/v1/registrations` ||
        pathWithoutQuery === `${prefix}/api/v1/sessions`)) {
      res.status(403).json({ code: 'bridge.platform_identity_required', message: '请使用平台身份进入麻将' });
      return;
    }
    const upstream = http.request({
      hostname: '127.0.0.1', port, path: externalPath(req.originalUrl || req.url),
      method: req.method, headers: gameHeaders(req), timeout: 10000,
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
    upstream.on('timeout', () => upstream.destroy(new Error('MaMahjong service timed out')));
    upstream.on('error', () => {
      if (!res.headersSent) res.status(503).send('麻将服务暂不可用');
      else res.destroy();
    });
    req.pipe(upstream);
  }

  function upgrade(req, clientSocket, head) {
    const player = sessionFromRequest(req);
    if (!player || !acceptedOrigin(req)) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const upstream = http.request({
      hostname: '127.0.0.1', port, path: externalPath(req.url), method: 'GET',
      headers: gameHeaders(req), timeout: 10000,
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
    upstream.on('timeout', () => upstream.destroy(new Error('MaMahjong service timed out')));
    upstream.on('error', () => clientSocket.destroy());
    upstream.end();
  }

  return { request, upgrade };
}

module.exports = { createMamahjongProxy, externalPath, platformCredentials, safeNickname };
