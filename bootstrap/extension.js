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

/** The version of the MOOPI extension packaged with this build ('' when unknown). */
function bundledVersion(context) {
  try { return fs.readFileSync(path.join(context.extensionPath, 'bundled-version.txt'), 'utf8').trim(); } catch (e) { return ''; }
}
function isNewer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}

async function activate(context) {
  // An older MOOPI extension is replaced by the packaged one: a Desktop that could not update itself gets well this way.
  const want = bundledVersion(context), have = vscode.extensions.getExtension(MAIN);
  if (have && !(want && isNewer(want, have.packageJSON.version))) return; // the main extension takes it from here
  const mark = want || context.extension.packageJSON.version;
  if (context.globalState.get('moopi.bootstrapped') === mark && !context.globalState.get('moopi.bootstrapRetry')) {
    // Installed earlier but not loaded yet (the reload after the install did not happen): one more reload.
    await context.globalState.update('moopi.bootstrapRetry', true);
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
    return;
  }
  // Packaged as .vsixdata (vsce leaves .vsix files out of a package); VS Code wants a .vsix name to install.
  const bundled = path.join(context.extensionPath, 'moopi.moopi-desktop.vsixdata');
  let file = null;
  try {
    if (fs.existsSync(bundled)) { file = path.join(os.tmpdir(), 'moopi.moopi-desktop-bundled.vsix'); fs.copyFileSync(bundled, file); }
    else file = await download();
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file));
    await context.globalState.update('moopi.bootstrapped', mark);
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
