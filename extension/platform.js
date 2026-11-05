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
  child.stderr.on('data', (d) => { err += d; });
  const exited = new Promise((resolve) => { child.on('exit', resolve); child.on('error', (e) => { err += String(e); resolve(1); }); });
  return {
    file,
    stop: async () => {
      try { fs.writeFileSync(stopFile, 'stop'); } catch (e) {}
      await exited;
      try { fs.unlinkSync(stopFile); } catch (e) {}
      let size = 0; try { size = fs.statSync(file).size; } catch (e) {}
      if (size < 3000) throw new Error('no audio' + (err ? ': ' + err.replace(/\s+/g, ' ').slice(0, 200) : ''));
      return { file, size };
    },
    cancel: () => { try { fs.writeFileSync(stopFile, 'stop'); } catch (e) {} },
  };
}

// ---------- the screen: the person marks a region (macOS: screencapture; Windows: Snip), a PNG comes back ----------
async function screenshot(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ekran-${stamp()}.png`);
  if (MAC) {
    await run('/usr/sbin/screencapture', ['-i', '-x', file]); // -i: a region by hand, Esc cancels; -x: no sound
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

module.exports = { WIN, MAC, startRecording, screenshot, clipboardImage, copyImage, play, activateWindow, ps, run };
