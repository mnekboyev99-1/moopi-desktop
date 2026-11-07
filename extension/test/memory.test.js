// node --test extension/test — the memory sync, the index, the Stop hook and the settings (no VS Code needed).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const m = require('../memory');

test('a change on one side goes to the other; on both, this copy wins; first meeting goes to the newer', () => {
  const h = (t) => m.hash(t);
  const local = { 'a.md': { text: 'A2', mtime: 0 }, 'b.md': { text: 'B', mtime: 0 }, 'c.md': { text: 'C2', mtime: 0 },
    'new.md': { text: 'N', mtime: 0 }, 'gone-there.md': { text: 'G', mtime: 0 }, 'both.md': { text: 'old', mtime: Date.parse('2026-11-07T10:00:00Z') } };
  const remote = { 'a.md': { at: '1' }, 'b.md': { at: '2' }, 'c.md': { at: '9' }, 'theirs.md': { at: '1' }, 'gone-here.md': { at: '1' },
    'both.md': { at: '2026-11-07T11:00:00' } };
  const state = { 'a.md': { hash: h('A1'), at: '1' }, 'b.md': { hash: h('B'), at: '1' }, 'c.md': { hash: h('C1'), at: '1' },
    'gone-there.md': { hash: h('G'), at: '1' }, 'gone-here.md': { hash: h('X'), at: '1' }, 'old.md': { hash: 'x', at: '1' } };
  const ops = Object.fromEntries(m.plan(local, remote, state).map((o) => [o.rel, o.op + (o.conflict ? '!' : '')]));
  assert.deepStrictEqual(ops, { 'a.md': 'push', 'b.md': 'pull', 'c.md': 'push!', 'new.md': 'push', 'theirs.md': 'pull',
    'gone-there.md': 'deleteLocal', 'gone-here.md': 'deleteRemote', 'old.md': 'forget', 'both.md': 'pull' });
});

test('only plain .md files under /memories/ are kept in the folder', () => {
  assert.strictEqual(m.relOf('/memories/odamlar/akmal.md'), 'odamlar/akmal.md');
  for (const bad of ['/memories/../x.md', '/memories/.hidden.md', '/memories/a.txt', '/etc/x.md', '/memories/a//b.md']) assert.strictEqual(m.relOf(bad), null, bad);
});

test('the index names every file once, and adds a line for a file it does not mention', () => {
  const files = { 'saboqlar.md': { text: '# Saboqlar va qoidalar\n' }, 'narx.md': { text: '---\nname: narx\ndescription: Non narxi 6000\n---\nx' } };
  const first = m.indexText(null, files);
  assert.match(first, /\[saboqlar\]\(saboqlar\.md\) — Saboqlar va qoidalar/);
  assert.match(first, /\[narx\]\(narx\.md\) — Non narxi 6000/);
  assert.strictEqual(m.indexText(first, files), null);
  const more = m.indexText(first, { ...files, 'odamlar.md': { text: '# Odamlar\n' } });
  assert.ok(more.startsWith(first) && more.endsWith('- [odamlar](odamlar.md) — Odamlar\n'));
});

test('a reminder comes after several messages without a memory write, not after a write or a reminder', () => {
  const dir = path.join(os.homedir(), 'MOOPI', 'xotira');
  const user = (text, extra = {}) => JSON.stringify({ type: 'user', message: { role: 'user', content: text }, ...extra });
  const write = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(dir, 'odamlar.md') } }] } });
  const elsewhere = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: path.join(os.homedir(), 'MOOPI', 'tayyor', 'x.md') } }] } });
  const mcp = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__moopi__memory', input: { command: 'insert' } }] } });
  const result = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } });
  const four = [user('1'), user('2'), result, user('3'), user('<command-name>/usage</command-name>'), user('4')];
  assert.strictEqual(m.messagesSinceMemory(four, dir), 4);
  assert.strictEqual(m.messagesSinceMemory([...four.slice(0, 3), write, user('5')], dir), 1);
  assert.strictEqual(m.messagesSinceMemory([...four, mcp], dir), 0);
  assert.strictEqual(m.messagesSinceMemory([...four, elsewhere], dir), 4);
  assert.strictEqual(m.messagesSinceMemory([...four, user('Stop hook feedback:\n' + m.nudgeText(4), { isMeta: true }), user('6')], dir), 1);
  assert.strictEqual(m.messagesSinceMemory([user('summary', { isCompactSummary: true }), user('7')], dir), 1);
});

test("Claude Code's local settings point at the folder and keep the person's own entries", () => {
  const before = { permissions: { allow: ['Bash(ls)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }, { type: 'http', url: 'http://127.0.0.1:47821/stop', headers: { 'X-Moopi-Hook': 'old' } }] }] } };
  const s = m.localSettings(before, 'http://127.0.0.1:47822/stop', 'tok');
  assert.strictEqual(s.autoMemoryDirectory, '~/MOOPI/xotira');
  assert.strictEqual(s.autoDreamEnabled, true);
  assert.deepStrictEqual(s.permissions, before.permissions);
  assert.deepStrictEqual(s.hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo hi' }] },
    { hooks: [{ type: 'http', url: 'http://127.0.0.1:47822/stop', headers: { 'X-Moopi-Hook': 'tok' }, timeout: 10 }] }]);
  assert.deepStrictEqual(m.localSettings(s, 'http://127.0.0.1:47822/stop', 'tok'), s);
});

test('the briefing time becomes a UTC cron line', () => {
  assert.strictEqual(m.cronFor('07:00', 'Asia/Tashkent'), '0 2 * * *');
  assert.strictEqual(m.cronFor('03:30', 'Asia/Tashkent'), '30 22 * * *');
  assert.strictEqual(m.cronFor('08:15', 'Europe/Moscow'), '15 5 * * *');
});

/** MOOPI's memory API, in memory. */
function fakeApi(files) {
  let clock = 0;
  const tick = () => `2026-11-07T12:00:${String(++clock).padStart(2, '0')}`;
  const rows = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, { content: c, at: tick() }]));
  const fixed = new Set(['/memories/README.md', '/memories/saboqlar.md']);
  const api = { token: 't', me: { id: 7 }, rows, log: [],
    async get(p) {
      if (p === '/memory') return Object.entries(rows).map(([path, r]) => ({ path, size: r.content.length, updated_by: 'user', updated_at: r.at }));
      const q = decodeURIComponent(p.split('path=')[1]);
      return { path: q, content: rows[q].content };
    },
    async request(method, p, body) {
      api.log.push(method + ' ' + p.split('?')[0]);
      if (method === 'PUT') { rows[body.path] = { content: body.content, at: tick() }; return body; }
      const q = decodeURIComponent(p.split('path=')[1]);
      if (fixed.has(q)) throw new Error('fixed');
      delete rows[q]; return { ok: true };
    } };
  api.edit = (p, c) => { rows[p] = { content: c, at: tick() }; };
  return api;
}
function store() { let v = null; return { get: () => v, set: async (x) => { v = JSON.parse(JSON.stringify(x)); } }; }

test("the folder and MOOPI's memory stay the same both ways, and nothing MOOPI keeps is lost", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xotira-'));
  const api = fakeApi({ '/memories/README.md': '# Bilim bazasi tuzilmasi\n', '/memories/saboqlar.md': '# Saboqlar\n', '/memories/odamlar.md': '# Odamlar\n' });
  const sync = new m.MemorySync({ root, api, store: store() });
  await sync.sync();
  assert.strictEqual(fs.readFileSync(path.join(root, 'odamlar.md'), 'utf8'), '# Odamlar\n');
  assert.match(fs.readFileSync(path.join(root, 'MEMORY.md'), 'utf8'), /\(saboqlar\.md\)/);
  assert.ok(api.rows['/memories/MEMORY.md'], 'the index goes up too');
  // Claude writes a new fact file and edits one; the app edits another
  fs.mkdirSync(path.join(root, 'mijozlar'));
  fs.writeFileSync(path.join(root, 'mijozlar', 'akmal.md'), '# Akmal\n\n- 20 qop, 07.11.2026\n');
  fs.writeFileSync(path.join(root, 'odamlar.md'), '# Odamlar\n\n- Ravshan — omborchi\n');
  api.edit('/memories/saboqlar.md', '# Saboqlar\n\n- Narxni so\'mda yoz\n');
  await sync.sync();
  assert.strictEqual(api.rows['/memories/mijozlar/akmal.md'].content, '# Akmal\n\n- 20 qop, 07.11.2026\n');
  assert.match(api.rows['/memories/odamlar.md'].content, /Ravshan/);
  assert.match(fs.readFileSync(path.join(root, 'saboqlar.md'), 'utf8'), /so'mda/);
  assert.match(api.rows['/memories/MEMORY.md'].content, /mijozlar\/akmal\.md/);
  // a sync with nothing new sends nothing
  const before = api.log.length;
  await sync.sync();
  assert.strictEqual(api.log.length, before);
  // deleted here: deleted there — except a file MOOPI keeps, which comes back
  fs.rmSync(path.join(root, 'odamlar.md'));
  fs.rmSync(path.join(root, 'saboqlar.md'));
  await sync.sync();
  assert.ok(!api.rows['/memories/odamlar.md']);
  assert.match(fs.readFileSync(path.join(root, 'saboqlar.md'), 'utf8'), /so'mda/);
  // deleted in the app: gone from the folder
  delete api.rows['/memories/mijozlar/akmal.md'];
  await sync.sync();
  assert.ok(!fs.existsSync(path.join(root, 'mijozlar', 'akmal.md')));
  // another account signs in: the folder is moved aside, never deleted
  api.me = { id: 8 };
  await sync.sync();
  const aside = fs.readdirSync(path.dirname(root)).filter((n) => n.startsWith(path.basename(root) + '-7-'));
  assert.strictEqual(aside.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
  for (const n of aside) fs.rmSync(path.join(path.dirname(root), n), { recursive: true, force: true });
});

test('the Stop hook answers Claude Code on 127.0.0.1, with the token only', async () => {
  const projects = path.join(os.homedir(), '.claude', 'projects', 'moopi-hook-test');
  fs.mkdirSync(projects, { recursive: true });
  const file = path.join(projects, 's.jsonl');
  fs.writeFileSync(file, ['a', 'b', 'c', 'd'].map((t) => JSON.stringify({ type: 'user', message: { content: t } })).join('\n') + '\n');
  const started = await m.startHookServer({ token: 'tok', memoryDir: '/x', port: 0, isOn: () => true, log: () => {} });
  const url = `http://127.0.0.1:${started.port}/stop`;
  const post = (body, token = 'tok') => fetch(url, { method: 'POST', headers: { 'X-Moopi-Hook': token }, body: JSON.stringify(body) });
  const r = await post({ transcript_path: file, stop_hook_active: false });
  const j = await r.json();
  assert.strictEqual(j.decision, 'block');
  assert.ok(j.reason.startsWith(m.MARK));
  assert.deepStrictEqual(await (await post({ transcript_path: file, stop_hook_active: true })).json(), {});
  assert.deepStrictEqual(await (await post({ transcript_path: '/etc/passwd.jsonl' })).json(), {});
  assert.strictEqual((await post({ transcript_path: file }, 'wrong')).status, 403);
  started.server.close();
  fs.rmSync(projects, { recursive: true, force: true });
});
