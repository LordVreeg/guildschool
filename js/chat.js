// ============================================================
// GROUP CHAT (one chat per group; post as one of your characters in it)
// ============================================================
// Messages live in group_chat_messages (see schema_group_chat.sql). The
// database fills in the sender's name from the character and enforces who
// may read, post, edit and delete; this page only offers what's allowed.
// One realtime channel, opened at sign-in, carries every group's new and
// changed messages: it updates the open chat and the unread badges.

const CHAT_PAGE_SIZE = 50;
let chatGroupId = null;
let chatMessages = [];      // oldest first, for chatGroupId
let chatHasMore = false;
let chatUnread = {};        // groupId -> count of unread messages from others
let chatChannel = null;
let chatSetupError = null;  // set when the table isn't there yet

function chatReadKey(groupId) { return 'gs_chat_read_' + groupId; }
function chatLastRead(groupId) {
  try { return localStorage.getItem(chatReadKey(groupId)) || '1970-01-01T00:00:00Z'; } catch (e) { return '1970-01-01T00:00:00Z'; }
}
function chatMarkRead(groupId) {
  const last = chatMessages.length ? chatMessages[chatMessages.length - 1].created_at : new Date().toISOString();
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
        renderChatMessages(stick ? 'bottom' : 'keep');
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
    if (i >= 0) { chatMessages[i] = msg; if (chatPageOpen()) renderChatMessages('keep'); }
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
      <div class="panel-header"><h2>Chat</h2></div>
      <div class="panel-body">
        <div id="chat-group-tabs" class="chat-group-tabs"></div>
        <div id="chat-messages" class="chat-messages"><div class="note">Loading messages…</div></div>
        <div id="chat-composer"></div>
      </div>
    </div>`;
  renderChatGroupTabs();
  renderChatComposer();
  await loadChatMessages(false);
}

function selectChatGroup(groupId) {
  if (groupId === chatGroupId) return;
  chatGroupId = groupId;
  chatMessages = [];
  renderChatGroupTabs();
  renderChatComposer();
  loadChatMessages(false);
}

function renderChatGroupTabs() {
  const el = document.getElementById('chat-group-tabs');
  if (!el) return;
  el.innerHTML = myGroups.map(g => {
    const n = g.id === chatGroupId ? 0 : (chatUnread[g.id] || 0);
    return `<button class="btn ${g.id === chatGroupId ? 'btn-gold' : 'btn-dim'}" onclick="selectChatGroup('${g.id}')">${escapeHtml(g.name)}${g.myRole === 'gm' ? ' ★' : ''}${n ? ` <span class="chat-badge">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
  }).join('');
}

// Who you can post as in this group: your characters linked to it, plus
// "GM" if you're a GM of it. The choice is remembered per group.
function chatPostAsOptions(groupId) {
  const group = myGroups.find(g => g.id === groupId);
  const opts = Object.keys(state.characters)
    .filter(appId => state.characters[appId].playGroupId === groupId && charRowIds[appId])
    .map(appId => ({ value: charRowIds[appId], label: state.characters[appId].name || '(unnamed)' }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (group && group.myRole === 'gm') opts.push({ value: '', label: 'GM' });
  return opts;
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
    <div class="chat-composer">
      <div class="form-group"><label>Post as</label>
        <select id="chat-post-as" onchange="try{localStorage.setItem('gs_chat_as_${chatGroupId}', this.value)}catch(e){}">
          ${opts.map(o => `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select>
      </div>
      <textarea id="chat-input" rows="2" maxlength="4000" placeholder="Write a message… (Enter to send, Shift+Enter for a new line)" onkeydown="chatInputKeydown(event)"></textarea>
      <button class="btn btn-gold" id="chat-send-btn" onclick="sendChatMessage()">Send</button>
    </div>
    <div id="chat-status" class="note" style="color:var(--red-b);display:none"></div>`;
}

function chatInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendChatMessage();
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
  if (older && chatMessages.length) q = q.lt('created_at', chatMessages[0].created_at);
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
    chatMessages = batch;
    renderChatMessages('bottom');
    chatMarkRead(groupId);
    renderChatGroupTabs();
  }
}

function chatNearBottom() {
  const box = document.getElementById('chat-messages');
  return !box || box.scrollHeight - box.scrollTop - box.clientHeight < 60;
}

// Escapes the text, then turns web addresses into links.
function chatFormatBody(text) {
  return escapeHtml(text).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
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
  const group = myGroups.find(g => g.id === chatGroupId);
  const isGM = group && group.myRole === 'gm';
  let html = chatHasMore ? `<div style="text-align:center;margin-bottom:8px"><button class="btn btn-dim" style="font-size:11px" onclick="loadChatMessages(true)">Load older messages</button></div>` : '';
  if (!chatMessages.length) html += `<div class="note" style="text-align:center;padding:20px">No messages yet. Say hello!</div>`;
  let lastDay = null, prev = null;
  for (const m of chatMessages) {
    const d = new Date(m.created_at);
    const day = d.toDateString();
    if (day !== lastDay) { html += `<div class="chat-day"><span>${chatDayLabel(d)}</span></div>`; lastDay = day; prev = null; }
    const mine = m.author_id === currentUser.id;
    const deleted = !!m.deleted_at;
    // Back-to-back messages from the same sender within 5 minutes share a header.
    const continued = prev && prev.author_id === m.author_id && prev.sender_name === m.sender_name && (d - new Date(prev.created_at)) < 5 * 60 * 1000;
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const actions = deleted ? '' : [
      mine ? `<button onclick="openEditChatMessage('${m.id}')" title="Edit">Edit</button>` : '',
      (mine || isGM) ? `<button onclick="deleteChatMessage('${m.id}')" title="Delete">Delete</button>` : ''
    ].join('');
    html += `<div class="chat-msg ${mine ? 'mine' : ''} ${continued ? 'continued' : ''}" title="${escapeHtml(d.toLocaleString())}">
      ${continued ? '' : `<div class="chat-msg-head"><span class="chat-sender">${escapeHtml(m.sender_name || '?')}</span><span class="chat-time">${time}</span></div>`}
      <div class="chat-body ${deleted ? 'deleted' : ''}">${deleted ? 'Message deleted' : chatFormatBody(m.body)}${m.edited_at && !deleted ? ' <span class="chat-edited">(edited)</span>' : ''}</div>
      ${actions ? `<div class="chat-actions">${actions}</div>` : ''}
    </div>`;
    prev = m;
  }
  box.innerHTML = html;
  if (mode === 'bottom') box.scrollTop = box.scrollHeight;
  else if (mode === 'older') box.scrollTop = box.scrollHeight - prevHeight + prevTop;
  else box.scrollTop = prevTop;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const asSel = document.getElementById('chat-post-as');
  if (!input || !asSel) return;
  const body = input.value.trim();
  if (!body) return;
  const btn = document.getElementById('chat-send-btn');
  if (btn) btn.disabled = true;
  chatShowStatus('');
  const { data, error } = await sb.from('group_chat_messages')
    .insert({ group_id: chatGroupId, character_id: asSel.value || null, body })
    .select().single();
  if (btn) btn.disabled = false;
  if (error) { chatShowStatus('Failed to send: ' + error.message); return; }
  input.value = '';
  input.focus();
  if (data && data.group_id === chatGroupId && !chatMessages.some(m => m.id === data.id)) {
    chatMessages.push(data);
    renderChatMessages('bottom');
  }
  chatMarkRead(chatGroupId);
}

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
  if (chatPageOpen()) { loadChatMessages(false); } else { refreshChatUnread(); }
});
