// What the computer itself does for MOOPI — the microphone, the screen, the clipboard, the sound — each system
// its own way, with its own tools and nothing to install: macOS (moopi-rec, screencapture, osascript, afplay),
// Windows (PowerShell: the system's MCI recorder, Snip, the clipboard, the media player). The two never mix:
// every function switches on process.platform at its top.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const tmp = () => os.tmpdir();
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

function ps(script, args) {
  return new Promise((resolve, reject) => {
    cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script, ...(args || [])],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (e, out, errText) => e ? reject(new Error(String(errText || e.message).slice(0, 300))) : resolve(String(out || '').trim()));
  });
}
function run(file, args) {
  return new Promise((resolve, reject) => {
    cp.execFile(file, args, { maxBuffer: 16 * 1024 * 1024 }, (e, out, errText) => e ? reject(new Error(String(errText || e.message).slice(0, 300))) : resolve(String(out || '').trim()));
  });
}

// ---------- the microphone: tap to start, tap to stop; two minutes at most ----------
const RECORD_PS = `param([string]$Out, [string]$Stop, [int]$Max = 120)
$code = @"
using System; using System.Text; using System.Runtime.InteropServices;
public class Mci { [DllImport("winmm.dll", CharSet=CharSet.Unicode)] public static extern int mciSendString(string cmd, StringBuilder ret, int len, IntPtr h); }
"@
Add-Type -TypeDefinition $code
$sb = New-Object System.Text.StringBuilder 256
[Mci]::mciSendString('open new type waveaudio alias rec', $sb, 256, [IntPtr]::Zero) | Out-Null
[Mci]::mciSendString('set rec time format ms bitspersample 16 channels 1 samplespersec 16000 bytespersec 32000 alignment 2', $sb, 256, [IntPtr]::Zero) | Out-Null
$r = [Mci]::mciSendString('record rec', $sb, 256, [IntPtr]::Zero)
if ($r -ne 0) { [Console]::Error.WriteLine("record failed: $r"); exit 1 }
$started = Get-Date
while (-not (Test-Path $Stop)) { Start-Sleep -Milliseconds 150; if (((Get-Date) - $started).TotalSeconds -gt $Max) { break } }
[Mci]::mciSendString('stop rec', $sb, 256, [IntPtr]::Zero) | Out-Null
[Mci]::mciSendString("save rec \`"$Out\`"", $sb, 256, [IntPtr]::Zero) | Out-Null
[Mci]::mciSendString('close rec', $sb, 256, [IntPtr]::Zero) | Out-Null
`;
/** Starts recording. Returns {file, stop(): Promise<{file, size}>}; stop() after the recorder exited. */
function startRecording(extensionPath, maxSec) {
  const id = `moopi-rec-${Date.now()}`, stopFile = path.join(tmp(), id + '.stop');
  let child, file, err = '';
  if (MAC) {
    file = path.join(tmp(), id + '.m4a');
    const bin = path.join(extensionPath, 'bin', 'darwin', 'moopi-rec');
    try { fs.chmodSync(bin, 0o755); } catch (e) {}
    child = cp.spawn(bin, [file, stopFile, String(maxSec || 120)]);
  } else if (WIN) {
    file = path.join(tmp(), id + '.wav');
    const script = path.join(tmp(), id + '.ps1');
    fs.writeFileSync(script, RECORD_PS);
    child = cp.spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Out', file, '-Stop', stopFile, '-Max', String(maxSec || 120)], { windowsHide: true });
    child.on('exit', () => { try { fs.unlinkSync(script); } catch (e) {} });
  } else {
    throw new Error('recording: unsupported platform');
  }
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  const exited = new Promise((resolve) => { child.on('exit', resolve); child.on('error', (e) => { err += String(e); resolve(1); }); });
  return {
    file,
    stop: async () => {
      try { fs.writeFileSync(stopFile, 'stop'); } catch (e) {}
      await exited;
      try { fs.unlinkSync(stopFile); } catch (e) {}
      let size = 0; try { size = fs.statSync(file).size; } catch (e) {}
      if (/microphone denied/.test(err)) { const e = new Error('microphone denied'); e.code = 'mic'; throw e; }
      if (size < 3000) throw new Error('no audio' + (err ? ': ' + err.replace(/\s+/g, ' ').slice(0, 200) : ''));
      const seconds = Number((out.match(/ok (\d+)s/) || [])[1] || 0);
      return { file, size, seconds };
    },
    cancel: () => { try { fs.writeFileSync(stopFile, 'stop'); } catch (e) {} },
  };
}

// ---------- the screen: the person marks a region (macOS: screencapture; Windows: Snip), a PNG comes back ----------
async function screenshot(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ekran-${stamp()}.png`);
  if (MAC) {
    try { await run('/usr/sbin/screencapture', ['-i', '-x', file]); } // -i: a region by hand, Esc cancels; -x: no sound
    catch (e) { if (/could not create image/i.test(String(e.message))) { const d = new Error('screen recording not allowed'); d.code = 'screen'; throw d; } throw e; }
    return fs.existsSync(file) ? file : null;
  }
  if (WIN) {
    await ps("Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Clipboard]::Clear(); Start-Process 'ms-screenclip:'");
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 600));
      const got = await ps("Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $i = [Windows.Forms.Clipboard]::GetImage(); if ($i) { $i.Save($args[0], [Drawing.Imaging.ImageFormat]::Png); 'ok' } else { 'none' }", [file]).catch(() => 'none');
      if (got === 'ok') return file;
    }
    return null;
  }
  throw new Error('screenshot: unsupported platform');
}

// ---------- the clipboard: a picture copied anywhere, as a file; a file, onto the clipboard as a picture ----------
async function clipboardImage(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `bufer-${stamp()}.png`);
  if (MAC) {
    const ok = await run('/usr/bin/osascript', ['-e', `try
set f to open for access POSIX file "${file}" with write permission
write (the clipboard as «class PNGf») to f
close access f
return "ok"
on error
try
close access POSIX file "${file}"
end try
return "none"
end try`]).catch(() => 'none');
    if (ok !== 'ok') { try { fs.unlinkSync(file); } catch (e) {} return null; }
    return fs.existsSync(file) && fs.statSync(file).size > 100 ? file : null;
  }
  if (WIN) {
    const got = await ps("Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $i = [Windows.Forms.Clipboard]::GetImage(); if ($i) { $i.Save($args[0], [Drawing.Imaging.ImageFormat]::Png); 'ok' } else { 'none' }", [file]).catch(() => 'none');
    return got === 'ok' ? file : null;
  }
  return null;
}
async function copyImage(file) {
  if (MAC) return run('/usr/bin/osascript', ['-e', `set the clipboard to (read (POSIX file "${file}") as «class PNGf»)`]);
  if (WIN) return ps("Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $i = [Drawing.Image]::FromFile($args[0]); [Windows.Forms.Clipboard]::SetImage($i)", [file]);
  throw new Error('clipboard: unsupported platform');
}

// ---------- sound: an MP3 through the system's own player; the handle lets a voice be cut short ----------
function play(file) {
  let child;
  if (MAC) child = cp.spawn('/usr/bin/afplay', [file]);
  else if (WIN) child = cp.spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName PresentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([Uri]${JSON.stringify(file)}); Start-Sleep -m 300; $p.Play(); while (-not $p.NaturalDuration.HasTimeSpan) { Start-Sleep -m 100 }; Start-Sleep -m ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 300); $p.Close()`], { windowsHide: true });
  else child = cp.spawn('sh', ['-c', `mpg123 -q "${file}" || ffplay -nodisp -autoexit -loglevel quiet "${file}"`]);
  const done = new Promise((resolve) => { child.on('exit', resolve); child.on('error', resolve); });
  return { done, stop: () => { try { child.kill(); } catch (e) {} } };
}

// ---------- the window to the front (after a hotkey from elsewhere) ----------
function activateWindow(appName) {
  try {
    if (MAC) cp.execFile('/usr/bin/osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose name contains "${appName}") to true`], () => {});
    else if (WIN) cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject WScript.Shell).AppActivate('${appName}')`], { windowsHide: true }, () => {});
  } catch (e) {}
}

/** The system's privacy pane for the microphone or the screen (macOS), so the person can allow MOOPI Desktop. */
function openPrivacy(which) {
  if (!MAC) return;
  const pane = which === 'mic' ? 'Privacy_Microphone' : 'Privacy_ScreenCapture';
  cp.execFile('/usr/bin/open', [`x-apple.systempreferences:com.apple.preference.security?${pane}`], () => {});
}
// ---------- Windows: "MOOPI'ga yuborish" in Explorer's right-click menu (the current user's registry, no admin) ----------
async function explorerMenu(enable, label, dest) {
  if (!WIN) return;
  if (!enable) {
    await ps("Remove-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\MOOPI' -Recurse -ErrorAction SilentlyContinue");
    return;
  }
  const cmd = `powershell -NoProfile -WindowStyle Hidden -Command "Copy-Item -LiteralPath '%1' -Destination '${dest.replace(/'/g, "''")}'"`;
  await ps(`$k = 'HKCU:\\Software\\Classes\\*\\shell\\MOOPI'
New-Item -Path $k -Force | Out-Null
Set-ItemProperty -Path $k -Name '(Default)' -Value $args[0]
Set-ItemProperty -Path $k -Name 'Icon' -Value $args[1]
New-Item -Path "$k\\command" -Force | Out-Null
Set-ItemProperty -Path "$k\\command" -Name '(Default)' -Value $args[2]`, [label, process.execPath + ',0', cmd]);
}

// ---------- Windows: a key that works everywhere (RegisterHotKey in a hidden window), reported through a file ----------
const HOTKEY_PS = `param([int]$Mod, [int]$Key, [string]$Trigger)
Add-Type -AssemblyName System.Windows.Forms
$code = @"
using System; using System.Runtime.InteropServices; using System.Windows.Forms;
public class MoopiHotkey : Form {
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  public string Trigger; public int Mod; public int Key;
  protected override void OnLoad(EventArgs e) { base.OnLoad(e); this.ShowInTaskbar = false; this.WindowState = FormWindowState.Minimized; this.Visible = false;
    if (!RegisterHotKey(this.Handle, 1, (uint)Mod, (uint)Key)) { Console.Error.WriteLine("hotkey taken"); Environment.Exit(2); } }
  protected override void WndProc(ref Message m) { if (m.Msg == 0x0312) { try { System.IO.File.WriteAllText(Trigger, DateTime.UtcNow.Ticks.ToString()); } catch {} } base.WndProc(ref m); }
  protected override void OnFormClosed(FormClosedEventArgs e) { UnregisterHotKey(this.Handle, 1); base.OnFormClosed(e); }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms
$f = New-Object MoopiHotkey; $f.Trigger = $Trigger; $f.Mod = $Mod; $f.Key = $Key
[System.Windows.Forms.Application]::Run($f)
`;
const MODS = { ctrl: 2, alt: 1, shift: 4, win: 8 };
/** "Ctrl+Alt+M" → {mod, key}; null when it is not a key we can register. */
function parseHotkey(text) {
  const parts = String(text || '').toLowerCase().split('+').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const key = parts.pop(); let mod = 0;
  for (const m of parts) { if (!(m in MODS)) return null; mod |= MODS[m]; }
  if (!/^[a-z0-9]$/.test(key) && key !== 'space') return null;
  const vk = key === 'space' ? 0x20 : key.toUpperCase().charCodeAt(0);
  return { mod: mod | 0x4000, key: vk }; // 0x4000: MOD_NOREPEAT
}
/** Starts the helper; onPress() each time the key is pressed anywhere. Returns {stop}. Windows only. */
function startHotkey(text, onPress) {
  if (!WIN) return null;
  const hk = parseHotkey(text); if (!hk) return null;
  const script = path.join(tmp(), 'moopi-hotkey.ps1'), trigger = path.join(tmp(), 'moopi-hotkey.trigger');
  fs.writeFileSync(script, HOTKEY_PS);
  try { fs.unlinkSync(trigger); } catch (e) {}
  const child = cp.spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-Mod', String(hk.mod), '-Key', String(hk.key), '-Trigger', trigger], { windowsHide: true });
  let last = '';
  const poll = setInterval(() => { try { const v = fs.readFileSync(trigger, 'utf8'); if (v && v !== last) { last = v; onPress(); } } catch (e) {} }, 250);
  return { stop: () => { clearInterval(poll); try { child.kill(); } catch (e) {} try { fs.unlinkSync(trigger); } catch (e) {} } };
}
// ---------- keystrokes: paste what is on the clipboard into the focused input, then Enter — the way a
// dictation program types into any app. The request itself is then made by Claude Code's own panel, with the
// person's own sign-in; MOOPI only did the typing. (macOS asks for Accessibility once.)
// Every key goes only into MOOPI Desktop's own window (owner, 08.11.2026: "boshqa dasturga tushib qolishi
// mumkin — yechim topish kerak"): right before each key the system is asked which window is in front, in the
// same call that sends the key, and when it is not MOOPI Desktop's nothing is sent at all (code 'front').

/** MOOPI Desktop's own windows: the extension host is a child of the app's main process, which owns them;
 *  the app's bundle (macOS) or executable (Windows) is the second way to know them. */
let ownOverride = null; // tests only
function ownApp(exe = process.execPath || '', ppid = process.ppid, mac = MAC) {
  if (ownOverride) return ownOverride;
  const i = exe.indexOf('.app/');
  return { pid: ppid, app: mac ? (i > 0 ? exe.slice(0, i + 4) : '') : exe };
}
function _setOwn(own) { ownOverride = own; }
const GUARD_MAC = [
  'on run argv',
  'set wantPid to (item 1 of argv) as integer',
  'set wantApp to item 2 of argv',
  'set steps to item 3 of argv',
  'if steps is "check" then',
  'if my isOurs(wantPid, wantApp) then return "front"',
  'return "back"',
  'end if',
  'repeat with s in (characters of steps)',
  'if not my isOurs(wantPid, wantApp) then error "MOOPI_NOT_FRONT" number 9001',
  'tell application "System Events"',
  'if (s as text) is "v" then',
  'keystroke "v" using command down',
  'delay 0.25',
  'else',
  'key code 36',
  'end if',
  'end tell',
  'end repeat',
  'return "ok"',
  'end run',
  'on isOurs(wantPid, wantApp)',
  'tell application "System Events"',
  'set p to first application process whose frontmost is true',
  'if unix id of p is wantPid then return true',
  'if wantApp is not "" then',
  'try',
  'set f to POSIX path of (application file of p)',
  'if f starts with wantApp then return true',
  'end try',
  'end if',
  'end tell',
  'return false',
  'end isOurs',
];
const GUARD_PS = `param([int]$OwnPid, [string]$Exe, [string]$Steps)
$sig = @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
[StructLayout(LayoutKind.Sequential)] public struct LII { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LII l);
'@
Add-Type -Namespace MoopiKeys -Name U -MemberDefinition $sig
function Ours {
  $p = [uint32]0
  [void][MoopiKeys.U]::GetWindowThreadProcessId([MoopiKeys.U]::GetForegroundWindow(), [ref]$p)
  if ($p -eq $OwnPid) { return $true }
  try { return ((Get-Process -Id $p -ErrorAction Stop).Path -ieq $Exe) } catch { return $false }
}
if ($Steps -eq 'check') {
  $l = New-Object MoopiKeys.U+LII
  $l.cbSize = 8
  [void][MoopiKeys.U]::GetLastInputInfo([ref]$l)
  $now = ([long][Environment]::TickCount + 4294967296) % 4294967296
  $idle = ($now - [long]$l.dwTime + 4294967296) % 4294967296
  $front = 'back'
  if (Ours) { $front = 'front' }
  Write-Output ($front + ' ' + $idle)
  exit 0
}
Add-Type -AssemblyName System.Windows.Forms
foreach ($s in $Steps.ToCharArray()) {
  if (-not (Ours)) { Write-Output 'MOOPI_NOT_FRONT'; exit 9 }
  if ($s -eq 'v') { [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep -Milliseconds 250 }
  else { [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
}
Write-Output 'ok'
`;
function guardScript() {
  const file = path.join(tmp(), 'moopi-keys.ps1');
  try { if (fs.readFileSync(file, 'utf8') === GUARD_PS) return file; } catch (e) {}
  fs.writeFileSync(file, GUARD_PS);
  return file;
}
function guardWin(steps) {
  const own = ownApp();
  return new Promise((resolve, reject) => {
    cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', guardScript(), '-OwnPid', String(own.pid), '-Exe', own.app, '-Steps', steps],
      { windowsHide: true }, (e, out, errText) => {
        const text = String(out || '').trim();
        if (/MOOPI_NOT_FRONT/.test(text)) { const d = new Error('MOOPI Desktop is not the window in front'); d.code = 'front'; return reject(d); }
        if (e) { const d = new Error('key guard: ' + String(errText || e.message).slice(0, 300)); d.code = 'guard'; return reject(d); }
        resolve(text);
      });
  });
}
async function guardMac(steps) {
  const own = ownApp();
  try {
    return await run('/usr/bin/osascript', [...GUARD_MAC.flatMap((line) => ['-e', line]), String(own.pid), own.app, steps]);
  } catch (e) {
    const m = String(e.message);
    if (/MOOPI_NOT_FRONT|9001/.test(m)) { const d = new Error('MOOPI Desktop is not the window in front'); d.code = 'front'; throw d; }
    if (/assistive access|not allowed|1002|-1743/i.test(m)) { const d = new Error('accessibility not allowed'); d.code = 'ax'; throw d; }
    const d = new Error('key guard: ' + m); d.code = 'guard'; throw d;
  }
}
/** Is MOOPI Desktop's window the one in front, and how long since the person last touched the keyboard or
 *  mouse anywhere (seconds)? {front, idle}; idle is null when the system does not say. */
async function frontState() {
  if (MAC) {
    const front = (await guardMac('check')) === 'front';
    let idle = null;
    try { const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(await run('/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-d', '4'])); if (m) idle = Number(m[1]) / 1e9; } catch (e) {}
    return { front, idle };
  }
  if (WIN) {
    const [front, ms] = (await guardWin('check')).split(/\s+/);
    return { front: front === 'front', idle: ms !== undefined && !isNaN(+ms) ? +ms / 1000 : null };
  }
  return { front: false, idle: null };
}
/** MOOPI Desktop's window to the front — only for something the person asked for themselves (their voice,
 *  a button they pressed); never for what MOOPI does by itself. */
async function bringOwnToFront() {
  const own = ownApp();
  try {
    if (MAC) await run('/usr/bin/osascript', ['-e', `tell application "System Events" to set frontmost of (first application process whose unix id is ${Number(own.pid)}) to true`]);
    else if (WIN) await ps(`[void](New-Object -ComObject WScript.Shell).AppActivate(${Number(own.pid)})`);
  } catch (e) {}
}
/** Cmd/Ctrl+V (and Enter when [submit]) into MOOPI Desktop's window; nothing when another window is in front. */
async function pasteAndEnter(submit) {
  const steps = submit ? 've' : 'v';
  if (MAC) { await guardMac(steps); return; }
  if (WIN) { await guardWin(steps); return; }
  throw new Error('typing: unsupported platform');
}
/** The keys without asking the system which window is in front — only when the check itself could not run
 *  (code 'guard', reported) and the editor says its own window has the focus: never worse than before 0.9.6. */
async function pasteAndEnterPlain(submit) {
  if (MAC) {
    try {
      await run('/usr/bin/osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down',
        ...(submit ? ['-e', 'delay 0.25', '-e', 'tell application "System Events" to key code 36'] : [])]);
    } catch (e) {
      if (/assistive access|not allowed|1002/i.test(String(e.message))) { const d = new Error('accessibility not allowed'); d.code = 'ax'; throw d; }
      throw e;
    }
    return;
  }
  if (WIN) {
    await ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')${submit ? "; Start-Sleep -m 250; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')" : ''}`);
    return;
  }
  throw new Error('typing: unsupported platform');
}
/** Enter alone, the old way (see pasteAndEnterPlain). */
async function pressEnterPlain() {
  if (MAC) { await run('/usr/bin/osascript', ['-e', 'tell application "System Events" to key code 36']); return; }
  if (WIN) { await ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"); return; }
  throw new Error('typing: unsupported platform');
}
/** Enter alone, into MOOPI Desktop's window (the text is already in Claude's input). */
async function pressEnter() {
  if (MAC) { await guardMac('e'); return; }
  if (WIN) { await guardWin('e'); return; }
  throw new Error('typing: unsupported platform');
}
function openAccessibility() { if (MAC) cp.execFile('/usr/bin/open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'], () => {}); }
module.exports = { WIN, MAC, startRecording, screenshot, clipboardImage, copyImage, play, activateWindow, openPrivacy, openAccessibility, explorerMenu, startHotkey, parseHotkey, pasteAndEnter, pasteAndEnterPlain, pressEnter, pressEnterPlain, frontState, bringOwnToFront, ownApp, _setOwn, ps, run };
