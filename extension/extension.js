// MOOPI Desktop: the MOOPI shell around the official Claude Code extension. Signs in to MOOPI (its own
// API, the same ways as the app), shows Bugun / Tasdiqlar / Fayllar as sidebar panels, opens Claude in the
// editor area at startup. Nothing here touches Claude's own sign-in or the Claude Code extension.
const vscode = require('vscode');
const brain = require('./brain');
const platform = require('./platform');
const assistant = require('./assistant');
const fs = require('fs');
const path = require('path');

const T = {
  uz: { signin: 'MOOPI hisobingiz bilan kiring', email: 'Email', code: '6 xonali kod', send_code: 'Kod yuborish', enter: 'Kirish',
        tg_hint: "@moopiai botida raqamingizni yuboring va kelgan 6 xonali kodni shu yerga yozing.", tg: 'Telegram orqali', mail: 'Email orqali',
        code_sent: 'Kod yuborildi. Kelmasa, Spam papkasini tekshiring.', failed: 'Kirib bo‘lmadi', empty: 'Hozircha bo‘sh',
        approve: 'Tasdiqlash', reject: 'Rad etish', open: 'Ochish', overdue: 'muddati o‘tgan', today_tasks: 'Bugungi ishlar',
        briefing: 'Ertalabki brifing', recent: 'Oxirgi suhbatlar', loading: 'Yuklanmoqda…', signed_out: 'Chiqdingiz', hello: 'Salom',
        claude: 'Claude bilan suhbat', no_claude: 'Claude Code kengaytmasi topilmadi.', signin_elsewhere: 'Kirish \u2014 "Bugun" panelida.',
        voice_ask: 'Claude javoblarini ovoz bilan o\u2018qib berilsinmi? (MOOPI ovozi, keyin Cmd/Ctrl+Alt+V bilan yoqib-o\u2018chirasiz)', yes: 'Ha', no: 'Yo\u2018q', voice_on: 'Ovozli javob yoqildi', voice_off: 'Ovozli javob o\u2018chirildi',
        tips: 'O\u2018ng tomonda yozasiz, chapda MOOPI ko\u2018rsatadi va bajaradi. Rasm yoki skrinshotni Claude maydoniga tortib tashlang. Fayllar bo\u2018limidagi yulduzcha faylni Claude\u2019ga beradi.', ok: 'Tushundim',
        uploaded: 'MOOPI\u2019ga yuklandi: {f}', upload_failed_f: 'MOOPI\u2019ga yuklab bo\u2018lmadi: {f}',
        file_ready: 'Fayl Claude uchun tayyor: {m} \u2014 yozish maydoniga qo\u2018ying (Cmd+V / Ctrl+V).', go_claude: 'Claude\u2019ga o\u2018tish', file_failed: 'Faylni olib bo\u2018lmadi', approvals_waiting: '{n} ta tasdiq kutmoqda', open_approvals: 'Tasdiqlarni ochish',
        send_logs: 'Xatoni yuborish', logs_sent: 'Jurnal MOOPI\u2019ga yuborildi, rahmat.', logs_failed: 'Jurnalni yuborib bo\u2018lmadi', installing_claude: 'Claude Code o\u2018rnatilmoqda\u2026', claude_installed: 'Claude Code o\u2018rnatildi.' },
  ru: { signin: 'Войдите в аккаунт MOOPI', email: 'Email', code: '6-значный код', send_code: 'Отправить код', enter: 'Войти',
        tg_hint: 'Отправьте боту @moopiai свой номер и введите код.', tg: 'Через Telegram', mail: 'По email',
        code_sent: 'Код отправлен. Проверьте «Спам».', failed: 'Не удалось войти', empty: 'Пока пусто',
        approve: 'Одобрить', reject: 'Отклонить', open: 'Открыть', overdue: 'просрочено', today_tasks: 'Дела на сегодня',
        briefing: 'Утренний брифинг', recent: 'Недавние разговоры', loading: 'Загрузка…', signed_out: 'Вы вышли', hello: 'Привет',
        claude: 'Разговор с Claude', no_claude: 'Расширение Claude Code не найдено.', signin_elsewhere: '\u0412\u0445\u043e\u0434 \u2014 \u0432 \u043f\u0430\u043d\u0435\u043b\u0438 \u00ab\u0411\u0443\u0433\u0443\u043d\u00bb.',
        voice_ask: '\u041e\u0437\u0432\u0443\u0447\u0438\u0432\u0430\u0442\u044c \u043e\u0442\u0432\u0435\u0442\u044b Claude \u0433\u043e\u043b\u043e\u0441\u043e\u043c MOOPI? (\u043f\u043e\u0442\u043e\u043c Cmd/Ctrl+Alt+V)', yes: '\u0414\u0430', no: '\u041d\u0435\u0442', voice_on: '\u0413\u043e\u043b\u043e\u0441\u043e\u0432\u044b\u0435 \u043e\u0442\u0432\u0435\u0442\u044b \u0432\u043a\u043b\u044e\u0447\u0435\u043d\u044b', voice_off: '\u0413\u043e\u043b\u043e\u0441\u043e\u0432\u044b\u0435 \u043e\u0442\u0432\u0435\u0442\u044b \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u044b',
        tips: '\u0421\u043f\u0440\u0430\u0432\u0430 \u043f\u0438\u0448\u0435\u0442\u0435, \u0441\u043b\u0435\u0432\u0430 MOOPI \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442 \u0438 \u0434\u0435\u043b\u0430\u0435\u0442. \u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443 \u0432 \u043f\u043e\u043b\u0435 Claude. \u0417\u0432\u0451\u0437\u0434\u043e\u0447\u043a\u0430 \u0432 \u0424\u0430\u0439\u043b\u0430\u0445 \u043f\u0435\u0440\u0435\u0434\u0430\u0451\u0442 \u0444\u0430\u0439\u043b Claude.', ok: '\u041f\u043e\u043d\u044f\u0442\u043d\u043e',
        uploaded: '\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u043e \u0432 MOOPI: {f}', upload_failed_f: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0432 MOOPI: {f}',
        file_ready: '\u0424\u0430\u0439\u043b \u0433\u043e\u0442\u043e\u0432 \u0434\u043b\u044f Claude: {m} \u2014 \u0432\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u0432 \u043f\u043e\u043b\u0435 \u0432\u0432\u043e\u0434\u0430 (Cmd+V / Ctrl+V).', go_claude: '\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a Claude', file_failed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0444\u0430\u0439\u043b', approvals_waiting: '{n} \u0437\u0430\u043f\u0440\u043e\u0441\u043e\u0432 \u0436\u0434\u0443\u0442 \u043e\u0434\u043e\u0431\u0440\u0435\u043d\u0438\u044f', open_approvals: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043e\u0434\u043e\u0431\u0440\u0435\u043d\u0438\u044f',
        send_logs: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043e\u0442\u0447\u0451\u0442 \u043e\u0431 \u043e\u0448\u0438\u0431\u043a\u0435', logs_sent: '\u0416\u0443\u0440\u043d\u0430\u043b \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d \u0432 MOOPI, \u0441\u043f\u0430\u0441\u0438\u0431\u043e.', logs_failed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0436\u0443\u0440\u043d\u0430\u043b', installing_claude: '\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430 Claude Code\u2026', claude_installed: 'Claude Code \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d.' },
};
Object.assign(T.uz, {
  dictate_copied: "Matn nusxalandi \u2014 Claude maydoniga Ctrl+V bilan qo\u2018ying.", dictate_failed: 'Ovozni matnga aylantirib bo\u2018lmadi',
  dictate_unsupported: 'Gapirib yozish bu tizimda hozircha yo\u2018q', dictate_recording: 'Yozilmoqda\u2026 to\u2018xtatish uchun yana bosing',
  update_ready: 'MOOPI yangilandi ({v}). Qayta yuklash?', updating: 'Yangilanmoqda: {v}\u2026', updated: 'Yangilandi: {v} \u2014 qayta yuklang',
  reload: 'Qayta yuklash', later: 'Keyinroq', up_to_date: 'MOOPI yangi ({v}).', update_failed: 'Yangilab bo\u2018lmadi',
  signed_in_google: 'Kirdingiz.', signin_failed: 'Kirib bo\u2018lmadi: {e}', launch_on: 'Kompyuter bilan ochilish yoqildi',
  launch_off: 'Kompyuter bilan ochilish o\u2018chirildi', hotkey_set: 'Tezkor tugma: {k}', hotkey_cleared: 'Tezkor tugma olib tashlandi',
  hotkey_bad: 'Tezkor tugma Ctrl+Alt+M ko\u2018rinishida bo\u2018lsin', workspace_opening: 'MOOPI ish papkasi ochilmoqda\u2026',
});
Object.assign(T.ru, {
  dictate_copied: '\u0422\u0435\u043a\u0441\u0442 \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d \u2014 \u0432\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u0432 \u043f\u043e\u043b\u0435 Claude (Ctrl+V).', dictate_failed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044c \u0440\u0435\u0447\u044c \u0432 \u0442\u0435\u043a\u0441\u0442',
  dictate_unsupported: '\u041d\u0430\u0434\u0438\u043a\u0442\u043e\u0432\u043a\u0430 \u0432 \u044d\u0442\u043e\u0439 \u0441\u0438\u0441\u0442\u0435\u043c\u0435 \u043f\u043e\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430', dictate_recording: '\u0417\u0430\u043f\u0438\u0441\u044c\u2026 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437, \u0447\u0442\u043e\u0431\u044b \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c',
  update_ready: 'MOOPI \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d ({v}). \u041f\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c?', updating: '\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435: {v}\u2026', updated: '\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u043e: {v} \u2014 \u043f\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435',
  reload: '\u041f\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c', later: '\u041f\u043e\u0437\u0436\u0435', up_to_date: 'MOOPI \u0430\u043a\u0442\u0443\u0430\u043b\u0435\u043d ({v}).', update_failed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c',
  signed_in_google: '\u0412\u044b \u0432\u043e\u0448\u043b\u0438.', signin_failed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438: {e}', launch_on: '\u0417\u0430\u043f\u0443\u0441\u043a \u0441 \u043a\u043e\u043c\u043f\u044c\u044e\u0442\u0435\u0440\u043e\u043c \u0432\u043a\u043b\u044e\u0447\u0451\u043d',
  launch_off: '\u0417\u0430\u043f\u0443\u0441\u043a \u0441 \u043a\u043e\u043c\u043f\u044c\u044e\u0442\u0435\u0440\u043e\u043c \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d', hotkey_set: '\u0413\u043e\u0440\u044f\u0447\u0430\u044f \u043a\u043b\u0430\u0432\u0438\u0448\u0430: {k}', hotkey_cleared: '\u0413\u043e\u0440\u044f\u0447\u0430\u044f \u043a\u043b\u0430\u0432\u0438\u0448\u0430 \u0443\u0431\u0440\u0430\u043d\u0430',
  hotkey_bad: '\u0413\u043e\u0440\u044f\u0447\u0430\u044f \u043a\u043b\u0430\u0432\u0438\u0448\u0430 \u0432 \u0432\u0438\u0434\u0435 Ctrl+Alt+M', workspace_opening: '\u041e\u0442\u043a\u0440\u044b\u0432\u0430\u044e \u0440\u0430\u0431\u043e\u0447\u0443\u044e \u043f\u0430\u043f\u043a\u0443 MOOPI\u2026',
});
Object.assign(T.uz, {
  as_ready: "Tayyorman. Gapiring yoki yozing.", as_listening: "Eshityapman… to‘xtatish uchun yana bosing", as_thinking: "O‘ylayapman…",
  as_speaking: "Gapiryapman", as_tap_talk: "Gapirish (Ctrl+Alt+M)", as_tap_stop: "To‘xtatish", as_type: "Yoki shu yerga yozing…", as_send: "Yuborish",
  as_screen: "Ekrandan so‘ra", as_clip: "Nusxalaganimni ber", as_to_claude: "Claude paneliga", as_stop: "To‘xtat", as_new: "Yangi suhbat",
  as_you: "Siz", as_moopi: "MOOPI", as_no_brain: "Claude Code hali o‘rnatilmagan — yordamchi undan keyin ishlaydi.",
  as_tool: "{t}", as_image: "Rasm biriktirildi — endi savolingizni ayting yoki yozing", as_hint: "Mikrofonni bosing va gapiring. MOOPI xotirangiz va vositalaringiz bilan, o‘z Claude obunangizda javob beradi.",
  as_sent_claude: "Claude maydoniga qo‘ying: Ctrl+V (Mac: ⌘V)", as_nothing_heard: "Hech narsa eshitilmadi — yana urinib ko‘ring", as_failed: "Javob bera olmadim. Claude’ga kirganmisiz? Yana urinib ko‘ring.",
  claude_ready: "Claude Code tayyor", claude_installing: "Claude Code o‘rnatilmoqda (150 MB)…", claude_missing: "Claude Code o‘rnatilmagan", claude_failed: "Claude Code o‘rnatilmadi — internetni tekshirib, qayta urinib ko‘ring",
  shot_cancelled: "Ekran rasmi olinmadi", voice_tail: " … davomi ekranda.",
});
Object.assign(T.ru, {
  as_ready: "Готов. Говорите или пишите.", as_listening: "Слушаю… нажмите ещё раз, чтобы остановить", as_thinking: "Думаю…",
  as_speaking: "Говорю", as_tap_talk: "Говорить (Ctrl+Alt+M)", as_tap_stop: "Остановить", as_type: "Или напишите здесь…", as_send: "Отправить",
  as_screen: "Спросить по экрану", as_clip: "Дать скопированное", as_to_claude: "В панель Claude", as_stop: "Стоп", as_new: "Новый разговор",
  as_you: "Вы", as_moopi: "MOOPI", as_no_brain: "Claude Code ещё не установлен — помощник заработает после него.",
  as_tool: "{t}", as_image: "Картинка приложена — теперь задайте вопрос", as_hint: "Нажмите микрофон и говорите. MOOPI отвечает с вашей памятью и инструментами, на вашей подписке Claude.",
  as_sent_claude: "Вставьте в поле Claude: Ctrl+V (Mac: ⌘V)", as_nothing_heard: "Ничего не услышал — попробуйте ещё", as_failed: "Не смог ответить. Вы вошли в Claude? Попробуйте ещё.",
  claude_ready: "Claude Code готов", claude_installing: "Claude Code устанавливается (150 МБ)…", claude_missing: "Claude Code не установлен", claude_failed: "Claude Code не установился — проверьте интернет и повторите",
  shot_cancelled: "Снимок экрана не сделан", voice_tail: " … дальше на экране.",
});
function lang() { return vscode.workspace.getConfiguration('moopi').get('language', 'uz') === 'ru' ? 'ru' : 'uz'; }
function t(key) { return (T[lang()] && T[lang()][key]) || T.uz[key] || key; }

/** MOOPI's API with the account's token kept in the editor's secret storage. */
class Api {
  constructor(context) { this.context = context; this.token = null; this.me = null; this.listeners = new Set(); }
  get base() { return vscode.workspace.getConfiguration('moopi').get('apiUrl', 'https://moopi.uz/api').replace(/\/$/, ''); }
  async load() { this.token = (await this.context.secrets.get('moopi.token')) || null; if (this.token) { try { this.me = await this.get('/auth/me'); } catch (e) { this.token = null; this.me = null; } } this.emit(); }
  onChange(fn) { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; }
  emit() { for (const fn of this.listeners) { try { fn(); } catch (e) {} } }
  async request(method, p, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const r = await fetch(this.base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) {}
    if (r.status === 401 && this.token) { await this.signOut(); }
    if (!r.ok) throw new Error((json && (json.detail || json.message)) || ('HTTP ' + r.status));
    return json;
  }
  get(p) { return this.request('GET', p); }
  post(p, body) { return this.request('POST', p, body || {}); }
  async signInWith(body) {
    // The same endpoints the MOOPI app uses: email code, Telegram code, or email + password.
    const p = body.method === 'telegram_code' ? '/auth/telegram/code' : body.method === 'email_code' ? '/auth/email/verify' : '/auth/login';
    const r = await this.request('POST', p, body.method === 'telegram_code' ? { code: body.code } : body.method === 'email_code' ? { email: body.email, code: body.code } : { email: body.email, password: body.password });
    const token = r && (r.token || r.access_token);
    if (!token) throw new Error(t('failed'));
    this.token = token; await this.context.secrets.store('moopi.token', token);
    this.me = await this.get('/auth/me'); this.emit();
  }
  async sendEmailCode(email) { await this.request('POST', '/auth/email/code', { email }); }
  async signOut() { this.token = null; this.me = null; await this.context.secrets.delete('moopi.token'); this.emit(); }
}

/** One sidebar panel: a webview that renders what the extension sends it. */
class Panel {
  constructor(id, api, context) { this.id = id; this.api = api; this.context = context; this.view = null; this.data = null; }
  resolveWebviewView(view) {
    this.view = view;
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const css = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css'));
    const js = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js'));
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    view.webview.html = `<!doctype html><html lang="${lang()}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${view.webview.cspSource} https:;">
<link rel="stylesheet" href="${css}"></head><body data-panel="${this.id}"><div id="root"></div><script nonce="${nonce}" src="${js}"></script></body></html>`;
    view.webview.onDidReceiveMessage((m) => this.onMessage(m));
    view.onDidChangeVisibility(() => { if (view.visible) this.refresh(); });
    this.refresh();
  }
  send(msg) { if (this.view) this.view.webview.postMessage(msg); }
  strings() { return T[lang()]; }
  async refresh() {
    if (!this.view) return;
    if (!this.api.token) { this.send({ kind: this.id === 'bugun' ? 'signin' : 'signinElsewhere', t: this.strings() }); return; }
    this.send({ kind: 'loading', t: this.strings() });
    try {
      this.data = await this.fetch();
      this.send({ kind: 'data', panel: this.id, data: this.data, me: this.api.me, t: this.strings() });
    } catch (e) {
      reportError(this.context, this.api, 'panel:' + this.id, e);
      this.send({ kind: 'error', message: String(e.message || e), t: this.strings() });
    }
  }
  async fetch() {
    if (this.id === 'bugun') return this.api.get('/today');
    if (this.id === 'tasdiqlar') return this.api.get('/approvals');
    if (this.id === 'fayllar') return this.api.get('/files');
    return null;
  }
  async onMessage(m) {
    try {
      if (m.kind === 'sendCode') { await this.api.sendEmailCode(m.email); this.send({ kind: 'codeSent', t: this.strings() }); }
      else if (m.kind === 'signIn') { await this.api.signInWith(m.body); }
      else if (m.kind === 'approve') { await this.api.post(`/approvals/${m.id}/approve`); await refreshAll(); }
      else if (m.kind === 'reject') { await this.api.post(`/approvals/${m.id}/reject`); await refreshAll(); }
      else if (m.kind === 'openFile') { const r = await this.api.get(`/files/${m.id}/link`); const url = r && (r.url || r.link); if (url) vscode.env.openExternal(vscode.Uri.parse(url.startsWith('http') ? url : this.api.base.replace(/\/api$/, '') + url)); }
      else if (m.kind === 'openClaude') { await openClaude(); }
      else if (m.kind === 'refresh') { await this.refresh(); }
      else if (m.kind === 'sendLogs') { await sendLogs(this.context, this.api, 'user', false); }
    } catch (e) {
      reportError(this.context, this.api, 'message:' + m.kind, e);
      this.send({ kind: 'error', message: String(e.message || e), t: this.strings() });
    }
  }
}

let panels = [];
async function refreshAll() { for (const p of panels) await p.refresh(); }

/** The MOOPI app (its web build, in desktop mode) in the editor area: the window IS the MOOPI app. The
 *  app hands its sign-in token over and asks for Claude through messages; nothing else crosses. */
let appPanel = null;
function appUrl() { return vscode.workspace.getConfiguration('moopi').get('appUrl', 'https://sessions.moopi.uz/app/').replace(/\/?$/, '/'); }
function openApp(context, api) {
  if (appPanel) { appPanel.reveal(vscode.ViewColumn.One, true); return appPanel; }
  const url = appUrl(), origin = new URL(url).origin;
  appPanel = vscode.window.createWebviewPanel('moopi.app', 'MOOPI', { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true, enableForms: true });
  appPanel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'moopi.svg');
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  appPanel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>html,body{margin:0;height:100%;background:#061210;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe id="app" src="${url}?desktop=1" allow="clipboard-read; clipboard-write; microphone" referrerpolicy="origin"></iframe>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const frame = document.getElementById('app'), home = ${JSON.stringify(url + '?desktop=1')};
// The app announces itself ('ready' / 'signedIn') after every load. A load with no announcement means the
// frame has wandered off to a page that is not the app (a sign-in provider, an error page): bring it back.
let watchdog = null;
frame.addEventListener('load', () => { clearTimeout(watchdog); watchdog = setTimeout(() => { frame.src = home; }, 8000); });
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  if (e.source !== frame.contentWindow) { // from MOOPI Desktop itself: for the frame
    if (d.reload) { frame.src = home; return; }
    if (d.goto) { frame.contentWindow.postMessage({ fromMoopiDesktop: true, moopi: 'goto', tab: d.goto }, ${JSON.stringify(origin)}); return; }
    if (d.fromMoopiDesktop) frame.contentWindow.postMessage(d, ${JSON.stringify(origin)});
    return;
  }
  if (e.origin !== ${JSON.stringify(origin)}) return;
  if (d.reload) { frame.src = home; return; }
  if (d.moopi) { clearTimeout(watchdog); vscode.postMessage(d); }
});
</script></body></html>`;
  appPanel.webview.onDidReceiveMessage(async (m) => {
    try {
      if (m.moopi === 'ready') { sendState(context, api); setTimeout(() => openClaude().catch(() => {}), 1500); return; }
      if (m.moopi === 'getState') sendState(context, api);
      else if (m.moopi === 'openClaude') await openClaude();
      else if (m.moopi === 'giveFile') await giveFile(context, api, m.id, m.name);
      else if (m.moopi === 'open' && typeof m.url === 'string' && /^https:\/\//.test(m.url)) await vscode.env.openExternal(vscode.Uri.parse(m.url));
      else if (m.moopi === 'googleSignIn') await vscode.env.openExternal(vscode.Uri.parse(api.base + '/auth/google/start?desktop=true'));
      else if (m.moopi === 'desktop') await desktopAction(context, api, String(m.action || ''), m.value);
      else if (m.moopi === 'signedIn' && m.token) {
        if (m.token !== api.token) { api.token = m.token; await context.secrets.store('moopi.token', m.token); try { api.me = await api.get('/auth/me'); } catch (e) {} api.emit(); }
      } else if (m.moopi === 'signedOut') { await api.signOut(); }
    } catch (e) { reportError(context, api, 'appMessage', e); }
  });
  appPanel.onDidDispose(() => { appPanel = null; });
  appPanel.onDidChangeViewState((e) => { if (e.webviewPanel.active) setTimeout(() => openClaude().catch(() => {}), 300); });
  return appPanel;
}

/** A MOOPI file handed to Claude: downloaded into the workspace (~/MOOPI/fayllar), its @-mention put on the
 *  clipboard (Claude's input box is Anthropic's; it cannot be typed into from here), text files also opened
 *  so the panel attaches them by itself. */
async function giveFile(context, api, id, name) {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder || !api.token) { vscode.window.showWarningMessage(t('file_failed')); return; }
  const safe = String(name || ('fayl-' + id)).replace(/[\/\\:*?"<>|]+/g, '_').slice(-120);
  const dir = vscode.Uri.joinPath(folder.uri, 'fayllar'), target = vscode.Uri.joinPath(dir, safe);
  try {
    const r = await fetch(`${api.base}/files/${id}`, { headers: { Authorization: 'Bearer ' + api.token } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const bytes = new Uint8Array(await r.arrayBuffer());
    await vscode.workspace.fs.createDirectory(dir);
    const from = new Set(context.globalState.get('moopi.fromMoopi') || []); from.add(target.fsPath);
    await context.globalState.update('moopi.fromMoopi', [...from].slice(-500));
    await vscode.workspace.fs.writeFile(target, bytes);
    const mention = '@fayllar/' + safe;
    await vscode.env.clipboard.writeText(mention + ' ');
    if (/\.(txt|md|csv|json|html|xml|yaml|yml)$/i.test(safe)) {
      try { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target), { preview: true, preserveFocus: true, viewColumn: vscode.ViewColumn.Beside }); } catch (e) {}
    }
    const pick = await vscode.window.showInformationMessage(t('file_ready').replace('{m}', mention), t('go_claude'));
    if (pick) await openClaude();
  } catch (e) {
    reportError(context, api, 'giveFile', e);
    vscode.window.showErrorMessage(t('file_failed') + ': ' + (e.message || e));
  }
}

/** Two folders of the workspace are MOOPI's: fayllar/ (what the user gives Claude) and tayyor/ (what Claude
 *  makes, by the CLAUDE.md rule). Every new or changed file there goes into MOOPI's Fayllar with the user's
 *  own sign-in (a plain upload, no model), so the phone and MOOPI's memory see the same files. Files that
 *  came down from MOOPI (giveFile) are left alone. */
const SYNC_FOLDERS = ['fayllar', 'tayyor'];
const SYNC_MAX = 25 * 1024 * 1024;
const pendingUploads = new Map();
async function uploadToMoopi(context, api, fsPath) {
  const name = path.basename(fsPath);
  try {
    const st = fs.statSync(fsPath);
    if (!st.isFile() || st.size === 0 || st.size > SYNC_MAX) return;
    const uploaded = context.globalState.get('moopi.uploaded') || {};
    if (uploaded[fsPath] === st.mtimeMs) return;
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(fsPath)]), name);
    const r = await fetch(`${api.base}/files`, { method: 'POST', headers: { Authorization: 'Bearer ' + api.token }, body: form });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    uploaded[fsPath] = st.mtimeMs;
    const keys = Object.keys(uploaded); if (keys.length > 1000) for (const k of keys.slice(0, keys.length - 1000)) delete uploaded[k];
    await context.globalState.update('moopi.uploaded', uploaded);
    console.log('[moopi] uploaded', fsPath);
    vscode.window.setStatusBarMessage(t('uploaded').replace('{f}', name), 6000);
    vscode.window.showInformationMessage(t('uploaded').replace('{f}', name));
  } catch (e) {
    reportError(context, api, 'upload', e);
    vscode.window.showWarningMessage(t('upload_failed_f').replace('{f}', name) + ' (' + (e.message || e) + ')');
  }
}
function wantsSync(context, fsPath) {
  const name = path.basename(fsPath);
  if (name.startsWith('.') || name.startsWith('~$') || /\.(tmp|part|crdownload|swp)$/i.test(name)) return false;
  const from = new Set(context.globalState.get('moopi.fromMoopi') || []);
  return !from.has(fsPath);
}
function scheduleUpload(context, api, fsPath) {
  if (!api.token || !wantsSync(context, fsPath)) return;
  clearTimeout(pendingUploads.get(fsPath));
  pendingUploads.set(fsPath, setTimeout(() => { pendingUploads.delete(fsPath); uploadToMoopi(context, api, fsPath); }, 2500));
}
function startSync(context, api) {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) return;
  for (const sub of SYNC_FOLDERS) {
    const dir = vscode.Uri.joinPath(folder.uri, sub);
    vscode.workspace.fs.createDirectory(dir).then(() => {}, () => {});
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, sub + '/**'));
    watcher.onDidCreate((u) => scheduleUpload(context, api, u.fsPath));
    watcher.onDidChange((u) => scheduleUpload(context, api, u.fsPath));
    context.subscriptions.push(watcher);
  }
  // What appeared while the window was closed.
  const sweep = () => {
    if (!api.token) return;
    let n = 0;
    for (const sub of SYNC_FOLDERS) {
      const dir = path.join(folder.uri.fsPath, sub);
      let names = []; try { names = fs.readdirSync(dir); } catch (e) { continue; }
      for (const name of names) { if (n++ > 50) break; scheduleUpload(context, api, path.join(dir, name)); }
    }
  };
  setTimeout(sweep, 20000);
  context.subscriptions.push(api.onChange(() => { if (api.token) setTimeout(sweep, 5000); }));
}

/** Claude's answers read aloud: the extension follows Claude Code's own transcript of this workspace
 *  (~/.claude/projects/<folder>/*.jsonl, written by the unmodified binary), sends each new answer's text to
 *  MOOPI's voice (the user's chosen voice, a small API cost) and plays it with the system player. */
const voice = { on: false, queue: Promise.resolve(), player: null, offsets: new Map(), watcher: null, started: 0 };
function transcriptDir() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) return null;
  const key = folder.uri.fsPath.replace(/[^A-Za-z0-9]/g, '-');
  return path.join(require('os').homedir(), '.claude', 'projects', key);
}
function readNewLines(file) {
  let st; try { st = fs.statSync(file); } catch (e) { return []; }
  const from = voice.offsets.has(file) ? voice.offsets.get(file) : (st.mtimeMs < voice.started ? st.size : 0);
  if (st.size <= from) { voice.offsets.set(file, st.size); return []; }
  const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(st.size - from);
  fs.readSync(fd, buf, 0, buf.length, from); fs.closeSync(fd);
  const text = buf.toString('utf8'); const cut = text.lastIndexOf('\n');
  voice.offsets.set(file, from + Buffer.byteLength(text.slice(0, cut + 1)));
  return text.slice(0, cut).split('\n').filter(Boolean);
}
function answersIn(lines) {
  const out = [];
  for (const line of lines) {
    let d; try { d = JSON.parse(line); } catch (e) { continue; }
    if (d.type !== 'assistant' || d.isSidechain) continue;
    const c = d.message && d.message.content;
    if (!Array.isArray(c)) continue;
    const text = c.filter((b) => b && b.type === 'text' && b.text).map((b) => b.text).join('\n').trim();
    if (text.length > 1) out.push(text);
  }
  return out;
}
function startVoiceWatch(context, api) {
  const dir = transcriptDir(); if (!dir || voice.watcher) return;
  voice.started = Date.now();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  try {
    voice.watcher = fs.watch(dir, (ev, name) => {
      if (!name || !name.endsWith('.jsonl')) return;
      syncTranscript(context, api, path.join(dir, name));
      if (!voice.on) return;
      for (const text of answersIn(readNewLines(path.join(dir, name)))) speak(context, api, text);
    });
    context.subscriptions.push({ dispose: () => { try { voice.watcher.close(); } catch (e) {} } });
  } catch (e) { noteError('voiceWatch', e); }
}
function stripForSpeech(text) {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 1500);
}
function speak(context, api, text) {
  if (!voice.on || !api.token) return;
  if (context.globalState.get('moopi.voiceAway') !== false && vscode.window.state.focused) return; // reading it themselves
  let say = stripForSpeech(text); if (say.length < 2) return;
  if (context.globalState.get('moopi.voiceShort') !== false && say.length > 520) {
    const cut = say.slice(0, 520); const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    say = (end > 200 ? cut.slice(0, end + 1) : cut) + t('voice_tail');
  }
  voice.queue = voice.queue.then(async () => {
    if (!voice.on) return;
    try {
      const r = await fetch(`${api.base}/voice/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + api.token }, body: JSON.stringify({ text: say }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const file = path.join(require('os').tmpdir(), `moopi-say-${Date.now()}.mp3`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      await playFile(file);
      try { fs.unlinkSync(file); } catch (e) {}
    } catch (e) { noteError('speak', e); }
  });
}
function playFile(file) {
  const p = platform.play(file); voice.player = p;
  return p.done.then(() => { voice.player = null; });
}
function setVoice(context, on) {
  voice.on = on; context.globalState.update('moopi.voice', on);
  if (voice.api) sendState(context, voice.api);
  if (!on && voice.player) { try { voice.player.stop(); } catch (e) {} }
  vscode.window.setStatusBarMessage(t(on ? 'voice_on' : 'voice_off'), 4000);
  vscode.window.showInformationMessage(t(on ? 'voice_on' : 'voice_off'));
}

/** A notification of the operating system (the window may be behind others). */
function osNotify(title, body) {
  const cp = require('child_process');
  try {
    if (process.platform === 'darwin') {
      cp.execFile('osascript', ['-e', `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`], () => {});
    } else if (process.platform === 'win32') {
      const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $n = $t.GetElementsByTagName('text'); $n.Item(0).AppendChild($t.CreateTextNode(${JSON.stringify(title)})) > $null; $n.Item(1).AppendChild($t.CreateTextNode(${JSON.stringify(body)})) > $null; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('MOOPI Desktop').Show([Windows.UI.Notifications.ToastNotification]::new($t))`;
      cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], () => {});
    } else {
      cp.execFile('notify-send', [title, body], () => {});
    }
  } catch (e) {}
}

/** New approvals and MOOPI notifications, checked every minute: a message in the window and one of the
 *  operating system, so the owner knows without opening MOOPI. */
let watchTimer = null;
async function watchMoopi(context, api) {
  if (!api.token) return;
  try {
    const approvals = await api.get('/approvals');
    const pending = (approvals || []).filter((a) => a.status === 'pending').map((a) => a.id);
    const seen = new Set(context.globalState.get('moopi.seenApprovals') || []);
    const fresh = pending.filter((id) => !seen.has(id));
    if (fresh.length && seen.size) { // not on the very first look
      const text = t('approvals_waiting').replace('{n}', String(pending.length));
      osNotify('MOOPI', text);
      vscode.window.showInformationMessage(text, t('open_approvals')).then((pick) => { if (pick && appPanel) { appPanel.reveal(); appPanel.webview.postMessage({ goto: 'approvals' }); } });
    }
    await context.globalState.update('moopi.seenApprovals', pending.slice(0, 500));
    const notes = await api.get('/notifications');
    const unread = (notes || []).filter((n) => !n.read);
    const lastNote = context.globalState.get('moopi.lastNotification') || 0;
    const newest = unread.filter((n) => n.id > lastNote);
    if (newest.length && lastNote) {
      const n = newest[newest.length - 1];
      osNotify('MOOPI', String(n.text || '').slice(0, 160));
      vscode.window.showInformationMessage(String(n.text || '').slice(0, 200));
    }
    if (unread.length || notes && notes.length) await context.globalState.update('moopi.lastNotification', Math.max(lastNote, ...(notes || []).map((n) => n.id || 0)));
  } catch (e) { noteError('watchMoopi', e); }
}

/** The window's shape: no IDE chrome, the MOOPI app in the middle, Claude Code's panel on the right. */
const LAYOUT = {
  'workbench.colorTheme': 'MOOPI Dark',
  'window.title': 'MOOPI Desktop',
  'window.commandCenter': false,
  'window.menuBarVisibility': 'compact',
  'workbench.activityBar.location': 'hidden',
  'workbench.statusBar.visible': false,
  'workbench.editor.showTabs': 'none',
  'workbench.editor.editorActionsLocation': 'hidden',
  'workbench.layoutControl.enabled': false,
  'workbench.navigationControl.enabled': false,
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.secondarySideBar.defaultVisibility': 'visible',
  'breadcrumbs.enabled': false,
  'extensions.ignoreRecommendations': true,
  'security.workspace.trust.enabled': false,
  'git.enabled': false,
  'claudeCode.preferredLocation': 'sidebar',
  'claudeCode.hideOnboarding': true,
  'claudeCode.continueAfterReload': true,
  // Focus view: only the person's messages and Claude's answers; tool calls fold away (one click to see).
  'claudeCode.focusView': true,
  'claudeCode.spinnerVerbs': { mode: 'replace', verbs: ["O'ylayapman", "Qarab chiqyapman", "Tayyorlayapman", "Tekshiryapman", "Yozyapman"] },
};
async function applyLayout(context) {
  if (context.globalState.get('moopi.layout') === 4) return;
  for (const [k, v] of Object.entries(LAYOUT)) {
    try { await vscode.workspace.getConfiguration().update(k, v, vscode.ConfigurationTarget.Global); } catch (e) {}
  }
  await context.globalState.update('moopi.layout', 4);
}

/** Logs of this window: the extension host's folder (ours and Claude Code's output) and the main logs. */
const LOGS_URL = 'https://sessions.moopi.uz/api/desktop/logs';
const ownErrors = [];
let logsSentAt = 0, logsSendCount = 0;
function noteError(where, e) {
  const line = `${new Date().toISOString()} ${where}: ${String((e && e.stack) || e).slice(0, 800)}`;
  ownErrors.push(line); if (ownErrors.length > 100) ownErrors.shift();
  console.error('[moopi]', line);
}
function tailOf(file, max) {
  try { const st = fs.statSync(file); const fd = fs.openSync(file, 'r'); const len = Math.min(st.size, max);
    const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd); return buf.toString('utf8'); } catch (e) { return ''; }
}
function collectLogs(context, api, reason) {
  const parts = [];
  parts.push(`# MOOPI Desktop log report\nreason: ${reason}\ntime: ${new Date().toISOString()}\napp: ${vscode.env.appName} ${vscode.version} (${process.platform} ${process.arch})\nextension: ${context.extension.packageJSON.version}\nuser: ${api.me ? (api.me.id + ' ' + (api.me.name || '')) : 'not signed in'}\n`);
  parts.push('\n## own errors\n' + (ownErrors.join('\n') || '(none)') + '\n');
  // context.logUri = <user-data>/logs/<session>/window<N>/exthost/<publisher>.<name>
  const exthost = path.dirname(context.logUri.fsPath), windowDir = path.dirname(exthost), session = path.dirname(windowDir);
  const files = [];
  for (const f of ['main.log', 'sharedprocess.log', 'network.log']) files.push(path.join(session, f));
  for (const f of ['renderer.log']) files.push(path.join(windowDir, f));
  try { for (const f of fs.readdirSync(exthost)) { const full = path.join(exthost, f); if (fs.statSync(full).isFile()) files.push(full); else if (/claude|moopi|output_logging/i.test(f)) for (const g of fs.readdirSync(full)) files.push(path.join(full, g)); } } catch (e) {}
  for (const f of files) { const t = tailOf(f, 60 * 1024); if (t) parts.push(`\n## ${path.relative(session, f)}\n${t}\n`); }
  return parts.join('');
}
async function sendLogs(context, api, reason, quiet) {
  if (!api.token) { if (!quiet) vscode.window.showWarningMessage(t('signin')); return false; }
  try {
    const text = collectLogs(context, api, reason);
    const r = await fetch(LOGS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8', Authorization: 'Bearer ' + api.token, 'X-MOOPI-Reason': reason }, body: text.slice(0, 1024 * 1024) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (!quiet) vscode.window.showInformationMessage(t('logs_sent'));
    return true;
  } catch (e) {
    noteError('sendLogs', e);
    if (!quiet) vscode.window.showErrorMessage(t('logs_failed') + ': ' + (e.message || e));
    return false;
  }
}
/** The extension's own errors go to MOOPI by themselves, at most 3 reports an hour. */
let errorPingAt = 0;
function reportError(context, api, where, e) {
  noteError(where, e);
  const now = Date.now();
  if (now - errorPingAt > 60000) { errorPingAt = now; ping(context, api, `${where}: ${String((e && e.message) || e).slice(0, 300)}`).catch(() => {}); }
  if (now - logsSentAt > 3600 * 1000) { logsSentAt = now; logsSendCount = 0; }
  if (logsSendCount >= 3) return;
  logsSendCount += 1;
  setTimeout(() => sendLogs(context, api, 'auto:' + where, true), 3000);
}

/** Claude Code, from Open VSX, on the first start (the build ships MOOPI's extension; Claude's is theirs). */
let claudeState = 'missing';
async function ensureClaude(context, api) {
  if (vscode.extensions.getExtension('Anthropic.claude-code') || vscode.extensions.getExtension('anthropic.claude-code')) { claudeState = 'ready'; if (api) sendState(context, api); return true; }
  claudeState = 'installing'; if (api) sendState(context, api);
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t('installing_claude') }, async () => {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', 'anthropic.claude-code');
    });
    claudeState = 'ready'; if (api) sendState(context, api);
    vscode.window.showInformationMessage(t('claude_installed'));
    return true;
  } catch (e) {
    claudeState = 'failed'; if (api) sendState(context, api);
    noteError('ensureClaude', e); vscode.window.showWarningMessage(t('claude_failed') + ' ' + ((e && e.message) || ''));
    return false;
  }
}

/** Claude Code's own panel, in the editor area: the chat in the middle of the MOOPI window. */
async function openClaude() {
  const ext = vscode.extensions.getExtension('Anthropic.claude-code') || vscode.extensions.getExtension('anthropic.claude-code');
  if (!ext) { vscode.window.showWarningMessage(t('no_claude')); return; }
  if (!ext.isActive) { try { await ext.activate(); } catch (e) {} }
  const commands = await vscode.commands.getCommands(true);
  for (const c of ['claude-vscode.sidebar.open', 'claude-vscode.primaryEditor.open', 'claude-vscode.editor.open']) {
    if (commands.includes(c)) { try { await vscode.commands.executeCommand(c); return; } catch (e) {} }
  }
}

/** The work folder, ~/MOOPI: MOOPI's persona for Claude Code (CLAUDE.md, refreshed every start in the
 *  person's language), the MOOPI MCP server (.mcp.json) and Claude's settings (once; the person's own
 *  edits stay). A fresh installation has no folder open: MOOPI's is opened, and the window reloads with it. */
const WORKSPACE_DIR = path.join(require('os').homedir(), 'MOOPI');
function writeIfChanged(file, text) {
  let old = null; try { old = fs.readFileSync(file, 'utf8'); } catch (e) {}
  if (old !== text) fs.writeFileSync(file, text);
}
async function prepareWorkspace(context, api) {
  const bundled = (name) => fs.readFileSync(path.join(context.extensionUri.fsPath, 'workspace', name), 'utf8');
  try {
    fs.mkdirSync(path.join(WORKSPACE_DIR, '.claude'), { recursive: true });
    for (const sub of SYNC_FOLDERS) fs.mkdirSync(path.join(WORKSPACE_DIR, sub), { recursive: true });
    const code = (api.me && api.me.language) || lang();
    const tz = (api.me && api.me.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tashkent';
    writeIfChanged(path.join(WORKSPACE_DIR, 'CLAUDE.md'),
      bundled('CLAUDE.md').replace(/\{language\}/g, code === 'ru' ? 'rus tili' : "o'zbek tili (lotin)").replace(/\{timezone\}/g, tz));
    if (!fs.existsSync(path.join(WORKSPACE_DIR, '.mcp.json'))) fs.writeFileSync(path.join(WORKSPACE_DIR, '.mcp.json'), bundled('mcp.json'));
    const settingsPath = path.join(WORKSPACE_DIR, '.claude', 'settings.json');
    let own = {}; try { own = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
    const wanted = JSON.parse(bundled('settings.json'));
    const merged = { ...wanted, ...own, language: code === 'ru' ? 'russian' : 'uzbek', enableAllProjectMcpServers: true };
    writeIfChanged(settingsPath, JSON.stringify(merged, null, 2) + '\n');
  } catch (e) { noteError('prepareWorkspace', e); }
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (folder) return true;
  vscode.window.setStatusBarMessage(t('workspace_opening'), 5000);
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(WORKSPACE_DIR), { forceNewWindow: false });
  return false; // the window reloads with the folder; activate() runs again
}

/** What the app's Desktop section shows, sent after every change. */
let updating = '';
function claudeVersion() {
  const ext = vscode.extensions.getExtension('Anthropic.claude-code') || vscode.extensions.getExtension('anthropic.claude-code');
  return ext ? String((ext.packageJSON && ext.packageJSON.version) || '') : '';
}
function pushToApp(msg) { if (appPanel) appPanel.webview.postMessage({ fromMoopiDesktop: true, ...msg }); }
function sendState(context, api) {
  pushToApp({ moopi: 'state', platform: process.platform, arch: process.arch, appVersion: vscode.version,
    extVersion: context.extension.packageJSON.version, claudeVersion: claudeVersion(), claudeState, voice: !!voice.on,
    voiceAway: context.globalState.get('moopi.voiceAway') !== false, voiceShort: context.globalState.get('moopi.voiceShort') !== false,
    assistantVoice: context.globalState.get('moopi.assistantVoice') !== false, brain: !!brain.binary(),
    launchAtLogin: !!context.globalState.get('moopi.launchAtLogin'), hotkey: String(context.globalState.get('moopi.hotkey') || ''),
    dictation: (platform.MAC || platform.WIN) ? dictation.state : 'unsupported', lastDictation: dictation.last,
    assistant: assistant.current(), updating });
}
async function desktopAction(context, api, action, value) {
  const ctx = assistantContext(context, api);
  if (action === 'voice') setVoice(context, !!value);
  else if (action === 'voiceAway') await context.globalState.update('moopi.voiceAway', !!value);
  else if (action === 'voiceShort') await context.globalState.update('moopi.voiceShort', !!value);
  else if (action === 'assistantVoice') await context.globalState.update('moopi.assistantVoice', !!value);
  else if (action === 'dictate') await toggleDictation(context, api);
  else if (action === 'talk') await assistant.talk(ctx);
  else if (action === 'assistant') assistant.open(ctx);
  else if (action === 'askScreen') await assistant.askScreen(ctx);
  else if (action === 'askClipboard') await assistant.askClipboard(ctx);
  else if (action === 'installClaude') { if (await ensureClaude(context, api)) await openClaude(); }
  else if (action === 'launchAtLogin') {
    await context.globalState.update('moopi.launchAtLogin', !!value);
    await applyStartup(context, api);
    vscode.window.showInformationMessage(t(value ? 'launch_on' : 'launch_off'));
  } else if (action === 'hotkey') {
    const k = String(value || '').trim();
    if (k && !/^((ctrl|alt|shift)\+){1,3}[a-z0-9]$/i.test(k)) vscode.window.showWarningMessage(t('hotkey_bad'));
    else {
      await context.globalState.update('moopi.hotkey', k);
      await applyStartup(context, api);
      vscode.window.showInformationMessage(k ? t('hotkey_set').replace('{k}', k) : t('hotkey_cleared'));
    }
  } else if (action === 'sendLogs') await sendLogs(context, api, 'user', false);
  sendState(context, api);
}

/** What the assistant and the brain need from the window: strings, the API, the log, Claude's panel. */
function assistantContext(context, api) {
  return {
    context, api, t, lang, noteError, openClaude,
    reportError: (where, e) => reportError(context, api, where, e),
    sendState: () => sendState(context, api),
    assistantVoice: () => context.globalState.get('moopi.assistantVoice') !== false,
  };
}

/** moopi://moopi.moopi-desktop/signin?code=… — the system browser hands the session over after Google
 *  (the server's one-time code, traded for a token here); ?error=… says why it did not. */
function registerUri(context, api) {
  context.subscriptions.push(vscode.window.registerUriHandler({
    handleUri: async (uri) => {
      try {
        const params = new URLSearchParams(uri.query);
        if (uri.path !== '/signin') return;
        if (params.get('error')) { vscode.window.showWarningMessage(t('signin_failed').replace('{e}', params.get('error'))); return; }
        const code = params.get('code'); if (!code) return;
        const r = await api.post('/auth/desktop/exchange', { code });
        const token = r && r.token; if (!token) throw new Error('no token');
        api.token = token; await context.secrets.store('moopi.token', token);
        try { api.me = await api.get('/auth/me'); } catch (e) {}
        api.emit();
        pushToApp({ moopi: 'token', token });
        if (appPanel) appPanel.reveal(vscode.ViewColumn.One, false);
        vscode.window.showInformationMessage(t('signed_in_google'));
      } catch (e) {
        reportError(context, api, 'uri', e);
        vscode.window.showWarningMessage(t('signin_failed').replace('{e}', String((e && e.message) || e)));
      }
    },
  }));
}

/** The extension updates itself from GitHub releases (moopi.moopi-desktop-<version>.vsix): a newer release
 *  is installed over the built-in copy and the window offers a reload — fixes reach people in minutes, no
 *  new Desktop build. Checked 20 s after start and every 6 hours; "MOOPI: Yangilanishni tekshirish" at will. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
async function checkUpdate(context, api, manual) {
  const conf = vscode.workspace.getConfiguration('moopi');
  if (!manual && !conf.get('autoUpdate', true)) return;
  const current = context.extension.packageJSON.version;
  const repo = conf.get('updateRepo', 'mnekboyev99-1/moopi-desktop');
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'moopi-desktop' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json();
    const tag = String(rel.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(tag)) throw new Error('tag ' + rel.tag_name);
    if (compareVersions(tag, current) <= 0) { if (manual) vscode.window.showInformationMessage(t('up_to_date').replace('{v}', current)); return; }
    const asset = (rel.assets || []).find((a) => a.name === `moopi.moopi-desktop-${tag}.vsix`);
    if (!asset) throw new Error('no vsix for ' + tag);
    updating = t('updating').replace('{v}', tag); sendState(context, api);
    const file = path.join(require('os').tmpdir(), `moopi.moopi-desktop-${tag}.vsix`);
    const dl = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'moopi-desktop' } });
    if (!dl.ok) throw new Error('HTTP ' + dl.status);
    fs.writeFileSync(file, Buffer.from(await dl.arrayBuffer()));
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file));
    try { fs.unlinkSync(file); } catch (e) {}
    updating = t('updated').replace('{v}', tag); sendState(context, api);
    const pick = await vscode.window.showInformationMessage(t('update_ready').replace('{v}', tag), t('reload'), t('later'));
    if (pick === t('reload')) await vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (e) {
    updating = ''; sendState(context, api); noteError('checkUpdate', e);
    if (manual) vscode.window.showWarningMessage(t('update_failed') + ': ' + ((e && e.message) || e));
  }
}

/** "Gapirib yozish": the microphone (macOS: MOOPI's own recorder; Windows: the system's MCI through PowerShell —
 *  nothing to install), MOOPI's speech-to-text (ElevenLabs, Uzbek and Russian), the text onto the clipboard and
 *  Claude's input focused — one Ctrl+V. Tap to start, tap again to stop; two minutes at most. */
const dictation = { state: 'idle', rec: null, last: '', timer: null };
async function transcribeFile(api, file) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)], { type: file.endsWith('.wav') ? 'audio/wav' : 'audio/mp4' }), path.basename(file));
  const r = await fetch(`${api.base}/voice/transcribe`, { method: 'POST', headers: { Authorization: 'Bearer ' + api.token }, body: form });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return String((((await r.json()) || {}).text) || '').trim();
}
async function toggleDictation(context, api) {
  if (!platform.MAC && !platform.WIN) { vscode.window.showInformationMessage(t('dictate_unsupported')); return; }
  if (!api.token) { vscode.window.showWarningMessage(t('signin')); return; }
  if (dictation.state === 'recording') return finishDictation(context, api);
  if (dictation.state !== 'idle') return;
  try {
    dictation.rec = platform.startRecording(context.extensionPath, 120);
    dictation.state = 'recording'; sendState(context, api);
    vscode.window.setStatusBarMessage(t('dictate_recording'), 8000);
    dictation.timer = setTimeout(() => finishDictation(context, api).catch(() => {}), 121000);
  } catch (e) { dictation.state = 'idle'; reportError(context, api, 'dictate', e); vscode.window.showWarningMessage(t('dictate_failed') + ': ' + ((e && e.message) || e)); }
}
async function finishDictation(context, api) {
  const rec = dictation.rec; if (!rec) return;
  clearTimeout(dictation.timer); dictation.rec = null;
  dictation.state = 'working'; sendState(context, api);
  try {
    const { file } = await rec.stop();
    const text = await transcribeFile(api, file);
    try { fs.unlinkSync(file); } catch (e) {}
    if (!text) throw new Error('empty transcript');
    dictation.last = text.slice(0, 300);
    await vscode.env.clipboard.writeText(text);
    await openClaude();
    try { await vscode.commands.executeCommand('claude-vscode.focus'); } catch (e) {}
    vscode.window.showInformationMessage(t('dictate_copied'));
  } catch (e) {
    reportError(context, api, 'dictate', e);
    vscode.window.showWarningMessage(t('dictate_failed') + ': ' + ((e && e.message) || e));
  } finally { dictation.state = 'idle'; sendState(context, api); }
}

/** Start with the computer: a shortcut in Windows' Startup folder (its hotkey opens MOOPI Desktop from
 *  anywhere — a Windows shortcut feature; without start-up the shortcut sits in the Start menu instead), a
 *  LaunchAgent on the Mac. */
function psQuote(v) { return "'" + String(v).replace(/'/g, "''") + "'"; }
function execPowershell(script) {
  return new Promise((resolve, reject) => {
    require('child_process').execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }, (e, out, errText) => e ? reject(new Error(String(errText || e.message).slice(0, 300))) : resolve(out));
  });
}
async function applyStartup(context, api) {
  const on = !!context.globalState.get('moopi.launchAtLogin');
  const hotkey = String(context.globalState.get('moopi.hotkey') || '');
  try {
    if (process.platform === 'win32') {
      const menu = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      const startup = path.join(menu, 'Startup', 'MOOPI Desktop.lnk'), programs = path.join(menu, 'MOOPI Desktop (tezkor).lnk');
      const target = on ? startup : (hotkey ? programs : '');
      await execPowershell(`$w = New-Object -ComObject WScript.Shell
foreach ($p in @(${psQuote(startup)}, ${psQuote(programs)})) { if (Test-Path $p) { Remove-Item $p -Force } }
if (${psQuote(target)} -ne '') { $s = $w.CreateShortcut(${psQuote(target)}); $s.TargetPath = ${psQuote(process.execPath)}; $s.WorkingDirectory = ${psQuote(path.dirname(process.execPath))}; if (${psQuote(hotkey)} -ne '') { $s.Hotkey = ${psQuote(hotkey)} }; $s.Save() }`);
    } else if (process.platform === 'darwin') {
      const plist = path.join(require('os').homedir(), 'Library', 'LaunchAgents', 'uz.moopi.desktop.plist');
      const cp = require('child_process');
      if (!on) { try { cp.execFileSync('launchctl', ['unload', plist]); } catch (e) {} try { fs.unlinkSync(plist); } catch (e) {} return; }
      const i = process.execPath.indexOf('.app/'); if (i < 0) return;
      const app = process.execPath.slice(0, i + 4);
      fs.mkdirSync(path.dirname(plist), { recursive: true });
      fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>uz.moopi.desktop</string>
<key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-a</string><string>${app}</string></array>
<key>RunAtLoad</key><true/></dict></plist>
`);
      try { cp.execFileSync('launchctl', ['load', plist]); } catch (e) {}
    }
  } catch (e) { reportError(context, api, 'startup', e); }
}

/** This installation reports itself to MOOPI (which versions, where; an error when one happens): the owner's
 *  Platforma page. At most once in 10 minutes without an error. */
let pingedAt = 0;
function clientId(context) {
  let id = context.globalState.get('moopi.clientId');
  if (!id) { id = require('crypto').randomBytes(12).toString('hex'); context.globalState.update('moopi.clientId', id); }
  return id;
}
async function ping(context, api, error) {
  if (!api.token) return;
  if (!error && Date.now() - pingedAt < 600000) return;
  pingedAt = Date.now();
  try {
    await api.post('/desktop/ping', { client_id: clientId(context), platform: process.platform, arch: process.arch, app_version: vscode.version,
      extension_version: context.extension.packageJSON.version, claude_version: claudeVersion(), error: error ? String(error).slice(0, 2000) : null });
  } catch (e) { noteError('ping', e); }
}

/** Every conversation in Claude's panel is MOOPI's too (owner's rule, 05.11.2026: nothing said in the
 *  app is lost, yesterday's work is known tomorrow). The extension follows Claude Code's transcript files
 *  (the unmodified binary writes them) and sends each new turn — the person's words and Claude's answers,
 *  never tool traffic — to MOOPI, where it is a conversation like the app's own: on the phone, summed up
 *  and learned from by the background passes. A file's offset is kept and moved only after MOOPI took the
 *  batch (a batch sent twice is recognised there by the turns' ids), so a failed send is simply sent again. */
const transcripts = { pending: new Set(), timer: null, busy: false };
function parseTurn(line) {
  let d; try { d = JSON.parse(line); } catch (e) { return null; }
  if ((d.type !== 'user' && d.type !== 'assistant') || d.isSidechain || d.isMeta || !d.uuid) return null;
  const c = d.message && d.message.content;
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) text = c.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  text = text.trim();
  if (!text || /^<(command-name|command-message|local-command|system-reminder|bash-input|bash-stdout|bash-stderr)/.test(text)) return null;
  return { id: String(d.uuid).slice(0, 64), role: d.type, text: text.slice(0, 40000), at: d.timestamp || null };
}
function syncTranscript(context, api, file) {
  transcripts.pending.add(file);
  clearTimeout(transcripts.timer);
  transcripts.timer = setTimeout(() => flushTranscripts(context, api).catch((e) => noteError('transcripts', e)), 3000);
}
async function flushTranscripts(context, api) {
  if (transcripts.busy || !api.token) return;
  transcripts.busy = true;
  try {
    const offsets = { ...(context.globalState.get('moopi.transcriptOffsets') || {}) };
    for (const file of [...transcripts.pending]) {
      transcripts.pending.delete(file);
      let st; try { st = fs.statSync(file); } catch (e) { continue; }
      let from = offsets[file] || 0; if (from > st.size) from = 0; // the file was replaced: from the start
      if (st.size <= from) continue;
      const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(st.size - from);
      fs.readSync(fd, buf, 0, buf.length, from); fs.closeSync(fd);
      const text = buf.toString('utf8'); const cut = text.lastIndexOf('\n');
      if (cut < 0) continue; // an unfinished line: next time
      const turns = text.slice(0, cut).split('\n').map(parseTurn).filter(Boolean);
      const session = path.basename(file, '.jsonl');
      let ok = true;
      for (let i = 0; i < turns.length && ok; i += 200) {
        try { await api.post('/desktop/transcript', { session, messages: turns.slice(i, i + 200) }); }
        catch (e) { ok = false; noteError('transcript', e); }
      }
      if (ok) offsets[file] = from + Buffer.byteLength(text.slice(0, cut + 1));
    }
    const keys = Object.keys(offsets); if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete offsets[k];
    await context.globalState.update('moopi.transcriptOffsets', offsets);
  } finally { transcripts.busy = false; }
}
/** Everything in the transcript folder, now and every 10 minutes: what the watcher missed, what was said
 *  while MOOPI was unreachable, and a fresh installation's history. */
function sweepTranscripts(context, api) {
  const dir = transcriptDir(); if (!dir || !api.token) return;
  let names = []; try { names = fs.readdirSync(dir); } catch (e) { return; }
  for (const name of names) if (name.endsWith('.jsonl')) transcripts.pending.add(path.join(dir, name));
  if (transcripts.pending.size) syncTranscript(context, api, [...transcripts.pending][0]);
}

function activate(context) {
  const api = new Api(context);
  panels = ['bugun', 'tasdiqlar', 'fayllar'].map((id) => new Panel(id, api, context));
  for (const p of panels) context.subscriptions.push(vscode.window.registerWebviewViewProvider('moopi.' + p.id, p, { webviewOptions: { retainContextWhenHidden: true } }));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'moopi.signIn';
  context.subscriptions.push(status);
  const showStatus = () => { status.text = api.me ? `$(account) MOOPI · ${api.me.name || api.me.email || ''}` : '$(account) MOOPI'; status.show(); };
  context.subscriptions.push(api.onChange(() => { showStatus(); refreshAll(); }));
  context.subscriptions.push(
    vscode.commands.registerCommand('moopi.signIn', () => vscode.commands.executeCommand('moopi.bugun.focus')),
    vscode.commands.registerCommand('moopi.signOut', async () => { await api.signOut(); vscode.window.showInformationMessage(t('signed_out')); }),
    vscode.commands.registerCommand('moopi.refresh', () => refreshAll()),
    vscode.commands.registerCommand('moopi.openClaude', () => openClaude()),
    vscode.commands.registerCommand('moopi.sendLogs', () => sendLogs(context, api, 'user', false)),
    vscode.commands.registerCommand('moopi.voiceToggle', () => setVoice(context, !voice.on)),
    vscode.commands.registerCommand('moopi.dictate', () => toggleDictation(context, api)),
    vscode.commands.registerCommand('moopi.checkUpdate', () => checkUpdate(context, api, true)),
    vscode.commands.registerCommand('moopi.talk', () => assistant.talk(assistantContext(context, api))),
    vscode.commands.registerCommand('moopi.assistant', () => assistant.open(assistantContext(context, api))),
    vscode.commands.registerCommand('moopi.askScreen', () => assistant.askScreen(assistantContext(context, api))),
    vscode.commands.registerCommand('moopi.askClipboard', () => assistant.askClipboard(assistantContext(context, api))),
  );
  registerUri(context, api);
  // Answers read aloud unless switched off (owner's rule 05.11: everything on; the app's Desktop section has the switch).
  voice.on = context.globalState.get('moopi.voice') === undefined ? true : !!context.globalState.get('moopi.voice');
  voice.api = api;
  startVoiceWatch(context, api);
  // Once, after the first sign-in: the three things to know, and whether answers should be read aloud.
  context.subscriptions.push(api.onChange(async () => {
    if (!api.token || context.globalState.get('moopi.welcomed')) return;
    await context.globalState.update('moopi.welcomed', true);
    vscode.window.showInformationMessage(t('tips'), t('ok'));
    const pick = await vscode.window.showInformationMessage(t('voice_ask'), t('yes'), t('no'));
    if (pick === t('yes')) setVoice(context, true);
  }));
  process.on('unhandledRejection', (e) => reportError(context, api, 'unhandledRejection', e));
  context.subscriptions.push(vscode.commands.registerCommand('moopi.openApp', () => openApp(context, api)));
  context.subscriptions.push(vscode.commands.registerCommand('moopi.reloadApp', () => { if (appPanel) appPanel.webview.postMessage({ reload: true }); else openApp(context, api); }));
  (async () => {
    await api.load(); showStatus();
    await applyLayout(context);
    if (!(await prepareWorkspace(context, api))) return; // the window reloads with ~/MOOPI open
    try { await vscode.commands.executeCommand('workbench.action.closeSidebar'); } catch (e) {}
    openApp(context, api);
    ping(context, api).catch(() => {});
    context.subscriptions.push(api.onChange(() => { if (api.token) { pingedAt = 0; ping(context, api).catch(() => {}); } }));
    setTimeout(() => checkUpdate(context, api, false), 20000);
    const updates = setInterval(() => checkUpdate(context, api, false), 6 * 3600 * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(updates) });
    try { await vscode.commands.executeCommand('workbench.action.lockEditorGroup'); } catch (e) {}
    setTimeout(async () => { if (await ensureClaude(context, api)) { await openClaude(); appPanel && appPanel.reveal(vscode.ViewColumn.One, true); } }, 2500);
  })();
  // Refresh the panels now and then while the window is open; watch MOOPI for new approvals and notes.
  const timer = setInterval(() => { if (api.token) refreshAll(); }, 120000);
  watchTimer = setInterval(() => watchMoopi(context, api), 60000);
  startSync(context, api);
  setTimeout(() => watchMoopi(context, api), 15000);
  setTimeout(() => sweepTranscripts(context, api), 30000);
  const sweeps = setInterval(() => sweepTranscripts(context, api), 600000);
  context.subscriptions.push({ dispose: () => clearInterval(sweeps) }, api.onChange(() => { if (api.token) setTimeout(() => sweepTranscripts(context, api), 8000); }));
  context.subscriptions.push({ dispose: () => { clearInterval(timer); clearInterval(watchTimer); } });
}
function deactivate() {}
module.exports = { activate, deactivate };
