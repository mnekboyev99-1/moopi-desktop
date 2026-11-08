// One MOOPI on a computer (0.9.8; owner, 08.11.2026: "microsoftdan oladimi, boshqa joydan oladimi kompyuterda bitta
// dastur ishlashi kerak"). On Windows the Microsoft Store is the one source; a copy installed earlier from the site
// (Inno Setup, per user or for all users) is found by the Store's copy, which offers to remove it — the site's own
// uninstaller runs, so the person sees and confirms it. Nothing here runs on a Mac.
const fs = require('fs');
const path = require('path');

/** Started from a Store (MSIX) package: those live under ...\WindowsApps\. */
function fromStore(execPath = process.execPath) {
  return /[\\/]WindowsApps[\\/]/i.test(String(execPath || ''));
}

/** The uninstallers of copies installed from the site (the per-user and the all-users setup). */
function siteCopies(env = process.env, exists = fs.existsSync) {
  const dirs = [];
  if (env.LOCALAPPDATA) dirs.push(path.win32.join(env.LOCALAPPDATA, 'Programs', 'MOOPI Desktop'));
  for (const pf of [env.ProgramFiles, env['ProgramFiles(x86)']]) if (pf) dirs.push(path.win32.join(pf, 'MOOPI Desktop'));
  return dirs.map((d) => path.win32.join(d, 'unins000.exe')).filter((u) => exists(u));
}

module.exports = { fromStore, siteCopies };
