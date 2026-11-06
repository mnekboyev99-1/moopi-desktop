// Watched folders: the folders where 1C or Excel drop their reports. A new or changed file there is copied into
// MOOPI's own folder (fayllar/kuzatuv — so MOOPI on the server and the phone see it too) and the person is asked
// whether MOOPI should read it; a yes types the instruction into Claude's own panel, which reads the file and says
// what matters, writing the important part into the notebooks and the memory.
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WORKSPACE_DIR = path.join(os.homedir(), 'MOOPI');
const KINDS = /\.(xlsx|xlsm|xls|csv|tsv|pdf|docx|doc|txt|json|xml|md)$/i;
const MAX = 25 * 1024 * 1024;
const state = { watchers: new Map(), seen: new Map(), timers: new Map(), poll: null };

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
function start(context, ctx) {
  for (const dir of folders(context)) {
    if (state.watchers.has(dir)) continue;
    try {
      const w = fs.watch(dir, { persistent: false }, (ev, name) => { if (name) noticed(context, ctx, path.join(dir, name)); });
      w.on('error', () => {});
      state.watchers.set(dir, w);
      try { for (const name of fs.readdirSync(dir)) remember(path.join(dir, name)); } catch (e) {}
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
    if (now.mtimeMs !== st.mtimeMs) { noticed(context, ctx, file); return; }
    state.seen.set(file, now.mtimeMs);
    arrived(context, ctx, file).catch((e) => ctx.reportError('watch', e));
  }, 5000));
}
const PROMPT = {
  uz: (rel, src) => `Kuzatuvchi papkaga yangi fayl tushdi: ${rel} (manbasi: ${src}). Uni o'qi — jadval bo'lsa python (pandas yoki openpyxl, kerak bo'lsa pip install) bilan. Biznes egasi uchun 3–6 jumlada ayt: bu nima, muhim raqamlar (savdo, xarajat, qarz, qoldiq), nima o'zgargan yoki e'tibor berish kerak. Muhim raqam yoki fakt bo'lsa, MOOPI daftariga yoki xotirasiga ham yoz (MOOPI vositalari).`,
  ru: (rel, src) => `В отслеживаемую папку пришёл новый файл: ${rel} (источник: ${src}). Прочитай его — таблицу через python (pandas или openpyxl, при необходимости pip install). Скажи владельцу бизнеса в 3–6 предложениях: что это, важные цифры (продажи, расходы, долги, остатки), что изменилось или на что обратить внимание. Важные цифры или факты запиши также в тетрадь или память MOOPI (инструменты MOOPI).`,
};
async function arrived(context, ctx, file) {
  const name = path.basename(file);
  const dir = path.join(WORKSPACE_DIR, 'fayllar', 'kuzatuv');
  fs.mkdirSync(dir, { recursive: true });
  const copy = path.join(dir, name);
  fs.copyFileSync(file, copy); // the folder sync takes it to MOOPI as well
  ctx.osNotify('MOOPI', ctx.t('watch_ask').replace('{f}', name));
  const pick = await vscode.window.showInformationMessage(ctx.t('watch_ask').replace('{f}', name), ctx.t('watch_yes'), ctx.t('later'));
  if (pick !== ctx.t('watch_yes')) return;
  const lang = (ctx.api.me && ctx.api.me.language) === 'ru' ? 'ru' : 'uz';
  ctx.onReport('watch', '📄 ' + name, null, false, true);
  await ctx.typeToPanel(PROMPT[lang](path.relative(WORKSPACE_DIR, copy), path.dirname(file)));
}
module.exports = { folders, add, remove, start, stop };
