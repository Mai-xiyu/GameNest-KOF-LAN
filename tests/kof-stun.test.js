const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const { createLocalStunServer, isLanIpv4, MAGIC_COOKIE } = require('../deploy/local-stun');

test('local STUN only accepts loopback and private IPv4 clients', () => {
  assert.equal(isLanIpv4('127.0.0.1'), true);
  assert.equal(isLanIpv4('10.20.55.23'), true);
  assert.equal(isLanIpv4('172.16.0.1'), true);
  assert.equal(isLanIpv4('172.31.255.254'), true);
  assert.equal(isLanIpv4('192.168.1.2'), true);
  assert.equal(isLanIpv4('8.8.8.8'), false);
  assert.equal(isLanIpv4('172.32.0.1'), false);
});

test('local STUN returns the LAN-visible UDP address without a public service', async () => {
  const service = createLocalStunServer();
  const address = await service.start(0);
  const client = dgram.createSocket('udp4');
  try {
    const transactionId = crypto.randomBytes(12);
    const request = Buffer.alloc(20);
    request.writeUInt16BE(0x0001, 0);
    request.writeUInt16BE(0, 2);
    request.writeUInt32BE(MAGIC_COOKIE, 4);
    transactionId.copy(request, 8);
    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('STUN response timeout')), 1000);
      client.once('message', message => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    client.send(request, address.port, '127.0.0.1');
    const response = await responsePromise;
    assert.equal(response.readUInt16BE(0), 0x0101);
    assert.equal(response.readUInt32BE(4), MAGIC_COOKIE);
    assert.deepEqual(response.subarray(8, 20), transactionId);
    assert.equal(response.readUInt16BE(20), 0x0020);
    assert.equal(response[25], 1);
    const decodedAddress = Array.from(response.subarray(28, 32), (value, index) => {
      const shift = (3 - index) * 8;
      return value ^ ((MAGIC_COOKIE >>> shift) & 0xff);
    }).join('.');
    assert.equal(decodedAddress, '127.0.0.1');
  } finally {
    client.close();
    service.close();
  }
});
