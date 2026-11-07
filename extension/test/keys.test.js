// Keys go only into MOOPI Desktop's own window (0.9.6; owner, 08.11.2026).
const test = require('node:test');
const assert = require('node:assert');
const platform = require('../platform.js');

test('the app is known by its main process and its bundle or executable', () => {
  platform._setOwn(null);
  const mac = platform.ownApp('/Applications/MOOPI Desktop.app/Contents/Frameworks/MOOPI Desktop Helper (Plugin).app/Contents/MacOS/MOOPI Desktop Helper (Plugin)', 4242, true);
  assert.deepStrictEqual(mac, { pid: 4242, app: '/Applications/MOOPI Desktop.app' });
  const win = platform.ownApp('C:\\Users\\m\\AppData\\Local\\Programs\\MOOPI Desktop\\MOOPI Desktop.exe', 77, false);
  assert.deepStrictEqual(win, { pid: 77, app: 'C:\\Users\\m\\AppData\\Local\\Programs\\MOOPI Desktop\\MOOPI Desktop.exe' });
  assert.strictEqual(platform.ownApp('/usr/local/bin/node', 5, true).app, '');
});

// On a Mac the real check runs: as "the app" a process that is never a window in front (launchd), so no key
// can ever be sent from this test.
test('no key is sent when another window is in front (macOS)', { skip: process.platform !== 'darwin' }, async () => {
  platform._setOwn({ pid: 1, app: '' });
  try {
    const st = await platform.frontState().catch((e) => ({ error: e.code }));
    if (st.error === 'ax' || st.error === 'guard') return; // no permission to ask System Events here
    assert.strictEqual(st.front, false);
    assert.ok(st.idle === null || st.idle >= 0);
    await assert.rejects(platform.pressEnter(), (e) => e.code === 'front');
    await assert.rejects(platform.pasteAndEnter(true), (e) => e.code === 'front');
  } finally { platform._setOwn(null); }
});
