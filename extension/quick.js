// Quick actions: one-tap jobs — "Kunlik hisobot", "Haftalik xulosa", "Qarzdorlar ro'yxati" — each a name and an
// instruction the owner can change or add to. A tap types the instruction into Claude's own panel (the person
// sees it run there, on their own sign-in); the result lands in tayyor/ by MOOPI's rule and opens by itself.
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WORKSPACE_DIR = path.join(os.homedir(), 'MOOPI');
const DEFAULTS = {
  uz: [
    { id: 'daily', title: 'Kunlik hisobot', prompt: "Bugungi kun bo'yicha qisqa hisobot tayyorla: savdo, xarajat, qarzlar, bajarilgan va qolgan ishlar — MOOPI daftarlari, vazifalar va xotira asosida (MOOPI vositalari). Natijani tayyor/kunlik-hisobot-<sana>.docx qilib saqla (python-docx, kerak bo'lsa pip install; python bo'lmasa .md). Bir sahifa, sodda til. Oxirida 2 jumla bilan nima qilganingni ayt." },
    { id: 'weekly', title: 'Haftalik xulosa', prompt: "Shu hafta bo'yicha xulosa tayyorla: savdo va xarajat dinamikasi, qarzlar, bajarilgan ishlar, keyingi haftaga 3 ta tavsiya — MOOPI daftarlari, vazifalar, suhbatlar va xotira asosida. tayyor/haftalik-xulosa-<sana>.docx (python-docx; python bo'lmasa .md). Oxirida 2 jumla bilan nima qilganingni ayt." },
    { id: 'debts', title: "Qarzdorlar ro'yxati", prompt: "MOOPI daftarlari va xotirasidan qarzdorlar ro'yxatini tuz: kim, qancha, qachondan, oxirgi to'lov. tayyor/qarzdorlar-<sana>.xlsx (openpyxl; python bo'lmasa .csv), jami summa bilan. Oxirida 2 jumla bilan nima qilganingni ayt." },
  ],
  ru: [
    { id: 'daily', title: 'Отчёт за день', prompt: 'Подготовь короткий отчёт за сегодня: продажи, расходы, долги, сделанные и оставшиеся задачи — по тетрадям, задачам и памяти MOOPI (инструменты MOOPI). Сохрани в tayyor/kunlik-hisobot-<дата>.docx (python-docx, при необходимости pip install; без python — .md). Одна страница, простой язык. В конце в двух предложениях скажи, что сделал.' },
    { id: 'weekly', title: 'Итоги недели', prompt: 'Подготовь итоги недели: динамика продаж и расходов, долги, сделанное, 3 рекомендации на следующую неделю — по тетрадям, задачам, разговорам и памяти MOOPI. tayyor/haftalik-xulosa-<дата>.docx (python-docx; без python — .md). В конце в двух предложениях скажи, что сделал.' },
    { id: 'debts', title: 'Список должников', prompt: 'Составь из тетрадей и памяти MOOPI список должников: кто, сколько, с какого числа, последний платёж. tayyor/qarzdorlar-<дата>.xlsx (openpyxl; без python — .csv), с общей суммой. В конце в двух предложениях скажи, что сделал.' },
  ],
};
function list(context, lang) {
  const own = context.globalState.get('moopi.quickActions');
  return Array.isArray(own) && own.length ? own : DEFAULTS[lang === 'ru' ? 'ru' : 'uz'];
}
async function save(context, lang, actions) { await context.globalState.update('moopi.quickActions', actions); }
async function addAction(context, lang, title, prompt) {
  const actions = list(context, lang).slice();
  actions.push({ id: 'q' + Date.now().toString(36), title: String(title).slice(0, 60), prompt: String(prompt).slice(0, 4000) });
  await save(context, lang, actions);
}
async function removeAction(context, lang, id) { await save(context, lang, list(context, lang).filter((a) => a.id !== id)); }
function snapshot(dir) { const out = new Map(); try { for (const n of fs.readdirSync(dir)) { try { out.set(n, fs.statSync(path.join(dir, n)).mtimeMs); } catch (e) {} } } catch (e) {} return out; }

let opener = null;
/** Runs one action: the instruction goes into Claude's panel; for six minutes, a new file in tayyor/ opens by itself. */
async function run(context, ctx, id) {
  const lang = (ctx.api.me && ctx.api.me.language) === 'ru' ? 'ru' : 'uz';
  const action = list(context, lang).find((a) => a.id === id);
  if (!action) return;
  const out = path.join(WORKSPACE_DIR, 'tayyor');
  fs.mkdirSync(out, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  ctx.onReport('quick', '⚡ ' + action.title, null, false, true);
  const ok = await ctx.typeToPanel(action.prompt.replace(/<sana>|<дата>/g, today));
  if (!ok) return;
  vscode.window.setStatusBarMessage(ctx.t('quick_sent'), 8000);
  const before = snapshot(out), started = Date.now(), opened = new Set();
  clearInterval(opener);
  opener = setInterval(() => {
    if (Date.now() - started > 6 * 60000) { clearInterval(opener); return; }
    for (const [n, m] of snapshot(out)) {
      if ((before.has(n) && before.get(n) === m) || opened.has(n) || n.startsWith('.') || n.startsWith('~$')) continue;
      opened.add(n);
      setTimeout(() => { vscode.env.openExternal(vscode.Uri.file(path.join(out, n))).then(() => {}, () => {}); }, 2000);
      vscode.window.showInformationMessage(ctx.t('quick_done').replace('{f}', n));
    }
  }, 5000);
}
module.exports = { list, addAction, removeAction, run, DEFAULTS };
