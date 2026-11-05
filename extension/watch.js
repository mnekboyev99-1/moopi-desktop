// Watched folders: the folders where 1C or Excel drop their reports. A new or changed file there is copied into
// MOOPI's own folder (fayllar/kuzatuv — so MOOPI on the server and the phone see it too) and read by MOOPI's
// local brain, which says in a few sentences what it is and what matters, and writes the important part into
// the notebooks and the memory. One file at a time, five seconds after it stopped changing.
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const brain = require('./brain');

const KINDS = /\.(xlsx|xlsm|xls|csv|tsv|pdf|docx|doc|txt|json|xml|md)$/i;
const MAX = 25 * 1024 * 1024;
const state = { watchers: new Map(), seen: new Map(), timers: new Map(), queue: [], running: false, poll: null };

function folders(context) { return (context.globalState.get('moopi.watchFolders') || []).filter((f) => typeof f === 'string'); }
async function add(context, ctx) {
  const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: ctx.t('watch_pick') });
  if (!picked || !picked[0]) return null;
  const dir = picked[0].fsPath;
  const list = folders(context);
  if (!list.includes(dir)) { list.push(dir); await context.globalState.update('moopi.watchFolders', list); }
  start(context, ctx);
  return dir;
}
async function remove(context, ctx, dir) {
  await context.globalState.update('moopi.watchFolders', folders(context).filter((f) => f !== dir));
  const w = state.watchers.get(dir); if (w) { try { w.close(); } catch (e) {} state.watchers.delete(dir); }
}

/** Watches every folder of the list (and looks again every minute: fs.watch misses things on some disks). */
function start(context, ctx) {
  for (const dir of folders(context)) {
    if (state.watchers.has(dir)) continue;
    try {
      const w = fs.watch(dir, { persistent: false }, (ev, name) => { if (name) noticed(context, ctx, path.join(dir, name)); });
      w.on('error', () => {});
      state.watchers.set(dir, w);
      try { for (const name of fs.readdirSync(dir)) remember(path.join(dir, name)); } catch (e) {} // what is there now is old news
    } catch (e) { ctx.noteError('watch:' + dir, e); }
  }
  if (!state.poll) state.poll = setInterval(() => sweep(context, ctx), 60000);
}
function stop() {
  for (const w of state.watchers.values()) { try { w.close(); } catch (e) {} }
  state.watchers.clear(); clearInterval(state.poll); state.poll = null;
}
function remember(file) { try { const st = fs.statSync(file); if (st.isFile()) state.seen.set(file, st.mtimeMs); } catch (e) {} }
function sweep(context, ctx) {
  for (const dir of folders(context)) {
    let names = []; try { names = fs.readdirSync(dir); } catch (e) { continue; }
    for (const name of names) noticed(context, ctx, path.join(dir, name));
  }
}
function noticed(context, ctx, file) {
  const name = path.basename(file);
  if (!KINDS.test(name) || name.startsWith('.') || name.startsWith('~$')) return;
  let st; try { st = fs.statSync(file); } catch (e) { return; }
  if (!st.isFile() || st.size === 0 || st.size > MAX) return;
  if (state.seen.get(file) === st.mtimeMs) return;
  clearTimeout(state.timers.get(file));
  state.timers.set(file, setTimeout(() => {
    state.timers.delete(file);
    let now; try { now = fs.statSync(file); } catch (e) { return; }
    if (now.mtimeMs !== st.mtimeMs) { noticed(context, ctx, file); return; } // still being written
    state.seen.set(file, now.mtimeMs);
    state.queue.push(file);
    next(context, ctx);
  }, 5000));
}

const PROMPT = {
  uz: (rel, src) => `Kuzatuvchi papkaga yangi fayl tushdi: ${rel} (manbasi: ${src}). Uni o'qi — jadval bo'lsa python (pandas yoki openpyxl, kerak bo'lsa pip install) bilan. Biznes egasi uchun 3–6 jumlada ayt: bu nima, muhim raqamlar (savdo, xarajat, qarz, qoldiq), nima o'zgargan yoki e'tibor berish kerak. Muhim raqam yoki fakt bo'lsa, MOOPI daftariga yoki xotirasiga ham yoz (MOOPI vositalari). Faqat xulosani qaytar, ro'yxat va markdown belgilarisiz.`,
  ru: (rel, src) => `В отслеживаемую папку пришёл новый файл: ${rel} (источник: ${src}). Прочитай его — таблицу через python (pandas или openpyxl, при необходимости pip install). Скажи владельцу бизнеса в 3–6 предложениях: что это, важные цифры (продажи, расходы, долги, остатки), что изменилось или на что обратить внимание. Важные цифры или факты запиши также в тетрадь или память MOOPI (инструменты MOOPI). Верни только вывод, без списков и разметки.`,
};
async function next(context, ctx) {
  if (state.running || !state.queue.length) return;
  if (!ctx.api.token || !brain.binary()) return;
  if (brain.busy()) { setTimeout(() => next(context, ctx), 15000); return; }
  state.running = true;
  const file = state.queue.shift();
  const name = path.basename(file);
  try {
    const dir = path.join(brain.WORKSPACE_DIR, 'fayllar', 'kuzatuv');
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, name);
    fs.copyFileSync(file, copy); // the folder sync takes it to MOOPI as well
    const lang = (ctx.api.me && ctx.api.me.language) === 'ru' ? 'ru' : 'uz';
    vscode.window.setStatusBarMessage(ctx.t('watch_reading').replace('{f}', name), 8000);
    ctx.onReport('watch', ctx.t('watch_reading').replace('{f}', name), null);
    const r = await brain.ask({ prompt: PROMPT[lang](path.relative(brain.WORKSPACE_DIR, copy), path.dirname(file)), maxTurns: 16, timeoutMs: 360000,
      onTool: (n) => ctx.onReport('watch', null, n) });
    const text = (r.text || '').trim();
    if (text) ctx.onReport('watch', `${name}: ${text}`, null, true);
  } catch (e) { ctx.reportError('watch:read', e); ctx.onReport('watch', ctx.t('watch_failed').replace('{f}', name), null); }
  finally { state.running = false; setTimeout(() => next(context, ctx), 1000); }
}

module.exports = { folders, add, remove, start, stop };
