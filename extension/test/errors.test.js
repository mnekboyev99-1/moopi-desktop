// node --test extension/test/errors.test.js — the extension's own error reporting, as wired in extension.js:
// a lost connection sends nothing (no error, no ping, no report), a real error still does, and a report that
// could not go is kept in a file and sent by the next start (18–22.11.2026).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// extension.js needs the editor's API only when its functions run; here it gets a stand-in that answers
// anything, with the few values these tests read.
const shown = [];
const anything = () => new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : anything()), apply: () => anything() });
const vscode = new Proxy({
  version: '1.143.1', env: { appName: 'MOOPI Desktop', language: 'uz' },
  window: new Proxy({ showInformationMessage: (m) => { shown.push(['info', m]); }, showErrorMessage: (m) => { shown.push(['error', m]); },
    showWarningMessage: (m) => { shown.push(['warn', m]); } }, { get: (o, k) => (k in o ? o[k] : anything()) }),
}, { get: (o, k) => (k in o ? o[k] : anything()) });
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'vscode' ? vscode : load.call(this, request, ...rest); };
const ext = require('../extension')._test;
Module._load = load;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moopi-errors-'));
const context = { globalStorageUri: { fsPath: path.join(dir, 'storage') }, logUri: { fsPath: path.join(dir, 'logs', 's', 'window1', 'exthost', 'moopi.moopi-desktop') },
  extension: { packageJSON: { version: '0.9.10' } }, globalState: { get: () => 'client-1', update: async () => {} } };
const api = { base: 'https://moopi.uz/api', token: 'app-token', me: { id: 2, name: 'Sinov' }, post: async (p, body) => { calls.push(['POST', p, body]); return {}; } };
let calls = [];
let network = 'up';
const realFetch = global.fetch;
function fakeFetch(url, opts = {}) {
  if (network === 'down') { const e = new TypeError('fetch failed'); e.cause = Object.assign(new Error('getaddrinfo ENOTFOUND moopi.uz'), { code: 'ENOTFOUND', hostname: 'moopi.uz' }); return Promise.reject(e); }
  calls.push([opts.method || 'GET', String(url).replace('https://moopi.uz/api', ''), opts.body]);
  return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test.before(() => { global.fetch = fakeFetch; ext.setErrorApi(api, '0.9.10'); ext.takeHeldLogs(context); });
test.after(() => { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); });

test('a lost connection is written down here and sent nowhere', async () => {
  calls = []; network = 'up';
  const away = new TypeError('fetch failed'); away.cause = Object.assign(new Error('getaddrinfo ENOTFOUND moopi.uz'), { code: 'ENOTFOUND', hostname: 'moopi.uz' });
  ext.reportError(context, api, 'memorySync', away);
  ext.reportError(context, api, 'bridge', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
  ext.noteError('ping', away);
  await settle();
  assert.deepEqual(calls, [], 'no error, no ping and no report for a computer that is offline');
  const last = ext.ownErrors.slice(-3).join('\n');
  assert.match(last, /memorySync: offline: fetch failed \(ENOTFOUND moopi\.uz\)/); // kept for the next report
  assert.match(last, /bridge: offline: socket hang up/);
});

test('a real error is still reported, with its reason', async () => {
  calls = []; network = 'up';
  const cert = new TypeError('fetch failed'); cert.cause = Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' });
  ext.noteError('memorySync', cert);
  ext.noteError('talk', new Error('HTTP 502'));
  await settle();
  const sent = calls.filter((c) => c[1] === '/client/errors').map((c) => JSON.parse(c[2]).errors[0]);
  assert.deepEqual(sent.map((e) => [e.where, e.message]), [['memorySync', 'fetch failed (CERT_HAS_EXPIRED)'], ['talk', 'HTTP 502']]);
  assert.equal(sent[0].version, '0.9.10');
});

test('a report that cannot go is kept in a file and sent by the next start', async () => {
  const held = path.join(context.globalStorageUri.fsPath, 'held-report.json');
  calls = []; shown.length = 0; network = 'down';
  assert.equal(await ext.sendLogs(context, api, 'user', false), false);
  assert.ok(ext.logReports.waiting && fs.existsSync(held), 'the report waits on disk');
  assert.equal(JSON.parse(fs.readFileSync(held, 'utf8')).reason, 'user');
  assert.deepEqual(shown.map((s) => s[0]), ['info']); // "saved, will go by itself" — not an error box
  assert.match(shown[0][1], /Hisobot saqlab qo.yildi/);
  assert.deepEqual(calls, []);

  network = 'up'; // the connection is back: the waiting report goes, and its file is removed
  assert.equal(await ext.logReports.flush(), true);
  const posted = calls.filter((c) => /desktop\/logs$/.test(c[1]));
  assert.equal(posted.length, 1);
  assert.match(posted[0][2], /# MOOPI Desktop log report\nreason: user/);
  assert.ok(!ext.logReports.waiting && !fs.existsSync(held));

  // closed before the connection came back: the next start finds the file and takes it up
  network = 'down';
  await ext.sendLogs(context, api, 'auto:talk', true);
  assert.ok(fs.existsSync(held));
  await ext.logReports.flush().catch(() => {}); // still away
  network = 'up'; calls = [];
  ext.takeHeldLogs(context);
  assert.ok(ext.logReports.waiting);
  assert.equal(await ext.logReports.flush(), true);
  assert.match(calls[0][2], /reason: auto:talk/);
  assert.ok(!fs.existsSync(held));
});

test('online, a report goes at once as before', async () => {
  calls = []; shown.length = 0; network = 'up';
  assert.equal(await ext.sendLogs(context, api, 'user', false), true);
  assert.equal(calls.filter((c) => /desktop\/logs$/.test(c[1])).length, 1);
  assert.match(shown[0][1], /yuborildi/);
});
