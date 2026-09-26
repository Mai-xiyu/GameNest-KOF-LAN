const dgram = require('node:dgram');

const MAGIC_COOKIE = 0x2112a442;
const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;
const XOR_MAPPED_ADDRESS = 0x0020;

function isLanIpv4(address) {
  if (address === '127.0.0.1') return true;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

function bindingResponse(message, remote) {
  if (!Buffer.isBuffer(message) || message.length < 20) return null;
  if (message.readUInt16BE(0) !== BINDING_REQUEST || message.readUInt32BE(4) !== MAGIC_COOKIE) return null;
  if (!isLanIpv4(remote.address)) return null;
  const declaredLength = message.readUInt16BE(2);
  if (20 + declaredLength > message.length || remote.family !== 'IPv4') return null;
  const address = remote.address.split('.').map(Number);
  if (address.length !== 4 || address.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;

  const response = Buffer.alloc(32);
  response.writeUInt16BE(BINDING_SUCCESS, 0);
  response.writeUInt16BE(12, 2);
  response.writeUInt32BE(MAGIC_COOKIE, 4);
  message.copy(response, 8, 8, 20);
  response.writeUInt16BE(XOR_MAPPED_ADDRESS, 20);
  response.writeUInt16BE(8, 22);
  response[24] = 0;
  response[25] = 1;
  response.writeUInt16BE(remote.port ^ (MAGIC_COOKIE >>> 16), 26);
  const cookie = Buffer.alloc(4);
  cookie.writeUInt32BE(MAGIC_COOKIE);
  for (let index = 0; index < 4; index++) response[28 + index] = address[index] ^ cookie[index];
  return response;
}

function createLocalStunServer(options = {}) {
  let socket = null;
  let address = null;

  function start(port) {
    if (socket) return Promise.resolve(address);
    return new Promise((resolve, reject) => {
      const candidate = dgram.createSocket('udp4');
      let settled = false;
      const fail = error => {
        if (!settled) {
          settled = true;
          candidate.close();
          reject(error);
        } else if (typeof options.onError === 'function') options.onError(error);
      };
      candidate.on('error', fail);
      candidate.on('message', (message, remote) => {
        const response = bindingResponse(message, remote);
        if (response) candidate.send(response, remote.port, remote.address);
      });
      candidate.bind(port, options.host || '0.0.0.0', () => {
        if (settled) return;
        settled = true;
        socket = candidate;
        address = candidate.address();
        resolve(address);
      });
    });
  }

  function close() {
    const current = socket;
    socket = null;
    address = null;
    if (current) current.close();
  }

  return { start, close, get address() { return address; } };
}

module.exports = { bindingResponse, createLocalStunServer, isLanIpv4, MAGIC_COOKIE };
