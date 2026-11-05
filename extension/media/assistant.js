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

  // ---- the light: a glass ribbon folded into a circle, breathing; rings when listening; orbiting sparks when
  // thinking; a pulse of sound when speaking. Canvas, no library.
  const cv = $('orb'), g = cv.getContext('2d'), W = cv.width, H = cv.height, C = W / 2;
  const rings = []; let lastRing = 0;
  function noise(a, t, k) { return Math.sin(a * 3 + t * .9 + k) * .5 + Math.sin(a * 5 - t * .7 + k * 2) * .3 + Math.sin(a * 8 + t * 1.3) * .2; }
  function draw(now) {
    const t = now / 1000; g.clearRect(0, 0, W, H);
    const base = W * .27, breathe = Math.sin(t * (state === 'thinking' ? 2.2 : .9)) * (state === 'idle' ? 3 : 6);
    const amp = state === 'listening' ? 14 : state === 'speaking' ? 10 + Math.abs(Math.sin(t * 9)) * 10 + Math.abs(Math.sin(t * 13.7)) * 6 : state === 'thinking' ? 9 : 5;
    // glow
    const glow = g.createRadialGradient(C, C, base * .2, C, C, base * 1.9);
    glow.addColorStop(0, 'rgba(0,200,164,.35)'); glow.addColorStop(.6, 'rgba(0,200,164,.08)'); glow.addColorStop(1, 'rgba(0,200,164,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // listening rings
    if (state === 'listening' && now - lastRing > 700) { rings.push(now); lastRing = now; }
    for (let i = rings.length - 1; i >= 0; i--) {
      const age = (now - rings[i]) / 1600; if (age > 1) { rings.splice(i, 1); continue; }
      g.beginPath(); g.arc(C, C, base + 10 + age * base * .9, 0, Math.PI * 2); g.strokeStyle = `rgba(127,245,218,${(1 - age) * .55})`; g.lineWidth = 2 - age; g.stroke();
    }
    // ribbons
    g.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 3; r++) {
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2, rad = base + breathe + noise(a, t * (1 + r * .2), r * 1.7) * amp * (1 - r * .22);
        const x = C + Math.cos(a) * rad, y = C + Math.sin(a) * rad; i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.strokeStyle = r === 0 ? 'rgba(127,245,218,.95)' : r === 1 ? 'rgba(0,200,164,.7)' : 'rgba(0,160,130,.45)';
      g.lineWidth = r === 0 ? 2.6 : 1.6; g.shadowColor = 'rgba(0,200,164,.9)'; g.shadowBlur = 18; g.stroke();
    }
    g.shadowBlur = 0; g.globalCompositeOperation = 'source-over';
    // the heart
    const core = g.createRadialGradient(C - base * .25, C - base * .3, 2, C, C, base * .75);
    core.addColorStop(0, 'rgba(255,255,255,.85)'); core.addColorStop(.25, 'rgba(127,245,218,.55)'); core.addColorStop(1, 'rgba(0,120,100,.05)');
    g.beginPath(); g.arc(C, C, base * .72 + breathe * .4, 0, Math.PI * 2); g.fillStyle = core; g.fill();
    // thinking sparks
    if (state === 'thinking') for (let k = 0; k < 3; k++) {
      const a = t * 2.4 + k * (Math.PI * 2 / 3), rr = base + 26 + Math.sin(t * 3 + k) * 6;
      g.beginPath(); g.arc(C + Math.cos(a) * rr, C + Math.sin(a) * rr, 3.5, 0, Math.PI * 2); g.fillStyle = 'rgba(127,245,218,.95)'; g.shadowColor = '#7FF5DA'; g.shadowBlur = 12; g.fill(); g.shadowBlur = 0;
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  vscode.postMessage({ kind: 'ready' });
})();
