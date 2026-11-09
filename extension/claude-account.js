// Is Claude Code on this computer signed in, and on what? Claude Code's own `auth status` says so. Only the answer
// "active / none / unknown" leaves this file: no token, no email. (Owner, 09.11.2026: one chat — where it is depends
// on what the person really has.)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function binaryIn(extensionPath, platform = process.platform) {
  return path.join(extensionPath, 'resources', 'native-binary', platform === 'win32' ? 'claude.exe' : 'claude');
}

/** 'active': Claude's panel can answer. 'none': not signed in, or a plan without Claude Code. 'unknown': could not tell. */
function classify(output) {
  let d;
  try { d = JSON.parse(String(output)); } catch (e) { return 'unknown'; }
  if (!d || typeof d.loggedIn !== 'boolean') return 'unknown';
  if (!d.loggedIn) return 'none';
  if (d.authMethod !== 'claude.ai') return 'active'; // a Console key or a cloud account in Claude Code itself
  const plan = String(d.subscriptionType || '').toLowerCase();
  if (!plan) return 'unknown';
  return plan === 'free' ? 'none' : 'active';
}

function check(extensionPath, run = execFile, exists = fs.existsSync) {
  const file = binaryIn(extensionPath);
  if (!exists(file)) return Promise.resolve('unknown');
  return new Promise((resolve) => {
    // A signed-out Claude may answer with a non-zero exit and its JSON all the same: the output decides.
    run(file, ['auth', 'status', '--json'], { timeout: 20000, windowsHide: true, cwd: os.homedir() },
      (error, stdout) => resolve(stdout ? classify(stdout) : 'unknown'));
  });
}

/** The business passport still as the template left it: headings and "(what goes here)" lines only. */
function passportEmpty(text) {
  const written = String(text || '').split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !/^\(.*\)$/.test(l)).join(' ');
  return written.length < 40;
}

module.exports = { binaryIn, classify, check, passportEmpty };
