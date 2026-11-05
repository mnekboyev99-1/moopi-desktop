// MOOPI Desktop: the MOOPI shell around the official Claude Code extension. Signs in to MOOPI (its own
// API, the same ways as the app), shows Bugun / Tasdiqlar / Fayllar as sidebar panels, opens Claude in the
// editor area at startup. Nothing here touches Claude's own sign-in or the Claude Code extension.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const T = {
  uz: { signin: 'MOOPI hisobingiz bilan kiring', email: 'Email', code: '6 xonali kod', send_code: 'Kod yuborish', enter: 'Kirish',
        tg_hint: "@moopiai botida raqamingizni yuboring va kelgan 6 xonali kodni shu yerga yozing.", tg: 'Telegram orqali', mail: 'Email orqali',
        code_sent: 'Kod yuborildi. Kelmasa, Spam papkasini tekshiring.', failed: 'Kirib bo‘lmadi', empty: 'Hozircha bo‘sh',
        approve: 'Tasdiqlash', reject: 'Rad etish', open: 'Ochish', overdue: 'muddati o‘tgan', today_tasks: 'Bugungi ishlar',
        briefing: 'Ertalabki brifing', recent: 'Oxirgi suhbatlar', loading: 'Yuklanmoqda…', signed_out: 'Chiqdingiz', hello: 'Salom',
        claude: 'Claude bilan suhbat', no_claude: 'Claude Code kengaytmasi topilmadi.' },
  ru: { signin: 'Войдите в аккаунт MOOPI', email: 'Email', code: '6-значный код', send_code: 'Отправить код', enter: 'Войти',
        tg_hint: 'Отправьте боту @moopiai свой номер и введите код.', tg: 'Через Telegram', mail: 'По email',
        code_sent: 'Код отправлен. Проверьте «Спам».', failed: 'Не удалось войти', empty: 'Пока пусто',
        approve: 'Одобрить', reject: 'Отклонить', open: 'Открыть', overdue: 'просрочено', today_tasks: 'Дела на сегодня',
        briefing: 'Утренний брифинг', recent: 'Недавние разговоры', loading: 'Загрузка…', signed_out: 'Вы вышли', hello: 'Привет',
        claude: 'Разговор с Claude', no_claude: 'Расширение Claude Code не найдено.' },
};
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
    if (!this.api.token) { this.send({ kind: 'signin', t: this.strings() }); return; }
    this.send({ kind: 'loading', t: this.strings() });
    try {
      this.data = await this.fetch();
      this.send({ kind: 'data', panel: this.id, data: this.data, me: this.api.me, t: this.strings() });
    } catch (e) {
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
    } catch (e) {
      this.send({ kind: 'error', message: String(e.message || e), t: this.strings() });
    }
  }
}

let panels = [];
async function refreshAll() { for (const p of panels) await p.refresh(); }

/** Claude Code's own panel, in the editor area: the chat in the middle of the MOOPI window. */
async function openClaude() {
  const ext = vscode.extensions.getExtension('Anthropic.claude-code') || vscode.extensions.getExtension('anthropic.claude-code');
  if (!ext) { vscode.window.showWarningMessage(t('no_claude')); return; }
  if (!ext.isActive) { try { await ext.activate(); } catch (e) {} }
  const commands = await vscode.commands.getCommands(true);
  for (const c of ['claude-vscode.primaryEditor.open', 'claude-vscode.editor.open', 'claude-vscode.sidebar.open']) {
    if (commands.includes(c)) { try { await vscode.commands.executeCommand(c); return; } catch (e) {} }
  }
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
  );
  api.load().then(() => showStatus());
  // The MOOPI side first, Claude in the middle once the window has settled.
  setTimeout(() => { vscode.commands.executeCommand('moopi.bugun.focus').then(() => {}, () => {}); }, 800);
  setTimeout(() => { openClaude(); }, 2500);
  // Refresh the panels now and then while the window is open.
  const timer = setInterval(() => { if (api.token) refreshAll(); }, 120000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}
function deactivate() {}
module.exports = { activate, deactivate };
