// The voice bar: MOOPI's ribbon, one line of state, the microphone, a field, two tools. Nothing of the
// conversation is shown here — that is Claude's panel above. Talks to the extension with postMessage.
(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  let T = {}, state = 'idle', caption = '', noteTimer = null;
  root.innerHTML = `
    <canvas id="orb"></canvas>
    <div class="line">
      <span class="caption" id="caption"></span>
      <button class="stop" id="stop" hidden><svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg><span></span></button>
      <span class="attach" id="attach" hidden><img id="attachImg" alt=""><span id="attachText"></span><button id="attachX" title="">×</button></span>
    </div>
    <div class="row">
      <button class="mic" id="mic" title=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button>
      <div class="field" id="field"><input id="input" type="text" autocomplete="off" spellcheck="false"><button class="send" id="send" title="">↑</button></div>
      <button id="screen" class="tool" title=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8"/></svg><span></span></button>
      <button id="clip" class="tool" title=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V3h6v1"/></svg><span></span></button>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const input = $('input'), mic = $('mic'), cap = $('caption'), stopBtn = $('stop'), field = $('field');

  function apply() {
    mic.title = state === 'listening' ? T.as_tap_stop : T.as_tap_talk;
    input.placeholder = T.as_type || '';
    $('send').title = T.as_send || '';
    for (const id of ['screen', 'clip']) { const b = $(id); b.querySelector('span').textContent = T['as_' + id] || ''; b.title = T['as_' + id] || ''; }
    stopBtn.querySelector('span').textContent = T.as_stop || '';
    $('attachX').title = T.as_remove || '';
  }
  function show() {
    cap.textContent = caption || (state === 'listening' ? T.as_listening : state === 'thinking' ? T.as_claude_thinking : state === 'speaking' ? T.as_reading : T.as_ready) || '';
    cap.className = 'caption' + (state !== 'idle' ? ' on' : '');
    stopBtn.hidden = state !== 'speaking';
  }
  function setState(s, text) {
    clearTimeout(noteTimer); noteTimer = null;
    state = s; caption = text || '';
    mic.classList.toggle('on', s === 'listening');
    mic.title = s === 'listening' ? T.as_tap_stop : T.as_tap_talk;
    show();
  }
  function note(text, level) {
    clearTimeout(noteTimer);
    cap.textContent = text; cap.className = 'caption ' + (level === 'error' ? 'err' : 'info');
    noteTimer = setTimeout(() => { noteTimer = null; show(); }, level === 'error' ? 6000 : 4000);
  }
  mic.addEventListener('click', () => vscode.postMessage({ kind: 'talk' }));
  $('orb').addEventListener('click', () => vscode.postMessage({ kind: state === 'speaking' ? 'stop' : 'talk' }));
  const send = () => { const t = input.value.trim(); if (!t) return; input.value = ''; field.classList.remove('has'); vscode.postMessage({ kind: 'ask', text: t }); };
  $('send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  input.addEventListener('input', () => field.classList.toggle('has', !!input.value.trim()));
  $('screen').addEventListener('click', () => vscode.postMessage({ kind: 'screen' }));
  $('clip').addEventListener('click', () => vscode.postMessage({ kind: 'clip' }));
  stopBtn.addEventListener('click', () => vscode.postMessage({ kind: 'stop' }));
  $('attachX').addEventListener('click', () => { $('attach').hidden = true; vscode.postMessage({ kind: 'detach' }); });

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.kind === 'init') { T = m.t || T; apply(); setState(m.state || 'idle', m.caption); }
    else if (m.kind === 'state') setState(m.state, m.caption);
    else if (m.kind === 'note') note(m.text, m.level);
    else if (m.kind === 'image') { $('attachImg').src = m.uri || ''; $('attachImg').hidden = !m.uri; $('attachText').textContent = m.text; $('attach').hidden = false; input.focus(); }
    else if (m.kind === 'detach') $('attach').hidden = true;
    else if (m.kind === 'prefill') { input.value = m.text; field.classList.add('has'); input.focus(); }
  });

  // ---- the light: MOOPI's ribbon — thin lines of glass flowing across, as in the app's voice screen. They rest
  // and breathe; rise and quicken when listening; swirl when thinking; pulse with the voice when speaking.
  const cv = $('orb'), g = cv.getContext('2d');
  function size() { const r = cv.getBoundingClientRect(); cv.width = Math.max(200, Math.round(r.width * 2)); cv.height = Math.max(40, Math.round(r.height * 2)); }
  size();
  if (window.ResizeObserver) new ResizeObserver(size).observe(cv); else addEventListener('resize', size);
  const LINES = 9;
  function draw(now) {
    const t = now / 1000, W = cv.width, H = cv.height, mid = H / 2;
    const light = document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light');
    g.clearRect(0, 0, W, H);
    const energy = state === 'listening' ? .55 : state === 'thinking' ? .7 : state === 'speaking' ? .5 + Math.abs(Math.sin(t * 7.3)) * .35 + Math.abs(Math.sin(t * 11.1)) * .2 : .22;
    const speed = state === 'thinking' ? 2.6 : state === 'listening' ? 1.4 : state === 'speaking' ? 1.9 : .7;
    const amp = Math.min(H * .32, 70) * energy;
    g.globalCompositeOperation = light ? 'source-over' : 'lighter';
    for (let k = 0; k < LINES; k++) {
      const ph = k / LINES, off = (ph - .5) * amp * .9;
      g.beginPath();
      for (let i = 0; i <= 160; i++) {
        const x = (i / 160) * W, u = i / 160;
        const env = Math.sin(u * Math.PI); // quiet at the edges, alive in the middle
        const y = mid + off * env + env * amp * (Math.sin(u * 6.2 + t * speed + k * .9) * .55 + Math.sin(u * 11.3 - t * speed * .8 + k * 1.7) * .3 + Math.sin(u * 2.1 + t * .6 + k) * .25);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      const a = (light ? .35 : .25) + .55 * (1 - Math.abs(ph - .5) * 1.4);
      g.strokeStyle = light
        ? (k % 3 === 0 ? `rgba(0,122,96,${a})` : k % 3 === 1 ? `rgba(14,156,124,${a * .9})` : `rgba(0,150,125,${a * .7})`)
        : (k % 3 === 0 ? `rgba(127,245,218,${a})` : k % 3 === 1 ? `rgba(0,200,164,${a * .9})` : `rgba(0,150,125,${a * .7})`);
      g.lineWidth = k % 3 === 0 ? 2.2 : 1.3;
      g.shadowColor = light ? 'rgba(0,122,96,.35)' : 'rgba(0,200,164,.8)'; g.shadowBlur = state === 'idle' ? 4 : 12;
      g.stroke();
    }
    g.shadowBlur = 0; g.globalCompositeOperation = 'source-over';
    if (state === 'listening') { // a soft beat under the ribbon
      const pulse = (Math.sin(t * 3.2) + 1) / 2;
      const gl = g.createRadialGradient(W / 2, mid, 4, W / 2, mid, W * .22);
      gl.addColorStop(0, light ? `rgba(0,122,96,${.08 + pulse * .08})` : `rgba(127,245,218,${.14 + pulse * .12})`); gl.addColorStop(1, 'rgba(127,245,218,0)');
      g.fillStyle = gl; g.fillRect(0, 0, W, H);
    }
    if (state === 'thinking') for (let k = 0; k < 3; k++) { // sparks travelling along it
      const u = ((t * .35 + k / 3) % 1), x = u * W, y = mid + Math.sin(u * 6.2 + t * speed) * amp * .5;
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fillStyle = light ? 'rgba(0,122,96,.9)' : 'rgba(255,255,255,.9)'; g.shadowColor = light ? '#007A60' : '#7FF5DA'; g.shadowBlur = 12; g.fill(); g.shadowBlur = 0;
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  vscode.postMessage({ kind: 'ready' });
})();
