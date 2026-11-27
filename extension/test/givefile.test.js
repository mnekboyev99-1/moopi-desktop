// node --test extension/test/givefile.test.js — a MOOPI file handed to Claude (0.9.11): dragged over from the
// app, its mention goes into Claude's input box; by the button, or when it can't be typed there, it is on the
// clipboard and a notice says so.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moopi-give-'));
const shown = [], written = [], clipboard = [];
const anything = () => new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : anything()), apply: () => anything() });
const uri = (p) => ({ fsPath: p, path: p });
const vscode = new Proxy({
  version: '1.143.1',
  env: new Proxy({ appName: 'MOOPI Desktop', language: 'uz', clipboard: { writeText: async (t) => { clipboard.push(t); } } }, { get: (o, k) => (k in o ? o[k] : anything()) }),
  Uri: { joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)), file: uri, parse: (s) => ({ toString: () => s }) },
  workspace: new Proxy({ workspaceFolders: [{ uri: uri(dir) }],
    fs: { createDirectory: async () => {}, writeFile: async (u, bytes) => { written.push([u.fsPath, Buffer.from(bytes).toString()]); } } },
    { get: (o, k) => (k in o ? o[k] : anything()) }),
  window: new Proxy({ showInformationMessage: async (m) => { shown.push(m); }, showErrorMessage: async (m) => { shown.push('ERROR ' + m); },
    showWarningMessage: async (m) => { shown.push('WARN ' + m); } }, { get: (o, k) => (k in o ? o[k] : anything()) }),
}, { get: (o, k) => (k in o ? o[k] : anything()) });
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'vscode' ? vscode : load.call(this, request, ...rest); };
const ext = require('../extension')._test;
const assistant = require('../assistant');
Module._load = load;

const state = {};
const context = { globalState: { get: (k) => state[k], update: async (k, v) => { state[k] = v; } }, extension: { packageJSON: { version: '0.9.11' } } };
const api = { base: 'https://moopi.uz/api', token: 'app-token' };
const realFetch = global.fetch, realPut = assistant.putInPanel;
let asked = [], put = [], panelTakes = true;
test.before(() => {
  global.fetch = async (url, opts = {}) => { asked.push([String(url), (opts.headers || {}).Authorization]); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('PDF bytes') }; };
  assistant.putInPanel = async (ctx, text) => { put.push(text); return panelTakes; };
});
test.after(() => { global.fetch = realFetch; assistant.putInPanel = realPut; fs.rmSync(dir, { recursive: true, force: true }); });
const reset = () => { asked = []; put = []; shown.length = 0; written.length = 0; clipboard.length = 0; };

test('a file dragged onto Claude: downloaded into the work folder, its mention put into Claude\'s input box, no notice', async () => {
  reset(); panelTakes = true;
  await ext.giveFile(context, api, 992, 'Murat-savollariga-javoblar.pdf', true);
  assert.deepEqual(asked, [['https://moopi.uz/api/files/992', 'Bearer app-token']]);
  assert.deepEqual(written, [[path.join(dir, 'fayllar', 'Murat-savollariga-javoblar.pdf'), 'PDF bytes']]);
  assert.deepEqual(put, ['@fayllar/Murat-savollariga-javoblar.pdf ']); // a space after it: the request follows
  assert.deepEqual(shown, [], 'the mention is already where the person writes');
  assert.ok((state['moopi.fromMoopi'] || []).includes(path.join(dir, 'fayllar', 'Murat-savollariga-javoblar.pdf')), 'not uploaded back to MOOPI as a new file');
});

test('when it can\'t be typed into the panel, the mention is on the clipboard and the notice says so', async () => {
  reset(); panelTakes = false;
  await ext.giveFile(context, api, 7, 'jadval.xlsx', true);
  assert.deepEqual(put, ['@fayllar/jadval.xlsx ']);
  assert.deepEqual(clipboard, ['@fayllar/jadval.xlsx ']);
  assert.equal(shown.length, 1);
  assert.match(shown[0], /@fayllar\/jadval\.xlsx/);
});

test('the button works as before: clipboard and notice, nothing typed', async () => {
  reset(); panelTakes = true;
  await ext.giveFile(context, api, 7, 'jadval.xlsx');
  assert.deepEqual(put, []);
  assert.deepEqual(clipboard, ['@fayllar/jadval.xlsx ']);
  assert.equal(shown.length, 1);
});

test('a name that would leave the folder is made safe', async () => {
  reset(); panelTakes = true;
  await ext.giveFile(context, api, 8, '..\\..\\boshqa/joy:fayl?.pdf', true);
  assert.equal(path.dirname(written[0][0]), path.join(dir, 'fayllar'));
  assert.doesNotMatch(path.basename(written[0][0]), /[\\/:?]/);
});
