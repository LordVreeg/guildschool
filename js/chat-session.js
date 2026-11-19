// ============================================================
// CHAT SESSIONS: the /session command
// ============================================================
// /session opens one dialog for the group's chat as a game session:
//   - pick a session (the one being played now, or a saved one) and name it
//   - download it as text or HTML, or copy it to the clipboard
//   - Load session: read it in the chat window
//   - Save session (GM): keep the session so far under its name, then ask
//     whether to end it and start a new one
// A saved session is only a name and a stretch of time (table chat_sessions,
// schema_v31); the messages stay in group_chat_messages. Everything works
// without the table except saving and loading. What you can export or read is
// what you could already see: a whisper is in it only if you sent or got it.

const CHAT_SESSION_EPOCH = '1970-01-01T00:00:00.000Z';   // "from the very start of the chat"
let chatSessions = [];            // chat_sessions rows for chatGroupId, oldest first
let chatSessionsReady = true;     // false when schema_v31 hasn't been run
let chatSessionPick = 'current';  // the picker's choice

function chatSessionsMissing(error) {
  return error && (error.code === '42P01' || error.code === 'PGRST205' || /chat_sessions/.test(error.message || ''));
}
// quiet: don't redraw the chat (the caller is about to).
async function chatSessionsLoad(quiet) {
  const groupId = chatGroupId;
  const { data, error } = await sb.from('chat_sessions').select('*').eq('group_id', groupId).order('started_at');
  if (groupId !== chatGroupId) return null;   // switched groups while loading
  if (error) {
    chatSessionsReady = !chatSessionsMissing(error);
    chatSessions = [];
    if (!quiet) chatSessionsViewRefresh();
    return error;
  }
  chatSessionsReady = true;
  chatSessions = data || [];
  if (!quiet) chatSessionsViewRefresh();
  return null;
}
function chatSessionsViewRefresh() {
  renderChatSessionLabel();
  if (typeof chatPageOpen === 'function' && chatPageOpen() && !chatSearch) renderChatMessages('keep');
}
// The session being played, named in the chat header (blank until a session has been saved).
function renderChatSessionLabel() {
  const el = document.getElementById('chat-session-label');
  if (!el) return;
  const open = chatSessionOpenRow();
  const name = open ? open.name : (chatSessions.some(s => s.closed) ? chatSessionDefaultName() : '');
  el.textContent = name ? '· ' + name : '';
  el.title = name ? 'The current session. /session to save, load or end it.' : '';
}
// Dividers for the chat: where each saved session begins and ends, and where
// the current one began. t is the timestamp a divider sits at: a "begins"
// divider goes before the first message after it, an "ends" divider after the
// last message up to it (an end comes first when both fall on the same moment).
function chatSessionMarkers() {
  if (!chatSessionsReady || !chatSessions.length) return [];
  const mk = [];
  for (const s of chatSessions) {
    mk.push({ t: s.started_at, order: 1, text: `${s.name} begins` });
    if (s.closed) mk.push({ t: s.ended_at, order: 0, text: `${s.name} ends` });
  }
  if (!chatSessionOpenRow()) mk.push({ t: chatSessionCurrentStart(), order: 1, text: `${chatSessionDefaultName()} begins` });   // the new session, not named yet
  return mk.sort((a, b) => a.t.localeCompare(b.t) || a.order - b.order);
}
// Sessions are ended by a GM in another window, so look again when this one comes to the front.
let chatSessionsLastLook = 0;
window.addEventListener('focus', () => {
  if (typeof chatPageOpen !== 'function' || !chatPageOpen() || Date.now() - chatSessionsLastLook < 5000) return;
  chatSessionsLastLook = Date.now();
  chatSessionsLoad();
});
// Where the session being played began: the end of the last ended session.
function chatSessionCurrentStart() {
  return chatSessions.filter(s => s.closed).reduce((a, s) => (s.ended_at > a ? s.ended_at : a), CHAT_SESSION_EPOCH);
}
function chatSessionOpenRow() { return chatSessions.find(s => !s.closed) || null; }
function chatSessionDefaultName() { return 'Session ' + (chatSessions.filter(s => s.closed).length + 1); }
function chatSessionDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function chatSessionRangeText(from, to) {
  const a = from === CHAT_SESSION_EPOCH ? 'the start of the chat' : chatSessionDate(from);
  return to ? `${a} to ${chatSessionDate(to)}` : `since ${a}`;
}
// What the picker offers: the current session, then the saved ones, newest first.
function chatSessionChoices() {
  const open = chatSessionOpenRow();
  const cur = { value: 'current', from: chatSessionCurrentStart(), to: null,
    name: open ? open.name : chatSessionDefaultName(),
    label: 'Current session (' + chatSessionRangeText(chatSessionCurrentStart(), null) + ')' };
  const saved = chatSessions.slice().sort((a, b) => b.started_at.localeCompare(a.started_at)).map(s => ({
    value: s.id, from: s.started_at, to: s.ended_at, name: s.name, row: s,
    label: `${s.name} (${chatSessionRangeText(s.started_at, s.ended_at)}${s.closed ? '' : ', saved, still going'})`
  }));
  return [cur].concat(saved);
}
function chatSessionChoice() {
  const all = chatSessionChoices();
  return all.find(c => c.value === chatSessionPick) || all[0];
}

// Every stored message in a stretch of time, oldest first, as this user can
// see them (the database already hides other people's whispers).
async function chatSessionFetch(from, to) {
  const out = [], PAGE = 1000;
  for (let at = 0; ; at += PAGE) {
    let q = sb.from('group_chat_messages').select('*').eq('group_id', chatGroupId).is('deleted_at', null)
      .gt('created_at', from).order('created_at', { ascending: true }).range(at, at + PAGE - 1);
    if (to) q = q.lte('created_at', to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out.filter(m => !(m.payload && m.payload.att_reply));   // /att answers are never shown
}

// ---------- the dialog ----------
async function openChatSessionModal() {
  if (!chatGroupId) return;
  chatSessionPick = 'current';
  openModal('<h3>Session</h3><div class="note">Loading…</div>', { width: 'min(520px, 94vw)' });
  await chatSessionsLoad();
  renderChatSessionModal();
}
function renderChatSessionModal(status) {
  const gm = chatIsGM();
  const choices = chatSessionChoices();
  const cur = chatSessionChoice();
  const isCurrent = cur.value === 'current';
  const saveOk = gm && chatSessionsReady && isCurrent;
  const group = myGroups.find(g => g.id === chatGroupId);
  openModal(`
    <h3>Session${group ? ' — ' + escapeHtml(group.name) : ''}</h3>
    <div class="form-group" style="margin-bottom:8px"><label>Session</label>
      <select id="cs-pick" class="w-full" onchange="chatSessionPicked(this.value)">
        ${choices.map(c => `<option value="${escapeHtml(c.value)}" ${c.value === cur.value ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
      </select></div>
    <div class="form-group" style="margin-bottom:10px"><label>Name</label>
      <input id="cs-name" class="w-full" maxlength="80" value="${escapeHtml(cur.name)}" ${isCurrent ? '' : 'disabled'} onkeydown="if(event.key==='Enter'){event.preventDefault();chatSessionSave()}"></div>
    <div class="cs-group-label">Get a copy${infoTip('Everything in the session, in order, with dice results. A whisper is included only if you sent it or it was sent to you.')}</div>
    <div class="cs-buttons">
      <button class="btn btn-dim" onclick="chatSessionExport('txt')">Download text</button>
      <button class="btn btn-dim" onclick="chatSessionExport('html')">Download HTML</button>
      <button class="btn btn-dim" onclick="chatSessionExport('copy')">Copy to clipboard</button>
    </div>
    <div class="cs-group-label">Keep it${infoTip('Save session keeps the current session under its name (the messages stay in the chat; saving again later updates it). It then asks whether to end the session and start a new one. Load session reads the chosen session in the chat window.')}</div>
    <div class="cs-buttons">
      <button class="btn btn-dim" ${chatSessionsReady ? '' : 'disabled'} onclick="chatSessionLoad()">Load session</button>
      <button class="btn btn-gold" ${saveOk ? '' : 'disabled'} ${gm ? '' : 'title="Only a GM can save a session"'} onclick="chatSessionSave()">Save session</button>
      ${gm && chatSessionsReady && !isCurrent ? '<button class="btn btn-dim" onclick="chatSessionDelete()">Delete saved session</button>' : ''}
    </div>
    ${chatSessionsReady ? '' : '<div class="warn">Saving and loading sessions isn\'t set up in the database yet. An admin needs to run <b>schema_v31_chat_sessions.sql</b> in the Supabase SQL editor. Download and copy work now.</div>'}
    <div id="cs-status" class="note">${status ? escapeHtml(status) : ''}</div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Close</button></div>`, { width: 'min(520px, 94vw)' });
}
function chatSessionPicked(value) {
  chatSessionPick = value;
  renderChatSessionModal();
}
function chatSessionStatus(text) {
  const el = document.getElementById('cs-status');
  if (el) el.textContent = text || '';
}
// The name typed in the box (for the current session), else the saved name.
function chatSessionName() {
  const cur = chatSessionChoice();
  const input = document.getElementById('cs-name');
  const typed = input && !input.disabled ? input.value.trim() : '';
  return typed || cur.name;
}

// ---------- save / end ----------
async function chatSessionSave() {
  if (!chatIsGM()) return;
  const name = chatSessionName();
  chatSessionStatus('Saving…');
  // The end is the newest message's own timestamp, so it lines up with the
  // messages exactly (no clock differences between this browser and the server).
  const { data: newest, error: nErr } = await sb.from('group_chat_messages').select('created_at').eq('group_id', chatGroupId)
    .order('created_at', { ascending: false }).limit(1);
  if (nErr) { chatSessionStatus('Failed to save: ' + nErr.message); return; }
  const from = chatSessionCurrentStart();
  // A session with no messages yet (the one just started) can still be named:
  // it is saved with nothing in it, and Save session again later keeps its messages.
  const empty = !newest || !newest.length || newest[0].created_at <= from;
  const ended = empty ? (from === CHAT_SESSION_EPOCH ? new Date().toISOString() : from) : newest[0].created_at;
  const open = chatSessionOpenRow();
  // The write asks for nothing back, then the list is read again to confirm it
  // landed: a database rule that hides a row would otherwise fail with a vague
  // "cannot coerce the result" error.
  const res = open
    ? await sb.from('chat_sessions').update({ name, ended_at: ended }).eq('id', open.id)
    : await sb.from('chat_sessions').insert({ group_id: chatGroupId, name, started_at: from, ended_at: ended, closed: false, created_by: currentUser.id });
  if (res.error) { chatSessionStatus(`Failed to save (${open ? 'update' : 'add'}): ${res.error.message}${res.error.code ? ' [' + res.error.code + ']' : ''}`); return; }
  const loadErr = await chatSessionsLoad();
  const saved = chatSessionOpenRow();
  if (loadErr || !saved || Date.parse(saved.ended_at) !== Date.parse(ended)) {
    chatSessionStatus(loadErr
      ? 'Saved, but the saved sessions could not be read back: ' + loadErr.message
      : `The database did not keep the ${open ? 'change' : 'new session'}. Check that schema_v31_chat_sessions.sql ran completely and that you are a GM of this group.`);
    return;
  }
  if (empty) { renderChatSessionModal(`Named this session “${name}”. Save session again once you've played some, to keep its messages.`); return; }
  renderChatSessionModal(`Saved “${name}”.`);
  const end = await appConfirm(`Saved “${name}”. End this session and start a new one?`, 'End session');
  if (!end) { renderChatSessionModal(`Saved “${name}”. The session is still going.`); return; }
  const { error } = await sb.from('chat_sessions').update({ closed: true }).eq('id', saved.id);
  const reloadErr = error ? null : await chatSessionsLoad();
  const stillOpen = !error && !reloadErr && chatSessions.some(s => s.id === saved.id && !s.closed);
  if (error || reloadErr || stillOpen) {
    renderChatSessionModal('Saved, but the session could not be ended' + (error ? ': ' + error.message : stillOpen ? ': the database did not keep the change.' : '.'));
    return;
  }
  chatSessionPick = 'current';
  renderChatSessionModal(`“${name}” ended. A new session has started.`);
}
async function chatSessionDelete() {
  const cur = chatSessionChoice();
  if (!cur.row || !chatIsGM()) return;
  if (!await appConfirm(`Delete the saved session “${cur.name}”? The messages stay in the chat; only the saved name and dates are removed.`, 'Delete')) return;
  const { error } = await sb.from('chat_sessions').delete().eq('id', cur.row.id);
  if (error) { chatSessionStatus('Failed to delete: ' + error.message); return; }
  chatSessionPick = 'current';
  await chatSessionsLoad();
  renderChatSessionModal(`Deleted “${cur.name}”.`);
}

// ---------- load ----------
async function chatSessionLoad() {
  const cur = chatSessionChoice();
  chatSessionStatus('Loading…');
  let msgs;
  try { msgs = await chatSessionFetch(cur.from, cur.to); } catch (e) { chatSessionStatus('Failed to load: ' + e.message); return; }
  const label = cur.value === 'current' ? chatSessionName() : cur.name;
  chatSearch = { term: label, results: msgs, session: true };
  closeModal();
  renderChatSearchBar();
  renderChatMessages('bottom');
}

// ---------- download / copy ----------
function chatSessionDay(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function chatPlainWhisper(m) {
  if (!m.whisper_to) return '';
  if (m.author_id === currentUser.id) return `(To ${m.whisper_label || '?'})`;
  return `(Whisper${m.whisper_label ? ' to ' + m.whisper_label : ''})`;
}
// Text with its [[inline rolls]] replaced by their stored results.
function chatPlainRich(text, rolls, cursor) {
  const spans = DiceRoller.findInline(text);
  let out = '', at = 0;
  for (const sp of spans) {
    out += text.slice(at, sp.start);
    const r = (rolls || [])[cursor.i++];
    out += r && !r.error ? String(r.total) : '?';
    at = sp.end;
  }
  return out + text.slice(at);
}
function chatPlainBody(m) {
  const p = m.payload || {};
  if (m.kind === 'roll' && p.rolls && p.rolls[0]) {
    const r = p.rolls[0], steps = DiceRoller.partsText(r.parts).trim();
    return `rolled ${r.expr}: ${steps && steps !== String(r.total) ? steps + ' = ' : ''}${r.total}`;
  }
  const cursor = { i: 0 };
  if (p.template) {
    const rows = Array.isArray(p.template.rows) ? p.template.rows : [];
    const title = rows.find(([k]) => String(k).toLowerCase() === 'name');
    return [p.text ? chatPlainRich(p.text, p.inline, cursor) : '',
      title ? chatPlainRich(String(title[1]), p.inline, cursor) : '',
      ...rows.filter(r => r !== title).map(([k, v]) => `   ${k}: ${chatPlainRich(String(v), p.inline, cursor)}`)].filter(Boolean).join('\n');
  }
  return chatPlainRich(m.body || '', p.inline, cursor);
}
function chatSessionHeaderLines(title, cur) {
  const group = myGroups.find(g => g.id === chatGroupId);
  return [title, `${group ? group.name + ' — ' : ''}${chatSessionRangeText(cur.from, cur.to)}`,
    `Exported ${new Date().toLocaleString()}. Whispers are included only if you sent or received them.`];
}
function chatSessionText(title, cur, msgs) {
  const lines = chatSessionHeaderLines(title, cur);
  lines.push('');
  let lastDay = '';
  for (const m of msgs) {
    const d = new Date(m.created_at);
    if (d.toDateString() !== lastDay) { lastDay = d.toDateString(); lines.push('', `=== ${chatSessionDay(d)} ===`); }
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const who = m.sender_name || '?', w = chatPlainWhisper(m), body = chatPlainBody(m).replace(/\n/g, '\n    ');
    const kind = m.kind || 'message';
    if (kind === 'emote' || kind === 'emas') lines.push(`[${time}] ${w ? w + ' ' : ''}* ${who} ${body}`);
    else if (kind === 'desc') lines.push(`[${time}] ${w ? w + ' ' : ''}— ${body}`);
    else lines.push(`[${time}] ${who}${kind === 'ooc' ? ' (OOC)' : ''}${w ? ' ' + w : ''}: ${body}`);
  }
  return lines.join('\n') + '\n';
}
const CHAT_SESSION_HTML_CSS = `
body{font-family:Georgia,serif;max-width:820px;margin:24px auto;padding:0 16px;color:#2a2418;background:#fbf8f1;line-height:1.45}
h1{font-size:1.5em;margin:0 0 4px} .meta{color:#6b624f;font-size:.85em;margin-bottom:18px}
.day{text-align:center;margin:22px 0 8px;border-bottom:1px solid #cfc6b0;line-height:0}.day span{background:#fbf8f1;padding:0 10px;font-size:.8em;text-transform:uppercase;letter-spacing:1px;color:#6b624f}
.m{padding:3px 8px;margin-top:4px;border-left:3px solid transparent}.m.w{background:rgba(92,60,140,.09);border-left-color:#7a5aa8}
.t{color:#6b624f;font-size:.8em;margin-right:6px}.who{font-weight:bold;color:#7a5a12}.wt{font-size:.8em;color:#6a4a98;font-style:italic;margin-left:4px}
.m.emote,.m.emas{font-style:italic;color:#7a5a12;text-align:center}.m.desc{font-style:italic;text-align:center;background:rgba(122,90,18,.07)}.m.ooc{color:#6b624f}
.body{white-space:pre-wrap;overflow-wrap:anywhere}
.dice-inline,.dice-total{display:inline-block;min-width:1.6em;padding:0 5px;text-align:center;font-weight:bold;background:rgba(201,162,39,.18);border:1px solid #a98a3a;border-radius:3px}
.dice-inline.crit,.dice-total.crit{border-color:#3c8a4a;color:#2f7a3c}.dice-inline.fumble,.dice-total.fumble{border-color:#b03030;color:#b03030}.dice-inline.both,.dice-total.both{border-color:#3c6ab0;color:#2f5a9a}
.dice-roll{display:inline-block;margin:2px 0;padding:4px 8px;background:rgba(255,255,255,.6);border:1px solid #cfc6b0;white-space:normal}.dice-formula{font-size:.8em;color:#6b624f}.dice-eq{color:#6b624f}
.dr-dropped,.dr-rerolled{text-decoration:line-through;opacity:.5}.dr-crit,.dr-success{color:#2f7a3c;font-weight:bold}.dr-fumble,.dr-failure{color:#b03030;font-weight:bold}
.chat-template{display:inline-block;min-width:220px;border:1px solid #a98a3a;background:rgba(255,255,255,.6);white-space:normal}.chat-template-title{background:#4a3a1c;color:#fbf8f1;padding:4px 8px}
.chat-template-row{display:flex;gap:10px;padding:3px 8px;border-top:1px solid #e1d9c3}.chat-template-key{font-weight:bold;min-width:80px}a{color:#7a5a12}`;
function chatSessionHtml(title, cur, msgs) {
  const [, rangeLine, note] = chatSessionHeaderLines(title, cur);
  let html = '', lastDay = '';
  for (const m of msgs) {
    const d = new Date(m.created_at);
    if (d.toDateString() !== lastDay) { lastDay = d.toDateString(); html += `<div class="day"><span>${escapeHtml(chatSessionDay(d))}</span></div>`; }
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const kind = m.kind || 'message', w = chatPlainWhisper(m);
    const tag = w ? `<span class="wt">${escapeHtml(w)}</span>` : '';
    const who = `<span class="who">${escapeHtml(m.sender_name || '?')}</span>${kind === 'ooc' ? ' <span class="wt">(OOC)</span>' : ''}`;
    const body = `<span class="body">${chatMessageBodyHtml(m)}</span>`;
    let inner;
    if (kind === 'emote' || kind === 'emas') inner = `<span class="t">${time}</span>${tag} ${who} ${body}`;
    else if (kind === 'desc') inner = `<span class="t">${time}</span>${tag} ${body}`;
    else inner = `<span class="t">${time}</span>${who}${tag} ${body}`;
    html += `<div class="m ${escapeHtml(kind)}${m.whisper_to ? ' w' : ''}">${inner}</div>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${CHAT_SESSION_HTML_CSS}</style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(rangeLine)}<br>${escapeHtml(note)}</div>${html}</body></html>`;
}
function chatSessionDownload(filename, mime, content) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function chatSessionCopy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {   // older browsers, or a window that isn't allowed to use the clipboard API
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
async function chatSessionExport(how) {
  const cur = chatSessionChoice();
  const title = chatSessionName();
  chatSessionStatus('Collecting the messages…');
  let msgs;
  try { msgs = await chatSessionFetch(cur.from, cur.to); } catch (e) { chatSessionStatus('Failed: ' + e.message); return; }
  if (!msgs.length) { chatSessionStatus('There are no messages in this session yet.'); return; }
  const stamp = new Date().toISOString().slice(0, 10);
  const file = (title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'session') + '-' + stamp;
  const n = `${msgs.length} message${msgs.length === 1 ? '' : 's'}`;
  if (how === 'html') { chatSessionDownload(file + '.html', 'text/html', chatSessionHtml(title, cur, msgs)); chatSessionStatus(`Downloaded ${n} as HTML.`); return; }
  const text = chatSessionText(title, cur, msgs);
  if (how === 'txt') { chatSessionDownload(file + '.txt', 'text/plain', text); chatSessionStatus(`Downloaded ${n} as text.`); return; }
  if (await chatSessionCopy(text)) { chatSessionStatus(`Copied ${n} to the clipboard.`); return; }
  chatSessionStatus('The browser blocked copying. Use Download text instead.');
}
