// The morning briefing of a person on a Claude subscription, inside it (0.9.6; owner, 07.11.2026: "agar Claude
// ulanmagan bulsa brifingni desktopni uzi qilsin. agar ulangan bulsa har ertalab offline bulsa ham qilsin").
// - claude.ai has MOOPI connected (the account's claude_web_at): a routine there writes it every morning, the
//   computer on or off. Desktop starts its setting-up once by itself (/ertalabki-brifing in Claude's panel;
//   Claude asks the person before it creates anything).
// - Not connected — or the routine's briefing hasn't come 30 minutes after the time: Desktop's Claude writes it
//   in its panel (/ertalabki-brifing-yoz), while the person is at the window, before 13:00 as the server does.
// - Not connected: once a week at most, Desktop offers to connect claude.ai in one click (connector's
//   /connector/desktop-link → claude.ai's Add-connector dialog prefilled → "Continue", no password).
// Typing into Claude's panel happens only while MOOPI Desktop's window is in front and Claude is not answering,
// so the keys never land in another program.
const LATEST_MINUTE = 13 * 60; // the server's LATEST_HOUR: a briefing after it waits for tomorrow
const ROUTINE_GRACE = 30; // minutes the routine has before Desktop writes the briefing itself
const OFFER_EVERY = 7 * 86400000;

function onSubscription(me) { return !!me && me.billing === 'own' && !me.claude_key_end; }

/** The local date and minute of the day in [timeZone]. */
function localNow(timeZone, now = new Date()) {
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now).map((p) => [p.type, p.value]));
  } catch (e) { return localNow('Asia/Tashkent', now); }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: +parts.hour * 60 + +parts.minute };
}
function minutesOf(hhmm) { const [h, m] = String(hhmm || '07:00').split(':').map((x) => parseInt(x, 10)); return (h || 0) * 60 + (m || 0); }

/** What to do now: 'setupRoutine', 'write', 'offerConnect' or null. [today] is GET /today; [state] what this
 *  installation did already ({routineSetupFor, wroteOn, offeredAt}). */
function decide({ me, today, state, now = new Date() }) {
  if (!onSubscription(me) || me.briefing_enabled === false) return null;
  const web = !!me.claude_web_at;
  if (web && state.routineSetupFor !== me.id) return 'setupRoutine';
  const { date, minute } = localNow(me.timezone || 'Asia/Tashkent', now);
  const has = !!(today && today.briefing && today.briefing.is_today);
  if (!has && state.wroteOn !== date && minute >= minutesOf(me.briefing_time) + (web ? ROUTINE_GRACE : 0) && minute < LATEST_MINUTE) return 'write';
  if (!web && (!state.offeredAt || now.getTime() - state.offeredAt > OFFER_EVERY)) return 'offerConnect';
  return null;
}

module.exports = { onSubscription, localNow, minutesOf, decide, ROUTINE_GRACE };
