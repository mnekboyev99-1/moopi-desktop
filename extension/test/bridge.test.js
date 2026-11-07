// node --test extension/test/bridge.test.js — Desktop's Claude reaches MOOPI's tools through the bridge, with
// Desktop's own sign-in; the morning briefing's choices.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const bridge = require('../bridge');
const memory = require('../memory');
const morning = require('../morning');

const jwt = (sub, n) => 'h.' + Buffer.from(JSON.stringify({ sub: String(sub), n })).toString('base64url') + '.s';

/** The connector, in miniature: tokens for the app token or a refresh token, /mcp for a valid access token. */
function fakeConnector() {
  const seen = { exchanges: [], mcp: [] };
  let n = 0; let valid = new Set();
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url === '/connector/sandbox-token') {
        const j = JSON.parse(body || '{}');
        seen.exchanges.push(req.headers.authorization ? 'app:' + j.client : 'refresh');
        if (req.headers.authorization !== 'Bearer app-token' && !String(j.refresh_token || '').startsWith('h.')) { res.writeHead(401); return res.end('{}'); }
        const access = jwt(5, ++n); valid.add(access);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ access_token: access, refresh_token: jwt(5, 'r' + n), expires_in: 86400 }));
      }
      if (req.url === '/mcp') {
        const token = String(req.headers.authorization || '').replace('Bearer ', '');
        seen.mcp.push({ method: req.method, session: req.headers['mcp-session-id'] || null });
        if (!valid.has(token)) { res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }); return res.end(); }
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'S1' });
          res.write('event: message\ndata: {"one":1}\n\n');
          setTimeout(() => { res.write('event: message\ndata: {"two":2}\n\n'); res.end(); }, 50);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'S1' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(body).id, result: { echoed: JSON.parse(body).method } }));
      }
      res.writeHead(404); res.end();
    });
  });
  return { server, seen, expireAll: () => { valid = new Set(); } };
}

test("Claude reaches MOOPI's tools with Desktop's own sign-in; a 401 renews the tokens once; streams pass through", async () => {
  const up = fakeConnector();
  await new Promise((r) => up.server.listen(0, '127.0.0.1', r));
  const connectorUrl = `http://127.0.0.1:${up.server.address().port}`;
  let kept = null;
  let appToken = 'app-token';
  const tokens = new bridge.Tokens({ connectorUrl, appToken: () => appToken, userId: () => 5,
    store: { get: async () => kept, set: async (v) => { kept = v; } } });
  const local = await memory.startHookServer({ token: 'tok', memoryDir: '/x', port: 47890, isOn: () => true, log: () => {},
    mcp: (req, res) => bridge.forward(req, res, { mcpUrl: connectorUrl + '/mcp', tokens, log: () => {} }) });
  const url = `http://127.0.0.1:${local.port}/mcp`;
  const call = (method, headers = {}) => fetch(url, { method: 'POST', headers: { 'X-Moopi-Hook': 'tok', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }) });

  let r = await call('tools/list');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual((await r.json()).result, { echoed: 'tools/list' });
  assert.strictEqual(r.headers.get('mcp-session-id'), 'S1');
  assert.deepStrictEqual(up.seen.exchanges, ['app:desktop']);
  await call('ping');
  assert.strictEqual(up.seen.exchanges.length, 1, 'the token is kept, not asked for every call');

  up.expireAll(); // the connector refuses the token (a password change, a restart with another key…)
  r = await call('tools/call', { 'Mcp-Session-Id': 'S1' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(up.seen.exchanges, ['app:desktop', 'refresh']);
  assert.strictEqual(up.seen.mcp.at(-1).session, 'S1');

  const stream = await fetch(url, { headers: { 'X-Moopi-Hook': 'tok', Accept: 'text/event-stream' } });
  assert.strictEqual(stream.headers.get('content-type'), 'text/event-stream');
  const text = await stream.text();
  assert.ok(text.includes('{"one":1}') && text.includes('{"two":2}'));

  assert.strictEqual((await fetch(url, { method: 'POST', headers: { 'X-Moopi-Hook': 'wrong' }, body: '{}' })).status, 403);
  // signed out of Desktop: no tokens, a plain answer instead of a sign-in page
  kept = null; appToken = null; up.expireAll();
  r = await call('tools/list');
  assert.strictEqual(r.status, 503);
  assert.match((await r.json()).error.message, /MOOPI Desktop'ga/);
  // tokens of another account are never used
  kept = { access: jwt(9, 1), refresh: jwt(9, 2), expiresAt: Date.now() + 86400000 };
  appToken = 'app-token';
  await call('ping');
  assert.strictEqual(String(bridge.subjectOf(kept.access)), '5');
  local.server.close(); up.server.close();
});

test(".mcp.json points Claude Code's moopi server at the bridge and keeps the person's other servers", () => {
  const c = bridge.mcpConfig({ mcpServers: { moopi: { type: 'http', url: 'https://mcp.moopi.uz/mcp' }, other: { command: 'x' } } }, 'http://127.0.0.1:47821/mcp', 'tok');
  assert.deepStrictEqual(c.mcpServers.moopi, { type: 'http', url: 'http://127.0.0.1:47821/mcp', headers: { 'X-Moopi-Hook': 'tok' } });
  assert.deepStrictEqual(c.mcpServers.other, { command: 'x' });
});

test("the morning: the routine once claude.ai is connected, Desktop writes when it isn't or the routine is late", () => {
  const me = { id: 5, billing: 'own', claude_key_end: '', briefing_time: '07:00', timezone: 'Asia/Tashkent', briefing_enabled: true, claude_web_at: null };
  const at = (hhmm) => new Date(`2026-11-08T${hhmm}:00+05:00`);
  const none = { briefing: null };
  assert.strictEqual(morning.decide({ me, today: none, state: { offeredAt: Date.now() }, now: at('06:50') }), null);
  assert.strictEqual(morning.decide({ me, today: none, state: { offeredAt: Date.now() }, now: at('07:05') }), 'write');
  assert.strictEqual(morning.decide({ me, today: none, state: { offeredAt: Date.now(), wroteOn: '2026-11-08' }, now: at('07:05') }), null);
  assert.strictEqual(morning.decide({ me, today: none, state: { offeredAt: Date.now() }, now: at('13:10') }), null, 'after 13:00 it waits for tomorrow');
  assert.strictEqual(morning.decide({ me, today: { briefing: { is_today: true } }, state: { offeredAt: Date.now() }, now: at('08:00') }), null);
  assert.strictEqual(morning.decide({ me, today: none, state: {}, now: at('06:00') }), 'offerConnect');
  const web = { ...me, claude_web_at: '2026-11-07T20:00:00' };
  assert.strictEqual(morning.ROUTINES_OPEN, false, 'routines reach MOOPI only once it is in Anthropic\'s directory');
  assert.strictEqual(morning.decide({ me: web, today: none, state: {}, now: at('06:00') }), null, 'claude.ai connected: no offer, no routine yet');
  assert.strictEqual(morning.decide({ me: web, today: none, state: {}, now: at('07:05') }), 'write', 'Desktop writes it, no waiting for a routine');
  const open = { routinesOpen: true };
  assert.strictEqual(morning.decide({ me: web, today: none, state: {}, now: at('06:00'), ...open }), 'setupRoutine');
  assert.strictEqual(morning.decide({ me: web, today: none, state: { routineSetupFor: 5 }, now: at('07:10'), ...open }), null, 'the routine has 30 minutes');
  assert.strictEqual(morning.decide({ me: web, today: none, state: { routineSetupFor: 5 }, now: at('07:31'), ...open }), 'write');
  assert.strictEqual(morning.decide({ me: { ...me, claude_key_end: 'abcd' }, today: none, state: {}, now: at('08:00') }), null, 'a key: the server writes it');
  assert.strictEqual(morning.decide({ me: { ...me, briefing_enabled: false }, today: none, state: {}, now: at('08:00') }), null);
});
