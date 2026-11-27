// node --test extension/test/selfupdate.test.js — the extension's own updates (0.9.12; owner, 27.11.2026): a newer
// release is installed by itself, quietly — no notice to press, no reload under the person's hands; the menu's
// "check" still loads it at once.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const shown = [], commands = [];
const anything = () => new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : anything()), apply: () => anything() });
const vscode = new Proxy({
  version: '1.143.1', env: { appName: 'MOOPI Desktop', language: 'uz' },
  Uri: { file: (p) => ({ fsPath: p }), parse: (s) => ({ toString: () => s }), joinPath: (b, ...p) => ({ fsPath: [b.fsPath, ...p].join('/') }) },
  extensions: { getExtension: () => undefined, all: [] },
  commands: { executeCommand: async (name, arg) => { commands.push([name, arg && arg.fsPath ? 'file' : arg]); }, getCommands: async () => [] },
  workspace: new Proxy({ getConfiguration: () => ({ get: (k, d) => d }) }, { get: (o, k) => (k in o ? o[k] : anything()) }),
  window: new Proxy({ showInformationMessage: async (m, ...buttons) => { shown.push([m, ...buttons]); }, showWarningMessage: async (m) => { shown.push(['WARN ' + m]); },
    showErrorMessage: async (m) => { shown.push(['ERROR ' + m]); } }, { get: (o, k) => (k in o ? o[k] : anything()) }),
}, { get: (o, k) => (k in o ? o[k] : anything()) });
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'vscode' ? vscode : load.call(this, request, ...rest); };
const ext = require('../extension')._test;
const update = require('../update');
Module._load = load;

const context = (version) => ({ extension: { packageJSON: { version } }, globalState: { get: () => undefined, update: async () => {} } });
const api = { base: 'https://moopi.uz/api', token: 'app-token' };
const realFetch = global.fetch, realLatest = update.latestRelease, realTimeout = global.setTimeout;
let latest = '0.9.13', downloads = [];
test.before(() => {
  update.latestRelease = async () => ({ tag: latest, url: `https://github.com/x/releases/download/v${latest}/moopi.moopi-desktop-${latest}.vsix` });
  global.fetch = async (url) => { downloads.push(String(url)); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('vsix'), json: async () => ({}) }; };
});
test.after(() => { update.latestRelease = realLatest; global.fetch = realFetch; });
const reset = () => { shown.length = 0; commands.length = 0; downloads = []; };
const installs = () => commands.filter((c) => c[0] === 'workbench.extensions.installExtension').length;
const reloads = () => commands.filter((c) => c[0] === 'workbench.action.reloadWindow').length;

test('a newer release is installed by itself: nothing to press, nothing reloaded', async () => {
  reset(); latest = '0.9.13';
  await ext.checkUpdate(context('0.9.12'), api, false, true);
  assert.equal(downloads.filter((u) => u.endsWith('moopi.moopi-desktop-0.9.13.vsix')).length, 1);
  assert.equal(installs(), 1);
  assert.equal(reloads(), 0, 'the new version runs from the next start');
  assert.deepEqual(shown, [], 'no notice that waits for a press');
});

test('the same release is not fetched again while it waits for the next start', async () => {
  reset(); latest = '0.9.13';
  await ext.checkUpdate(context('0.9.12'), api, false);
  assert.equal(downloads.filter((u) => u.endsWith('.vsix')).length, 0);
  assert.equal(installs(), 0);
});

test('nothing happens when the release is not newer', async () => {
  reset(); latest = '0.9.12';
  await ext.checkUpdate(context('0.9.12'), api, false, true);
  assert.equal(installs(), 0);
  assert.deepEqual(shown, []);
});

test('asked from the menu, the new version is installed and loaded at once', async () => {
  reset(); latest = '0.9.14';
  const timers = [];
  global.setTimeout = (fn, ms) => { timers.push(fn); return 0; };
  try { await ext.checkUpdate(context('0.9.12'), api, true); } finally { global.setTimeout = realTimeout; }
  for (const fn of timers) await fn();
  assert.equal(installs(), 1);
  assert.equal(reloads(), 1);
  assert.equal(shown.length, 1); // "MOOPI … ga yangilandi — qayta yuklanmoqda…"
});
