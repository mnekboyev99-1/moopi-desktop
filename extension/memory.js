// MOOPI's memory is Claude's own memory (0.9.6; owner's rule 07.11.2026: a person on a Claude subscription gets
// every service inside it, without an API key). Claude Code keeps its automatic memory in a folder of its own
// and loads that folder's MEMORY.md index into every session; here that folder is ~/MOOPI/xotira, and this file
// keeps it the same as MOOPI's memory (/memories/ on the server, the phone's Xotira): what Claude writes goes up
// within seconds, what the app, the server or another device writes comes down within a minute. All of it
// runs on the person's own Claude — no MOOPI key is spent.
//
// Three pieces: the folder sync, the settings that point Claude Code at the folder (and switch on its own
// nightly tidying, auto-dream, where Anthropic offers it), and a Stop hook served on 127.0.0.1 that asks
// Claude, once, to save what matters when several messages went by without a memory write.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');

const DIR_NAME = 'xotira';
const REMOTE_ROOT = '/memories/';
const MAX_CHARS = 100000; // the server's limit for one memory file
const PULL_EVERY = 60 * 1000;
const NUDGE_AFTER = 4; // the person's messages since Claude last wrote to memory
const MARK = 'MOOPI eslatmasi:';
const INDEX = 'MEMORY.md';
const PORTS = [47821, 47822, 47823, 47824, 47825];

function hash(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32); }

/** '/memories/odamlar/akmal.md' → 'odamlar/akmal.md'; null for anything that is not a plain .md under /memories/. */
function relOf(remotePath) {
  if (typeof remotePath !== 'string' || !remotePath.startsWith(REMOTE_ROOT)) return null;
  const rel = remotePath.slice(REMOTE_ROOT.length);
  return safeRel(rel) ? rel : null;
}
function safeRel(rel) {
  if (!rel || !rel.endsWith('.md') || rel.includes('\\') || rel.includes('\0')) return false;
  return rel.split('/').every((part) => part && part !== '.' && part !== '..' && !part.startsWith('.'));
}
function remoteOf(rel) { return REMOTE_ROOT + rel; }
/** The server's times are UTC without a zone mark. */
function parseAt(at) { const s = String(at || ''); return Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : s + 'Z'); }
function localOf(root, rel) { return path.join(root, ...rel.split('/')); }

/** What to do with each file, from what is here (local: rel → {text, mtime}), what MOOPI has (remote: rel →
 *  {at}) and what both were at the last sync (state: rel → {hash, at}). A file changed on one side goes to
 *  the other; changed on both, this computer's copy wins and MOOPI keeps the other in its history (nothing
 *  is lost: every memory write keeps the earlier version). A file met on both sides for the first time (a
 *  folder from before, a reinstall) goes the way of the newer one. */
function plan(local, remote, state) {
  const ops = [];
  const names = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(state)]);
  for (const rel of [...names].sort()) {
    const L = local[rel], R = remote[rel], S = state[rel];
    if (L && R && S) {
      const localChanged = hash(L.text) !== S.hash, remoteChanged = R.at !== S.at;
      if (localChanged) ops.push({ rel, op: 'push', conflict: remoteChanged });
      else if (remoteChanged) ops.push({ rel, op: 'pull' });
    } else if (L && R) {
      ops.push({ rel, op: L.mtime > parseAt(R.at) ? 'push' : 'pull' });
    } else if (L && S) {
      ops.push({ rel, op: hash(L.text) === S.hash ? 'deleteLocal' : 'push' });
    } else if (L) {
      ops.push({ rel, op: 'push' });
    } else if (R && S) {
      ops.push({ rel, op: R.at === S.at ? 'deleteRemote' : 'pull' });
    } else if (R) {
      ops.push({ rel, op: 'pull' });
    } else {
      ops.push({ rel, op: 'forget' });
    }
  }
  return ops;
}

/** Every .md under the folder (not dot-files or dot-folders): rel → {text, mtime}. */
function readLocal(root) {
  const out = {};
  const walk = (dir, prefix) => {
    let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else if (e.isFile() && safeRel(rel)) {
        try {
          const file = path.join(dir, e.name);
          out[rel] = { text: fs.readFileSync(file, 'utf8'), mtime: fs.statSync(file).mtimeMs };
        } catch (err) {}
      }
    }
  };
  walk(root, '');
  return out;
}

/** The first heading of a memory file (or its frontmatter description), for its line in MEMORY.md. */
function titleOf(text, rel) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (fm) { const d = /^description:\s*(.+)$/m.exec(fm[1]); if (d) return d[1].trim().replace(/^["']|["']$/g, ''); }
  const h = /^#\s+(.+)$/m.exec(text);
  return h ? h[1].trim() : rel.replace(/\.md$/, '');
}
const INDEX_HEAD = '# Xotira (MOOPI)\n\nMOOPI xotirasining mundarijasi: har fayl bir qator. Asosiylari — biznes-pasporti.md, men-haqimda.md, saboqlar.md, kundalik.md.\n\n';
/** MEMORY.md, the index Claude Code loads into every session, names every file of the folder: written once
 *  when it is missing, and a line added for a file it does not mention yet (one MOOPI made, or one Claude
 *  forgot to list). Claude edits it freely otherwise. Returns the new text, or null when nothing changes. */
function indexText(current, files) {
  const lines = [];
  for (const rel of Object.keys(files).sort()) {
    if (rel === INDEX) continue;
    if (current !== null && current.includes('(' + rel + ')')) continue;
    lines.push(`- [${rel.replace(/\.md$/, '')}](${rel}) — ${titleOf(files[rel].text, rel).slice(0, 140)}`);
  }
  if (current !== null && !lines.length) return null;
  const base = current === null ? INDEX_HEAD : current.replace(/\s*$/, '\n');
  return base + lines.join('\n') + (lines.length ? '\n' : '');
}

/** Did Claude write to memory in this tool call? The folder's files (Write/Edit/MultiEdit), or MOOPI's
 *  memory tool over MCP. */
function isMemoryWrite(block, memoryDir) {
  if (!block || block.type !== 'tool_use') return false;
  const input = block.input || {};
  if (['Write', 'Edit', 'MultiEdit'].includes(block.name) && typeof input.file_path === 'string') {
    const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
    return norm(input.file_path).startsWith(norm(memoryDir) + '/');
  }
  return block.name === 'mcp__moopi__memory' && ['create', 'str_replace', 'insert', 'delete', 'rename'].includes(input.command);
}
/** The person's own words in a transcript line (not a tool result, a command, Claude Code's summary or a hook's note). */
function isPersonsMessage(d) {
  if (d.type !== 'user' || d.isMeta || d.isSidechain || d.isCompactSummary) return false;
  const c = d.message && d.message.content;
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n') : '';
  return !!text.trim() && !/^\s*<(command-name|command-message|local-command|system-reminder|bash-input|bash-stdout|bash-stderr)/.test(text);
}
/** How many of the person's messages went by since Claude last wrote to memory (or was last reminded). */
function messagesSinceMemory(lines, memoryDir) {
  let count = 0;
  for (const line of lines) {
    let d; try { d = JSON.parse(line); } catch (e) { continue; }
    if (d.isSidechain) continue;
    if (d.type === 'assistant' && Array.isArray(d.message && d.message.content) && d.message.content.some((b) => isMemoryWrite(b, memoryDir))) count = 0;
    else if (d.type === 'user' && d.isMeta && JSON.stringify(d.message || '').includes(MARK)) count = 0;
    else if (isPersonsMessage(d)) count += 1;
  }
  return count;
}
function nudgeText(n) {
  return `${MARK} so'nggi ${n} ta xabardan beri xotiraga hech narsa yozilmadi. Suhbatni ko'rib chiq: foydalanuvchi aytgan yangi fakt, ` +
    `qaror, narx, odam, afzallik yoki tuzatish bo'lsa, ${DIR_NAME}/ papkasidagi tegishli faylga uning so'zlari bilan, sana bilan yoz ` +
    `(kerak bo'lsa kundalik.md tepasiga qisqa yozuv ham). Saqlashga arziydigan narsa bo'lmasa, hech narsa yozma. ` +
    `Bu eslatma haqida foydalanuvchiga gapirma.`;
}
/** The last part of a transcript (at most 3 MB from the end), as lines. */
function tailLines(file) {
  const st = fs.statSync(file);
  const from = Math.max(0, st.size - 3 * 1024 * 1024);
  const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(st.size - from);
  fs.readSync(fd, buf, 0, buf.length, from); fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n');
  if (from > 0) lines.shift(); // a cut line
  return lines.filter(Boolean);
}

/** Claude Code's settings for this folder that make it MOOPI's: the memory folder, auto-dream and the Stop hook,
 *  merged into .claude/settings.local.json (the person's own entries there — permissions they allowed — stay).
 *  autoMemoryDirectory is honoured from the local settings, not from the checked-in settings.json. */
function localSettings(current, hookUrl, token) {
  const out = { ...(current || {}) };
  out.autoMemoryEnabled = true;
  out.autoMemoryDirectory = '~/MOOPI/' + DIR_NAME;
  out.autoDreamEnabled = true;
  const hooks = { ...(out.hooks || {}) };
  const ours = (h) => h && h.type === 'http' && /^http:\/\/127\.0\.0\.1:\d+\/stop$/.test(h.url || '') && h.headers && 'X-Moopi-Hook' in h.headers;
  const others = (hooks.Stop || []).map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !ours(h)) })).filter((g) => g.hooks.length);
  hooks.Stop = [...others, { hooks: [{ type: 'http', url: hookUrl, headers: { 'X-Moopi-Hook': token }, timeout: 10 }] }];
  out.hooks = hooks;
  return out;
}

/** The folder sync for one signed-in account. */
class MemorySync {
  constructor({ root, api, store, log }) {
    this.root = root; this.api = api; this.store = store; this.log = log || (() => {});
    this.running = null; this.again = false; this.failedPaths = new Set();
  }
  state() { return this.store.get() || { user: null, files: {} }; }
  async save(s) { await this.store.set(s); }
  /** A different account than the folder's: its copy is moved aside (kept, never deleted) and the new one starts fresh. */
  async forAccount(userId) {
    const s = this.state();
    if (s.user === userId) return s;
    if (s.user !== null && fs.existsSync(this.root) && Object.keys(readLocal(this.root)).length) {
      const aside = `${this.root}-${s.user}-${new Date().toISOString().slice(0, 10)}`;
      try { fs.renameSync(this.root, fs.existsSync(aside) ? aside + '-' + Date.now() : aside); } catch (e) { this.log('memory: could not move the old folder aside', e); }
    }
    const fresh = { user: userId, files: {} };
    await this.save(fresh);
    return fresh;
  }
  /** One sync; a call while one runs makes it run once more after. */
  sync() {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      try {
        do { this.again = false; await this.once(); } while (this.again);
      } finally { this.running = null; }
    })();
    return this.running;
  }
  async once() {
    if (!this.api.token || !this.api.me) return;
    const s = await this.forAccount(this.api.me.id);
    fs.mkdirSync(this.root, { recursive: true });
    const listed = await this.api.get('/memory');
    const remote = {};
    for (const f of listed || []) { const rel = relOf(f.path); if (rel) remote[rel] = { at: String(f.updated_at) }; }
    let local = readLocal(this.root);
    let changedLocal = false;
    for (const op of plan(local, remote, s.files)) {
      try {
        if (await this.apply(op, local, remote, s)) changedLocal = true;
      } catch (e) {
        if (!this.failedPaths.has(op.rel + op.op)) { this.failedPaths.add(op.rel + op.op); this.log(`memory ${op.op} ${op.rel}`, e); }
      }
    }
    await this.save(s);
    // The index names every file; a line it gained goes up on the next sync (the folder watcher sees it).
    if (changedLocal) local = readLocal(this.root);
    const index = path.join(this.root, INDEX);
    const next = indexText(local[INDEX] ? local[INDEX].text : null, local);
    if (next !== null) { fs.writeFileSync(index, next); this.again = true; }
  }
  async apply(op, local, remote, s) {
    const { rel } = op;
    const file = localOf(this.root, rel);
    if (op.op === 'pull') {
      const r = await this.api.get('/memory/file?path=' + encodeURIComponent(remoteOf(rel)));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, r.content);
      s.files[rel] = { hash: hash(r.content), at: remote[rel].at };
      return true;
    }
    if (op.op === 'push') {
      const text = local[rel].text;
      if (text.length > MAX_CHARS) throw new Error('too big for MOOPI memory (' + text.length + ' characters)');
      if (op.conflict) this.log(`memory: ${rel} changed here and in MOOPI; this copy kept, MOOPI's is in its history`);
      await this.api.request('PUT', '/memory/file?source=desktop', { path: remoteOf(rel), content: text });
      const after = (await this.api.get('/memory')) || [];
      const row = after.find((f) => f.path === remoteOf(rel));
      s.files[rel] = { hash: hash(text), at: row ? String(row.updated_at) : '' };
      if (row) remote[rel] = { at: String(row.updated_at) };
      return false;
    }
    if (op.op === 'deleteLocal') { fs.rmSync(file, { force: true }); delete s.files[rel]; return true; }
    if (op.op === 'deleteRemote') {
      try {
        await this.api.request('DELETE', '/memory/file?source=desktop&path=' + encodeURIComponent(remoteOf(rel)));
        delete s.files[rel];
      } catch (e) {
        // MOOPI keeps it (its fixed files: README, the profile, saboqlar): back into the folder.
        const r = await this.api.get('/memory/file?path=' + encodeURIComponent(remoteOf(rel)));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, r.content);
        s.files[rel] = { hash: hash(r.content), at: remote[rel].at };
        return true;
      }
      return false;
    }
    if (op.op === 'forget') { delete s.files[rel]; return false; }
    return false;
  }
}

/** The Stop hook's server on 127.0.0.1: Claude Code posts the hook's input (the session's transcript path)
 *  and gets back, at most once per few messages, a request to save what matters. A post without the token
 *  is refused; the transcript is read only from Claude Code's own folder. */
function startHookServer({ token, memoryDir, port, isOn, log }) {
  const projects = path.join(os.homedir(), '.claude', 'projects');
  const handle = (req, res) => {
    const send = (code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }); res.end(b); };
    if (req.method !== 'POST' || req.url !== '/stop') return send(404, {});
    if (req.headers['x-moopi-hook'] !== token) return send(403, {});
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const input = JSON.parse(body || '{}');
        if (input.stop_hook_active || !isOn()) return send(200, {});
        const file = path.resolve(String(input.transcript_path || ''));
        if (!file.endsWith('.jsonl') || !file.startsWith(path.resolve(projects) + path.sep)) return send(200, {});
        const n = messagesSinceMemory(tailLines(file), memoryDir);
        if (n < NUDGE_AFTER) return send(200, {});
        return send(200, { decision: 'block', reason: nudgeText(n) });
      } catch (e) { log('memory hook', e); return send(200, {}); }
    });
  };
  return new Promise((resolve) => {
    const tryPort = (i) => {
      const candidates = [port, ...PORTS.filter((p) => p !== port)].filter(Boolean);
      if (i >= candidates.length) { resolve(null); return; }
      const server = http.createServer(handle);
      server.once('error', () => tryPort(i + 1));
      server.listen(candidates[i], '127.0.0.1', () => resolve({ server, port: candidates[i] }));
    };
    tryPort(0);
  });
}

/** The routine's time: the person's local briefing time as a UTC cron line (Uzbekistan keeps one offset). */
function cronFor(hhmm, timeZone, now = new Date()) {
  const [h, m] = String(hhmm || '07:00').split(':').map((x) => parseInt(x, 10));
  let offsetMinutes = 0;
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    offsetMinutes = Math.round((asUtc - Math.floor(now.getTime() / 60000) * 60000) / 60000);
  } catch (e) { offsetMinutes = 300; }
  const total = (((h || 0) * 60 + (m || 0) - offsetMinutes) % 1440 + 1440) % 1440;
  return `${total % 60} ${Math.floor(total / 60)} * * *`;
}

module.exports = { DIR_NAME, MARK, NUDGE_AFTER, INDEX, hash, relOf, safeRel, plan, readLocal, indexText, titleOf, isMemoryWrite,
  isPersonsMessage, messagesSinceMemory, nudgeText, localSettings, MemorySync, startHookServer, cronFor, tailLines };
