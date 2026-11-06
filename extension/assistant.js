// The assistant: a thin voice bar under Claude Code's own panel (a view in Claude's container) and a light in
// the status bar — never a second chat. It listens, types what was said into Claude's panel (the clipboard and
// the system's keystrokes, as a dictation program would), and reads Claude's answer aloud from the panel's
// transcript. The conversation itself lives only in Claude's panel. It never calls Anthropic itself: the panel
// makes every request on the person's own sign-in. Behind it: the microphone and the screen (platform.js),
// MOOPI's speech-to-text and voice (the server).
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const platform = require('./platform');

const WORKSPACE_DIR = path.join(os.homedir(), 'MOOPI');
const VIEW_ID = 'moopi.yordamchi';
const EXPECT_MS = 5 * 60 * 1000;
const NOTE_MS = 6000;
const state = { view: null, status: null, getCtx: null, listening: null, phase: 'idle', caption: '', speaking: null, queue: Promise.resolve(),
  stopSpeech: false, pendingImage: null, expecting: 0, typing: false, autoStop: null, noteTimer: null, expectTimer: null };

function post(msg) { if (state.view) state.view.webview.postMessage(msg); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Registers the bar (a view in Claude Code's container) and the status bar light. [getCtx] makes the
 *  context the bar works with (extension.js's assistantContext). */
function init(getCtx, context) {
  state.getCtx = getCtx;
  state.status = vscode.window.createStatusBarItem('moopi.assistant', vscode.StatusBarAlignment.Right, 1000);
  state.status.name = 'MOOPI';
  context.subscriptions.push(state.status);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID,
    { resolveWebviewView: (view) => resolve(getCtx(), view) }, { webviewOptions: { retainContextWhenHidden: true } }));
  showStatus(getCtx());
}
function resolve(ctx, view) {
  state.view = view;
  const media = vscode.Uri.joinPath(ctx.context.extensionUri, 'media');
  view.webview.options = { enableScripts: true, localResourceRoots: [media, vscode.Uri.file(WORKSPACE_DIR)] };
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const js = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'assistant.js'));
  const css = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'assistant.css'));
  view.webview.html = `<!doctype html><html lang="${ctx.lang()}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${view.webview.cspSource} data:; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head><body><div id="root"></div><script nonce="${nonce}" src="${js}"></script></body></html>`;
  view.webview.onDidReceiveMessage((m) => onMessage(state.getCtx(), m).catch((e) => { const c = state.getCtx(); c.reportError('assistant:' + m.kind, e); note(c, String((e && e.message) || e)); }));
  view.onDidDispose(() => { if (state.view === view) state.view = null; });
  post({ kind: 'init', t: strings(ctx), state: state.phase, caption: state.caption });
}
function strings(ctx) {
  const keys = ['as_ready', 'as_listening', 'as_thinking', 'as_claude_thinking', 'as_reading', 'as_speaking', 'as_tap_talk', 'as_tap_stop', 'as_type', 'as_send',
    'as_screen', 'as_clip', 'as_usage', 'as_stop', 'as_new', 'as_image', 'as_remove', 'as_answered'];
  const out = {}; for (const k of keys) out[k] = ctx.t(k); return out;
}

async function onMessage(ctx, m) {
  if (m.kind === 'ready') post({ kind: 'init', t: strings(ctx), state: state.phase, caption: state.caption });
  else if (m.kind === 'talk') await talk(ctx);
  else if (m.kind === 'ask') await askText(ctx, String(m.text || '').trim());
  else if (m.kind === 'screen') await askScreen(ctx);
  else if (m.kind === 'clip') await askClipboard(ctx);
  else if (m.kind === 'usage') await usage(ctx);
  else if (m.kind === 'stop') stop(ctx);
  else if (m.kind === 'new') await newConversation(ctx);
  else if (m.kind === 'detach') { state.pendingImage = null; post({ kind: 'detach' }); }
}

/** Brings the bar into sight (without taking the keyboard from Claude's field unless [focus]). */
function open(ctx, focus) {
  if (state.view) { try { state.view.show(!focus); return; } catch (e) {} }
  vscode.commands.executeCommand(VIEW_ID + '.focus').then(undefined, () => {});
}
function stop(ctx) { stopSpeaking(); state.expecting = 0; phase(ctx, 'idle'); }
async function newConversation(ctx) {
  stopSpeaking(); state.pendingImage = null; state.expecting = 0; post({ kind: 'detach' }); phase(ctx, 'idle');
  try { await vscode.commands.executeCommand('claude-vscode.newConversation'); } catch (e) {}
}

// ---------- the state: the bar's line and the status bar light ----------
function phase(ctx, p, caption) {
  state.phase = p; state.caption = caption || '';
  post({ kind: 'state', state: p, caption: state.caption });
  showStatus(ctx);
  vscode.commands.executeCommand('setContext', 'moopi.speaking', p === 'speaking').then(undefined, () => {});
  vscode.commands.executeCommand('setContext', 'moopi.listening', p === 'listening').then(undefined, () => {});
}
function showStatus(ctx, override) {
  const s = state.status; if (!s) return;
  const p = state.phase;
  s.backgroundColor = undefined; s.command = 'moopi.talk';
  if (override) { s.text = '$(warning) ' + override.slice(0, 70); s.tooltip = override; s.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground'); }
  else if (p === 'listening') { s.text = '$(record) ' + ctx.t('as_listening_short'); s.tooltip = ctx.t('as_tap_stop'); s.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground'); }
  else if (p === 'thinking') { s.text = '$(sync~spin) ' + (state.caption || ctx.t('as_claude_thinking')); s.tooltip = state.caption || ctx.t('as_claude_thinking'); }
  else if (p === 'speaking') { s.text = '$(unmute) ' + (state.caption || ctx.t('as_reading')); s.tooltip = ctx.t('as_stop'); s.command = 'moopi.assistantStop'; }
  else { s.text = '$(mic) MOOPI'; s.tooltip = ctx.t('as_tap_talk'); }
  s.show();
}
/** A short line in the bar (red for a problem) and, for a problem, in the status bar for a moment. */
function note(ctx, text, level) {
  post({ kind: 'note', text, level: level || 'error' });
  if ((level || 'error') !== 'error') return;
  clearTimeout(state.noteTimer);
  showStatus(ctx, text);
  state.noteTimer = setTimeout(() => showStatus(ctx), NOTE_MS);
}

// ---------- the microphone: tap, speak, tap ----------
async function talk(ctx) {
  open(ctx, false);
  if (state.listening) { await finishListening(ctx); return; }
  if (state.typing) return;
  stopSpeaking();
  if (!ctx.api.token) { note(ctx, ctx.t('signin')); return; }
  try {
    state.listening = platform.startRecording(ctx.context.extensionPath, 120);
    phase(ctx, 'listening', ctx.t('as_listening'));
    ctx.sendState();
    state.autoStop = setTimeout(() => finishListening(ctx).catch(() => {}), 121000);
  } catch (e) { state.listening = null; phase(ctx, 'idle'); ctx.reportError('talk', e); note(ctx, ctx.t('dictate_failed') + ': ' + (e.message || e)); }
}
async function finishListening(ctx) {
  const rec = state.listening; if (!rec) return;
  state.listening = null; clearTimeout(state.autoStop);
  phase(ctx, 'thinking', ctx.t('as_thinking'));
  ctx.sendState();
  let text = '', seconds = 0;
  try {
    const got = await rec.stop(); seconds = got.seconds || 0;
    text = await transcribe(ctx, got.file);
    try { fs.unlinkSync(got.file); } catch (e) {}
  } catch (e) {
    phase(ctx, 'idle'); ctx.reportError('listen', e);
    if (e && e.code === 'mic') { note(ctx, ctx.t('as_need_mic')); platform.openPrivacy('mic'); }
    else note(ctx, ctx.t('as_nothing_heard'));
    return;
  }
  if (!text) { phase(ctx, 'idle'); ctx.noteError('listen', 'empty transcript after ' + seconds + ' s'); note(ctx, seconds < 1 ? ctx.t('as_too_short') : ctx.t('as_nothing_heard')); return; }
  await askText(ctx, text);
}
async function transcribe(ctx, file) {
  const form = new FormData();
  const name = path.basename(file);
  form.append('file', new Blob([fs.readFileSync(file)], { type: name.endsWith('.wav') ? 'audio/wav' : 'audio/mp4' }), name);
  const r = await fetch(`${ctx.api.base}/voice/transcribe`, { method: 'POST', headers: { Authorization: 'Bearer ' + ctx.api.token }, body: form });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return String((((await r.json()) || {}).text) || '').trim();
}

// ---------- the question goes into Claude's own panel; the answer comes back through its transcript ----------
async function askText(ctx, text) {
  if (!text) return;
  if (!ctx.claudeReady()) { note(ctx, ctx.t('as_no_brain')); return; }
  const image = state.pendingImage; state.pendingImage = null;
  post({ kind: 'detach' });
  await typeToPanel(ctx, text, image);
}
/** Types [text] (and a picture before it) into Claude's panel and presses Enter. */
async function typeToPanel(ctx, text, image) {
  if (state.typing) { note(ctx, ctx.t('quick_busy')); return false; }
  state.typing = true;
  stopSpeaking();
  phase(ctx, 'thinking', ctx.t('as_claude_thinking'));
  ctx.sendState();
  try {
    await ctx.openClaude();
    try { await vscode.commands.executeCommand('claude-vscode.focus'); } catch (e) {}
    await wait(400);
    if (image) { await platform.copyImage(image); await platform.pasteAndEnter(false); await wait(600); }
    await vscode.env.clipboard.writeText(text);
    await platform.pasteAndEnter(true);
    expect(ctx);
    return true;
  } catch (e) {
    phase(ctx, 'idle'); ctx.reportError('type', e);
    if (e && e.code === 'ax') { note(ctx, ctx.t('as_need_ax')); platform.openAccessibility(); }
    else note(ctx, ctx.t('as_failed'));
    return false;
  } finally { state.typing = false; ctx.sendState(); }
}
/** A command of Claude's own (/usage: the account's limits) typed into the panel; no answer is awaited —
 *  Claude shows it in a window of its own. */
async function slash(ctx, command) {
  if (!ctx.claudeReady()) { note(ctx, ctx.t('as_no_brain')); return; }
  if (state.typing) { note(ctx, ctx.t('quick_busy')); return; }
  state.typing = true;
  try {
    await ctx.openClaude();
    try { await vscode.commands.executeCommand('claude-vscode.focus'); } catch (e) {}
    await wait(400);
    await vscode.env.clipboard.writeText(command);
    await platform.pasteAndEnter(true);
    note(ctx, ctx.t('as_usage_sent'), 'info');
  } catch (e) {
    ctx.reportError('slash', e);
    if (e && e.code === 'ax') { note(ctx, ctx.t('as_need_ax')); platform.openAccessibility(); } else note(ctx, ctx.t('as_failed'));
  } finally { state.typing = false; }
}
function usage(ctx) { return slash(ctx, '/usage'); }
/** The answer is awaited for a while; when none comes the light goes back to rest. */
function expect(ctx) {
  state.expecting = Date.now();
  clearTimeout(state.expectTimer);
  state.expectTimer = setTimeout(() => { if (state.phase === 'thinking') phase(ctx, 'idle'); }, EXPECT_MS);
}
/** A new turn in the panel's transcript (extension.js watches it): an answer we were waiting for is spoken.
 *  Returns true when it spoke, so the plain read-aloud does not speak it a second time. */
function onTranscript(ctx, turn) {
  if (turn.role !== 'assistant' || !expecting()) return false;
  if (ctx.assistantVoice() && ctx.api.token) { speak(ctx, turn.text); return true; }
  phase(ctx, 'idle', ctx.t('as_answered'));
  return false;
}

// ---------- the screen and the clipboard ----------
function attach(ctx, file) {
  state.pendingImage = file;
  post({ kind: 'image', uri: state.view ? state.view.webview.asWebviewUri(vscode.Uri.file(file)).toString() : '', text: ctx.t('as_image') });
  open(ctx, true);
}
async function askScreen(ctx) {
  try {
    const file = await platform.screenshot(path.join(WORKSPACE_DIR, 'fayllar'));
    if (file) attach(ctx, file);
  } catch (e) {
    ctx.reportError('screen', e);
    if (e && e.code === 'screen') { note(ctx, ctx.t('as_need_screen')); platform.openPrivacy('screen'); }
    else note(ctx, ctx.t('shot_cancelled'));
  }
}
async function askClipboard(ctx) {
  try {
    const file = await platform.clipboardImage(path.join(WORKSPACE_DIR, 'fayllar'));
    if (file) { attach(ctx, file); return; }
    const text = (await vscode.env.clipboard.readText()).trim();
    if (text) { post({ kind: 'prefill', text: text.slice(0, 4000) }); open(ctx, true); }
    else note(ctx, ctx.t('as_clip_empty'));
  } catch (e) { ctx.reportError('clip', e); note(ctx, String((e && e.message) || e)); }
}

// ---------- the voice: sentence by sentence, through MOOPI's voice, cut short on demand ----------
function sentences(text) {
  const clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?…]+[.!?…]+["»)]?|[^.!?…]+$/g) || [clean];
  const out = []; let cur = '';
  for (const p of parts) { if ((cur + ' ' + p).length > 280 && cur) { out.push(cur.trim()); cur = p; } else cur += ' ' + p; }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s.length > 1);
}
function speak(ctx, text) {
  if (!ctx.assistantVoice() || !ctx.api.token) return;
  state.stopSpeech = false;
  const pieces = sentences(text).slice(0, 12);
  if (!pieces.length) return;
  pieces.forEach((piece, i) => {
    state.queue = state.queue.then(async () => {
      if (state.stopSpeech) return;
      try {
        const r = await fetch(`${ctx.api.base}/voice/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ctx.api.token }, body: JSON.stringify({ text: piece }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const file = path.join(os.tmpdir(), `moopi-say-${Date.now()}.mp3`);
        fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        if (state.stopSpeech) { try { fs.unlinkSync(file); } catch (e) {} return; }
        phase(ctx, 'speaking', pieces.length > 1 ? `${ctx.t('as_reading')} ${i + 1}/${pieces.length}` : ctx.t('as_reading'));
        state.speaking = platform.play(file);
        await state.speaking.done;
        state.speaking = null;
        try { fs.unlinkSync(file); } catch (e) {}
      } catch (e) { ctx.noteError('say', e); }
    });
  });
  state.queue = state.queue.then(() => { if (state.phase === 'speaking') phase(ctx, 'idle'); });
}
function stopSpeaking() {
  state.stopSpeech = true;
  if (state.speaking) { state.speaking.stop(); state.speaking = null; }
  state.queue = Promise.resolve();
  if (state.phase === 'speaking' && state.getCtx) phase(state.getCtx(), 'idle');
}

/** A line from a background job (a quick action, a watched folder, the briefing): the bar shows it; a final
 *  text is read aloud. */
function report(ctx, kind, text, tool, final, asUser) {
  if (text && asUser) { note(ctx, text, 'info'); return; }
  if (text && final) speak(ctx, text);
}

function listening() { return !!state.listening; }
function current() { return state.phase; }
function expecting() { return !!state.expecting && Date.now() - state.expecting < EXPECT_MS; }
module.exports = { init, open, talk, askText, typeToPanel, onTranscript, askScreen, askClipboard, usage, stop, stopSpeaking, newConversation, listening, current, expecting, report };
