(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const panel = document.body.dataset.panel;
  let T = {}, method = 'telegram';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => { if (!iso) return ''; const d = new Date(iso); const now = new Date(); const sameDay = d.toDateString() === now.toDateString(); return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: '2-digit', month: '2-digit' }); };
  const post = (m) => vscode.postMessage(m);

  function signIn(note) {
    root.innerHTML = `<div class="big">${esc(T.signin)}</div>
      <div class="tabs"><button data-m="telegram" class="${method === 'telegram' ? 'on' : ''}">${esc(T.tg)}</button><button data-m="email" class="${method === 'email' ? 'on' : ''}">${esc(T.mail)}</button></div>
      <div id="f"></div><div class="err" id="err">${esc(note || '')}</div>`;
    root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { method = b.dataset.m; signIn(); }));
    const f = root.querySelector('#f');
    if (method === 'telegram') {
      f.innerHTML = `<p class="hint">${esc(T.tg_hint)}</p><input id="code" inputmode="numeric" placeholder="${esc(T.code)}"><button id="go">${esc(T.enter)}</button>`;
      f.querySelector('#go').addEventListener('click', () => post({ kind: 'signIn', body: { method: 'telegram_code', code: f.querySelector('#code').value.trim() } }));
    } else {
      f.innerHTML = `<input id="email" type="email" placeholder="${esc(T.email)}"><div class="row"><button id="send" class="ghost">${esc(T.send_code)}</button></div><div id="step2" hidden><input id="code" inputmode="numeric" placeholder="${esc(T.code)}"><button id="go">${esc(T.enter)}</button></div>`;
      f.querySelector('#send').addEventListener('click', () => post({ kind: 'sendCode', email: f.querySelector('#email').value.trim() }));
      f.querySelector('#go').addEventListener('click', () => post({ kind: 'signIn', body: { method: 'email_code', email: f.querySelector('#email').value.trim(), code: f.querySelector('#code').value.trim() } }));
    }
    root.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const go = root.querySelector('#go'); if (go && !go.closest('[hidden]')) go.click(); else { const s = root.querySelector('#send'); if (s) s.click(); } } }));
  }

  function bugun(d) {
    let html = '';
    if (d.briefing && d.briefing.text) html += `<h3>${esc(T.briefing)}</h3><div class="card"><div class="meta">${esc(d.briefing.title || '')}</div><div class="text">${esc(d.briefing.text).slice(0, 1200)}</div></div>`;
    html += `<h3>${esc(T.today_tasks)}</h3>`;
    if (!d.tasks || !d.tasks.length) html += `<div class="empty">${esc(T.empty)}</div>`;
    for (const x of d.tasks || []) html += `<div class="item"><span class="dot ${x.overdue ? 'late' : ''}" style="margin-top:6px"></span><span class="grow">${esc(x.title)}${x.overdue ? ` <span class="hint">· ${esc(T.overdue)}</span>` : ''}</span><span class="when">${when(x.due_at || x.remind_at)}</span></div>`;
    if (d.recent && d.recent.length) { html += `<h3>${esc(T.recent)}</h3>`; for (const c of d.recent.slice(0, 5)) html += `<div class="item"><span class="grow">${esc(c.title || '')}</span><span class="when">${when(c.updated_at)}</span></div>`; }
    html += `<div style="margin-top:12px"><button id="claude">${esc(T.claude)}</button></div>`;
    root.innerHTML = html;
    root.querySelector('#claude').addEventListener('click', () => post({ kind: 'openClaude' }));
  }

  function tasdiqlar(list) {
    const pending = (list || []).filter((a) => a.status === 'pending');
    if (!pending.length) { root.innerHTML = `<div class="empty">${esc(T.empty)}</div>`; return; }
    root.innerHTML = pending.map((a) => `<div class="card"><div class="meta">${esc(a.action)} · ${when(a.created_at)}</div><div class="text">${esc(a.text || a.summary)}</div><div class="row" style="margin-top:8px"><button data-ok="${a.id}">${esc(T.approve)}</button><button class="ghost" data-no="${a.id}">${esc(T.reject)}</button></div></div>`).join('');
    root.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => { b.disabled = true; post({ kind: 'approve', id: Number(b.dataset.ok) }); }));
    root.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => { b.disabled = true; post({ kind: 'reject', id: Number(b.dataset.no) }); }));
  }

  function fayllar(list) {
    if (!list || !list.length) { root.innerHTML = `<div class="empty">${esc(T.empty)}</div>`; return; }
    root.innerHTML = list.slice(0, 40).map((f) => `<div class="item"><span class="grow">${esc(f.filename)}<div class="hint">${esc(f.source || '')} · ${Math.max(1, Math.round((f.size || 0) / 1024))} KB</div></span><span class="when">${when(f.created_at)}</span><button class="link" data-open="${f.id}">${esc(T.open)}</button></div>`).join('');
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => post({ kind: 'openFile', id: Number(b.dataset.open) })));
  }

  window.addEventListener('message', (ev) => {
    const m = ev.data || {};
    if (m.t) T = m.t;
    if (m.kind === 'signin') signIn();
    else if (m.kind === 'signinElsewhere') root.innerHTML = `<div class="empty">${esc(T.signin_elsewhere)}</div>`;
    else if (m.kind === 'loading') root.innerHTML = `<div class="hint">${esc(T.loading)}</div>`;
    else if (m.kind === 'codeSent') { const s = root.querySelector('#step2'); if (s) s.hidden = false; const e = root.querySelector('#err'); if (e) { e.className = 'ok'; e.textContent = T.code_sent; } }
    else if (m.kind === 'error') { const e = root.querySelector('#err'); if (e) { e.className = 'err'; e.textContent = m.message; } else root.innerHTML = `<div class="err">${esc(m.message)}</div>`; }
    else if (m.kind === 'data') { if (panel === 'bugun') bugun(m.data || {}); else if (panel === 'tasdiqlar') tasdiqlar(m.data); else if (panel === 'fayllar') fayllar(m.data); }
  });
  post({ kind: 'refresh' });
})();
