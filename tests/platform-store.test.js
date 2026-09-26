const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../platform/store');

test('player identity persists and duplicate results do not change grouped stats', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-store-'));
  try {
    let store = createStore(dataDir);
    const first = store.newSession();
    const second = store.newSession();
    assert.equal(store.session(first.token).playerId, first.player.playerId);
    assert.equal(store.session('invalid'), null);
    store.rename(first.player.playerId, '玩家甲');
    const match = {
      matchId: 'match-1', roomId: 'ABC', gameId: 'doudizhu', gameVersion: 'test',
      mode: 'classic', ruleVersion: 'v1', playerCount: 3, humanCount: 2,
      trustLevel: 'casual', startedAt: Date.now(), players: [
        { playerId: first.player.playerId, nickname: '玩家甲', faction: 'landlord', outcome: 'win' },
        { playerId: second.player.playerId, nickname: '玩家乙', faction: 'farmers', outcome: 'loss' },
      ],
    };
    assert.equal(store.record(match), true);
    assert.equal(store.record(match), false);
    const code = store.newRecoveryCode(first.player.playerId);
    store.close();

    store = createStore(dataDir);
    assert.equal(store.session(first.token).nickname, '玩家甲');
    const recovered = store.recover(code);
    assert.equal(recovered.player.playerId, first.player.playerId);
    assert.equal(store.recover(code), null);
    assert.equal(store.session(first.token), null);
    assert.equal(store.session(recovered.token).nickname, '玩家甲');
    assert.deepEqual(store.stats(first.player.playerId).map(row => ({
      faction: row.faction, trustLevel: row.trustLevel, played: row.played, wins: row.wins,
    })), [{ faction: 'landlord', trustLevel: 'casual', played: 1, wins: 1 }]);
    assert.equal(store.stats(second.player.playerId)[0].winRate, 0);
    assert.equal(store.leaderboard('landlord').length, 0);
    store.close();
  } finally {
    if (dataDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
