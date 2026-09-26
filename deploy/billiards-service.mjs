import path from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = process.env.BILLIARDS_DIR;
if (!directory) throw new Error('BILLIARDS_DIR is required');
const { createGameServer } = await import(pathToFileURL(path.join(directory, 'server.js')).href);
const app = createGameServer({
  port: Number(process.env.BILLIARDS_PORT || 8188),
  publicDir: path.join(directory, 'public'),
  dataDir: path.join(process.env.DATA_DIR || path.join(directory, 'data'), 'billiards'),
});
await app.listen(Number(process.env.BILLIARDS_PORT || 8188), '127.0.0.1');
console.log('Billiards service listening on 127.0.0.1');

async function stop() {
  await app.close();
  process.exit(0);
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
