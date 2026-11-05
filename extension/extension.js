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
        claude: 'Claude bilan suhbat', no_claude: 'Claude Code kengaytmasi topilmadi.', signin_elsewhere: 'Kirish \u2014 "Bugun" panelida.',
        file_ready: 'Fayl Claude uchun tayyor: {m} \u2014 yozish maydoniga qo\u2018ying (Cmd+V / Ctrl+V).', go_claude: 'Claude\u2019ga o\u2018tish', file_failed: 'Faylni olib bo\u2018lmadi', approvals_waiting: '{n} ta tasdiq kutmoqda', open_approvals: 'Tasdiqlarni ochish',
        send_logs: 'Xatoni yuborish', logs_sent: 'Jurnal MOOPI\u2019ga yuborildi, rahmat.', logs_failed: 'Jurnalni yuborib bo\u2018lmadi', installing_claude: 'Claude Code o\u2018rnatilmoqda\u2026', claude_installed: 'Claude Code o\u2018rnatildi.' },
  ru: { signin: 'Войдите в аккаунт MOOPI', email: 'Email', code: '6-значный код', send_code: 'Отправить код', enter: 'Войти',
        tg_hint: 'Отправьте боту @moopiai свой номер и введите код.', tg: 'Через Telegram', mail: 'По email',
        code_sent: 'Код отправлен. Проверьте «Спам».', failed: 'Не удалось войти', empty: 'Пока пусто',
        approve: 'Одобрить', reject: 'Отклонить', open: 'Открыть', overdue: 'просрочено', today_tasks: 'Дела на сегодня',
        briefing: 'Утренний брифинг', recent: 'Недавние разговоры', loading: 'Загрузка…', signed_out: 'Вы вышли', hello: 'Привет',
        claude: 'Разговор с Claude', no_claude: 'Расширение Claude Code не найдено.', signin_elsewhere: '\u0412\u0445\u043e\u0434 \u2014 \u0432 \u043f\u0430\u043d\u0435\u043b\u0438 \u00ab\u0411\u0443\u0433\u0443\u043d\u00bb.',
        file_ready: '\u0424\u0430\u0439\u043b \u0433\u043e\u0442\u043e\u0432 \u0434\u043b\u044f Claude: {m} \u2014 \u0432\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u0432 \u043f\u043e\u043b\u0435 \u0432\u0432\u043e\u0434\u0430 (Cmd+V / Ctrl+V).', go_claude: '\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a Claude', file_failed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0444\u0430\u0439\u043b', approvals_waiting: '{n} \u0437\u0430\u043f\u0440\u043e\u0441\u043e\u0432 \u0436\u0434\u0443\u0442 \u043e\u0434\u043e\u0431\u0440\u0435\u043d\u0438\u044f', open_approvals: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043e\u0434\u043e\u0431\u0440\u0435\u043d\u0438\u044f',
        send_logs: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043e\u0442\u0447\u0451\u0442 \u043e\u0431 \u043e\u0448\u0438\u0431\u043a\u0435', logs_sent: '\u0416\u0443\u0440\u043d\u0430\u043b \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d \u0432 MOOPI, \u0441\u043f\u0430\u0441\u0438\u0431\u043e.', logs_failed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0436\u0443\u0440\u043d\u0430\u043b', installing_claude: '\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430 Claude Code\u2026', claude_installed: 'Claude Code \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d.' },
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
  if (e.origin !== ${JSON.stringify(origin)} || !e.data || typeof e.data !== 'object') return;
  if (e.data.reload) { frame.src = home; return; }
  if (e.data.moopi) { clearTimeout(watchdog); vscode.postMessage(e.data); }
});
</script></body></html>`;
  appPanel.webview.onDidReceiveMessage(async (m) => {
    try {
      if (m.moopi === 'ready') { setTimeout(() => openClaude().catch(() => {}), 1500); return; }
      if (m.moopi === 'openClaude') await openClaude();
      else if (m.moopi === 'giveFile') await giveFile(context, api, m.id, m.name);
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
};
async function applyLayout(context) {
  if (context.globalState.get('moopi.layout') === 3) return;
  for (const [k, v] of Object.entries(LAYOUT)) {
    try { await vscode.workspace.getConfiguration().update(k, v, vscode.ConfigurationTarget.Global); } catch (e) {}
  }
  await context.globalState.update('moopi.layout', 3);
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
function reportError(context, api, where, e) {
  noteError(where, e);
  const now = Date.now();
  if (now - logsSentAt > 3600 * 1000) { logsSentAt = now; logsSendCount = 0; }
  if (logsSendCount >= 3) return;
  logsSendCount += 1;
  setTimeout(() => sendLogs(context, api, 'auto:' + where, true), 3000);
}

/** Claude Code, from Open VSX, on the first start (the build ships MOOPI's extension; Claude's is theirs). */
async function ensureClaude(context) {
  if (vscode.extensions.getExtension('Anthropic.claude-code') || vscode.extensions.getExtension('anthropic.claude-code')) return true;
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t('installing_claude') }, async () => {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', 'anthropic.claude-code');
    });
    vscode.window.showInformationMessage(t('claude_installed'));
    return true;
  } catch (e) { noteError('ensureClaude', e); vscode.window.showWarningMessage(t('no_claude') + ' ' + (e.message || '')); return false; }
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
  );
  process.on('unhandledRejection', (e) => reportError(context, api, 'unhandledRejection', e));
  context.subscriptions.push(vscode.commands.registerCommand('moopi.openApp', () => openApp(context, api)));
  context.subscriptions.push(vscode.commands.registerCommand('moopi.reloadApp', () => { if (appPanel) appPanel.webview.postMessage({ reload: true }); else openApp(context, api); }));
  api.load().then(() => showStatus());
  (async () => {
    await applyLayout(context);
    try { await vscode.commands.executeCommand('workbench.action.closeSidebar'); } catch (e) {}
    openApp(context, api);
    try { await vscode.commands.executeCommand('workbench.action.lockEditorGroup'); } catch (e) {}
    setTimeout(async () => { if (await ensureClaude(context)) { await openClaude(); appPanel && appPanel.reveal(vscode.ViewColumn.One, true); } }, 2500);
  })();
  // Refresh the panels now and then while the window is open; watch MOOPI for new approvals and notes.
  const timer = setInterval(() => { if (api.token) refreshAll(); }, 120000);
  watchTimer = setInterval(() => watchMoopi(context, api), 60000);
  setTimeout(() => watchMoopi(context, api), 15000);
  context.subscriptions.push({ dispose: () => { clearInterval(timer); clearInterval(watchTimer); } });
}
function deactivate() {}
module.exports = { activate, deactivate };
