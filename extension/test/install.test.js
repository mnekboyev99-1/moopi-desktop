// One MOOPI on a computer: the Store's copy finds the site's (0.9.8; owner, 08.11.2026).
const test = require('node:test');
const assert = require('node:assert');
const { fromStore, siteCopies } = require('../install.js');

test('a Store package is told by its folder', () => {
  assert.strictEqual(fromStore('C:\\Program Files\\WindowsApps\\MuhiddinNekboyev.MOOPI_2.0.0.0_x64__abc\\MOOPI Desktop.exe'), true);
  assert.strictEqual(fromStore('C:\\Users\\m\\AppData\\Local\\Programs\\MOOPI Desktop\\MOOPI Desktop.exe'), false);
  assert.strictEqual(fromStore('/Applications/MOOPI Desktop.app/Contents/MacOS/MOOPI Desktop'), false);
});

test("the site's copies are found by their uninstallers, per user and for all users", () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\m\\AppData\\Local', ProgramFiles: 'C:\\Program Files' };
  const there = new Set(['C:\\Users\\m\\AppData\\Local\\Programs\\MOOPI Desktop\\unins000.exe']);
  assert.deepStrictEqual(siteCopies(env, (p) => there.has(p)), ['C:\\Users\\m\\AppData\\Local\\Programs\\MOOPI Desktop\\unins000.exe']);
  assert.deepStrictEqual(siteCopies(env, () => false), []);
});
