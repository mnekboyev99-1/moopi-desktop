// node --test extension/test/net.test.js — a lost connection is not an error: nothing is sent for it, and a
// log report that could not go waits for the connection (18–22.11.2026, a laptop waking from sleep).
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const net = require('../net');

/** What Node's fetch really throws: TypeError('fetch failed') with the reason in `cause`. */
function fetchFailed(code, extra = {}) {
  const e = new TypeError('fetch failed');
  if (code) e.cause = Object.assign(new Error(extra.message || code), { code }, extra);
  return e;
}

test('the connection being away is told apart from a fault', async () => {
  // the lines from the laptop's own report
  assert.ok(net.offline(fetchFailed()));
  assert.ok(net.offline(fetchFailed('ENOTFOUND', { hostname: 'moopi.uz' })));
  assert.ok(net.offline(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })));
  assert.ok(net.offline(new Error('read ECONNRESET'))); // the words alone, as a log line carries them
  assert.ok(net.offline(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })));
  assert.ok(net.offline(Object.assign(new Error('getaddrinfo ENOTFOUND mcp.moopi.uz'), { code: 'ENOTFOUND' })));
  assert.ok(net.offline(new Error('getaddrinfo ENOTFOUND mcp.moopi.uz')));
  assert.ok(net.offline(new Error('net::ERR_ADDRESS_UNREACHABLE')));
  assert.ok(net.offline(fetchFailed('UND_ERR_CONNECT_TIMEOUT')));
  assert.ok(net.offline('TypeError: fetch failed'));

  // a server that answered, a certificate that was refused, our own mistakes: all still errors
  assert.equal(net.offline(new Error('HTTP 502')), false);
  assert.equal(net.offline(new Error('HTTP 401')), false);
  assert.equal(net.offline(fetchFailed('CERT_HAS_EXPIRED')), false);
  assert.equal(net.offline(fetchFailed('UNABLE_TO_VERIFY_LEAF_SIGNATURE')), false);
  assert.equal(net.offline(fetchFailed('ERR_SOMETHING_NEW')), false); // a reason we don't know is worth hearing
  assert.equal(net.offline(new TypeError("Cannot read properties of undefined (reading 'id')")), false);
  assert.equal(net.offline(new Error('Claude Code not ready (missing)')), false);
  assert.equal(net.offline(null), false);

  // a real request to a name that does not exist, as this machine's Node reports it
  let real = null;
  try { await fetch('https://no-such-host.invalid/x'); } catch (e) { real = e; }
  assert.ok(real && net.offline(real), 'a failed DNS lookup counts as the connection');
});

test('an error says its real reason', () => {
  assert.equal(net.describe(fetchFailed('ENOTFOUND', { hostname: 'mcp.moopi.uz' })), 'fetch failed (ENOTFOUND mcp.moopi.uz)');
  assert.equal(net.describe(fetchFailed('CERT_HAS_EXPIRED')), 'fetch failed (CERT_HAS_EXPIRED)');
  assert.equal(net.describe(new Error('HTTP 502')), 'HTTP 502');
  assert.equal(net.describe('plain words'), 'plain words');
});

test('a report that cannot go waits, survives a restart, and goes when the connection is back', async () => {
  let online = false, saved = 'never';
  const got = [];
  const send = async (item) => { if (!online) throw fetchFailed('ENETUNREACH'); got.push(item.reason); };
  const reports = net.holder(send, (item) => { saved = item; });

  assert.equal(await reports.send({ reason: 'user', text: 'a' }), 'held');
  assert.ok(reports.waiting && saved.reason === 'user');
  assert.equal(await reports.flush(), false); // still away: kept
  assert.ok(reports.waiting);

  // a later report replaces the earlier one (it carries the earlier lines too)
  assert.equal(await reports.send({ reason: 'auto:talk', text: 'b' }), 'held');
  assert.equal(saved.reason, 'auto:talk');

  // the window is closed and opened again: the saved one is taken up
  const again = net.holder(send, (item) => { saved = item; });
  assert.equal(again.waiting, false);
  again.take(saved);
  online = true;
  assert.equal(await again.flush(), true);
  assert.deepEqual(got, ['auto:talk']);
  assert.ok(!again.waiting && saved === null);
  assert.equal(await again.flush(), false); // nothing left

  // online, a report goes at once and nothing is kept
  assert.equal(await again.send({ reason: 'user', text: 'c' }), 'sent');
  assert.deepEqual(got, ['auto:talk', 'user']);
});

test('a report the server refuses is not kept for ever', async () => {
  let answer = 'offline', saved = 'never';
  const reports = net.holder(async () => {
    if (answer === 'offline') throw fetchFailed('ECONNRESET');
    throw new Error('HTTP 401');
  }, (item) => { saved = item; });
  await assert.rejects(net.holder(async () => { throw new Error('HTTP 413'); }).send({ reason: 'user' }), /HTTP 413/);
  assert.equal(await reports.send({ reason: 'user' }), 'held');
  answer = 'refused';
  await assert.rejects(reports.flush(), /HTTP 401/);
  assert.ok(!reports.waiting && saved === null);
});

test('against a real server: held while it is down, delivered when it is up', async () => {
  const bodies = [];
  const server = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { bodies.push(b); res.end('{}'); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  await new Promise((r) => server.close(r)); // nothing listens there now: connection refused
  const post = async (item) => { const r = await fetch(`http://127.0.0.1:${port}/logs`, { method: 'POST', body: item.text }); if (!r.ok) throw new Error('HTTP ' + r.status); };
  const reports = net.holder(post);
  assert.equal(await reports.send({ text: 'the report' }), 'held');
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  try {
    assert.equal(await reports.flush(), true);
    assert.deepEqual(bodies, ['the report']);
  } finally { await new Promise((r) => server.close(r)); }
});

test('the window being closed is told apart from a fault (0.9.12)', () => {
  const net = require('../net.js');
  const canceled = Object.assign(new Error('Canceled'), { name: 'Canceled' }); // the editor's own CancellationError
  assert.equal(net.closing(canceled), true);
  assert.equal(net.closing(new Error('Canceled')), true);
  assert.equal(net.closing('Canceled'), true);
  assert.equal(net.closing(new Error('Channel has been closed')), true);
  assert.equal(net.closing(new Error('HTTP 502')), false);
  assert.equal(net.closing(new Error('The upload was canceled by the server')), false); // a sentence that merely has the word
  assert.equal(net.closing(null), false);
});

