const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SESSION_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const STANDARD_DOUDIZHU_CONFIG = JSON.stringify({
  firstCaller: 'random', allowDouble: false, allowShowHand: false,
  playTimeLimit: 0, totalRounds: 1,
});

function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'gamenest.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      player_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      recovery_hash TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(player_id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS external_players (
      game_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      player_id TEXT NOT NULL REFERENCES players(player_id),
      PRIMARY KEY (game_id, external_id)
    );
    CREATE TABLE IF NOT EXISTS matches (
      match_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      game_version TEXT NOT NULL,
      mode TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      config_json TEXT NOT NULL,
      configured_player_count INTEGER NOT NULL,
      actual_human_count INTEGER NOT NULL,
      trust_level TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_players (
      match_id TEXT NOT NULL REFERENCES matches(match_id),
      player_id TEXT NOT NULL REFERENCES players(player_id),
      nickname TEXT NOT NULL,
      faction TEXT NOT NULL,
      outcome TEXT NOT NULL,
      PRIMARY KEY (match_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS match_players_player ON match_players(player_id);
  `);
  if (!db.prepare('PRAGMA table_info(players)').all().some(column => column.name === 'recovery_hash')) {
    db.exec('ALTER TABLE players ADD COLUMN recovery_hash TEXT');
  }
  if (!db.prepare('PRAGMA table_info(matches)').all().some(column => column.name === 'config_json')) {
    db.exec("ALTER TABLE matches ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}'");
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS players_recovery ON players(recovery_hash)');

  const hash = token => crypto.createHash('sha256').update(token).digest('hex');
  const getSession = db.prepare(`SELECT p.player_id AS playerId, p.nickname
    FROM sessions s JOIN players p ON p.player_id = s.player_id
    WHERE s.token_hash = ? AND s.expires_at > ?`);
  const insertPlayer = db.prepare('INSERT INTO players (player_id, nickname, created_at) VALUES (?, ?, ?)');
  const insertSession = db.prepare('INSERT INTO sessions VALUES (?, ?, ?)');
  const updateNickname = db.prepare('UPDATE players SET nickname = ? WHERE player_id = ?');
  const setRecovery = db.prepare('UPDATE players SET recovery_hash = ? WHERE player_id = ?');
  const getRecovery = db.prepare('SELECT player_id AS playerId, nickname FROM players WHERE recovery_hash = ?');
  const removeSessions = db.prepare('DELETE FROM sessions WHERE player_id = ?');
  const linkExternal = db.prepare('INSERT OR IGNORE INTO external_players VALUES (?, ?, ?)');
  const getExternal = db.prepare('SELECT player_id AS playerId FROM external_players WHERE game_id = ? AND external_id = ?');
  const insertMatch = db.prepare(`INSERT OR IGNORE INTO matches
    (match_id, room_id, game_id, game_version, mode, rule_version, config_json,
     configured_player_count, actual_human_count, trust_level, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertResult = db.prepare('INSERT INTO match_players VALUES (?, ?, ?, ?, ?)');
  const stats = db.prepare(`SELECT m.game_id AS gameId, m.mode, m.rule_version AS ruleVersion, m.config_json AS configJson,
    m.configured_player_count AS playerCount, p.faction, m.trust_level AS trustLevel,
    COUNT(*) AS played, SUM(CASE WHEN p.outcome = 'win' THEN 1 ELSE 0 END) AS wins
    FROM match_players p JOIN matches m ON m.match_id = p.match_id
    WHERE p.player_id = ?
    GROUP BY m.game_id, m.mode, m.rule_version, m.config_json, m.configured_player_count, p.faction, m.trust_level
    ORDER BY m.game_id, m.mode, p.faction`);
  const leaderboard = db.prepare(`SELECT p.player_id AS playerId, MAX(p.nickname) AS nickname,
    COUNT(*) AS played, SUM(CASE WHEN p.outcome = 'win' THEN 1 ELSE 0 END) AS wins
    FROM match_players p JOIN matches m ON m.match_id = p.match_id
    WHERE m.game_id = ? AND m.mode = ? AND m.rule_version = ?
      AND m.configured_player_count = ? AND p.faction = ? AND m.config_json = ?
      AND m.trust_level = 'server_validated'
    GROUP BY p.player_id ORDER BY wins DESC, played DESC, p.player_id LIMIT 50`);

  return {
    session(token) {
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
      return getSession.get(hash(token), Date.now()) || null;
    },
    newSession() {
      const token = crypto.randomBytes(32).toString('base64url');
      const player = { playerId: crypto.randomUUID(), nickname: '玩家' };
      const now = Date.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        insertPlayer.run(player.playerId, player.nickname, now);
        insertSession.run(hash(token), player.playerId, now + SESSION_AGE_MS);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return { token, player };
    },
    rename(playerId, nickname) {
      updateNickname.run(nickname, playerId);
    },
    newRecoveryCode(playerId) {
      const code = crypto.randomBytes(32).toString('base64url');
      if (setRecovery.run(hash(code), playerId).changes !== 1) throw new Error('Player not found');
      return code;
    },
    recover(code) {
      if (typeof code !== 'string' || !/^[\w-]{43}$/.test(code)) return null;
      db.exec('BEGIN IMMEDIATE');
      try {
        const player = getRecovery.get(hash(code));
        if (!player) { db.exec('ROLLBACK'); return null; }
        const token = crypto.randomBytes(32).toString('base64url');
        removeSessions.run(player.playerId);
        setRecovery.run(null, player.playerId);
        insertSession.run(hash(token), player.playerId, Date.now() + SESSION_AGE_MS);
        db.exec('COMMIT');
        return { player, token };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    linkExternal(gameId, externalId, playerId) {
      linkExternal.run(gameId, externalId, playerId);
    },
    externalPlayer(gameId, externalId) {
      return getExternal.get(gameId, externalId)?.playerId || null;
    },
    record(match) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const inserted = insertMatch.run(
          match.matchId, match.roomId, match.gameId, match.gameVersion, match.mode, match.ruleVersion,
          match.configJson || '{}',
          match.playerCount, match.humanCount, match.trustLevel, match.startedAt, Date.now()
        ).changes === 1;
        if (inserted) {
          for (const player of match.players) {
            insertResult.run(match.matchId, player.playerId, player.nickname, player.faction, player.outcome);
          }
        }
        db.exec('COMMIT');
        return inserted;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    stats(playerId) {
      return stats.all(playerId).map(row => ({ ...row, winRate: row.wins / row.played }));
    },
    leaderboard(faction) {
      return leaderboard.all('doudizhu', 'rob-single', 'doudizhu-v1', 3, faction, STANDARD_DOUDIZHU_CONFIG)
        .map(row => ({ ...row, winRate: row.wins / row.played }));
    },
    close() { db.close(); },
  };
}

module.exports = { createStore, SESSION_AGE_MS };
