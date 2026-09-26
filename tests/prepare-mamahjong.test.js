const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  prepareMamahjong,
  SOURCE_REVISION,
  TILE_ART_REVISION,
  TILE_CODES,
  CHARACTER_EMOTES,
  CHARACTER_OUTFITS,
  TABLECLOTHS,
} = require('../scripts/prepare-mamahjong');

function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

test('MaMahjong preparation is a reproducible adapter patch over a pinned upstream tree', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenest-prepare-mamahjong-'));
  const source = path.join(temporary, 'source');
  const output = path.join(temporary, 'output');
  const tileArt = path.join(temporary, 'tile-art');
  fs.mkdirSync(source);
  fs.mkdirSync(tileArt);
  write(tileArt, 'LICENSE', 'fixture tile license\n');
  for (const code of TILE_CODES) {
    write(tileArt, `nested/vectors/${code}.svg`, `<svg data-code="${code}"/>\n`);
  }
  write(source, 'Cargo.toml', '[workspace]\n');
  write(source, 'apps/game-web/package.json', '{}\n');
  write(source, 'apps/game-web/vite.config.ts', 'export default {\n  base: "/game/",\n};\n');
  write(source, 'apps/game-web/src/api.ts', `async function request(path, init) {
  const response = await fetch(\`/api/v1\${path}\`, {
  });
}
export const gameApi = {
  /* ── Auth ── */
  leaveRoomOnExit: (roomId, token) => {
    void fetch(\`/api/v1/rooms/\${roomId}/members/me\`, {
    });
  },
};
`);
  write(source, 'apps/game-web/src/ws.ts', '  const url = new URL("/api/v1/ws", baseUrl);\n');
  write(source, 'apps/game-web/src/main.tsx', `      const auth = useAuthStore.getState();
      if (auth.token) {
`);
  write(source, 'apps/game-web/src/components/Layout.tsx', `        {children}
      </main>
`);
  write(source, 'apps/game-web/src/scenes/LobbyScene.tsx', `export default function LobbyScene({
  initialMenu = "main",
}) {
  return <>
        <LobbyMenuButton
          label="段位匹配"
          mark="段"
          featured
          onClick={() => onMenuChange("ranked")}
        />
        <nav aria-label="好友对战">
          <LobbyPanelBar title="好友对战" />
          <span>好友对战</span>
        </nav>
  </>;
}
`);
  write(source, 'apps/game-web/src/components/SplashScreen.tsx', `      prepareGame((nextProgress) => {
        if (!cancelled) setProgress(nextProgress);
      })
`);
  write(source, 'apps/game-web/src/audio/music.ts', `const inScene = tracks.filter(
    (track) => track.scene === scene && track.enabled,
  );
`);
  write(source, 'apps/game-web/src/audio/sfx.ts', `export function preloadSfx(src) {
  if (cache.has(src)) return Promise.resolve();
}
export const DISCARD_SFX = \`${'${import.meta.env.BASE_URL}'}assets/sfx/discard_tile.mp3\`;
export const SCORE_CHANGE_SFX = \`${'${import.meta.env.BASE_URL}'}assets/sfx/score_change.mp3\`;
export const HULE_FAN_OUT_SFX = \`${'${import.meta.env.BASE_URL}'}assets/sfx/hule_fan_out.mp3\`;
export const FU_APPEAR_SFX = \`${'${import.meta.env.BASE_URL}'}assets/sfx/fu_appear.mp3\`;
export const SCORE_APPEAR_SFX = \`${'${import.meta.env.BASE_URL}'}assets/sfx/score_appear.mp3\`;
export const MOUSECLICK_SFX = \`${'${import.meta.env.BASE_URL}'}assets/sfx/mouseclick.mp3\`;
export const NEWROUND_PAIS_SFX = \`${'${import.meta.env.BASE_URL}'}assets/sfx/newround_pais.mp3\`;
`);
  write(source, 'apps/game-web/src/scenes/GameScene.tsx', `const voicePaths = matchView.players.flatMap((player) => {
      const character = player.character_id
        ? charactersById.get(player.character_id)
        : undefined;
      return character ? actionVoices(character).map((voice) => voice.path) : [];
    });
`);
  write(source, 'apps/game-web/src/game/tileAssets.ts', `export function tileBackAssetPath(artwork = "jp") {
  return \`${'${import.meta.env.BASE_URL}'}assets/local-game-assets/mahjim/tiles-fixed/${'${artwork}'}/back.png?v=20260804-layout2\`;
}
`);
  write(source, 'apps/game-web/src/game/table/constants.ts', `export const DEFAULT_TABLECLOTH_ASSET =
  "/game/assets/local-game-assets/mahjong-soul/tablecloths/peacock-green-table.png";
`);
  write(source, 'apps/game-web/src/lobbyAssets.ts', `export const FALLBACK_CHARACTER = \`${'${import.meta.env.BASE_URL}'}assets/local-characters/mahjong-soul/ichihime/outfits/yiji.png\`;
export const FALLBACK_AVATAR = \`${'${import.meta.env.BASE_URL}'}assets/local-characters/mahjong-soul/ichihime/emotes/8.png\`;
`);
  write(source, 'apps/game-web/src/styles/global.css', 'body { background: url("/assets/ui/a.png"); }\n');
  write(source, 'apps/game-web/public/assets/ui/lobby-function-character.png',
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  write(source, 'apps/server/src/archive.rs', `        OpenOptions::new()
            .read(true)
            .open(&inner.directory)
            .and_then(|directory| directory.sync_all())
            .map_err(ArchiveError::Io)?;
`);
  write(source, 'apps/server/src/web/api_assets.rs', `const PUBLIC_BASE: &str = "/user-assets";
const SAMPLE: &str = "/user-assets/a.png";
`);
  write(source, 'crates/example/src/lib.rs', `const GAME: &str = "/game/assets/a.png";
const USER: &str = "/user-assets/b.png";
`);

  try {
    prepareMamahjong(source, output, tileArt);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/vite.config.ts'), 'utf8'),
      /base: "\/g\/mamahjong\/"/);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/api.ts'), 'utf8'),
      /platformSession/);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/main.tsx'), 'utf8'),
      /gameApi\.platformSession/);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/components/Layout.tsx'), 'utf8'),
      /返回游戏大厅/);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/components/SplashScreen.tsx'), 'utf8'),
      /nextProgress >= 100/);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/game/tileAssets.ts'), 'utf8'),
      /assets\/gamenest\/tile-back\.svg/);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/game/table/constants.ts'), 'utf8'),
      /assets\/gamenest\/tablecloth\.svg/);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/audio/music.ts'), 'utf8'),
      /!track\.audio_path\.includes/);
    const sfx = fs.readFileSync(path.join(output, 'apps/game-web/src/audio/sfx.ts'), 'utf8');
    assert.match(sfx, /if \(!src \|\| cache\.has\(src\)\)/);
    assert.doesNotMatch(sfx, /assets\/sfx\//);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/scenes/GameScene.tsx'), 'utf8'),
      /!path\.includes\("\/local-characters\/"\)/);
    assert.match(fs.readFileSync(path.join(output, 'apps/game-web/src/lobbyAssets.ts'), 'utf8'),
      /assets\/ui\/lobby-function-character\.png/);
    for (const code of TILE_CODES) {
      const tile = path.join(output,
        `apps/game-web/public/assets/local-game-assets/mahjong-graphic/vectors/${code}.svg`);
      assert.match(fs.readFileSync(tile, 'utf8'), new RegExp(`data-code="${code}"`));
    }
    assert.equal(
      fs.readFileSync(path.join(output,
        'apps/game-web/public/assets/licenses/mahjong-graphic-LICENSE.txt'), 'utf8'),
      'fixture tile license\n',
    );
    assert.match(fs.readFileSync(path.join(output,
      'apps/game-web/public/assets/gamenest/tile-back.svg'), 'utf8'), /<svg/);
    assert.match(fs.readFileSync(path.join(output,
      'apps/game-web/public/assets/gamenest/tablecloth.svg'), 'utf8'), /<svg/);
    const assertPng = relative => {
      const contents = fs.readFileSync(path.join(output, 'apps/game-web/public/assets', relative));
      assert.deepEqual([...contents.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], relative);
      assert.ok(contents.length > 100, relative);
    };
    for (const [name] of TABLECLOTHS) {
      assertPng(`local-game-assets/mahjong-soul/tablecloths/${name}.png`);
    }
    assertPng('local-game-assets/mahjong-soul/tablecloths/peacock-green-table.png');
    for (const name of CHARACTER_EMOTES) {
      assertPng(`local-characters/mahjong-soul/ichihime/emotes/${name}.png`);
    }
    for (const name of CHARACTER_OUTFITS) {
      assertPng(`local-characters/mahjong-soul/ichihime/outfits/${name}.png`);
    }
    const lobby = fs.readFileSync(path.join(output, 'apps/game-web/src/scenes/LobbyScene.tsx'), 'utf8');
    assert.match(lobby, /initialMenu = "friends"/);
    assert.doesNotMatch(lobby, /段位匹配/);
    assert.equal((lobby.match(/局域网房间/g) || []).length, 3);
    const css = fs.readFileSync(path.join(output, 'apps/game-web/src/styles/global.css'), 'utf8');
    assert.match(css, /\.game-lobby__functions/);
    assert.match(css, /\.splash-actions > button:last-child/);
    assert.match(fs.readFileSync(path.join(output, 'apps/server/src/archive.rs'), 'utf8'),
      /#\[cfg\(not\(windows\)\)\]/);
    assert.match(fs.readFileSync(path.join(output, 'crates/example/src/lib.rs'), 'utf8'),
      /\/g\/mamahjong\/assets\/a\.png/);
    assert.match(fs.readFileSync(path.join(output, 'apps/server/src/web/api_assets.rs'), 'utf8'),
      /\/g\/mamahjong\/user-assets/);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'gamenest-upstream.json')));
    assert.equal(manifest.revision, SOURCE_REVISION);
    assert.equal(manifest.tileArt.revision, TILE_ART_REVISION);
    assert.equal(manifest.tileArt.files.length, TILE_CODES.length);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
