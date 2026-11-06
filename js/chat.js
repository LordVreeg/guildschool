// ============================================================
// GROUP CHAT (one chat per group; post as one of your characters in it)
// ============================================================
// Messages live in group_chat_messages (see schema_group_chat.sql and
// schema_chat_v2.sql). The database fills in the sender's name, works out
// whisper recipients, and enforces who may read, post, edit and delete;
// this page only offers what's allowed.
// One realtime channel, opened at sign-in, carries every group's new and
// changed messages: it updates the open chat and the unread badges.
//
// Roll20-style chat: /roll /gmroll /w /em /ooc /desc /as /emas
// /talktomyself /help, inline [[rolls]], ?{queries}, @{attributes},
// #macros and %{Character|macro}, &{template:default} cards,
// **bold** *italic* ~~strike~~ [links](url), and up-arrow history.

const CHAT_PAGE_SIZE = 50;
let chatGroupId = null;
let chatMessages = [];      // oldest first, for chatGroupId
let chatHasMore = false;
let chatUnread = {};        // groupId -> count of unread messages from others
let chatChannel = null;
let chatSetupError = null;  // set when the table isn't there yet
let chatRoster = [];        // group_roster rows (id, owner_id, name) for chatGroupId
let chatTalkToMyself = false;
let chatHistory = [];       // what you've sent, newest last (up-arrow recall)
let chatHistoryPos = -1;
let chatSearch = null;      // { term, results } while showing search results

function chatReadKey(groupId) { return 'gs_chat_read_' + groupId; }
function chatLastRead(groupId) {
  try { return localStorage.getItem(chatReadKey(groupId)) || '1970-01-01T00:00:00Z'; } catch (e) { return '1970-01-01T00:00:00Z'; }
}
function chatMarkRead(groupId) {
  const stored = chatMessages.filter(m => !m.local);
  const last = stored.length ? stored[stored.length - 1].created_at : new Date().toISOString();
  try { localStorage.setItem(chatReadKey(groupId), last); } catch (e) {}
  chatUnread[groupId] = 0;
  updateChatMenuBadge();
}

function chatIsMissingTable(error) {
  return error && (error.code === '42P01' || error.code === 'PGRST205' || /group_chat_messages/.test(error.message || ''));
}

// Called once after sign-in: unread counts, then the live channel.
async function startChatWatcher() {
  await refreshChatUnread();
  if (chatChannel || chatSetupError) return;
  chatChannel = sb.channel('group-chat')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_chat_messages' }, onChatChange)
    .subscribe();
}

function stopChatWatcher() {
  if (chatChannel) sb.removeChannel(chatChannel);
  chatChannel = null;
  chatUnread = {};
  chatGroupId = null;
  chatMessages = [];
  chatHistory = [];
  chatTalkToMyself = false;
  updateChatMenuBadge();
}

async function refreshChatUnread() {
  if (!currentUser || !myGroups.length) { updateChatMenuBadge(); return; }
  const results = await Promise.all(myGroups.map(g => sb.from('group_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', g.id).neq('author_id', currentUser.id).is('deleted_at', null)
    .gt('created_at', chatLastRead(g.id))));
  const failed = results.find(r => r.error);
  if (failed) {
    if (chatIsMissingTable(failed.error)) chatSetupError = failed.error;
    else console.error('Failed to load chat unread counts', failed.error);
    return;
  }
  myGroups.forEach((g, i) => { chatUnread[g.id] = results[i].count || 0; });
  updateChatMenuBadge();
}

function updateChatMenuBadge() {
  const total = Object.values(chatUnread).reduce((a, b) => a + b, 0);
  for (const id of ['chat-menu-badge', 'other-menu-badge']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = total ? (total > 99 ? '99+' : String(total)) : '';
    el.style.display = total ? '' : 'none';
  }
}

function chatPageOpen() {
  return state.activeView === 'chat' && !!document.getElementById('chat-messages');
}

function onChatChange(payload) {
  const msg = payload.new;
  if (!msg || !msg.id) return;
  if (payload.eventType === 'INSERT') {
    if (chatPageOpen() && msg.group_id === chatGroupId) {
      if (!chatMessages.some(m => m.id === msg.id)) {
        const stick = chatNearBottom();
        chatMessages.push(msg);
        if (!chatSearch) renderChatMessages(stick ? 'bottom' : 'keep');
      }
      if (document.visibilityState === 'visible') chatMarkRead(chatGroupId);
      return;
    }
    if (msg.author_id !== currentUser.id) {
      chatUnread[msg.group_id] = (chatUnread[msg.group_id] || 0) + 1;
      updateChatMenuBadge();
      if (chatPageOpen()) renderChatGroupTabs();
    }
  } else if (payload.eventType === 'UPDATE') {
    const i = chatMessages.findIndex(m => m.id === msg.id);
    if (i >= 0) { chatMessages[i] = msg; if (chatPageOpen() && !chatSearch) renderChatMessages('keep'); }
  }
}

function showChatModule() {
  state.activeSkillId = null;
  state.activeView = 'chat';
  renderSidebar();
  renderChatModule();
}

async function renderChatModule() {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="panel"><div class="panel-body">Loading chat…</div></div>`;
  await fetchMyGroups();
  if (chatGroupId && !myGroups.find(g => g.id === chatGroupId)) chatGroupId = null;
  if (!chatGroupId && myGroups.length) {
    // Open the group with unread messages first, else the first group.
    const unreadGroup = myGroups.find(g => chatUnread[g.id] > 0);
    chatGroupId = (unreadGroup || myGroups[0]).id;
  }
  if (!myGroups.length) {
    main.innerHTML = `<div class="panel"><div class="panel-header"><h2>Chat</h2></div><div class="panel-body"><div class="note">You're not in any groups yet. Each group has its own chat — ask your GM to add one of your characters to a group.</div></div></div>`;
    return;
  }
  main.innerHTML = `
    <div class="panel chat-panel">
      <div class="panel-header"><h2>Chat</h2>
        <div style="flex:1"></div>
        <input id="chat-search-input" class="chat-search" type="search" placeholder="Search this chat…" onkeydown="if(event.key==='Enter')searchChat(this.value)">
        <button class="btn btn-dim" style="font-size:11px;padding:3px 8px" onclick="showChatHelp()" title="Commands and dice syntax">? Help</button>
      </div>
      <div class="panel-body">
        <div id="chat-group-tabs" class="chat-group-tabs"></div>
        <div id="chat-search-bar"></div>
        <div id="chat-messages" class="chat-messages"><div class="note">Loading messages…</div></div>
        <div id="chat-composer"></div>
      </div>
    </div>`;
  renderChatGroupTabs();
  await loadChatRoster();
  renderChatComposer();
  await loadChatMessages(false);
}

async function selectChatGroup(groupId) {
  if (groupId === chatGroupId) return;
  chatGroupId = groupId;
  chatMessages = [];
  chatSearch = null;
  renderChatSearchBar();
  renderChatGroupTabs();
  await loadChatRoster();
  renderChatComposer();
  loadChatMessages(false);
}

async function loadChatRoster() {
  const groupId = chatGroupId;
  const { data, error } = await sb.from('group_roster').select('id, owner_id, name').eq('group_id', groupId);
  if (groupId !== chatGroupId) return;
  chatRoster = error ? [] : (data || []);
}

function renderChatGroupTabs() {
  const el = document.getElementById('chat-group-tabs');
  if (!el) return;
  el.innerHTML = myGroups.map(g => {
    const n = g.id === chatGroupId ? 0 : (chatUnread[g.id] || 0);
    return `<button class="btn ${g.id === chatGroupId ? 'btn-gold' : 'btn-dim'}" onclick="selectChatGroup('${g.id}')">${escapeHtml(g.name)}${g.myRole === 'gm' ? ' ★' : ''}${n ? ` <span class="chat-badge">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
  }).join('');
}

function chatIsGM() {
  const group = myGroups.find(g => g.id === chatGroupId);
  return !!(group && group.myRole === 'gm');
}

// Your characters linked to this group: [{ appId, rowId, name }].
function chatMyCharacters(groupId) {
  return Object.keys(state.characters)
    .filter(appId => state.characters[appId].playGroupId === groupId && charRowIds[appId])
    .map(appId => ({ appId, rowId: charRowIds[appId], name: state.characters[appId].name || '(unnamed)' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Who you can post as in this group: your characters linked to it, plus
// "GM" if you're a GM of it. The choice is remembered per group.
function chatPostAsOptions(groupId) {
  const opts = chatMyCharacters(groupId).map(c => ({ value: c.rowId, label: c.name }));
  const group = myGroups.find(g => g.id === groupId);
  if (group && group.myRole === 'gm') opts.push({ value: '', label: 'GM' });
  return opts;
}

// The character currently picked in "Post as" (null when posting as GM).
function chatPostAsChar() {
  const sel = document.getElementById('chat-post-as');
  const rowId = sel ? sel.value : '';
  const appId = Object.keys(charRowIds).find(k => charRowIds[k] === rowId);
  return appId ? state.characters[appId] : null;
}

function renderChatComposer() {
  const el = document.getElementById('chat-composer');
  if (!el) return;
  const opts = chatPostAsOptions(chatGroupId);
  if (!opts.length) {
    el.innerHTML = `<div class="note" style="margin-top:8px">You can read this chat, but none of your characters is in this group, so you can't post. Link a character to this group on its General Info page.</div>`;
    return;
  }
  let saved = null;
  try { saved = localStorage.getItem('gs_chat_as_' + chatGroupId); } catch (e) {}
  const selected = opts.some(o => o.value === saved) ? saved : opts[0].value;
  el.innerHTML = `
    <div id="chat-macro-bar" class="chat-macro-bar"></div>
    <div class="chat-composer">
      <div class="form-group"><label>Post as</label>
        <select id="chat-post-as" onchange="try{localStorage.setItem('gs_chat_as_${chatGroupId}', this.value)}catch(e){};renderChatMacroBar()">
          ${opts.map(o => `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select>
      </div>
      <textarea id="chat-input" rows="2" maxlength="4000" placeholder="Message, /roll 1d20+5, [[2d6]], /w Name … — /help for commands" onkeydown="chatInputKeydown(event)"></textarea>
      <button class="btn btn-gold" id="chat-send-btn" onclick="sendChatMessage()">Send</button>
    </div>
    <div id="chat-status" class="note" style="color:var(--red-b);display:none"></div>
    <div id="chat-mode-note" class="note" style="display:none"></div>`;
  renderChatMacroBar();
  renderChatModeNote();
}

function renderChatModeNote() {
  const el = document.getElementById('chat-mode-note');
  if (!el) return;
  el.style.display = chatTalkToMyself ? '' : 'none';
  el.textContent = chatTalkToMyself ? 'Talking to yourself: messages stay on this screen only and are not sent or saved. Type /talktomyself off to stop.' : '';
}

function chatInputKeydown(e) {
  const input = e.target;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendChatMessage();
    return;
  }
  // Up/Down at the start/end of the box steps through what you've sent.
  if (e.key === 'ArrowUp' && input.selectionStart === 0 && input.selectionEnd === 0 && chatHistory.length) {
    e.preventDefault();
    chatHistoryPos = chatHistoryPos < 0 ? chatHistory.length - 1 : Math.max(0, chatHistoryPos - 1);
    input.value = chatHistory[chatHistoryPos];
  } else if (e.key === 'ArrowDown' && chatHistoryPos >= 0 && input.selectionStart === input.value.length) {
    e.preventDefault();
    chatHistoryPos++;
    if (chatHistoryPos >= chatHistory.length) { chatHistoryPos = -1; input.value = ''; }
    else input.value = chatHistory[chatHistoryPos];
  }
}

function chatShowStatus(text) {
  const el = document.getElementById('chat-status');
  if (!el) { if (text) alert(text); return; }
  el.textContent = text || '';
  el.style.display = text ? '' : 'none';
}

async function loadChatMessages(older) {
  const groupId = chatGroupId;
  let q = sb.from('group_chat_messages').select('*').eq('group_id', groupId)
    .order('created_at', { ascending: false }).limit(CHAT_PAGE_SIZE);
  const stored = chatMessages.filter(m => !m.local);
  if (older && stored.length) q = q.lt('created_at', stored[0].created_at);
  const { data, error } = await q;
  if (groupId !== chatGroupId) return; // switched groups while loading
  const box = document.getElementById('chat-messages');
  if (error) {
    if (!box) return;
    box.innerHTML = chatIsMissingTable(error)
      ? `<div class="note" style="color:var(--red-b)">Chat isn't set up in the database yet. An admin needs to run <b>schema_group_chat.sql</b> in the Supabase SQL editor.</div>`
      : `<div class="note" style="color:var(--red-b)">Failed to load messages: ${escapeHtml(error.message)}</div>`;
    return;
  }
  const batch = (data || []).reverse();
  chatHasMore = (data || []).length === CHAT_PAGE_SIZE;
  if (older) {
    chatMessages = batch.concat(chatMessages);
    renderChatMessages('older');
  } else {
    // Keep local-only lines (talk-to-myself, help, errors) from this visit.
    chatMessages = batch.concat(chatMessages.filter(m => m.local && m.group_id === groupId));
    chatMessages.sort((a, b) => a.created_at.localeCompare(b.created_at));
    renderChatMessages('bottom');
    chatMarkRead(groupId);
    renderChatGroupTabs();
  }
}

function chatNearBottom() {
  const box = document.getElementById('chat-messages');
  return !box || box.scrollHeight - box.scrollTop - box.clientHeight < 60;
}

// ---------- search (the chat archive) ----------
async function searchChat(term) {
  term = (term || '').trim();
  if (!term) { clearChatSearch(); return; }
  const like = '%' + term.replace(/[\\%_]/g, c => '\\' + c) + '%';
  const { data, error } = await sb.from('group_chat_messages').select('*').eq('group_id', chatGroupId)
    .is('deleted_at', null).or(`body.ilike.${JSON.stringify(like)},sender_name.ilike.${JSON.stringify(like)}`)
    .order('created_at', { ascending: true }).limit(200);
  if (error) { chatShowStatus('Search failed: ' + error.message); return; }
  chatSearch = { term, results: data || [] };
  renderChatSearchBar();
  renderChatMessages('bottom');
}
function clearChatSearch() {
  chatSearch = null;
  const input = document.getElementById('chat-search-input');
  if (input) input.value = '';
  renderChatSearchBar();
  renderChatMessages('bottom');
}
function renderChatSearchBar() {
  const el = document.getElementById('chat-search-bar');
  if (!el) return;
  el.innerHTML = chatSearch
    ? `<div class="chat-search-bar">${chatSearch.results.length}${chatSearch.results.length === 200 ? '+' : ''} message${chatSearch.results.length === 1 ? '' : 's'} matching “${escapeHtml(chatSearch.term)}” <button class="btn btn-dim" style="font-size:11px;padding:2px 8px" onclick="clearChatSearch()">Back to chat</button></div>`
    : '';
}

// ---------- rendering ----------
// Formats plain text: **bold**, *italic*, ~~strike~~, [text](url) and bare
// links. Everything is escaped first, so typed HTML only ever shows as text.
function chatFormatText(text) {
  const keep = [];
  const stash = html => `\u0000${keep.push(html) - 1}\u0000`;
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => stash(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`));
  s = s.replace(/\bhttps?:\/\/[^\s<\u0000]+[^\s<.,;:!?)\]'"\u0000]/g, url => stash(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`));
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1<i>$2</i>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}

function chatRollTitle(r) {
  return `Rolling ${r.expr} = ${DiceRoller.partsText(r.parts)}`;
}
function chatInlineRollHtml(r) {
  if (!r || r.error) return `<span class="dice-inline dice-error" title="${escapeHtml(r ? r.error : '')}">?</span>`;
  const cls = r.crit && r.fumble ? 'both' : r.crit ? 'crit' : r.fumble ? 'fumble' : '';
  return `<span class="dice-inline ${cls}" title="${escapeHtml(chatRollTitle(r))}">${escapeHtml(String(r.total))}</span>`;
}

// Text with its [[inline rolls]] swapped for their stored results, taken in
// order from `rolls` (cursor.i advances as they're used).
function chatRichText(text, rolls, cursor) {
  const spans = DiceRoller.findInline(text);
  let html = '', at = 0;
  for (const sp of spans) {
    html += chatFormatText(text.slice(at, sp.start));
    html += chatInlineRollHtml((rolls || [])[cursor.i++]);
    at = sp.end;
  }
  return html + chatFormatText(text.slice(at));
}

function chatTemplateHtml(tpl, rolls, cursor) {
  const rows = Array.isArray(tpl.rows) ? tpl.rows : [];
  const title = rows.find(([k]) => String(k).toLowerCase() === 'name');
  return `<div class="chat-template">
    ${title ? `<div class="chat-template-title">${chatRichText(String(title[1]), rolls, cursor)}</div>` : ''}
    ${rows.filter(r => r !== title).map(([k, v]) => `<div class="chat-template-row"><span class="chat-template-key">${chatFormatText(String(k))}</span><span>${chatRichText(String(v), rolls, cursor)}</span></div>`).join('')}
  </div>`;
}

function chatMessageBodyHtml(m) {
  if (m.deleted_at) return `<span class="chat-deleted">Message deleted</span>`;
  const p = m.payload || {};
  if (m.kind === 'roll' && p.rolls && p.rolls[0]) {
    const r = p.rolls[0];
    const cls = r.crit && r.fumble ? 'both' : r.crit ? 'crit' : r.fumble ? 'fumble' : '';
    return `<div class="dice-roll"><div class="dice-formula">rolling ${escapeHtml(r.expr)}</div>
      <div class="dice-result">${DiceRoller.partsHtml(r.parts)} <span class="dice-eq">=</span> <span class="dice-total ${cls}">${escapeHtml(String(r.total))}</span></div></div>`;
  }
  const cursor = { i: 0 };
  if (p.template) return (p.text ? chatRichText(p.text, p.inline, cursor) : '') + chatTemplateHtml(p.template, p.inline, cursor);
  return chatRichText(m.body, p.inline, cursor);
}

function chatWhisperTag(m) {
  if (!m.whisper_to) return '';
  if (m.author_id === currentUser.id) return `<span class="chat-whisper-tag">(To ${escapeHtml(m.whisper_label || '?')})</span>`;
  return `<span class="chat-whisper-tag">(Whisper${m.whisper_label ? ' to ' + escapeHtml(m.whisper_label) : ''})</span>`;
}

function chatDayLabel(d) {
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// mode: 'bottom' scrolls to the newest message, 'keep' holds the reader's
// place, 'older' keeps the same message in view after older ones load above.
function renderChatMessages(mode) {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
  const isGM = chatIsGM();
  const list = chatSearch ? chatSearch.results : chatMessages;
  let html = !chatSearch && chatHasMore ? `<div style="text-align:center;margin-bottom:8px"><button class="btn btn-dim" style="font-size:11px" onclick="loadChatMessages(true)">Load older messages</button></div>` : '';
  if (!list.length) html += `<div class="note" style="text-align:center;padding:20px">${chatSearch ? 'No messages match.' : 'No messages yet. Say hello! Type /help to see the commands.'}</div>`;
  let lastDay = null, prev = null;
  for (const m of list) {
    const d = new Date(m.created_at);
    const day = d.toDateString();
    if (day !== lastDay) { html += `<div class="chat-day"><span>${chatDayLabel(d)}</span></div>`; lastDay = day; prev = null; }
    const mine = m.author_id === currentUser.id;
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const kind = m.kind || 'message';
    const editable = mine && !m.local && !m.deleted_at && !m.payload && ['message', 'emote', 'ooc', 'desc', 'as', 'emas'].includes(kind);
    const actions = m.local || m.deleted_at || chatSearch ? '' : [
      editable ? `<button onclick="openEditChatMessage('${m.id}')">Edit</button>` : '',
      (mine || isGM) ? `<button onclick="deleteChatMessage('${m.id}')">Delete</button>` : ''
    ].join('');
    const classes = ['chat-msg', 'kind-' + kind, mine ? 'mine' : '', m.whisper_to ? 'whisper' : '', m.local ? 'local' : ''];
    const bodyHtml = chatMessageBodyHtml(m);
    let inner;
    if (kind === 'emote' || kind === 'emas') {
      inner = `<div class="chat-body">${chatWhisperTag(m)} <b>${escapeHtml(m.sender_name || '?')}</b> ${bodyHtml}</div>`;
      prev = null;
    } else if (kind === 'desc' || kind === 'system') {
      inner = `<div class="chat-body">${chatWhisperTag(m)} ${bodyHtml}</div>`;
      prev = null;
    } else {
      // Back-to-back messages from the same sender within 5 minutes share a header.
      const continued = prev && prev.author_id === m.author_id && prev.sender_name === m.sender_name && (prev.kind || 'message') === kind
        && (prev.whisper_label || '') === (m.whisper_label || '') && !!prev.whisper_to === !!m.whisper_to
        && (d - new Date(prev.created_at)) < 5 * 60 * 1000;
      if (continued) classes.push('continued');
      inner = `${continued ? '' : `<div class="chat-msg-head"><span class="chat-sender">${escapeHtml(m.sender_name || '?')}</span>${kind === 'ooc' ? '<span class="chat-ooc-tag">(OOC)</span>' : ''}${chatWhisperTag(m)}<span class="chat-time">${time}</span></div>`}
        <div class="chat-body">${bodyHtml}${m.edited_at && !m.deleted_at ? ' <span class="chat-edited">(edited)</span>' : ''}</div>`;
      prev = m;
    }
    html += `<div class="${classes.filter(Boolean).join(' ')}" title="${escapeHtml(d.toLocaleString())}">${inner}${actions ? `<div class="chat-actions">${actions}</div>` : ''}</div>`;
  }
  box.innerHTML = html;
  if (mode === 'bottom') box.scrollTop = box.scrollHeight;
  else if (mode === 'older') box.scrollTop = box.scrollHeight - prevHeight + prevTop;
  else box.scrollTop = prevTop;
}

// A line only you see: help, talk-to-myself, or why something didn't send.
function chatLocalLine(kind, body, extra) {
  chatMessages.push(Object.assign({
    id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    local: true, group_id: chatGroupId, author_id: currentUser.id,
    sender_name: extra && extra.sender_name || '', kind, body,
    created_at: new Date().toISOString(), payload: null
  }, extra || {}));
  if (chatSearch) clearChatSearch(); else renderChatMessages('bottom');
}

// ---------- attributes, macros, queries ----------
// @{attr} / @{Skill} / @{Skill|level} read the "Post as" character;
// @{Character|attr} and @{Character|Skill|level} read another of YOUR
// characters. Attributes: ST IN WI CD HE CH AP, name, hp, hp_max, and any
// skill by name (its SKVAL, or |level / |xp).
function chatFindMyCharacter(name) {
  const n = name.trim().toLowerCase();
  return Object.values(state.characters).find(c => (c.name || '').trim().toLowerCase() === n) || null;
}
function chatAttribute(char, key, field) {
  const k = key.trim(), low = k.toLowerCase();
  if (!char) throw new Error(`@{${k}} needs a character — pick one in "Post as", or use @{Character|${k}}`);
  if (low === 'name') return char.name || '';
  const attrs = char.attrs || {};
  const attrKey = Object.keys(attrs).find(a => a.toLowerCase() === low);
  if (attrKey) return attrs[attrKey];
  if (low === 'hp' || low === 'hp_max') {
    const hp = computeHP(char);
    const cur = hp.system === 'collegium' ? hp.physicalCurrent : hp.currentHP;
    const max = hp.system === 'collegium' ? hp.physicalMax : hp.totalHP;
    return low === 'hp' ? cur : max;
  }
  const skills = char.skills || [];
  const norm = s => normalizeSkillName(s);
  const si = skills.find(s => norm(s.skillName + (s.binding ? ` (${s.binding})` : '')) === norm(k))
    || skills.find(s => norm(s.skillName) === norm(k));
  if (!si) throw new Error(`${char.name || 'That character'} has no attribute or skill called "${k}"`);
  const vals = computeSkillValues(si, char, skills);
  const f = (field || '').trim().toLowerCase();
  if (f === 'level') return vals.level;
  if (f === 'xp') return parseFloat(si.rawXP) || 0;
  return vals.skval;
}
function chatResolveAttributes(text) {
  for (let guard = 0; guard < 100 && /@\{[^{}]+\}/.test(text); guard++) {
    text = text.replace(/@\{([^{}]+)\}/, (m, inner) => {
      const bits = inner.split('|');
      if (bits.length >= 2) {
        const other = chatFindMyCharacter(bits[0]);
        if (other) return String(chatAttribute(other, bits[1], bits[2]));
        if (bits.length === 2 && ['level', 'xp', 'skval'].includes(bits[1].trim().toLowerCase())) return String(chatAttribute(chatPostAsChar(), bits[0], bits[1]));
        throw new Error(`No character of yours is called "${bits[0].trim()}"`);
      }
      return String(chatAttribute(chatPostAsChar(), inner));
    });
  }
  return text;
}

// Macros belong to a character (saved with it). #name runs one of the
// "Post as" character's macros; %{name} and %{Character|name} do the same
// for any of your characters.
function chatMacrosOf(char) { return (char && Array.isArray(char.chatMacros)) ? char.chatMacros : []; }
function chatExpandMacros(text) {
  for (let depth = 0; depth < 10; depth++) {
    const before = text;
    text = text.replace(/%\{([^{}|]+)(?:\|([^{}]+))?\}/g, (m, a, b) => {
      const char = b !== undefined ? chatFindMyCharacter(a) : chatPostAsChar();
      const name = (b !== undefined ? b : a).trim();
      if (!char) throw new Error(`No character of yours is called "${a.trim()}"`);
      const macro = chatMacrosOf(char).find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!macro) throw new Error(`${char.name || 'That character'} has no macro called "${name}"`);
      return macro.body;
    });
    const mine = chatMacrosOf(chatPostAsChar());
    text = text.replace(/(^|\s)#([A-Za-z0-9_-]+)(?=\s|$)/g, (m, pre, name) => {
      const macro = mine.find(x => x.name.toLowerCase() === name.toLowerCase());
      return macro ? pre + macro.body : m;
    });
    if (text === before) return text;
  }
  throw new Error('Macros call each other too deeply');
}

// ?{Question} ?{Question|default} ?{Question|Label,value|Label2,value2}
// Asks once per distinct question; the same question reuses the answer.
async function chatResolveQueries(text) {
  const answers = {};
  for (let guard = 0; guard < 30; guard++) {
    const m = /\?\{([^{}]*)\}/.exec(text);
    if (!m) return text;
    const bits = m[1].split('|');
    const question = bits[0].trim() || 'Enter a value';
    if (!(question in answers)) {
      const options = bits.slice(1).map(o => { const i = o.indexOf(','); return i >= 0 ? { label: o.slice(0, i), value: o.slice(i + 1) } : { label: o, value: o }; });
      const answer = await chatAsk(question, options.length > 1 ? options : null, options.length === 1 ? options[0].value : '');
      if (answer === null) return null;
      answers[question] = answer;
    }
    text = text.slice(0, m.index) + answers[question] + text.slice(m.index + m[0].length);
  }
  return text;
}
let chatAskResolve = null;
function chatAsk(question, options, def) {
  return new Promise(resolve => {
    chatAskResolve = resolve;
    openModal(`
      <h3>${escapeHtml(question)}</h3>
      ${options
        ? `<select id="chat-ask-input" class="w-full">${options.map((o, i) => `<option value="${i}">${escapeHtml(o.label)}</option>`).join('')}</select>`
        : `<input id="chat-ask-input" class="w-full" value="${escapeHtml(def)}" onkeydown="if(event.key==='Enter')chatAskDone(true)">`}
      <div class="modal-actions"><button class="btn btn-dim" onclick="chatAskDone(false)">Cancel</button><button class="btn btn-gold" onclick="chatAskDone(true)">OK</button></div>`);
    chatAskDone.options = options;
    const el = document.getElementById('chat-ask-input');
    if (el) { el.focus(); if (el.select) el.select(); }
  });
}
function chatAskDone(ok) {
  const el = document.getElementById('chat-ask-input');
  let value = null;
  if (ok && el) value = chatAskDone.options ? chatAskDone.options[+el.value].value : el.value;
  const resolve = chatAskResolve;
  chatAskResolve = null;
  closeModal();
  if (resolve) resolve(value);
}

// &{template:default} {{name=Title}} {{Key=Value}} ...
function chatParseTemplate(text) {
  const t = /&\{template:([^}]*)\}/i.exec(text);
  if (!t) return null;
  const rows = [];
  const rest = text.slice(0, t.index) + text.slice(t.index + t[0].length);
  const outside = rest.replace(/\{\{([\s\S]*?)\}\}/g, (m, inner) => {
    const i = inner.indexOf('=');
    rows.push(i >= 0 ? [inner.slice(0, i).trim(), inner.slice(i + 1).trim()] : [inner.trim(), '']);
    return '';
  }).trim();
  return { name: t[1].trim() || 'default', rows, text: outside };
}

// ---------- commands ----------
const CHAT_HELP_HTML = `
  <div class="chat-help">
  <b>Chat commands</b>
  <table>
    <tr><td>/roll <i>dice</i> &nbsp;or&nbsp; /r</td><td>Roll dice for everyone to see: <code>/r 1d20+5</code></td></tr>
    <tr><td>/gmroll <i>dice</i> &nbsp;or&nbsp; /gr</td><td>Roll so only you and the GM see it</td></tr>
    <tr><td>[[<i>dice</i>]]</td><td>Inline roll inside any message: <code>I hit for [[2d6+3]]!</code></td></tr>
    <tr><td>/w <i>Name</i> <i>message</i></td><td>Whisper to a character in this group (use "quotes" for names with spaces), or <code>/w gm</code></td></tr>
    <tr><td>/em <i>action</i> &nbsp;or&nbsp; /me</td><td>Emote: <code>/em draws his sword.</code></td></tr>
    <tr><td>/ooc <i>message</i></td><td>Out of character</td></tr>
    <tr><td>/desc <i>text</i></td><td>GM: narration with no name</td></tr>
    <tr><td>/as "<i>Name</i>" <i>message</i></td><td>GM: speak as anyone</td></tr>
    <tr><td>/emas "<i>Name</i>" <i>action</i></td><td>GM: emote as anyone</td></tr>
    <tr><td>/talktomyself [on|off]</td><td>Messages stay on your screen only, not sent or saved</td></tr>
    <tr><td>/help</td><td>This list</td></tr>
  </table>
  <b>In any message</b>
  <table>
    <tr><td>@{ST} @{Hit Points} @{Avoidance|level}</td><td>Your "Post as" character's attribute, skill SKVAL, or skill level / xp. Also @{name}, @{hp}, @{hp_max}</td></tr>
    <tr><td>@{Character|Skill}</td><td>Same, from another of your characters</td></tr>
    <tr><td>?{Question} ?{Bonus|0} ?{Weapon|Sword,1d8|Axe,1d10}</td><td>Ask when sending (typed answer, default, or a dropdown)</td></tr>
    <tr><td>#name &nbsp; %{name} &nbsp; %{Character|name}</td><td>Run a saved macro (Macros… button)</td></tr>
    <tr><td>&amp;{template:default} {{name=Title}} {{Attack=[[1d20+5]]}}</td><td>A card with a title and rows</td></tr>
    <tr><td>**bold** *italic* ~~strike~~ [text](https://…)</td><td>Formatting and links</td></tr>
    <tr><td>↑ / ↓</td><td>Step through what you've sent</td></tr>
  </table>
  <b>Dice</b>
  <table>
    <tr><td>2d6 d20 d% 4dF (2+1)d6</td><td>Dice, percentile, fate (−1/0/+1), worked-out counts</td></tr>
    <tr><td>+ − * / % ** ( ) floor() ceil() round() abs()</td><td>Maths</td></tr>
    <tr><td>4d6kh3 4d6k3 · 2d20kl1 · 4d6d1 4d6dl1 · 2d20dh1</td><td>Keep highest / lowest, drop lowest / highest</td></tr>
    <tr><td>3d6! · 3d6!! · 3d6!p · 1d10!>8</td><td>Exploding, compounding, penetrating (optionally on a range)</td></tr>
    <tr><td>4d6r1 · 4d6r<2 · 4d6ro1</td><td>Reroll while matching, or reroll once</td></tr>
    <tr><td>10d6>4 · 10d6<2 · 10d6>4f1</td><td>Count successes (> is "at least"), minus failures</td></tr>
    <tr><td>1d20cs>19 · 1d20cf<3</td><td>What counts as a critical success / failure (green / red)</td></tr>
    <tr><td>8d6s 8d6sd · 10d6m 10d6mt 10d6m3</td><td>Sort; mark matching dice or count matches</td></tr>
    <tr><td>{4d6kh3, 4d6kh3} · {1d20+5, 1d20+5}kh1 · {3d6+3}>12</td><td>Groups: keep/drop or count successes across rolls</td></tr>
    <tr><td>1d20+5[STR] + 2[bonus]</td><td>Labels (just notes)</td></tr>
    <tr><td>[[ [[1d4]]d6 ]]</td><td>Nested rolls (inner one first)</td></tr>
  </table>
  </div>`;

function showChatHelp() {
  openModal(CHAT_HELP_HTML + `<div class="modal-actions"><button class="btn btn-gold" onclick="closeModal()">Close</button></div>`, { wide: true });
}

// Reads `"Quoted Name" rest` or `Word rest`.
function chatTakeName(s) {
  s = s.trim();
  const q = /^"([^"]+)"\s*([\s\S]*)$/.exec(s) || /^'([^']+)'\s*([\s\S]*)$/.exec(s);
  if (q) return { name: q[1].trim(), rest: q[2] };
  const w = /^(\S+)\s*([\s\S]*)$/.exec(s);
  return w ? { name: w[1], rest: w[2] } : { name: '', rest: '' };
}

// Works out what a typed line means. Returns the row to send (without
// group/character), or { local } for something shown only to you.
function chatParseCommand(text) {
  const cmd = /^\/(\S+)\s*([\s\S]*)$/.exec(text);
  if (!cmd) return { kind: 'message', body: text };
  const name = cmd[1].toLowerCase(), arg = cmd[2];
  const needArg = what => { if (!arg.trim()) throw new Error(`/${name} needs ${what}`); };
  const gmOnly = () => { if (!chatIsGM()) throw new Error(`/${name} is for the GM`); };
  switch (name) {
    case 'r': case 'roll': needArg('a roll, e.g. /r 1d20+5'); return { kind: 'roll', body: arg.trim() };
    case 'gr': case 'gmroll': needArg('a roll, e.g. /gr 1d20'); return { kind: 'roll', body: arg.trim(), whisper: { characters: [], gm: true } };
    case 'em': case 'me': needArg('an action'); return { kind: 'emote', body: arg.trim() };
    case 'ooc': needArg('a message'); return { kind: 'ooc', body: arg.trim() };
    case 'desc': gmOnly(); needArg('some text'); return { kind: 'desc', body: arg.trim() };
    case 'as': case 'emas': {
      gmOnly();
      const t = chatTakeName(arg);
      if (!t.name || !t.rest.trim()) throw new Error(`Use /${name} "Name" ${name === 'as' ? 'message' : 'action'}`);
      return { kind: name, body: t.rest.trim(), sender_name: t.name };
    }
    case 'w': case 'whisper': {
      const t = chatTakeName(arg);
      if (!t.name || !t.rest.trim()) throw new Error('Use /w Name message (or /w gm message)');
      const whisper = { characters: [], gm: false };
      if (t.name.toLowerCase() === 'gm') whisper.gm = true;
      else {
        const n = t.name.toLowerCase();
        const target = chatRoster.find(c => (c.name || '').toLowerCase() === n)
          || chatRoster.find(c => (c.name || '').toLowerCase().split(/\s+/)[0] === n);
        if (!target) throw new Error(`No one called "${t.name}" in this group. Use "quotes" for names with spaces, or /w gm.`);
        whisper.characters.push(target.id);
      }
      const inner = chatParseCommand(t.rest.trim());
      if (inner.local || inner.whisper) throw new Error('That can\'t be whispered');
      if (!['message', 'roll', 'emote', 'ooc'].includes(inner.kind)) throw new Error('Only messages, rolls, emotes and OOC can be whispered');
      return Object.assign(inner, { whisper });
    }
    case 'talktomyself': {
      const v = arg.trim().toLowerCase();
      chatTalkToMyself = v === 'on' ? true : v === 'off' ? false : !chatTalkToMyself;
      renderChatModeNote();
      return { local: 'system', body: chatTalkToMyself ? 'Talking to yourself: from now on your messages stay on this screen only. /talktomyself off to stop.' : 'Stopped talking to yourself. Messages go to the group again.' };
    }
    case 'help': case '?': return { local: 'help' };
  }
  throw new Error(`Unknown command /${name}. Type /help to see the commands.`);
}

async function sendChatMessage(textOverride) {
  const input = document.getElementById('chat-input');
  const asSel = document.getElementById('chat-post-as');
  if (!input || !asSel) return;
  const typed = (textOverride != null ? textOverride : input.value).trim();
  if (!typed) return;
  chatShowStatus('');
  let msg;
  try {
    // Roll20 order: macros, then attributes, then queries, then rolls.
    let text = chatExpandMacros(typed);
    text = chatResolveAttributes(text);
    text = await chatResolveQueries(text);
    if (text === null) return; // cancelled a question
    text = text.trim();
    if (!text) return;
    msg = chatParseCommand(text);
    if (msg.local === 'help') { showChatHelp(); chatAfterSend(input, typed, textOverride); return; }
    if (msg.local) { chatLocalLine('system', msg.body); chatAfterSend(input, typed, textOverride); return; }
    const payload = {};
    if (msg.kind === 'roll') {
      payload.rolls = [DiceRoller.roll(msg.body)];
    } else {
      // Rolls are stored in the order they're drawn: for a template card that's
      // the text before it, then the title row, then the other rows' values.
      const tpl = chatParseTemplate(msg.body);
      let rollText = msg.body;
      if (tpl) {
        const isTitle = r => r[0].toLowerCase() === 'name';
        const rows = tpl.rows.filter(isTitle).slice(0, 1).concat(tpl.rows.filter(r => !isTitle(r)));
        payload.template = { name: tpl.name, rows };
        if (tpl.text) payload.text = tpl.text;
        rollText = [tpl.text, ...rows.map(r => r[1])].join('\n');
      }
      const spans = DiceRoller.findInline(rollText);
      if (spans.length) payload.inline = spans.map(sp => DiceRoller.roll(sp.expr));
    }
    if (msg.whisper) payload.whisper = msg.whisper;
    msg.payload = Object.keys(payload).length ? payload : null;
  } catch (e) {
    chatShowStatus(e.message);
    return;
  }
  if (msg.body.length > 4000) { chatShowStatus('That message is too long (4,000 characters at most).'); return; }

  if (chatTalkToMyself) {
    const char = chatPostAsChar();
    chatLocalLine(msg.kind, msg.body, { sender_name: msg.sender_name || (char ? char.name : 'GM'), payload: msg.payload && Object.assign({}, msg.payload, { whisper: undefined }) });
    chatAfterSend(input, typed, textOverride);
    return;
  }

  const btn = document.getElementById('chat-send-btn');
  if (btn) btn.disabled = true;
  const row = { group_id: chatGroupId, character_id: asSel.value || null, body: msg.body, kind: msg.kind, payload: msg.payload };
  if (msg.sender_name) row.sender_name = msg.sender_name;
  const { data, error } = await sb.from('group_chat_messages').insert(row).select().single();
  if (btn) btn.disabled = false;
  if (error) { chatShowStatus('Failed to send: ' + error.message); return; }
  chatAfterSend(input, typed, textOverride);
  if (data && data.group_id === chatGroupId && !chatMessages.some(m => m.id === data.id)) {
    chatMessages.push(data);
    if (chatSearch) clearChatSearch(); else renderChatMessages('bottom');
  }
  chatMarkRead(chatGroupId);
}

function chatAfterSend(input, typed, fromMacroButton) {
  if (fromMacroButton != null) return;
  if (chatHistory[chatHistory.length - 1] !== typed) chatHistory.push(typed);
  if (chatHistory.length > 100) chatHistory.shift();
  chatHistoryPos = -1;
  input.value = '';
  input.focus();
}

// ---------- macro bar and manager ----------
function renderChatMacroBar() {
  const el = document.getElementById('chat-macro-bar');
  if (!el) return;
  const char = chatPostAsChar();
  const macros = chatMacrosOf(char);
  el.innerHTML = macros.map((m, i) => `<button class="btn btn-dim" title="${escapeHtml(m.body)}" onclick="runChatMacro(${i})">${escapeHtml(m.name)}</button>`).join('')
    + (char ? `<button class="btn btn-dim chat-macro-manage" onclick="openChatMacros()">Macros…</button>` : '');
}
function runChatMacro(i) {
  const m = chatMacrosOf(chatPostAsChar())[i];
  if (m) sendChatMessage(m.body);
}
function chatMacroOwner() {
  const char = chatPostAsChar();
  if (!char) return null;
  if (!Array.isArray(char.chatMacros)) char.chatMacros = [];
  return char;
}
function openChatMacros(editIndex) {
  const char = chatMacroOwner();
  if (!char) return;
  const macros = char.chatMacros;
  const editing = editIndex != null ? macros[editIndex] : null;
  openModal(`
    <h3>Macros — ${escapeHtml(char.name || '')}</h3>
    <div class="note" style="margin-bottom:8px">Saved with this character. Click one in the bar above the chat box, or type #name. A macro is one chat line: anything you could type, e.g. <code>/r 1d20+@{Avoidance}</code> or <code>/em swings: [[1d8+@{ST}]]</code>.</div>
    <table class="skill-table" style="margin-bottom:10px"><tbody>
      ${macros.length ? macros.map((m, i) => `<tr><td style="white-space:nowrap"><b>#${escapeHtml(m.name)}</b></td><td><code>${escapeHtml(m.body)}</code></td>
        <td style="white-space:nowrap"><button class="btn btn-dim" style="font-size:11px;padding:2px 6px" onclick="openChatMacros(${i})">Edit</button>
        <button class="btn btn-dim" style="font-size:11px;padding:2px 6px" onclick="deleteChatMacro(${i})">Delete</button></td></tr>`).join('')
        : '<tr><td class="note">No macros yet.</td></tr>'}
    </tbody></table>
    <div class="form-group" style="margin-bottom:6px"><label>${editing ? 'Edit macro' : 'New macro'} — name (letters, numbers, - and _)</label><input id="chat-macro-name" class="w-full" value="${editing ? escapeHtml(editing.name) : ''}"></div>
    <div class="form-group" style="margin-bottom:6px"><label>Chat line</label><input id="chat-macro-body" class="w-full" value="${editing ? escapeHtml(editing.body) : ''}" placeholder="/r 1d20+@{Avoidance} ?{Modifier|0}"></div>
    <div id="chat-macro-status" class="note" style="color:var(--red-b)"></div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal();renderChatMacroBar()">Close</button><button class="btn btn-gold" onclick="saveChatMacro(${editIndex != null ? editIndex : -1})">${editing ? 'Save' : 'Add'}</button></div>`, { wide: true });
}
function saveChatMacro(index) {
  const char = chatMacroOwner();
  if (!char) return;
  const name = document.getElementById('chat-macro-name').value.trim();
  const body = document.getElementById('chat-macro-body').value.trim();
  const status = document.getElementById('chat-macro-status');
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(name)) { status.textContent = 'Use 1-30 letters, numbers, - or _ for the name.'; return; }
  if (!body) { status.textContent = 'The chat line is empty.'; return; }
  if (char.chatMacros.some((m, i) => i !== index && m.name.toLowerCase() === name.toLowerCase())) { status.textContent = 'There is already a macro with that name.'; return; }
  if (index >= 0) char.chatMacros[index] = { name, body };
  else char.chatMacros.push({ name, body });
  saveState();
  openChatMacros();
  renderChatMacroBar();
}
function deleteChatMacro(index) {
  const char = chatMacroOwner();
  if (!char || !confirm(`Delete the macro #${char.chatMacros[index].name}?`)) return;
  char.chatMacros.splice(index, 1);
  saveState();
  openChatMacros();
  renderChatMacroBar();
}

// ---------- edit / delete ----------
function openEditChatMessage(id) {
  const m = chatMessages.find(x => x.id === id);
  if (!m) return;
  openModal(`
    <h3>Edit Message</h3>
    <textarea id="chat-edit-input" class="w-full" rows="4" maxlength="4000">${escapeHtml(m.body)}</textarea>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="saveChatEdit('${id}')">Save</button></div>`);
  const ta = document.getElementById('chat-edit-input');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

async function saveChatEdit(id) {
  const body = document.getElementById('chat-edit-input').value.trim();
  if (!body) { alert('A message can\'t be empty. Use Delete to remove it.'); return; }
  if (DiceRoller.findInline(body).length) { alert('Rolls can\'t be added by editing. Send a new message instead.'); return; }
  const { data, error } = await sb.from('group_chat_messages').update({ body }).eq('id', id).select().single();
  if (error) { alert('Failed to save: ' + error.message); return; }
  closeModal();
  const i = chatMessages.findIndex(m => m.id === id);
  if (i >= 0 && data) { chatMessages[i] = data; renderChatMessages('keep'); }
}

async function deleteChatMessage(id) {
  if (!confirm('Delete this message?')) return;
  const { data, error } = await sb.from('group_chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) { alert('Failed to delete: ' + error.message); return; }
  const i = chatMessages.findIndex(m => m.id === id);
  if (i >= 0 && data) { chatMessages[i] = data; renderChatMessages('keep'); }
}

// Coming back to the tab: catch up on anything missed and clear the unread count.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !currentUser) return;
  if (chatPageOpen()) { if (!chatSearch) loadChatMessages(false); } else { refreshChatUnread(); }
});
