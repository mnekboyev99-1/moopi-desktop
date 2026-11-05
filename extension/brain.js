// MOOPI's local brain: Claude Code's own binary — the one the panel ships, unmodified — run in print mode in
// the MOOPI folder on the person's own Claude sign-in. It carries MOOPI's persona (CLAUDE.md), MOOPI's tools
// (.mcp.json) and the memory, and costs no API key and no server spend: the subscription does the work.
// One run at a time; a session id kept, so a conversation continues (--resume).
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const WORKSPACE_DIR = path.join(os.homedir(), 'MOOPI');
// What a background run may do without asking: MOOPI's tools, the files of the MOOPI folder, and the little
// Python that makes documents and tables. Nothing that reaches outside the folder.
const TOOLS = ['mcp__moopi__*', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(python3 *)', 'Bash(python *)', 'Bash(ls *)',
  'Bash(mkdir *)', 'Bash(cat *)', 'Bash(cp *)', 'Bash(pip install *)', 'Bash(pip3 install *)'];

function binary() {
  const ext = vscode.extensions.getExtension('Anthropic.claude-code') || vscode.extensions.getExtension('anthropic.claude-code');
  if (!ext) return null;
  const dir = path.join(ext.extensionPath, 'resources', 'native-binary');
  for (const name of ['claude', 'claude.exe']) { const p = path.join(dir, name); if (fs.existsSync(p)) return p; }
  return null;
}

/** Claude Code trusts the MOOPI folder (its own trust dialog, which a background run cannot answer): the
 *  one flag in ~/.claude.json, set once. The folder is MOOPI's own, made by the Desktop. */
function trustWorkspace() {
  const file = path.join(os.homedir(), '.claude.json');
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (fs.existsSync(file)) return; }
  if (!data || typeof data !== 'object') return;
  data.projects = data.projects && typeof data.projects === 'object' ? data.projects : {};
  const project = data.projects[WORKSPACE_DIR] = data.projects[WORKSPACE_DIR] || {};
  if (project.hasTrustDialogAccepted === true) return;
  project.hasTrustDialogAccepted = true;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let current = null;
function busy() { return !!current; }
function cancel() { if (current) { try { current.kill(); } catch (e) {} current = null; } }

/** One question to MOOPI's brain. opts: prompt, session (to continue), system (added to the prompt), maxTurns,
 *  onText(text) for each answer piece as it comes, onTool(name) when a tool runs, timeoutMs.
 *  Resolves {text, session, cost, turns}; rejects on a failure (the message is for the log, not the person). */
function ask(opts) {
  return new Promise((resolve, reject) => {
    const bin = binary();
    if (!bin) return reject(new Error('claude binary not found'));
    if (current) return reject(new Error('busy'));
    try { trustWorkspace(); } catch (e) {}
    const session = opts.session || crypto.randomUUID();
    const args = ['-p', opts.prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--max-turns', String(opts.maxTurns || 12), '--allowedTools', ...TOOLS];
    args.push(opts.session ? '--resume' : '--session-id', session);
    if (opts.system) args.push('--append-system-prompt', opts.system);
    const env = { ...process.env };
    delete env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
    const child = cp.spawn(bin, args, { cwd: WORKSPACE_DIR, env, windowsHide: true });
    current = child;
    let buf = '', err = '', text = '', result = null, turns = 0;
    const timer = setTimeout(() => { try { child.kill(); } catch (e) {} }, opts.timeoutMs || 240000);
    const line = (raw) => {
      let d; try { d = JSON.parse(raw); } catch (e) { return; }
      if (d.type === 'assistant' && d.message && Array.isArray(d.message.content)) {
        turns += 1;
        for (const b of d.message.content) {
          if (b.type === 'text' && b.text && b.text.trim()) { text += (text ? '\n' : '') + b.text.trim(); if (opts.onText) opts.onText(b.text.trim()); }
          if (b.type === 'tool_use' && opts.onTool) opts.onTool(String(b.name || ''));
        }
      } else if (d.type === 'result') {
        result = d;
      }
    };
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) line(l); }
    });
    child.stderr.on('data', (chunk) => { err += chunk.toString('utf8'); });
    child.on('error', (e) => { clearTimeout(timer); current = null; reject(e); });
    child.on('exit', (code) => {
      clearTimeout(timer); current = null;
      if (buf.trim()) line(buf.trim());
      const final = result && typeof result.result === 'string' && result.result.trim() ? result.result.trim() : text;
      if (!final && code !== 0) return reject(new Error('claude exit ' + code + ': ' + err.replace(/\s+/g, ' ').slice(0, 300)));
      if (result && result.is_error) return reject(new Error('claude error: ' + String(result.result || '').slice(0, 300)));
      resolve({ text: final, session: (result && result.session_id) || session, cost: result ? result.total_cost_usd : null,
        turns: result ? result.num_turns : turns, stderr: err.slice(0, 500) });
    });
  });
}

module.exports = { WORKSPACE_DIR, binary, trustWorkspace, ask, busy, cancel };
