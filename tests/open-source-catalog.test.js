const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCatalog() {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'public/js/game-catalog.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.gameCatalog.list();
}

test('GameNest built-ins are exposed as prototypes rather than accepted release games', () => {
  const games = loadCatalog();
  const builtIns = games.filter((game) => game.status === 'prototype');

  assert.ok(builtIns.length > 0);
  assert.equal(builtIns.every((game) => game.status === 'prototype'), true);
  assert.equal(builtIns.every((game) => game.acceptance === 'not-real-player-verified'), true);
  assert.equal(builtIns.every((game) => game.source.startsWith('absswds/GameNest@')), true);
});

test('Mahjong and Dou Dizhu are explicitly described as replaceable prototypes', () => {
  const games = loadCatalog();
  const mahjong = games.find((game) => game.id === 'mahjong-sichuan');
  const doudizhu = games.find((game) => game.id === 'doudizhu');
  const billiards = games.find((game) => game.id === 'billiards');

  assert.equal(mahjong.status, 'prototype');
  assert.match(mahjong.description, /开源网页麻将/);
  assert.equal(doudizhu.status, 'prototype');
  assert.match(doudizhu.description, /开源上游/);
  assert.equal(billiards.status, 'preview');
  assert.equal(billiards.externalEntry, '/g/billiards/');
  assert.equal(billiards.source, 'axfsz/billiards@ec9a66ac67b3576c74b56aff75fde68895ccdca9');
});

test('every default-lobby entry points to a pinned upstream or fingerprinted local bundle', () => {
  const games = loadCatalog();
  const visible = games.filter((game) => game.status !== 'prototype');
  const launchable = visible.filter((game) => game.status !== 'candidate');

  assert.ok(visible.length > 0);
  assert.equal(visible.every((game) => /^[^/]+\/[^@]+@[0-9a-f]{40}$/.test(game.source) ||
    /^user-supplied-local-bundle@sha256:[0-9a-f]{64}$/.test(game.source)), true);
  assert.equal(launchable.every((game) => game.status === 'preview' &&
    (game.externalEntry || game.integrationMode === 'embedded-upstream-module')), true);
});

test('KOF Wing is a fingerprinted runtime-gated local integration', () => {
  const games = loadCatalog();
  const kof = games.find((game) => game.id === 'kof-wing');

  assert.equal(kof.status, 'candidate');
  assert.equal(kof.externalEntry, undefined);
  assert.match(kof.source, /^user-supplied-local-bundle@sha256:[0-9a-f]{64}$/);
  assert.equal(kof.maxPlayers, 2);
  assert.match(kof.description, /唯一权威实例/);
  assert.match(kof.description, /暂不接入战绩或排行榜/);
});

test('Checkers is an explicit pinned upstream preview, not a hidden built-in prototype', () => {
  const games = loadCatalog();
  const checkers = games.find((game) => game.id === 'checkers');

  assert.equal(checkers.status, 'preview');
  assert.equal(checkers.integrationMode, 'embedded-upstream-module');
  assert.equal(checkers.source, 'absswds/GameNest@c9f1207be23012a8cb278f312ccbd81196a760c3');
  assert.equal(checkers.acceptance, 'automated-two-session-only');
  assert.match(checkers.description, /强制吃子/);
  assert.match(checkers.description, /真人双设备.*未完成/);
});

test('release lobby has no client-side switch for built-in prototypes', () => {
  const root = path.resolve(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

  assert.match(page, /游戏来源与完成度/);
  assert.match(page, /自制原型不再提供网页入口或创建权限/);
  assert.match(page, /g\.status !== 'prototype'/);
  assert.doesNotMatch(page, /__showPrototypes|\?prototypes=1|prototypeStats|斗地主原型成绩/);
});

test('dedicated MaMahjong upstream is exposed only as an integration preview', () => {
  const games = loadCatalog();
  const preview = games.find((game) => game.id === 'mahjong-mamahjong');

  assert.equal(preview.status, 'preview');
  assert.equal(preview.externalEntry, '/g/mamahjong/');
  assert.equal(preview.source, 'yemaster/mamahjong@c903603cfefc5786126173b33468e7df001280de');
  assert.match(preview.description, /服务端权威规则/);
  assert.match(preview.description, /平台稳定身份/);
  assert.match(preview.description, /真人多设备.*未完成/);
});
