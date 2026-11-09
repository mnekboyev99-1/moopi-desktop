// The bootstrap: the only MOOPI piece built into MOOPI Desktop itself. VS Code never updates a built-in
// extension ("not allowed to be updated in the current product quality 'stable'"), so the real MOOPI
// extension must be an ordinary (user) extension — then it updates itself from GitHub. This one installs it
// on the first start, from the copy packaged next to this file (or GitHub's latest release when that copy
// is missing), reloads the window once, and from then on does nothing.
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAIN = 'moopi.moopi-desktop';
const REPO = 'mnekboyev99-1/moopi-desktop';

/** The first start's screen, in MOOPI's colours, while everything is set up behind it. */
function splash(context) {
  const panel = vscode.window.createWebviewPanel('moopi.splash', 'MOOPI', { viewColumn: vscode.ViewColumn.One, preserveFocus: true }, {});
  let logo = '';
  try { logo = fs.readFileSync(path.join(context.extensionPath, 'logo.png')).toString('base64'); } catch (e) {}
  const ru = String(vscode.env.language || '').startsWith('ru');
  panel.webview.html = `<!doctype html><meta charset="utf-8"><style>
html,body{height:100%;margin:0;background:#050F0D;color:#E8FFF7;font-family:"Segoe UI",system-ui,sans-serif}
main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
img{width:190px;animation:b 2.4s ease-in-out infinite}@keyframes b{50%{transform:scale(1.05);filter:brightness(1.25)}}
h1{margin:0;font-size:34px;font-weight:600;letter-spacing:.32em;padding-left:.32em}p{margin:0;color:#9DBDB3;font-size:16px}
.t{width:230px;height:3px;border-radius:2px;background:#123029;overflow:hidden;margin-top:10px}.t i{display:block;width:40%;height:100%;background:#00C8A4;animation:s 1.4s ease-in-out infinite}@keyframes s{from{transform:translateX(-100%)}to{transform:translateX(260%)}}
</style><main><img src="data:image/png;base64,${logo}" alt=""><h1>MOOPI</h1><p>${ru ? 'Подготовка MOOPI…' : 'MOOPI tayyorlanmoqda…'}</p><div class="t"><i></i></div></main>`;
  return panel;
}

/** Written just before the window reloads: changed while it runs, this setting asks for a restart in English. */
function presets(context) {
  try {
    const file = path.join(context.globalStorageUri.fsPath, '..', '..', 'settings.json');
    let now = {};
    try { now = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
    now['security.workspace.trust.enabled'] = false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(now, null, 2));
  } catch (e) {}
}

async function activate(context) {
  if (vscode.extensions.getExtension(MAIN)) return; // installed already: the main extension takes it from here
  if (context.globalState.get('moopi.bootstrapped') === context.extension.packageJSON.version && !context.globalState.get('moopi.bootstrapRetry')) {
    // Installed earlier but not loaded yet (the reload after the install did not happen): one more reload.
    await context.globalState.update('moopi.bootstrapRetry', true);
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
    return;
  }
  // Packaged as .vsixdata (vsce leaves .vsix files out of a package); VS Code wants a .vsix name to install.
  const bundled = path.join(context.extensionPath, 'moopi.moopi-desktop.vsixdata');
  let file = null;
  splash(context);
  try {
    if (fs.existsSync(bundled)) { file = path.join(os.tmpdir(), 'moopi.moopi-desktop-bundled.vsix'); fs.copyFileSync(bundled, file); }
    else file = await download();
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file));
    await context.globalState.update('moopi.bootstrapped', context.extension.packageJSON.version);
    await context.globalState.update('moopi.bootstrapRetry', false);
    presets(context);
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (e) {
    const pick = await vscode.window.showErrorMessage('MOOPI kengaytmasi o‘rnatilmadi: ' + ((e && e.message) || e), 'Qayta urinish');
    if (pick) await activate(context);
  } finally {
    if (file) { try { fs.unlinkSync(file); } catch (e) {} }
  }
}

/** GitHub's latest release of the main extension → a temporary file. The release page's redirect to its tag
 *  and the file's fixed address are not GitHub's API, whose 60 requests an hour for each internet address run out
 *  behind a provider sharing one address (a Desktop in Uzbekistan got "HTTP 403" from it on 08.11.2026); the API
 *  only if the page fails. */
async function download() {
  const ua = { 'User-Agent': 'moopi-bootstrap' };
  let tag = '', url = '';
  try {
    const r = await fetch(`https://github.com/${REPO}/releases/latest`, { headers: ua, redirect: 'manual' });
    const where = (r.status >= 300 && r.status < 400 && r.headers.get('location')) || r.url || '';
    const m = /\/releases\/tag\/v?(\d+\.\d+\.\d+)\/?$/.exec(where);
    if (m) { tag = m[1]; url = `https://github.com/${REPO}/releases/download/v${tag}/moopi.moopi-desktop-${tag}.vsix`; }
  } catch (e) {}
  if (!url) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { ...ua, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub HTTP ' + r.status);
    const rel = await r.json();
    tag = String(rel.tag_name || '').replace(/^v/, '');
    const asset = (rel.assets || []).find((a) => a.name === `moopi.moopi-desktop-${tag}.vsix`);
    if (!asset) throw new Error('no vsix in release ' + rel.tag_name);
    url = asset.browser_download_url;
  }
  const dl = await fetch(url, { headers: ua });
  if (!dl.ok) throw new Error('download HTTP ' + dl.status);
  const file = path.join(os.tmpdir(), `moopi.moopi-desktop-${tag}.vsix`);
  fs.writeFileSync(file, Buffer.from(await dl.arrayBuffer()));
  return file;
}

function deactivate() {}
module.exports = { activate, deactivate };
