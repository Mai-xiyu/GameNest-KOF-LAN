const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SOURCE_REVISION = 'c903603cfefc5786126173b33468e7df001280de';
const TILE_ART_REVISION = '3e275804ff58325306710bef3a7406860444bc6a';
const PUBLIC_PREFIX = '/g/mamahjong';
const TILE_CODES = [
  '0m', '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m',
  '0p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p',
  '0s', '1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
  '1z', '2z', '3z', '4z', '5z', '6z', '7z',
];
const CHARACTER_EMOTES = [
  '7', '3', '5', 'l_1', '1', 'l_2', '997', '10', '8', '996', '983',
  '888', '0', '2', 'l_3', 'l_4', '4', '984', '12', '6', '11', '966',
];
const CHARACTER_OUTFITS = [
  'yiji', 'yiji_0', 'yiji_haitanpaidui', 'yiji_xinnianchuzhi', 'yiji_SP', 'yiji_CJ',
];
const TABLECLOTHS = [
  ['peacock-green', [27, 91, 69], [51, 116, 88]],
  ['official-tournament', [32, 66, 104], [52, 96, 145]],
  ['coal-gray', [55, 59, 64], [83, 88, 94]],
  ['flowers-under-moon', [58, 54, 102], [105, 75, 131]],
  ['lotus-purple', [93, 52, 92], [139, 78, 126]],
];

function replaceExact(file, before, after) {
  const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path.relative(process.cwd(), file)}: expected one patch target, found ${count}`);
  }
  fs.writeFileSync(file, source.replace(before, after));
}

function replaceAllIn(file, before, after) {
  const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (!source.includes(before)) return 0;
  const count = source.split(before).length - 1;
  fs.writeFileSync(file, source.replaceAll(before, after));
  return count;
}

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, callback);
    else callback(target);
  }
}

function safeOutput(source, output) {
  const sourcePath = path.resolve(source);
  const outputPath = path.resolve(output);
  if (sourcePath === outputPath || outputPath === path.parse(outputPath).root) {
    throw new Error('Output must be a separate non-root directory');
  }
  return { sourcePath, outputPath };
}

function findTileVectorDirectory(tileArtSource) {
  const required = TILE_CODES.map(code => `${code}.svg`);
  let match = null;

  function visit(directory) {
    if (match) return;
    const names = new Set(fs.readdirSync(directory));
    if (required.every(name => names.has(name))) {
      match = directory;
      return;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '.git') visit(path.join(directory, entry.name));
    }
  }

  visit(tileArtSource);
  if (!match) throw new Error('Mahjong tile art source does not contain the required SVG set');
  return match;
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function writePng(file, width, height, pixel) {
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const rowOffset = rowIndex * (1 + width * 4);
    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      const offset = rowOffset + 1 + columnIndex * 4;
      const color = pixel(columnIndex, rowIndex);
      rows[offset] = color[0];
      rows[offset + 1] = color[1];
      rows[offset + 2] = color[2];
      rows[offset + 3] = color[3] ?? 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function writeTableclothPng(file, base, accent) {
  writePng(file, 256, 256, (column, row) => {
    const edge = Math.min(column, row, 255 - column, 255 - row) < 7;
    if (edge) return [196, 158, 82, 255];
    const checker = ((column >> 4) + (row >> 4)) % 2;
    const diamond = Math.abs((column % 64) - 32) + Math.abs((row % 64) - 32);
    const blend = diamond > 27 ? 0.22 : checker ? 0.12 : 0;
    return base.map((value, index) => Math.round(value * (1 - blend) + accent[index] * blend)).concat(255);
  });
}

function writeEmotePng(file, variant) {
  const palettes = [
    [244, 176, 190], [175, 210, 238], [245, 208, 132], [189, 221, 180],
    [206, 185, 229], [242, 190, 151],
  ];
  const backdrop = palettes[variant % palettes.length];
  writePng(file, 192, 192, (column, row) => {
    const centerX = 96;
    const centerY = 99;
    const distance = Math.hypot(column - centerX, row - centerY);
    if (distance > 88) return [250, 241, 232, 0];
    if (distance > 82) return [98, 58, 65, 255];
    if (row < 58 && distance < 80) return [83, 48, 54, 255];
    const eyeY = 91 + (variant % 3) * 2;
    const leftEye = Math.hypot(column - 68, row - eyeY) < 7;
    const rightEye = Math.hypot(column - 124, row - eyeY) < 7;
    if (leftEye || rightEye) return [66, 42, 45, 255];
    const mouthY = 127;
    const mouthCurve = variant % 4 === 0
      ? Math.abs(Math.hypot(column - 96, row - 113) - 23) < 3 && row > 113
      : variant % 4 === 1
        ? Math.abs(row - mouthY) < 3 && Math.abs(column - 96) < 22
        : variant % 4 === 2
          ? Math.hypot(column - 96, row - mouthY) < 10
          : Math.abs(Math.hypot(column - 96, row - 141) - 22) < 3 && row < 141;
    if (mouthCurve) return [139, 62, 75, 255];
    const highlight = Math.max(0, 1 - distance / 82) * 24;
    return backdrop.map(value => Math.min(255, Math.round(value + highlight))).concat(255);
  });
}

function writeOutfitPng(file, variant) {
  const garments = [
    [219, 103, 132], [116, 128, 191], [66, 166, 181],
    [207, 79, 72], [88, 112, 80], [169, 100, 168],
  ];
  const garment = garments[variant % garments.length];
  writePng(file, 480, 640, (column, row) => {
    const backgroundPattern = ((column >> 5) + (row >> 5)) % 2;
    const background = backgroundPattern ? [245, 231, 220] : [249, 238, 229];
    const head = Math.hypot(column - 240, row - 155) < 84;
    const hair = Math.hypot(column - 240, row - 132) < 91 && row < 164;
    const bodyWidth = Math.max(0, 170 - Math.abs(row - 390) * 0.13);
    const body = row >= 220 && row <= 590 && Math.abs(column - 240) < bodyWidth;
    const sleeveLeft = row >= 255 && row <= 470 && column > 46 && column < 210 - (row - 255) * 0.18;
    const sleeveRight = row >= 255 && row <= 470 && column < 434 && column > 270 + (row - 255) * 0.18;
    if (hair) return [72, 46, 50, 255];
    if (head) return [250, 211, 192, 255];
    if (body || sleeveLeft || sleeveRight) {
      const stripe = ((column + row + variant * 19) % 72) < 9;
      return stripe ? garment.map(value => Math.max(0, value - 28)).concat(255) : garment.concat(255);
    }
    const sash = row >= 390 && row <= 424 && Math.abs(column - 240) < 150;
    if (sash) return [242, 214, 151, 255];
    const border = Math.min(column, row, 479 - column, 639 - row) < 8;
    return border ? [112, 70, 72, 255] : background.concat(255);
  });
}

function installTileAssets(gameWeb, tileArtSource) {
  if (!tileArtSource || !fs.statSync(tileArtSource, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('A pinned mahjong_graphic checkout is required');
  }
  const vectors = findTileVectorDirectory(path.resolve(tileArtSource));
  const target = path.join(
    gameWeb,
    'public/assets/local-game-assets/mahjong-graphic/vectors',
  );
  fs.mkdirSync(target, { recursive: true });
  for (const code of TILE_CODES) {
    fs.copyFileSync(path.join(vectors, `${code}.svg`), path.join(target, `${code}.svg`));
  }

  const sourceLicense = path.join(path.resolve(tileArtSource), 'LICENSE');
  if (!fs.existsSync(sourceLicense)) throw new Error('Mahjong tile art source is missing LICENSE');
  const licenseTarget = path.join(gameWeb, 'public/assets/licenses');
  fs.mkdirSync(licenseTarget, { recursive: true });
  fs.copyFileSync(sourceLicense, path.join(licenseTarget, 'mahjong-graphic-LICENSE.txt'));

  const gamenestAssets = path.join(gameWeb, 'public/assets/gamenest');
  fs.mkdirSync(gamenestAssets, { recursive: true });
  fs.writeFileSync(path.join(gamenestAssets, 'tile-back.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 100">
  <defs><pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 6h12M6 0v12" stroke="#b9d7c5" stroke-width="1.2" opacity=".55"/></pattern></defs>
  <rect width="72" height="100" rx="7" fill="#f3efe3"/><rect x="4" y="4" width="64" height="92" rx="5" fill="#397b5a"/><rect x="8" y="8" width="56" height="84" rx="4" fill="url(#p)" stroke="#d5eadc" stroke-width="2"/><circle cx="36" cy="50" r="14" fill="none" stroke="#e8f3ec" stroke-width="3"/><path d="M28 50h16M36 42v16" stroke="#e8f3ec" stroke-width="3" stroke-linecap="round"/>
</svg>\n`);
  fs.writeFileSync(path.join(gamenestAssets, 'tablecloth.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs><radialGradient id="g"><stop stop-color="#277657"/><stop offset="1" stop-color="#123d31"/></radialGradient><pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M24 4 44 24 24 44 4 24Z" fill="none" stroke="#8bc3a4" stroke-width="2" opacity=".12"/></pattern></defs>
  <rect width="1024" height="1024" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#p)"/><rect x="28" y="28" width="968" height="968" rx="42" fill="none" stroke="#d8b96c" stroke-width="12" opacity=".7"/>
</svg>\n`);

  const tablecloths = path.join(
    gameWeb,
    'public/assets/local-game-assets/mahjong-soul/tablecloths',
  );
  fs.mkdirSync(tablecloths, { recursive: true });
  for (const [name, base, accent] of TABLECLOTHS) {
    writeTableclothPng(path.join(tablecloths, `${name}.png`), base, accent);
  }
  fs.copyFileSync(
    path.join(tablecloths, 'peacock-green.png'),
    path.join(tablecloths, 'peacock-green-table.png'),
  );

  const characterRoot = path.join(
    gameWeb,
    'public/assets/local-characters/mahjong-soul/ichihime',
  );
  for (const [index, name] of CHARACTER_EMOTES.entries()) {
    const destination = path.join(characterRoot, 'emotes', `${name}.png`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    writeEmotePng(destination, index);
  }
  for (const [index, name] of CHARACTER_OUTFITS.entries()) {
    const destination = path.join(characterRoot, 'outfits', `${name}.png`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    writeOutfitPng(destination, index);
  }
}

function prepareMamahjong(source, output, tileArtSource) {
  const { sourcePath, outputPath } = safeOutput(source, output);
  const required = [
    'Cargo.toml',
    'apps/game-web/package.json',
    'apps/server/src/archive.rs',
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(sourcePath, relative))) {
      throw new Error(`MaMahjong source is missing ${relative}`);
    }
  }

  fs.rmSync(outputPath, { recursive: true, force: true });
  fs.cpSync(sourcePath, outputPath, {
    recursive: true,
    filter(item) {
      const relative = path.relative(sourcePath, item);
      if (!relative) return true;
      const first = relative.split(path.sep)[0];
      if (['.git', 'target'].includes(first)) return false;
      return !relative.split(path.sep).some(part => part === 'node_modules' || part === 'dist');
    },
  });

  const gameWeb = path.join(outputPath, 'apps/game-web');
  installTileAssets(gameWeb, tileArtSource);
  replaceExact(
    path.join(gameWeb, 'vite.config.ts'),
    '  base: "/game/",',
    `  base: "${PUBLIC_PREFIX}/",`,
  );

  const api = path.join(gameWeb, 'src/api.ts');
  replaceExact(
    api,
    '  const response = await fetch(`/api/v1${path}`, {',
    `  const response = await fetch(\`${PUBLIC_PREFIX}/api/v1\${path}\`, {`,
  );
  replaceExact(
    api,
    '    void fetch(`/api/v1/rooms/${roomId}/members/me`, {',
    `    void fetch(\`${PUBLIC_PREFIX}/api/v1/rooms/\${roomId}/members/me\`, {`,
  );
  replaceExact(
    api,
    'export const gameApi = {\n  /* ── Auth',
    'export const gameApi = {\n  platformSession: () =>\n    request<AuthResponse>("/platform-session", { method: "POST" }),\n\n  /* ── Auth',
  );

  replaceExact(
    path.join(gameWeb, 'src/ws.ts'),
    '  const url = new URL("/api/v1/ws", baseUrl);',
    `  const url = new URL("${PUBLIC_PREFIX}/api/v1/ws", baseUrl);`,
  );

  replaceExact(
    path.join(gameWeb, 'src/main.tsx'),
    '      const auth = useAuthStore.getState();\n      if (auth.token) {',
    '      const bridgeAuth = useAuthStore.getState();\n      const bridged = await gameApi.platformSession();\n      bridgeAuth.setToken(bridged.session.token);\n      bridgeAuth.setIdentity(bridged.user);\n      const auth = useAuthStore.getState();\n      if (auth.token) {',
  );

  replaceExact(
    path.join(gameWeb, 'src/components/SplashScreen.tsx'),
    `      prepareGame((nextProgress) => {
        if (!cancelled) setProgress(nextProgress);
      })`,
    `      prepareGame((nextProgress) => {
        if (!cancelled) {
          setProgress(nextProgress);
          if (nextProgress >= 100) setReady(true);
        }
      })`,
  );

  replaceExact(
    path.join(gameWeb, 'src/game/tileAssets.ts'),
    '  return `${import.meta.env.BASE_URL}assets/local-game-assets/mahjim/tiles-fixed/${artwork}/back.png?v=20260804-layout2`;',
    '  return `${import.meta.env.BASE_URL}assets/gamenest/tile-back.svg?v=1`;',
  );
  replaceExact(
    path.join(gameWeb, 'src/game/table/constants.ts'),
    '  "/game/assets/local-game-assets/mahjong-soul/tablecloths/peacock-green-table.png";',
    '  `${import.meta.env.BASE_URL}assets/gamenest/tablecloth.svg`;',
  );
  replaceExact(
    path.join(gameWeb, 'src/audio/music.ts'),
    '    (track) => track.scene === scene && track.enabled,',
    '    (track) => track.scene === scene && track.enabled && !track.audio_path.includes("/local-game-assets/"),',
  );
  const sfx = path.join(gameWeb, 'src/audio/sfx.ts');
  replaceExact(
    sfx,
    '  if (cache.has(src)) return Promise.resolve();',
    '  if (!src || cache.has(src)) return Promise.resolve();',
  );
  for (const file of [
    'discard_tile.mp3',
    'score_change.mp3',
    'hule_fan_out.mp3',
    'fu_appear.mp3',
    'score_appear.mp3',
    'mouseclick.mp3',
    'newround_pais.mp3',
  ]) {
    replaceExact(
      sfx,
      `\`${'${import.meta.env.BASE_URL}'}assets/sfx/${file}\``,
      '""',
    );
  }
  replaceExact(
    path.join(gameWeb, 'src/scenes/GameScene.tsx'),
    '      return character ? actionVoices(character).map((voice) => voice.path) : [];',
    '      return character ? actionVoices(character).map((voice) => voice.path).filter((path) => !path.includes("/local-characters/")) : [];',
  );

  replaceExact(
    path.join(gameWeb, 'src/components/Layout.tsx'),
    '        {children}\n      </main>',
    `        {children}
        <a
          href="/"
          style={{
            position: "fixed",
            left: 12,
            top: 12,
            zIndex: 100000,
            padding: "8px 12px",
            borderRadius: 8,
            color: "#fff",
            background: "rgba(0, 0, 0, 0.7)",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          返回游戏大厅
        </a>
      </main>`,
  );

  const lobbyScene = path.join(gameWeb, 'src/scenes/LobbyScene.tsx');
  replaceExact(
    lobbyScene,
    '  initialMenu = "main",',
    '  initialMenu = "friends",',
  );
  replaceExact(
    lobbyScene,
    `        <LobbyMenuButton
          label="段位匹配"
          mark="段"
          featured
          onClick={() => onMenuChange("ranked")}
        />
`,
    '',
  );
  const localRoomLabels = replaceAllIn(lobbyScene, '好友对战', '局域网房间');
  if (localRoomLabels !== 3) {
    throw new Error(`Expected three MaMahjong friend-room labels, found ${localRoomLabels}`);
  }

  replaceExact(
    path.join(outputPath, 'apps/server/src/archive.rs'),
    `        OpenOptions::new()
            .read(true)
            .open(&inner.directory)
            .and_then(|directory| directory.sync_all())
            .map_err(ArchiveError::Io)?;`,
    `        #[cfg(not(windows))]
        OpenOptions::new()
            .read(true)
            .open(&inner.directory)
            .and_then(|directory| directory.sync_all())
            .map_err(ArchiveError::Io)?;`,
  );

  const sourceRoots = [
    path.join(outputPath, 'apps/game-web/src'),
    path.join(outputPath, 'apps/server/src'),
    path.join(outputPath, 'crates'),
  ];
  let gameAssetPaths = 0;
  let userAssetPaths = 0;
  let fallbackAvatarPaths = 0;
  let fallbackCharacterPaths = 0;
  for (const root of sourceRoots) {
    walk(root, file => {
      if (!/\.(css|rs|sql|ts|tsx)$/.test(file)) return;
      gameAssetPaths += replaceAllIn(file, '/game/assets/', `${PUBLIC_PREFIX}/assets/`);
      userAssetPaths += replaceAllIn(file, '/user-assets/', `${PUBLIC_PREFIX}/user-assets/`);
      fallbackAvatarPaths += replaceAllIn(
        file,
        'assets/local-characters/mahjong-soul/ichihime/emotes/8.png',
        'assets/ui/lobby-function-character.png',
      );
      fallbackCharacterPaths += replaceAllIn(
        file,
        'assets/local-characters/mahjong-soul/ichihime/outfits/yiji.png',
        'assets/ui/lobby-function-character.png',
      );
      if (file.endsWith(path.join('web', 'api_assets.rs'))) {
        userAssetPaths += replaceAllIn(file, 'const PUBLIC_BASE: &str = "/user-assets";',
          `const PUBLIC_BASE: &str = "${PUBLIC_PREFIX}/user-assets";`);
      }
    });
  }
  const adminApi = path.join(outputPath, 'apps/server/src/web/api.rs');
  if (fs.existsSync(adminApi)) {
    replaceAllIn(
      adminApi,
      '.uri("/g/mamahjong/user-assets/characters/hero.png")',
      '.uri("/user-assets/characters/hero.png")',
    );
  }
  if (gameAssetPaths === 0 || userAssetPaths === 0) {
    throw new Error('Expected upstream asset path literals were not found');
  }
  if (fallbackAvatarPaths === 0 || fallbackCharacterPaths === 0) {
    throw new Error('Expected upstream fallback character paths were not found');
  }
  const css = path.join(gameWeb, 'src/styles/global.css');
  const cssAssetPaths = replaceAllIn(css, 'url("/assets/', `url("${PUBLIC_PREFIX}/assets/`);
  if (cssAssetPaths === 0) throw new Error('Expected absolute CSS asset paths were not found');
  fs.appendFileSync(css, `

/* GameNest LAN adapter: platform identity replaces upstream account controls. */
.game-lobby__functions,
.game-lobby__utility > button:last-child,
.splash-actions > button:last-child {
  display: none !important;
}
`);

  fs.writeFileSync(path.join(outputPath, 'gamenest-upstream.json'), JSON.stringify({
    repository: 'https://github.com/yemaster/mamahjong',
    revision: SOURCE_REVISION,
    tileArt: {
      repository: 'https://github.com/lietxia/mahjong_graphic',
      revision: TILE_ART_REVISION,
      files: TILE_CODES.map(code => `assets/local-game-assets/mahjong-graphic/vectors/${code}.svg`),
    },
    publicPrefix: `${PUBLIC_PREFIX}/`,
    adapter: 'GameNest build-time path, identity bootstrap, LAN-room-only lobby, lobby return, and Windows archive patch',
  }, null, 2) + '\n');
}

if (require.main === module) {
  const [, , source, output, tileArtSource] = process.argv;
  if (!source || !output || !tileArtSource) {
    console.error('Usage: node scripts/prepare-mamahjong.js <source> <output> <mahjong-graphic-source>');
    process.exit(2);
  }
  prepareMamahjong(source, output, tileArtSource);
}

module.exports = {
  prepareMamahjong,
  SOURCE_REVISION,
  TILE_ART_REVISION,
  PUBLIC_PREFIX,
  TILE_CODES,
  CHARACTER_EMOTES,
  CHARACTER_OUTFITS,
  TABLECLOTHS,
};
