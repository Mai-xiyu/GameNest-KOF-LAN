const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const PORT = 3189;
const base = `http://127.0.0.1:${PORT}`;

test('session and one-time recovery bind room access to persistent identity', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-api-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir,
      BILLIARDS_DIR: '', STARLINER_DIR: '', ENABLE_STARLINER_PREVIEW: '', MAMAHJONG_DIR: '',
      KOF_WING_DIR: '', ENABLE_BUILTIN_PROTOTYPES: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk; });
  let socket;
  try {
    let health;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { health = await fetch(`${base}/healthz`); break; } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    assert.equal(health?.status, 200, stderr);
    const integrations = await (await fetch(`${base}/api/integrations`)).json();
    assert.equal(Object.values(integrations.integrations).every(entry => entry.enabled === false), true);
    assert.equal(Object.values(integrations.integrations).every(entry => entry.configured === false), true);
    assert.equal(Object.values(integrations.integrations).every(entry => entry.available === false), true);

    const first = await fetch(`${base}/api/session`, { method: 'POST' });
    const original = await first.json();
    const cookie = first.headers.get('set-cookie').split(';')[0];
    assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await fetch(`${base}/api/session`, { method: 'POST', headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${base}/api/me/stats`)).status, 401);
    assert.equal((await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: 'http://evil.test' } })).status, 403);

    const unauthorized = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const rejected = new Promise(resolve => unauthorized.once('close', resolve));
    assert.equal(await rejected, 1008);

    socket = new WebSocket(`ws://127.0.0.1:${PORT}`, { headers: { Cookie: cookie } });
    await new Promise(resolve => socket.once('open', resolve));
    const prototypeRejected = new Promise(resolve => socket.once('message', raw => resolve(JSON.parse(raw.toString()))));
    socket.send(JSON.stringify({ type: 'create_room', data: { game: 'mahjong-sichuan', lang: 'zh' } }));
    assert.match((await prototypeRejected).message, /内置游戏原型已停用/);
    const rotated = new Promise(resolve => socket.once('close', resolve));
    const generated = await fetch(`${base}/api/me/recovery-code`, { method: 'POST', headers: { Cookie: cookie } });
    const { code } = await generated.json();
    const recovery = await fetch(`${base}/api/recover`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    assert.equal(recovery.status, 200);
    assert.equal((await recovery.json()).playerId, original.playerId);
    await rotated;
    assert.equal((await fetch(`${base}/api/me/stats`, { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await fetch(`${base}/api/recover`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    })).status, 401);
    const newCookie = recovery.headers.get('set-cookie').split(';')[0];
    const newStats = await fetch(`${base}/api/me/stats`, { headers: { Cookie: newCookie } });
    assert.equal((await newStats.json()).player.playerId, original.playerId);
  } finally {
    if (socket) socket.terminate();
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
    if (dataDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
