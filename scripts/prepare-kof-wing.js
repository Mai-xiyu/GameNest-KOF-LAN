const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  throw new Error('Usage: node scripts/prepare-kof-wing.js SOURCE DESTINATION');
}

const expectedFiles = {
  'game.swf': '6c45fdc725d4910da5335ed74b66b6540b4bbdeffb74602b7b6c49185bc6e297',
  'preview.png': '93dea81819cb7fd16030bc10670b045be31bcd9bb26d0d4c1c9f34d9d4e4b011',
  'ruffle/ruffle.js': 'a686a305345b06542dddedada71869104916a61e393f174687571528ac4225f5',
  'ruffle/72a20ef1c0b8ceb37720.wasm': 'adabc1696a2f1f95715ede6be0ac00a73364895c8e599039e60fef3b2f52efa4',
  'ruffle/826bb0938097485a2c9d.wasm': 'e4ba64aa1dc9f7f2368602dd0fc2c51046f3e35baba8116d6cf3ae930a63aa02',
  'ruffle/core.ruffle.c80159b526e567babaf5.js': '624b0b23bc4460d73e789e608fd1274546a5a411f71f7e873414aca94bc5bc4f',
  'ruffle/core.ruffle.f000070ea72f8ae4fe3a.js': '08ce4ff032b61d2014ba52bdc6f5d8f6adb0aacdc1e6e3fd5e68281c958bd90d',
};

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const sourceRoot = path.resolve(source);
const destinationRoot = path.resolve(destination);
const rufflePackagePath = path.join(sourceRoot, 'ruffle', 'package.json');
const rufflePackage = JSON.parse(fs.readFileSync(rufflePackagePath, 'utf8'));
if (rufflePackage.name !== '@ruffle-rs/ruffle' || rufflePackage.version !== '0.6.0') {
  throw new Error(`Unsupported Ruffle bundle: ${rufflePackage.name || 'unknown'}@${rufflePackage.version || 'unknown'}`);
}

for (const [relativePath, expectedHash] of Object.entries(expectedFiles)) {
  const sourcePath = path.join(sourceRoot, ...relativePath.split('/'));
  if (!fs.statSync(sourcePath).isFile()) throw new Error(`Missing source file: ${relativePath}`);
  const actualHash = sha256(sourcePath);
  if (actualHash !== expectedHash) {
    throw new Error(`Source fingerprint mismatch for ${relativePath}: expected ${expectedHash}, got ${actualHash}`);
  }
}

fs.rmSync(destinationRoot, { recursive: true, force: true });
for (const relativePath of Object.keys(expectedFiles)) {
  const sourcePath = path.join(sourceRoot, ...relativePath.split('/'));
  const destinationPath = path.join(destinationRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

for (const licenseName of ['LICENSE_APACHE', 'LICENSE_MIT', 'package.json']) {
  const sourcePath = path.join(sourceRoot, 'ruffle', licenseName);
  const destinationPath = path.join(destinationRoot, 'ruffle', licenseName);
  fs.copyFileSync(sourcePath, destinationPath);
}

const manifest = {
  gameId: 'kof-wing-185',
  source: 'user-supplied-local-bundle',
  sourceDirectoryName: path.basename(sourceRoot),
  swfSha256: expectedFiles['game.swf'],
  ruffle: {
    package: '@ruffle-rs/ruffle',
    version: rufflePackage.version,
    license: rufflePackage.license,
    bundleSha256: expectedFiles['ruffle/ruffle.js'],
  },
  redistribution: 'The SWF license was not supplied. Keep this generated bundle local unless the operator has redistribution rights.',
  files: expectedFiles,
};
fs.writeFileSync(path.join(destinationRoot, 'gamenest-source.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared KOF Wing 1.85 bundle at ${destinationRoot}`);
