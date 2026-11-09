// ============================================================
// GROUP INVENTORY and GM INVENTORY
// ============================================================
// Items that belong to a group, not to one character, are rows in the
// Supabase table group_items (set up as in KnownIssues.md, "Group
// inventory"). row.item is an item exactly as in char.items. row.place:
//   'gm'       the GM's own list for the group (the GM Inventory page; only
//              the group's GM sees it). → Group moves an item to 'group'.
//   'group'    group treasure (the Group Inventory page). starred: put there
//              by the GM and not yet accepted. assigned_char_id: the party
//              member allowed to use it (the group still owns it).
//   'delivery' moved to a character (to_char_id): it now belongs to that
//              character, and their owner's app takes it into the
//              character's inventory (syncGroupItemsForMyCharacters).
// An assigned item shows in its character's inventory and works like their
// own (In Use, magic modifiers, Cast / Use). It is a copy marked with
// _groupItem: saveState leaves it out of the character's data
// (charDataForSave) and writes its changes back to the group's row instead.

let groupItemsCache = [];     // the rows on the page shown
let groupItemsRoster = [];    // the group's characters: { id, owner_id, name, is_npc }
let groupItemsError = '';     // why the rows couldn't be loaded ('' = fine)
let itemPopupTarget = null;   // the item popup saving to group_items: { groupId, place, rowId }

// Magic items, weapons, armor and shields need an item number.
function itemNeedsNumber(it) {
  return !!it && (['Weapon', 'Armor', 'Shield', 'Magic Item'].includes(it.type) || !!it.masterwork);
}
function isGroupGM(groupId) {
  const g = (myGroups || []).find(x => x.id === groupId);
  return !!(g && g.myRole === 'gm');
}
// An item the GM made keeps its item number and weight unless the GM changes them.
function canEditGmFields(it) {
  return !it || !it.gmMade || isGroupGM(it.gmGroupId);
}
function groupItemsTableMissing(error) {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /group_items/.test(error.message || ''));
}
function groupItemsErrorText(error) {
  return groupItemsTableMissing(error)
    ? 'Group inventory isn\'t set up in Supabase yet (see "Group inventory" in KnownIssues.md).'
    : 'Could not load the group\'s items: ' + (error.message || error);
}
// The item as the group keeps it: no place in a character's bags, no tie to
// that character's other items.
function groupItemPayload(it) {
  const c = JSON.parse(JSON.stringify(it));
  delete c._groupItem; delete c.location; delete c.ammunitionItemIdx; delete c.bookId; delete c.fromGroupItem;
  return c;
}
// A character's data as it is saved: without the group's assigned items.
function charDataForSave(charData) {
  if (!(charData.items || []).some(it => it && it._groupItem)) return charData;
  return { ...charData, items: charData.items.filter(it => !(it && it._groupItem)) };
}
function myCharAppIdOfRow(rowId) {
  return Object.keys(charRowIds || {}).find(k => charRowIds[k] === rowId) || null;
}

// ---------- the pages ----------

function showGroupInventory(groupId, gm) {
  if (groupId) activeGroupId = groupId;
  state.activeSkillId = null;
  state.activeView = gm ? 'gmInventory' : 'groupInventory';
  renderSidebar();
  renderGroupInventoryModule();
}

async function renderGroupInventoryModule() {
  const gmPage = state.activeView === 'gmInventory';
  const main = document.getElementById('main');
  main.innerHTML = `<div class="panel"><div class="panel-body">Loading…</div></div>`;
  if (!myGroups.length) await fetchMyGroups();
  const group = myGroups.find(g => g.id === activeGroupId);
  const title = gmPage ? 'GM Inventory' : 'Group Inventory';
  if (!group) { main.innerHTML = `<div class="panel"><div class="panel-header"><h2>${title}</h2></div><div class="panel-body"><div class="note placeholder">Open a group first (File → Groups).</div></div></div>`; return; }
  const isGM = group.myRole === 'gm';
  if (gmPage && !isGM) { main.innerHTML = `<div class="panel"><div class="panel-header"><h2>${title}</h2></div><div class="panel-body"><div class="note placeholder">Only the group's GM can open the GM Inventory.</div></div></div>`; return; }
  const [{ data: rows, error }, { data: roster }] = await Promise.all([
    sb.from('group_items').select('*').eq('group_id', group.id).eq('place', gmPage ? 'gm' : 'group').order('created_at', { ascending: true }),
    sb.from('group_roster').select('id, owner_id, name, is_npc').eq('group_id', group.id)
  ]);
  if (state.activeView !== (gmPage ? 'gmInventory' : 'groupInventory') || activeGroupId !== group.id) return; // moved on meanwhile
  groupItemsError = error ? groupItemsErrorText(error) : '';
  groupItemsCache = rows || [];
  groupItemsRoster = (roster || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const charName = id => { const c = groupItemsRoster.find(r => r.id === id); return c ? c.name : ''; };
  const rosterOpts = (selected, blank) => `<option value="">${blank}</option>` + groupItemsRoster.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${escapeHtml(c.name || 'Unnamed')}</option>`).join('');
  const num = v => (parseFloat(v) || 0).toLocaleString();
  const starred = groupItemsCache.filter(r => r.starred).length;

  const body = groupItemsCache.map(r => {
    const it = r.item || {};
    const star = r.starred ? `<span class="group-star" title="New from the GM">★</span> ` : '';
    const common = `
      <td>${star}${escapeHtml(it.name || '')}</td>
      <td>${escapeHtml(it.itemNo || '')}</td>
      <td class="item-kind">${escapeHtml(itemKindLabel(it))}</td>
      <td class="item-qty">${escapeHtml(it.qty || 1)}</td>
      <td>${num(it.weight)}</td>
      <td>${num(it.worth)}</td>`;
    const edit = `<td class="item-edit" title="${r.starred ? 'Open (accepts it)' : 'Edit'}" onclick="openGroupItemModal('${r.id}')">✎</td>`;
    const del = isGM ? `<td class="item-del" title="Delete" onclick="deleteGroupItem('${r.id}')">✕</td>` : '<td></td>';
    if (gmPage) return `<tr class="item-row">${common}
      <td class="item-kind">${escapeHtml(it.notes || '')}</td>
      <td><button class="btn btn-gold item-spell-btn" title="Move it to the group's inventory, starred" onclick="gmItemToGroup('${r.id}')">→ Group</button></td>
      ${edit}${del}</tr>`;
    return `<tr class="item-row${r.starred ? ' group-item-new' : ''}">${common}
      <td><select class="group-item-select" title="Who may use it: the group still owns it" onchange="assignGroupItem('${r.id}', this.value)">${rosterOpts(r.assigned_char_id, '— nobody —')}</select></td>
      <td class="item-kind">${escapeHtml(it.notes || '')}</td>
      <td class="group-item-actions">${r.starred ? `<button class="btn btn-gold item-spell-btn" onclick="acceptGroupItem('${r.id}')">Accept</button>` : ''}<select class="group-item-select" title="Give it to a party member: it becomes theirs" onchange="moveGroupItem('${r.id}', this.value)">${rosterOpts('', 'Move to…')}</select></td>
      ${edit}${del}</tr>`;
  }).join('');
  const cols = gmPage ? 10 : 11;
  const head = gmPage
    ? '<th>Item</th><th>Item #</th><th>Type</th><th>Qty</th><th>Weight</th><th>Worth</th><th>Notes</th><th></th><th></th><th></th>'
    : `<th>Item</th><th>Item #</th><th>Type</th><th>Qty</th><th>Weight</th><th>Worth</th><th>Assigned To${infoTip('Assigning lets that character use the item: it shows in their inventory and works like their own, but the group still owns it. Move to… gives it to them for good.')}</th><th>Notes</th><th></th><th></th><th></th>`;
  const weight = groupItemsCache.reduce((s, r) => s + (parseFloat((r.item || {}).weight) || 0) * (parseFloat((r.item || {}).qty) || 1), 0);
  const worth = groupItemsCache.reduce((s, r) => s + (parseFloat((r.item || {}).worth) || 0) * (parseFloat((r.item || {}).qty) || 1), 0);
  main.innerHTML = `
  <div class="panel plain-font">
    <div class="panel-header inventory-header"><h2>${title} — ${escapeHtml(group.name)}</h2>
      <div class="computed-item inventory-worth"><span class="ci-label">Weight</span><span class="ci-value">${weight.toLocaleString()}</span></div>
      <div class="computed-item inventory-worth"><span class="ci-label">Total Worth</span><span class="ci-value">${worth.toLocaleString()}</span></div>
    </div>
    <div class="panel-body">
      ${groupItemsError ? `<div class="warn">${escapeHtml(groupItemsError)}</div>` : ''}
      ${gmPage ? '<div class="note">Only you see this list. → Group moves an item into the group\'s inventory, starred until someone accepts it.</div>' : starred ? `<div class="note">★ ${starred} new item${starred === 1 ? '' : 's'} from the GM: Accept or open ${starred === 1 ? 'it' : 'them'}.</div>` : ''}
      <table class="item-table inventory-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${cols}" class="note">${gmPage ? 'No items yet. Use Add Item below.' : 'No group treasure yet. Use Add Item below, or Give to Group in an item\'s ✎ on your Inventory.'}</td></tr>`}</tbody>
      </table>
      ${groupItemsError ? '' : `<button class="btn btn-gold" onclick="openGroupItemModal(null, '${gmPage ? 'gm' : 'group'}')">Add Item</button>`}
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="btn btn-dim" onclick="showGroupModule()">👥 Group Page</button>
        ${gmPage ? `<button class="btn btn-dim" onclick="showGroupInventory(null, false)">💰 Group Inventory</button>` : isGM ? `<button class="btn btn-dim" onclick="showGroupInventory(null, true)">🔒 GM Inventory</button>` : ''}
      </div>
    </div>
  </div>`;
}

// ---------- the item popup, saving to the group ----------

// Add Item / ✎ on either page: the inventory's item popup (renderAddItemModal),
// saving to group_items. Opening a starred item accepts it.
function openGroupItemModal(rowId, place) {
  const row = rowId ? groupItemsCache.find(r => r.id === rowId) : null;
  if (rowId && !row) return;
  if (row && row.starred) acceptGroupItem(row.id, true);
  openAddItemModal({ target: { groupId: activeGroupId, place: row ? row.place : place, rowId: row ? row.id : null } });
  if (!row) return;
  itemDraft = JSON.parse(JSON.stringify(row.item || {}));
  itemPicks = itemPicksFromItem(itemDraft);
  for (const k of ['weaponClass', 'itemClass', 'magicItemClass']) if (itemPicks[k] === ITEM_PICK_CUSTOM) delete itemDraft[k];
  editingItemIdx = 'group';
  renderAddItemModal();
}

// confirmAddItem, for an item in the group's lists.
async function saveGroupItemFromPopup(d) {
  const t = itemPopupTarget;
  const isGM = isGroupGM(t.groupId);
  const row = t.rowId ? groupItemsCache.find(r => r.id === t.rowId) : null;
  if (!row && isGM) { d.gmMade = true; d.gmGroupId = t.groupId; }
  const payload = groupItemPayload(d);
  const { error } = row
    ? await sb.from('group_items').update({ item: payload, starred: false }).eq('id', row.id)
    : await sb.from('group_items').insert({ group_id: t.groupId, place: t.place, item: payload, starred: t.place === 'group' && isGM, created_by: currentUser.id });
  if (error) { const err = document.getElementById('ai-error'); if (err) { err.textContent = groupItemsErrorText(error); err.style.display = 'block'; } return; }
  const again = !row && addNextItem;
  itemDraft = null; editingItemIdx = null;
  if (again) openAddItemModal({ keepAddNext: true, justAdded: d.name, target: { ...t } });
  else { itemPopupTarget = null; closeModal(); }
  await renderGroupInventoryModule();
  if (row && row.assigned_char_id && myCharAppIdOfRow(row.assigned_char_id)) syncGroupItemsForMyCharacters(true);
}

// ---------- actions on the group's items ----------

async function updateGroupItemRow(id, patch) {
  const { error } = await sb.from('group_items').update(patch).eq('id', id);
  if (error) { alert('Could not save: ' + error.message); return false; }
  return true;
}
async function acceptGroupItem(id, quiet) {
  const row = groupItemsCache.find(r => r.id === id);
  if (row) row.starred = false;
  if (await updateGroupItemRow(id, { starred: false }) && !quiet) renderGroupInventoryModule();
}
async function gmItemToGroup(id) {
  if (await updateGroupItemRow(id, { place: 'group', starred: true })) renderGroupInventoryModule();
}
async function deleteGroupItem(id) {
  const row = groupItemsCache.find(r => r.id === id);
  if (!row || !await appConfirm(`Delete "${(row.item || {}).name || 'this item'}"? It can't be brought back.`, 'Delete')) return;
  const { error } = await sb.from('group_items').delete().eq('id', id);
  if (error) { alert('Could not delete: ' + error.message); return; }
  renderGroupInventoryModule();
  if (row.assigned_char_id && myCharAppIdOfRow(row.assigned_char_id)) syncGroupItemsForMyCharacters(true);
}
// Assigned To: that character may use it (the group keeps it).
async function assignGroupItem(id, charId) {
  const row = groupItemsCache.find(r => r.id === id);
  if (!row) return;
  const before = row.assigned_char_id;
  if (!await updateGroupItemRow(id, { assigned_char_id: charId || null, starred: false })) { renderGroupInventoryModule(); return; }
  await renderGroupInventoryModule();
  if ((before && myCharAppIdOfRow(before)) || (charId && myCharAppIdOfRow(charId))) syncGroupItemsForMyCharacters(true);
}
// Move to…: the item becomes that character's. One of your own characters
// takes it straight away; anyone else's gets it the next time their owner's
// app loads (see syncGroupItemsForMyCharacters).
async function moveGroupItem(id, charId) {
  const row = groupItemsCache.find(r => r.id === id);
  const who = groupItemsRoster.find(c => c.id === charId);
  if (!row || !who) { renderGroupInventoryModule(); return; }
  if (!await appConfirm(`Give "${(row.item || {}).name || 'this item'}" to ${who.name || 'this character'}? It leaves the group's inventory and becomes theirs.`, 'Give')) { renderGroupInventoryModule(); return; }
  const appId = myCharAppIdOfRow(charId);
  if (appId && state.characters[appId]) {
    const char = state.characters[appId];
    // a copy shown there as assigned goes; the real item takes its place
    char.items = (char.items || []).filter(it => !(it._groupItem && it._groupItem.id === row.id));
    delete groupItemSynced[row.id];
    char.items.push({ ...groupItemPayload(row.item || {}), fromGroupItem: row.id });
    clearTimeout(saveStateTimer); saveStateTimer = null;
    await flushCharactersToSupabase();
    const { error } = await sb.from('group_items').delete().eq('id', row.id);
    if (error) alert('The item was added to ' + (who.name || 'the character') + ', but could not be taken out of the group: ' + error.message);
  } else if (!await updateGroupItemRow(id, { place: 'delivery', to_char_id: charId, assigned_char_id: null, starred: false })) return;
  renderGroupInventoryModule();
}

// ✎ → Give to Group on your own item: it goes into the group's inventory.
async function giveItemToGroup() {
  const char = state.characters[state.activeChar];
  const idx = editingItemIdx;
  const it = char && typeof idx === 'number' && (char.items || [])[idx];
  const groupId = char && char.playGroupId;
  if (!it || !groupId) return;
  if (it.type === 'Spell Book') { alert("A spell book can't go into the group's inventory."); return; }
  if (!await appConfirm(`Give "${it.name || 'this item'}" to the group? It leaves ${char.name || 'this character'}'s inventory.`, 'Give')) return;
  const isGM = isGroupGM(groupId);
  const { error } = await sb.from('group_items').insert({ group_id: groupId, place: 'group', item: groupItemPayload(it), starred: isGM, created_by: currentUser.id });
  if (error) { alert(groupItemsErrorText(error)); return; }
  const at = char.items.indexOf(it);
  if (at >= 0) char.items.splice(at, 1);
  itemDraft = null; editingItemIdx = null;
  closeModal();
  saveState();
  renderInventoryModule();
}

// ---------- the group's items on your own characters ----------

// What each assigned item looked like when last loaded or written back
// (row id -> JSON), and which character shows it (row id -> app id).
let groupItemSynced = {};
let groupItemShownOn = {};
let groupItemsLastSync = 0;
// Loads the group items moved to your characters (taking them into their
// inventories) and the ones assigned to them (shown as _groupItem copies).
// Redraws the page if anything changed. force: even if it ran just now.
async function syncGroupItemsForMyCharacters(force) {
  if (typeof CHAT_WINDOW !== 'undefined' && CHAT_WINDOW) return;
  if (!currentUser) return;
  const rowIds = Object.values(charRowIds || {});
  if (!rowIds.length) return;
  if (!force && Date.now() - groupItemsLastSync < 20000) return;
  groupItemsLastSync = Date.now();
  const [{ data: deliveries, error: dErr }, { data: assigned, error: aErr }] = await Promise.all([
    sb.from('group_items').select('*').eq('place', 'delivery').in('to_char_id', rowIds),
    sb.from('group_items').select('*').eq('place', 'group').in('assigned_char_id', rowIds).order('created_at', { ascending: true })
  ]);
  if (dErr || aErr) { if (!groupItemsTableMissing(dErr || aErr)) console.error('Group items', dErr || aErr); return; }
  // a save on its way would be overwritten: try again once it's done
  if (saveStateTimer || flushBusy) { setTimeout(() => syncGroupItemsForMyCharacters(true), 1500); return; }
  let changed = false;
  // items given to your characters become theirs
  const taken = [];
  for (const row of deliveries || []) {
    const char = state.characters[myCharAppIdOfRow(row.to_char_id)];
    if (!char) continue;
    if (!(char.items || []).some(it => it.fromGroupItem === row.id)) (char.items = char.items || []).push({ ...groupItemPayload(row.item || {}), fromGroupItem: row.id });
    taken.push(row.id);
    changed = true;
  }
  // the assigned copies, fresh from the group
  const before = JSON.stringify(groupItemSynced);
  for (const char of Object.values(state.characters)) {
    if ((char.items || []).some(it => it._groupItem)) char.items = char.items.filter(it => !it._groupItem);
  }
  groupItemSynced = {}; groupItemShownOn = {};
  for (const row of assigned || []) {
    const appId = myCharAppIdOfRow(row.assigned_char_id);
    const char = state.characters[appId];
    if (!char) continue;
    const item = { ...groupItemPayload(row.item || {}), _groupItem: { id: row.id, groupId: row.group_id } };
    (char.items = char.items || []).push(item);
    groupItemSynced[row.id] = JSON.stringify(groupItemPayload(item));
    groupItemShownOn[row.id] = appId;
  }
  if (JSON.stringify(groupItemSynced) !== before) changed = true;
  if (taken.length) {
    await flushCharactersToSupabase();
    const { error } = await sb.from('group_items').delete().in('id', taken);
    if (error) console.error('Could not clear delivered group items', error);
  }
  if (changed && state.characters[state.activeChar] && ['overview', 'general', 'combat', 'inventory', 'companions', 'spell'].includes(state.activeView) && !document.getElementById('modal-overlay').classList.contains('open')) renderMain();
}

// After a save: changes to the assigned copies (In Use, uses, qty) go back to
// the group's rows; a copy that's gone (a scroll used up, the last potion)
// takes the group's row with it.
async function writeBackAssignedGroupItems() {
  const present = new Set();
  for (const [appId, char] of Object.entries(state.characters)) {
    for (const it of char.items || []) {
      if (!it || !it._groupItem) continue;
      const id = it._groupItem.id;
      present.add(id);
      const json = JSON.stringify(groupItemPayload(it));
      if (groupItemSynced[id] === json) continue;
      groupItemSynced[id] = json;
      const { error } = await sb.from('group_items').update({ item: JSON.parse(json) }).eq('id', id).eq('assigned_char_id', charRowIds[appId]);
      if (error) console.error('Could not save the group item', id, error);
    }
  }
  for (const id of Object.keys(groupItemSynced)) {
    if (present.has(id)) continue;
    const appId = groupItemShownOn[id];
    delete groupItemSynced[id]; delete groupItemShownOn[id];
    if (!appId || !state.characters[appId]) continue; // the character went, not the item
    const { error } = await sb.from('group_items').delete().eq('id', id).eq('assigned_char_id', charRowIds[appId]);
    if (error) console.error('Could not remove the used-up group item', id, error);
  }
}
