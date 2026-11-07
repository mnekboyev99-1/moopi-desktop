// MOOPI's tools for Desktop's Claude without a sign-in page (0.9.6; owner, 07.11.2026: "iloji boricha avtomatik
// ulattirish kerak"). On 07.11 user 5's Claude had never signed in to MOOPI's connector (it asks for an email and
// password, and a Telegram sign-up has no password), so it worked without MOOPI's memory, files or Telegram.
// Now Claude Code's MCP server "moopi" is http://127.0.0.1:<port>/mcp (with this installation's token, in
// ~/MOOPI/.mcp.json); the extension forwards each request to the connector (mcp.moopi.uz/mcp) with tokens it gets
// for Desktop's own MOOPI sign-in (POST /connector/sandbox-token {"client": "desktop"}), renews them before they
// run out and once more when the connector says 401. Streams (server-sent events) pass through as they come.
const http = require('http');
const https = require('https');

const RENEW_BEFORE = 60 * 60 * 1000; // renew an access token an hour before it ends
const PASS_UP = ['content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id'];
const PASS_DOWN = ['content-type', 'mcp-session-id', 'cache-control', 'mcp-protocol-version', 'www-authenticate'];

function subjectOf(jwt) {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')).sub || null; } catch (e) { return null; }
}

/** The connector tokens of Desktop's Claude: kept in the editor's secret storage, for the signed-in account only. */
class Tokens {
  constructor({ connectorUrl, appToken, userId, store, post }) {
    this.connectorUrl = connectorUrl.replace(/\/$/, ''); this.appToken = appToken; this.userId = userId;
    this.store = store; this.post = post || postJson; this.pending = null;
  }
  async current() {
    const kept = await this.store.get();
    if (kept && kept.access && String(subjectOf(kept.access)) === String(this.userId()) && kept.expiresAt - Date.now() > RENEW_BEFORE) return kept.access;
    return this.renew(kept);
  }
  /** New tokens: from the refresh token when there is one for this account, else from Desktop's own sign-in. */
  renew(kept) {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        let got = null;
        if (kept && kept.refresh && String(subjectOf(kept.refresh)) === String(this.userId())) {
          got = await this.post(this.connectorUrl + '/connector/sandbox-token', { refresh_token: kept.refresh }, null).catch(() => null);
        }
        const app = this.appToken();
        if (!got && app) got = await this.post(this.connectorUrl + '/connector/sandbox-token', { client: 'desktop' }, app);
        if (!got || !got.access_token) { await this.store.set(null); return null; }
        await this.store.set({ access: got.access_token, refresh: got.refresh_token, expiresAt: Date.now() + (got.expires_in || 3600) * 1000 });
        return got.access_token;
      } finally { this.pending = null; }
    })();
    return this.pending;
  }
  async forget() { const kept = await this.store.get(); if (kept) await this.store.set({ ...kept, access: null, expiresAt: 0 }); }
}

function postJson(url, body, bearer) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(JSON.stringify(body));
    const req = (u.protocol === 'https:' ? https : http).request(u, { method: 'POST', timeout: 20000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (c) => { text += c; });
      res.on('end', () => { if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(text)); } catch (e) { reject(e); } } else reject(new Error('HTTP ' + res.statusCode)); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(data);
  });
}

/** One request from Claude Code, forwarded to the connector's /mcp; on a 401, tokens are renewed and it goes once more. */
function forward(req, res, { mcpUrl, tokens, log }) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const body = Buffer.concat(chunks);
    const target = new URL(mcpUrl);
    const lib = target.protocol === 'https:' ? https : http;
    const fail = (code, message) => {
      if (res.headersSent) { try { res.end(); } catch (e) {} return; }
      const b = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } });
      res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }); res.end(b);
    };
    const send = async (again) => {
      const access = await tokens.current().catch(() => null);
      if (!access) return fail(503, "MOOPI Desktop'ga MOOPI akkaunti bilan kiring — keyin Claude MOOPI vositalarini ko'radi.");
      const headers = { Authorization: 'Bearer ' + access, Host: target.host };
      for (const h of PASS_UP) if (req.headers[h]) headers[h] = req.headers[h];
      if (body.length) headers['Content-Length'] = body.length;
      const up = lib.request(target, { method: req.method, headers }, (upRes) => {
        if (upRes.statusCode === 401 && !again) { upRes.resume(); tokens.forget().then(() => send(true)); return; }
        const down = {};
        for (const h of PASS_DOWN) if (upRes.headers[h]) down[h] = upRes.headers[h];
        if (upRes.statusCode === 401) { upRes.resume(); return fail(503, "MOOPI'ga ulanib bo'lmadi — MOOPI Desktop'da qayta kiring."); }
        res.writeHead(upRes.statusCode, down);
        upRes.pipe(res);
      });
      res.on('close', () => up.destroy());
      up.on('error', (e) => { log('bridge', e); fail(502, "MOOPI serveriga ulanib bo'lmadi — internetni tekshiring."); });
      up.end(body);
    };
    send(false).catch((e) => { log('bridge', e); fail(502, "MOOPI serveriga ulanib bo'lmadi."); });
  });
}

/** Claude Code's .mcp.json for ~/MOOPI with the server "moopi" on the bridge; the person's other servers stay. */
function mcpConfig(current, url, token) {
  const out = { ...(current || {}) };
  out.mcpServers = { ...(out.mcpServers || {}), moopi: { type: 'http', url, headers: { 'X-Moopi-Hook': token } } };
  return out;
}

module.exports = { Tokens, forward, mcpConfig, subjectOf, postJson };
