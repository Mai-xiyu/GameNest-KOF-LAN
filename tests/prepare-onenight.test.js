const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REVISION = '6a60bc96a72c6f93cb10938f970011f733a72df8';

test('One Night preparation replays over the pinned upstream without replacing its rule engine', {
  skip: !process.env.TEST_ONENIGHT_SOURCE,
}, () => {
  const source = path.resolve(process.env.TEST_ONENIGHT_SOURCE);
  const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(head, REVISION);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-prepare-onenight-'));
  const output = path.join(temporary, 'output');
  try {
    execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/prepare-onenight.js'), source, output], {
      stdio: 'pipe',
    });
    const manager = fs.readFileSync(path.join(output, 'server/src/RoomManager.ts'), 'utf8');
    const index = fs.readFileSync(path.join(output, 'server/src/index.ts'), 'utf8');
    const utils = fs.readFileSync(path.join(output, 'server/src/utils.ts'), 'utf8');
    const frontendSocket = fs.readFileSync(path.join(output, 'frontend/src/lib/useWebSocket.ts'), 'utf8');
    const nextConfig = fs.readFileSync(path.join(output, 'frontend/next.config.js'), 'utf8');

    assert.match(manager, /private identities = new Map/);
    assert.match(manager, /revokePlayer\(playerId: string\)/);
    assert.match(manager, /if \(room\.gameState\) \{/);
    assert.match(manager, /existingSocket\.close\(4001, 'Reconnected elsewhere'\)/);
    assert.match(manager, /event: 'role_assigned', roleId: player\.assignedRoleId/);
    assert.doesNotMatch(manager, /normalizeNickname|uuidv4/);
    assert.match(index, /x-gamenest-player/);
    assert.match(index, /manager\.revokePlayer\(payload\.playerId\)/);
    assert.match(index, /server\.listen\(PORT, '127\.0\.0\.1'/);
    assert.match(utils, /randomInt/);
    assert.doesNotMatch(utils, /Math\.random/);
    assert.match(frontendSocket, /\/g\/onenight\/ws/);
    assert.match(nextConfig, /basePath: '\/g\/onenight'/);
    assert.equal(fs.existsSync(path.join(output, 'node_modules')), false);

    for (const preserved of ['GameStateFactory.ts', 'NightPhaseEngine.ts', 'ResolutionEngine.ts', 'roles.ts']) {
      assert.equal(
        fs.readFileSync(path.join(output, 'server/src', preserved), 'utf8'),
        fs.readFileSync(path.join(source, 'server/src', preserved), 'utf8'),
        `${preserved} must remain upstream-owned`,
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
