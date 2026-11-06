// The assistant: MOOPI's own window beside Claude's panel — a living light that listens and speaks, the
// conversation mirrored under it, the screen or the clipboard handed over with a tap. It never calls Anthropic
// itself: what the person says is typed into Claude Code's own panel (the clipboard and the system's keystrokes,
// as a dictation program would), the panel makes the request on the person's own sign-in, and the answer is
// read from the panel's transcript and spoken in MOOPI's voice. Behind it: the microphone and the screen
// (platform.js), MOOPI's speech-to-text and voice (the server).
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const platform = require('./platform');

const WORKSPACE_DIR = path.join(os.homedir(), 'MOOPI');
const EXPECT_MS = 5 * 60 * 1000;
const state = { panel: null, listening: null, phase: 'idle', speaking: null, queue: Promise.resolve(), stopSpeech: false, pendingImage: null, expecting: 0, typing: false, autoStop: null };

function say(ctx, key, vars) { let s = ctx.t(key); for (const [k, v] of Object.entries(vars || {})) s = s.replace('{' + k + '}', v); return s; }
function post(msg) { if (state.panel) state.panel.webview.postMessage(msg); }
function phase(p, caption) { state.phase = p; post({ kind: 'state', state: p, caption: caption || '' }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function open(ctx, reveal) {
  if (state.panel) { if (reveal !== false) state.panel.reveal(vscode.ViewColumn.Two, true); return state.panel; }
  const media = vscode.Uri.joinPath(ctx.context.extensionUri, 'media');
  state.panel = vscode.window.createWebviewPanel('moopi.assistant', 'MOOPI', { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media, vscode.Uri.file(WORKSPACE_DIR)] });
  state.panel.iconPath = vscode.Uri.joinPath(media, 'moopi.svg');
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const mark = state.panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'moopi.svg'));
  const js = state.panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'assistant.js'));
  const css = state.panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'assistant.css'));
  state.panel.webview.html = `<!doctype html><html lang="${ctx.lang()}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${state.panel.webview.cspSource} data:; style-src ${state.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head><body><div id="root" data-mark="${mark}"></div><script nonce="${nonce}" src="${js}"></script></body></html>`;
  state.panel.webview.onDidReceiveMessage((m) => onMessage(ctx, m).catch((e) => { ctx.reportError('assistant:' + m.kind, e); post({ kind: 'error', text: String((e && e.message) || e) }); }));
  state.panel.onDidDispose(() => { state.panel = null; stopSpeaking(); if (state.listening) state.listening.cancel(); state.listening = null; });
  post({ kind: 'init', t: strings(ctx), state: state.phase, brain: ctx.claudeReady() });
  return state.panel;
}
function strings(ctx) {
  const keys = ['as_ready', 'as_listening', 'as_thinking', 'as_speaking', 'as_tap_talk', 'as_tap_stop', 'as_type', 'as_send', 'as_screen', 'as_clip',
    'as_to_claude', 'as_stop', 'as_new', 'as_you', 'as_moopi', 'as_no_brain', 'as_tool', 'as_image', 'as_hint', 'as_sent_claude', 'as_nothing_heard',
    'as_need_mic', 'as_need_screen', 'as_too_short', 'as_open_window'];
  const out = {}; for (const k of keys) out[k] = ctx.t(k); return out;
}

async function onMessage(ctx, m) {
  if (m.kind === 'ready') post({ kind: 'init', t: strings(ctx), state: state.phase, brain: ctx.claudeReady() });
  else if (m.kind === 'talk') await talk(ctx);
  else if (m.kind === 'ask') await askText(ctx, String(m.text || '').trim());
  else if (m.kind === 'screen') await askScreen(ctx);
  else if (m.kind === 'clip') await askClipboard(ctx);
  else if (m.kind === 'stop') { stopSpeaking(); state.expecting = 0; phase('idle'); }
  else if (m.kind === 'new') { state.pendingImage = null; state.expecting = 0; post({ kind: 'clear' }); phase('idle'); try { await vscode.commands.executeCommand('claude-vscode.newConversation'); } catch (e) {} }
  else if (m.kind === 'toClaude') await sendToClaude(ctx, m);
  else if (m.kind === 'close') { if (state.panel) state.panel.dispose(); }
}

// ---------- the microphone: tap, speak, tap ----------
async function talk(ctx) {
  open(ctx, false);
  if (state.listening) { await finishListening(ctx); return; }
  if (state.typing) return;
  stopSpeaking();
  if (!ctx.api.token) { post({ kind: 'error', text: ctx.t('signin') }); return; }
  try {
    state.listening = platform.startRecording(ctx.context.extensionPath, 120);
    phase('listening', ctx.t('as_listening'));
    ctx.sendState();
    state.autoStop = setTimeout(() => finishListening(ctx).catch(() => {}), 121000);
  } catch (e) { state.listening = null; phase('idle'); ctx.reportError('talk', e); post({ kind: 'error', text: ctx.t('dictate_failed') + ': ' + (e.message || e) }); }
}
async function finishListening(ctx) {
  const rec = state.listening; if (!rec) return;
  state.listening = null; clearTimeout(state.autoStop);
  phase('thinking', ctx.t('as_thinking'));
  ctx.sendState();
  let text = '', seconds = 0;
  try {
    const got = await rec.stop(); seconds = got.seconds || 0;
    text = await transcribe(ctx, got.file);
    try { fs.unlinkSync(got.file); } catch (e) {}
  } catch (e) {
    phase('idle'); ctx.reportError('listen', e);
    if (e && e.code === 'mic') { post({ kind: 'error', text: ctx.t('as_need_mic') }); platform.openPrivacy('mic'); }
    else post({ kind: 'error', text: ctx.t('as_nothing_heard') });
    return;
  }
  if (!text) { phase('idle'); ctx.noteError('listen', 'empty transcript after ' + seconds + ' s'); post({ kind: 'error', text: seconds < 1 ? ctx.t('as_too_short') : ctx.t('as_nothing_heard') }); return; }
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
  open(ctx, false);
  if (!text) return;
  if (!ctx.claudeReady()) { post({ kind: 'error', text: ctx.t('as_no_brain') }); return; }
  const image = state.pendingImage; state.pendingImage = null;
  post({ kind: 'you', text, image: image ? state.panel.webview.asWebviewUri(vscode.Uri.file(image)).toString() : null });
  await typeToPanel(ctx, text, image);
}
/** Types [text] (and a picture before it) into Claude's panel and presses Enter. */
async function typeToPanel(ctx, text, image) {
  if (state.typing) { post({ kind: 'error', text: ctx.t('quick_busy') }); return false; }
  state.typing = true;
  stopSpeaking();
  phase('thinking', ctx.t('as_thinking'));
  ctx.sendState();
  try {
    await ctx.openClaude();
    try { await vscode.commands.executeCommand('claude-vscode.focus'); } catch (e) {}
    await wait(400);
    if (image) { await platform.copyImage(image); await platform.pasteAndEnter(false); await wait(600); }
    await vscode.env.clipboard.writeText(text);
    await platform.pasteAndEnter(true);
    state.expecting = Date.now();
    return true;
  } catch (e) {
    phase('idle'); ctx.reportError('type', e);
    if (e && e.code === 'ax') { post({ kind: 'error', text: ctx.t('as_need_ax') }); platform.openAccessibility(); }
    else post({ kind: 'error', text: ctx.t('as_failed') });
    return false;
  } finally { state.typing = false; ctx.sendState(); }
}
/** A new turn in the panel's transcript (extension.js watches it): mirrored here; an answer we were waiting
 *  for is spoken. Returns true when it spoke, so the plain read-aloud does not speak it a second time. */
function onTranscript(ctx, turn) {
  const expecting = state.expecting && Date.now() - state.expecting < EXPECT_MS;
  if (turn.role === 'user') { if (state.panel && !expecting) post({ kind: 'you', text: turn.text }); return false; }
  if (!state.panel && !expecting) return false;
  post({ kind: 'moopi', text: turn.text, append: true });
  post({ kind: 'moopi', text: '', final: true });
  if (expecting) { speak(ctx, turn.text); return true; }
  return false;
}

// ---------- the screen and the clipboard ----------
async function askScreen(ctx) {
  open(ctx, false);
  try {
    const file = await platform.screenshot(path.join(WORKSPACE_DIR, 'fayllar'));
    if (!file) return;
    state.pendingImage = file;
    post({ kind: 'image', uri: state.panel.webview.asWebviewUri(vscode.Uri.file(file)).toString(), text: ctx.t('as_image') });
    state.panel.reveal(vscode.ViewColumn.Two, false);
  } catch (e) {
    ctx.reportError('screen', e);
    if (e && e.code === 'screen') { post({ kind: 'error', text: ctx.t('as_need_screen') }); platform.openPrivacy('screen'); }
    else post({ kind: 'error', text: ctx.t('shot_cancelled') });
  }
}
async function askClipboard(ctx) {
  open(ctx, false);
  try {
    const file = await platform.clipboardImage(path.join(WORKSPACE_DIR, 'fayllar'));
    if (file) {
      state.pendingImage = file;
      post({ kind: 'image', uri: state.panel.webview.asWebviewUri(vscode.Uri.file(file)).toString(), text: ctx.t('as_image') });
    } else {
      const text = (await vscode.env.clipboard.readText()).trim();
      if (text) post({ kind: 'prefill', text: text.slice(0, 4000) });
    }
    state.panel.reveal(vscode.ViewColumn.Two, false);
  } catch (e) { ctx.reportError('clip', e); post({ kind: 'error', text: String((e && e.message) || e) }); }
}
/** The last answer, or the attached picture, onto the clipboard with Claude's panel focused: one paste. */
async function sendToClaude(ctx, m) {
  if (m.file || state.pendingImage) await platform.copyImage(m.file || state.pendingImage);
  else if (m.text) await vscode.env.clipboard.writeText(String(m.text));
  await ctx.openClaude();
  try { await vscode.commands.executeCommand('claude-vscode.focus'); } catch (e) {}
  vscode.window.showInformationMessage(ctx.t('as_sent_claude'));
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
  for (const piece of sentences(text).slice(0, 12)) {
    state.queue = state.queue.then(async () => {
      if (state.stopSpeech) return;
      try {
        const r = await fetch(`${ctx.api.base}/voice/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ctx.api.token }, body: JSON.stringify({ text: piece }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const file = path.join(os.tmpdir(), `moopi-say-${Date.now()}.mp3`);
        fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        if (state.stopSpeech) { try { fs.unlinkSync(file); } catch (e) {} return; }
        phase('speaking', ctx.t('as_speaking'));
        state.speaking = platform.play(file);
        await state.speaking.done;
        state.speaking = null;
        try { fs.unlinkSync(file); } catch (e) {}
      } catch (e) { ctx.noteError('say', e); }
    });
  }
  state.queue = state.queue.then(() => { if (state.phase === 'speaking') phase('idle'); });
}
function stopSpeaking() {
  state.stopSpeech = true;
  if (state.speaking) { state.speaking.stop(); state.speaking = null; }
  state.queue = Promise.resolve();
  if (state.phase === 'speaking') phase('idle');
}

/** A line from a background job (a watched folder, the briefing): into the window and, when final, the voice. */
function report(ctx, kind, text, tool, final, asUser) {
  if (tool) post({ kind: 'tool', text: say(ctx, 'as_tool', { t: tool }) });
  if (text && asUser) { post({ kind: 'you', text }); return; }
  if (text) {
    post({ kind: 'moopi', text, append: true });
    if (final) { post({ kind: 'moopi', text: '', final: true }); speak(ctx, text); }
  }
}

function listening() { return !!state.listening; }
function current() { return state.phase; }
function expecting() { return !!state.expecting && Date.now() - state.expecting < EXPECT_MS; }
module.exports = { open, talk, askText, typeToPanel, onTranscript, askScreen, askClipboard, stopSpeaking, sendToClaude, listening, current, expecting, report };
