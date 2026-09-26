const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('failed Starliner preview service returns 503 without taking down the hall', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-starliner-failure-'));
  const serviceDir = path.join(directory, 'service');
  fs.mkdirSync(serviceDir);
  fs.writeFileSync(path.join(serviceDir, 'server.js'), 'process.exit(1);\n');
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: '3194', STARLINER_PORT: '8194', STARLINER_DIR: serviceDir,
      ENABLE_STARLINER_PREVIEW: '1', KOF_WING_DIR: '', DATA_DIR: path.join(directory, 'data') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  try {
    let health;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { health = await fetch('http://127.0.0.1:3194/healthz'); if (health.ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(health?.status, 200, logs);
    const integrations = await (await fetch('http://127.0.0.1:3194/api/integrations')).json();
    assert.deepEqual(integrations.integrations['social-starliner'], {
      configured: true,
      available: false,
      enabled: false,
      entry: '/g/starliner/',
      status: 'preview',
    });
    const unavailable = await fetch('http://127.0.0.1:3194/g/starliner/');
    assert.equal(unavailable.status, 503, logs);
    assert.match(await unavailable.text(), /阵营推理预览服务暂不可用/);
    assert.equal((await fetch('http://127.0.0.1:3194/healthz')).status, 200);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
    if (directory.startsWith(os.tmpdir() + path.sep)) fs.rmSync(directory, { recursive: true, force: true });
  }
});
