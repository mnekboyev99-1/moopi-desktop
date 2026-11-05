// MOOPI's assistant window: the light, the talk, the buttons. Talks to the extension with postMessage.
(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  let T = {}, state = 'idle', live = null, hasBrain = true;
  root.innerHTML = `
    <div class="top"><button class="close" title="×">×</button><canvas id="orb" width="380" height="380"></canvas><p class="caption" id="caption"></p></div>
    <div class="nobrain" id="nobrain" hidden></div>
    <div class="attach" id="attach" hidden><img id="attachImg" alt=""><span id="attachText"></span><button id="attachX" title="×">×</button></div>
    <div class="log" id="log"></div>
    <div class="bar">
      <button class="mic" id="mic" title=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button>
      <div class="field"><input id="input" type="text" autocomplete="off"><button class="send" id="send" title="">↑</button></div>
    </div>
    <div class="tools">
      <button id="screen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8"/></svg><span></span></button>
      <button id="clip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V3h6v1"/></svg><span></span></button>
      <button id="toClaude"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/></svg><span></span></button>
      <button id="stop" class="stop"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span></span></button>
      <button id="new"><span></span></button>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const log = $('log'), input = $('input'), mic = $('mic'), caption = $('caption');

  function apply() {
    $('mic').title = state === 'listening' ? T.as_tap_stop : T.as_tap_talk;
    input.placeholder = T.as_type || '';
    $('send').title = T.as_send || '';
    $('screen').querySelector('span').textContent = T.as_screen || '';
    $('clip').querySelector('span').textContent = T.as_clip || '';
    $('toClaude').querySelector('span').textContent = T.as_to_claude || '';
    $('stop').querySelector('span').textContent = T.as_stop || '';
    $('new').querySelector('span').textContent = T.as_new || '';
    log.dataset.hint = T.as_hint || '';
    $('nobrain').textContent = T.as_no_brain || '';
    $('nobrain').hidden = hasBrain;
  }
  function setState(s, text) {
    state = s;
    mic.classList.toggle('on', s === 'listening');
    caption.textContent = text || (s === 'listening' ? T.as_listening : s === 'thinking' ? T.as_thinking : s === 'speaking' ? T.as_speaking : T.as_ready) || '';
    caption.classList.toggle('on', s !== 'idle');
    mic.title = s === 'listening' ? T.as_tap_stop : T.as_tap_talk;
  }
  function add(cls, text, image) {
    const el = document.createElement('div'); el.className = 'msg ' + cls; el.textContent = text || '';
    if (image) { const img = document.createElement('img'); img.src = image; el.appendChild(img); }
    log.appendChild(el); log.scrollTop = log.scrollHeight; return el;
  }
  let lastAnswer = '';
  mic.addEventListener('click', () => vscode.postMessage({ kind: 'talk' }));
  $('orb').addEventListener('click', () => vscode.postMessage({ kind: 'talk' }));
  const send = () => { const t = input.value.trim(); if (!t) return; input.value = ''; vscode.postMessage({ kind: 'ask', text: t }); };
  $('send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  $('screen').addEventListener('click', () => vscode.postMessage({ kind: 'screen' }));
  $('clip').addEventListener('click', () => vscode.postMessage({ kind: 'clip' }));
  $('toClaude').addEventListener('click', () => vscode.postMessage({ kind: 'toClaude', text: lastAnswer }));
  $('stop').addEventListener('click', () => vscode.postMessage({ kind: 'stop' }));
  $('new').addEventListener('click', () => vscode.postMessage({ kind: 'new' }));
  $('attachX').addEventListener('click', () => { $('attach').hidden = true; vscode.postMessage({ kind: 'new' }); });
  document.querySelector('.close').addEventListener('click', () => vscode.postMessage({ kind: 'close' }));

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.kind === 'init') { T = m.t || T; hasBrain = m.brain !== false; apply(); setState(m.state || 'idle'); }
    else if (m.kind === 'state') setState(m.state, m.caption);
    else if (m.kind === 'you') { $('attach').hidden = true; add('you', m.text, m.image); live = null; }
    else if (m.kind === 'moopi') {
      if (m.final) { if (live) live.classList.remove('live'); live = null; return; }
      if (!live) { live = add('moopi live', ''); }
      live.textContent = (live.textContent ? live.textContent + '\n' : '') + m.text; lastAnswer = live.textContent; log.scrollTop = log.scrollHeight;
    }
    else if (m.kind === 'tool') add('tool', m.text);
    else if (m.kind === 'error') { add('err', m.text); if (live) { live.classList.remove('live'); live = null; } }
    else if (m.kind === 'image') { $('attachImg').src = m.uri; $('attachText').textContent = m.text; $('attach').hidden = false; input.focus(); }
    else if (m.kind === 'prefill') { input.value = m.text; input.focus(); }
    else if (m.kind === 'clear') { log.innerHTML = ''; live = null; lastAnswer = ''; $('attach').hidden = true; }
  });

  // ---- the light: MOOPI's ribbon — thin lines of glass flowing across, as in the app's voice screen. They rest
  // and breathe; rise and quicken when listening; swirl when thinking; pulse with the voice when speaking.
  const cv = $('orb'), g = cv.getContext('2d');
  function size() { const r = cv.getBoundingClientRect(); cv.width = Math.max(300, r.width * 2); cv.height = Math.max(120, r.height * 2); }
  size(); addEventListener('resize', size);
  const LINES = 9;
  function draw(now) {
    const t = now / 1000, W = cv.width, H = cv.height, mid = H / 2;
    g.clearRect(0, 0, W, H);
    const energy = state === 'listening' ? .55 : state === 'thinking' ? .7 : state === 'speaking' ? .5 + Math.abs(Math.sin(t * 7.3)) * .35 + Math.abs(Math.sin(t * 11.1)) * .2 : .22;
    const speed = state === 'thinking' ? 2.6 : state === 'listening' ? 1.4 : state === 'speaking' ? 1.9 : .7;
    const amp = H * .22 * energy;
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < LINES; k++) {
      const ph = k / LINES, off = (ph - .5) * amp * .9;
      g.beginPath();
      for (let i = 0; i <= 160; i++) {
        const x = (i / 160) * W, u = i / 160;
        const env = Math.sin(u * Math.PI); // quiet at the edges, alive in the middle
        const y = mid + off * env + env * amp * (Math.sin(u * 6.2 + t * speed + k * .9) * .55 + Math.sin(u * 11.3 - t * speed * .8 + k * 1.7) * .3 + Math.sin(u * 2.1 + t * .6 + k) * .25);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      const a = .25 + .55 * (1 - Math.abs(ph - .5) * 1.4);
      g.strokeStyle = k % 3 === 0 ? `rgba(127,245,218,${a})` : k % 3 === 1 ? `rgba(0,200,164,${a * .9})` : `rgba(0,150,125,${a * .7})`;
      g.lineWidth = k % 3 === 0 ? 2.4 : 1.4;
      g.shadowColor = 'rgba(0,200,164,.8)'; g.shadowBlur = state === 'idle' ? 6 : 14;
      g.stroke();
    }
    g.shadowBlur = 0; g.globalCompositeOperation = 'source-over';
    if (state === 'listening') { // a soft beat under the ribbon
      const pulse = (Math.sin(t * 3.2) + 1) / 2;
      const gl = g.createRadialGradient(W / 2, mid, 4, W / 2, mid, W * .22);
      gl.addColorStop(0, `rgba(127,245,218,${.14 + pulse * .12})`); gl.addColorStop(1, 'rgba(127,245,218,0)');
      g.fillStyle = gl; g.fillRect(0, 0, W, H);
    }
    if (state === 'thinking') for (let k = 0; k < 3; k++) { // sparks travelling along it
      const u = ((t * .35 + k / 3) % 1), x = u * W, y = mid + Math.sin(u * 6.2 + t * speed) * amp * .5;
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.9)'; g.shadowColor = '#7FF5DA'; g.shadowBlur = 14; g.fill(); g.shadowBlur = 0;
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  vscode.postMessage({ kind: 'ready' });
})();
