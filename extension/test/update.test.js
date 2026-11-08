// Desktop's own updates without GitHub's API (0.9.7; user 5's Desktop got "HTTP 403" from the API on 08.11.2026).
const test = require('node:test');
const assert = require('node:assert');
const { latestRelease } = require('../update.js');

const REPO = 'mnekboyev99-1/moopi-desktop';
const res = (status, { location, url, json } = {}) => ({
  status, ok: status >= 200 && status < 300, url: url || '',
  headers: { get: (h) => (h.toLowerCase() === 'location' ? location || null : null) },
  json: async () => json,
});

test('the version comes from the latest release page redirecting to its tag, not from the API', async () => {
  const asked = [];
  const got = await latestRelease(REPO, async (u) => {
    asked.push(u);
    return res(302, { location: `https://github.com/${REPO}/releases/tag/v0.9.7` });
  });
  assert.deepStrictEqual(got, { tag: '0.9.7', url: `https://github.com/${REPO}/releases/download/v0.9.7/moopi.moopi-desktop-0.9.7.vsix` });
  assert.deepStrictEqual(asked, [`https://github.com/${REPO}/releases/latest`]);
});

test('a followed redirect is read from the final address', async () => {
  const got = await latestRelease(REPO, async () => res(200, { url: `https://github.com/${REPO}/releases/tag/v1.2.3` }));
  assert.strictEqual(got.tag, '1.2.3');
});

test('only when the page fails is the API asked, and its refusal is reported', async () => {
  const asked = [];
  await assert.rejects(latestRelease(REPO, async (u) => {
    asked.push(u);
    if (u.startsWith('https://github.com/')) throw new Error('offline');
    return res(403);
  }), /HTTP 403/);
  assert.strictEqual(asked.length, 2);
  assert.ok(asked[1].startsWith('https://api.github.com/'));
});

test('the API answer still works as before', async () => {
  const got = await latestRelease(REPO, async (u) => (u.startsWith('https://github.com/')
    ? res(404)
    : res(200, { json: { tag_name: 'v0.9.8', assets: [{ name: 'moopi.moopi-desktop-0.9.8.vsix', browser_download_url: 'https://x/y.vsix' }] } })));
  assert.deepStrictEqual(got, { tag: '0.9.8', url: 'https://x/y.vsix' });
});
