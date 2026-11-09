const test = require('node:test');
const assert = require('node:assert');
const { binaryIn, classify, check, passportEmpty } = require('../claude-account.js');

const status = (o) => JSON.stringify({ apiProvider: 'firstParty', ...o });

test('a paid Claude plan means the panel can answer', () => {
  for (const plan of ['pro', 'max', 'ultra', 'team', 'enterprise', 'MAX'])
    assert.strictEqual(classify(status({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: plan })), 'active', plan);
});

test('signed out or on Free: not the panel', () => {
  assert.strictEqual(classify(status({ loggedIn: false })), 'none');
  assert.strictEqual(classify(status({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'free' })), 'none');
});

test('a Console key inside Claude Code also answers', () => {
  assert.strictEqual(classify(status({ loggedIn: true, authMethod: 'console' })), 'active');
});

test('anything it cannot read is unknown, never a guess', () => {
  assert.strictEqual(classify('not json'), 'unknown');
  assert.strictEqual(classify('{}'), 'unknown');
  assert.strictEqual(classify(status({ loggedIn: true, authMethod: 'claude.ai' })), 'unknown');
});

test('the binary is found by platform', () => {
  assert.ok(binaryIn('/x', 'win32').endsWith('claude.exe'));
  assert.ok(binaryIn('/x', 'darwin').endsWith('native-binary/claude'));
});

test('a signed-out Claude that exits with an error still answers through its output', async () => {
  const run = (f, a, o, cb) => cb(new Error('exit 1'), status({ loggedIn: false }));
  assert.strictEqual(await check('/x', run, () => true), 'none');
});

test('no binary or no output is unknown', async () => {
  assert.strictEqual(await check('/x', () => {}, () => false), 'unknown');
  assert.strictEqual(await check('/x', (f, a, o, cb) => cb(new Error('timeout'), ''), () => true), 'unknown');
});

test('the passport template counts as empty, a written one does not', () => {
  const template = "# Biznes pasporti\n\n## Umumiy\n(nima bilan shug'ullanadi, qachondan, qayerda)\n\n## Mijozlar\n(kimlar, segmentlar)\n";
  assert.strictEqual(passportEmpty(template), true);
  assert.strictEqual(passportEmpty(''), true);
  assert.strictEqual(passportEmpty(template + "\nBuxoroda 3 ta kiyim do'koni, 2019-yildan beri ishlaydi.\n"), false);
});
