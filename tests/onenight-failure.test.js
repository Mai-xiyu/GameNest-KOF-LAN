const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

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

test('failed One Night preview service returns 503 without taking down the hall', async () => {
  const hallPort = await getFreePort();
  const onenightPort = await getFreePort();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-onenight-failure-'));
  const serviceDir = path.join(directory, 'service');
  fs.mkdirSync(path.join(serviceDir, 'server', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(serviceDir, 'server', 'dist', 'index.js'), 'process.exit(1);\n');
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(hallPort),
      ONENIGHT_PORT: String(onenightPort),
      ONENIGHT_DIR: serviceDir,
      ENABLE_ONENIGHT_PREVIEW: '1',
      KOF_WING_DIR: '',
      DATA_DIR: path.join(directory, 'data'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${hallPort}`;
  try {
    let health;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        health = await fetch(base + '/healthz');
        if (health.ok) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(health?.status, 200, logs);
    const integrations = await (await fetch(base + '/api/integrations')).json();
    assert.deepEqual(integrations.integrations['social-onenight'], {
      configured: true,
      available: false,
      enabled: false,
      entry: '/g/onenight/',
      status: 'preview',
    });
    const unavailable = await fetch(base + '/g/onenight/');
    assert.equal(unavailable.status, 503, logs);
    assert.match(await unavailable.text(), /一夜狼人杀预览服务暂不可用/);
    assert.equal((await fetch(base + '/healthz')).status, 200);
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
    if (directory.startsWith(os.tmpdir() + path.sep)) fs.rmSync(directory, { recursive: true, force: true });
  }
});
