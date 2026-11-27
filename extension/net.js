// MOOPI Desktop and a lost connection (0.9.10).
//
// 18–22.11.2026, a Windows laptop: every time it woke from sleep or the Wi-Fi dropped, the timers that had
// been waiting (memory sync, the morning check, the watched folders, the ping) all fired in the same second,
// before the network was back. Each failed with "fetch failed" and each was sent to MOOPI as an error — the
// owner got "Yangi xato" notices for a computer that was simply offline, and the log report that was meant
// to explain them failed to send for the same reason and was lost. The work itself was never in danger: each
// of those runs again within a minute.
//
// So a lost connection is not an error here: it is noted in this window's own list (it goes with the next
// report), nothing is sent for it, and a report that could not go is kept until the connection is back.

/** What the system says when the connection itself is gone, slow or cut — not when a server answered. */
const AWAY = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENETUNREACH',
  'ENETDOWN', 'EHOSTUNREACH', 'EHOSTDOWN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT']);
/** A certificate that is refused is somebody's fault (ours, or a filter between) and must be heard about. */
const CERTIFICATE = /^(CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|ERR_TLS_|ERR_SSL_)/;
const AWAY_WORDS = /socket hang up|getaddrinfo |network is unreachable|\b(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH)\b|net::ERR_(INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE|NAME_NOT_RESOLVED|NETWORK_CHANGED|CONNECTION_(RESET|CLOSED|TIMED_OUT|REFUSED))/i;

/** The error and what caused it, outermost first (fetch wraps the real reason in `cause`). */
function chain(e) {
  const out = [];
  for (let x = e; x && typeof x === 'object' && out.length < 5; x = x.cause) out.push(x);
  return out;
}

/** Is this failure the computer's connection — nothing of ours to fix, and it will pass by itself? */
function offline(e) {
  if (!e) return false;
  const links = typeof e === 'object' ? chain(e) : [];
  const codes = links.map((x) => String(x.code || '')).filter(Boolean);
  if (codes.some((c) => CERTIFICATE.test(c))) return false;
  if (codes.some((c) => AWAY.has(c))) return true;
  const said = links.length ? links.map((x) => String(x.message || '')).join(' | ') : String(e);
  if (AWAY_WORDS.test(said)) return true;
  // fetch's own "fetch failed" with no reason given: the request never left. With a reason we did not
  // recognise above (not a certificate, not a network code) it is something new and worth hearing about.
  const bare = links.length ? String(links[0].message || '') : String(e);
  return /^(TypeError: )?fetch failed$/.test(bare.trim()) && codes.length === 0;
}

/** Is this the window itself going away (closed or reloaded) while something still waited — a notice nobody
 *  had answered, a call to a part of the editor that is already gone? The editor cancels what is pending and
 *  says "Canceled" or "Channel has been closed". Nothing of ours to fix: seen 14–27.11.2026 at every closing
 *  of one person's window, each sent to the owner as a new error (0.9.12). */
function closing(e) {
  if (!e) return false;
  const said = String((typeof e === 'object' && e.message) || e).trim();
  return (typeof e === 'object' && e.name === 'Canceled') || /^(Error: )?Cancell?ed$/.test(said) || /Channel has been closed/.test(said);
}

/** The message with its real reason: "fetch failed (ENOTFOUND mcp.moopi.uz)". */
function describe(e) {
  const message = String((e && e.message) || e);
  const cause = e && typeof e === 'object' ? chain(e).slice(1).find((x) => x.code || x.message) : null;
  if (!cause) return message;
  const why = [cause.code, cause.hostname || (cause.code ? '' : cause.message)].filter(Boolean).join(' ');
  return why && !message.includes(why) ? `${message} (${why})` : message;
}

/** One thing to send that may have to wait for the connection: the latest one (a log report carries the
 *  earlier lines too). `send(item)` posts it and throws on failure; `save(item | null)` keeps it across a
 *  restart (the laptop's lid may close before the connection is back).
 *  - send(item): 'sent', or 'held' when the connection is away; any other failure is thrown.
 *  - flush(): true when the held one went; false when nothing waits or the connection is still away.
 *  - take(item): start with one that was saved by an earlier run. */
function holder(send, save = () => {}) {
  let held = null, busy = false;
  const keep = (item) => { held = item; try { save(item); } catch (e) { /* keeping it is a courtesy */ } };
  return {
    get waiting() { return held !== null; },
    take(item) { if (item) held = item; },
    async send(item) {
      try { await send(item); return 'sent'; } catch (e) {
        if (!offline(e)) throw e;
        keep(item);
        return 'held';
      }
    },
    async flush() {
      if (held === null || busy) return false;
      busy = true;
      const item = held;
      try {
        await send(item);
        if (held === item) keep(null);
        return true;
      } catch (e) {
        if (offline(e)) return false;
        if (held === item) keep(null); // refused for good (signed out, too big): waiting longer won't send it
        throw e;
      } finally { busy = false; }
    },
  };
}

module.exports = { offline, closing, describe, holder };
