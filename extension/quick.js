// Quick actions: one-tap jobs for MOOPI's local brain — "Kunlik hisobot", "Haftalik xulosa", "Qarzdorlar ro'yxati" —
// each a name and an instruction the owner can change or add to. The result lands in tayyor/ (synced to MOOPI)
// and opens in Word or Excel by itself.
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const brain = require('./brain');

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

/** Runs one action: the assistant window shows it, the brain works, new files in tayyor/ open by themselves. */
async function run(context, ctx, id) {
  const lang = (ctx.api.me && ctx.api.me.language) === 'ru' ? 'ru' : 'uz';
  const action = list(context, lang).find((a) => a.id === id);
  if (!action) return;
  if (!brain.binary()) { vscode.window.showWarningMessage(ctx.t('as_no_brain')); return; }
  if (brain.busy()) { vscode.window.showInformationMessage(ctx.t('quick_busy')); return; }
  const out = path.join(brain.WORKSPACE_DIR, 'tayyor');
  fs.mkdirSync(out, { recursive: true });
  const before = snapshot(out);
  ctx.onReport('quick', '⚡ ' + action.title, null, false, true);
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await brain.ask({ prompt: action.prompt.replace(/<sana>|<дата>/g, today), maxTurns: 24, timeoutMs: 420000,
      onTool: (n) => ctx.onReport('quick', null, n), onText: (piece) => ctx.onReport('quick', piece, null, false) });
    const after = snapshot(out);
    const fresh = [...after.keys()].filter((n) => !before.has(n) || before.get(n) !== after.get(n)).map((n) => path.join(out, n));
    for (const f of fresh.slice(0, 3)) { try { await vscode.env.openExternal(vscode.Uri.file(f)); } catch (e) {} }
    ctx.onReport('quick', fresh.length ? ctx.t('quick_done').replace('{f}', fresh.map((f) => path.basename(f)).join(', ')) : (r.text ? '' : ctx.t('quick_nothing')), null, true);
  } catch (e) { ctx.reportError('quick:' + id, e); ctx.onReport('quick', ctx.t('quick_failed'), null, true); }
}

module.exports = { list, addAction, removeAction, run, DEFAULTS };
