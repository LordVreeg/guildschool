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
// GM of at least one group: the GM Inventory is theirs.
function amIGM() {
  return (myGroups || []).some(g => g.myRole === 'gm');
}
// An item the GM made: its item number, weight, Omni Eyed and hidden magic
// are for the GM who made it, or the GM of the group it was given to.
function canSeeGmSecrets(it) {
  return !it || !it.gmMade || (!!currentUser && it.gmBy === currentUser.id) || isGroupGM(it.gmGroupId);
}
function canEditGmFields(it) { return canSeeGmSecrets(it); }

// Omni Eyed (GM only, on items the GM made). Unticked, the item's magic --
// modifiers, spells, a potion's effect -- is kept under it.veiled, where
// nothing that shows or counts an item looks: players don't see it and it
// doesn't count for them. Ticking it puts the magic back.
function magicVeilFields() {
  return [...MAGIC_MOD_FIELDS.defense, ...MAGIC_MOD_FIELDS.offense, 'magicVoid', 'magicVoidStacks', 'spells', 'effect', 'effectUsesLeft'];
}
function veilItemMagic(d) {
  const v = d.veiled || {};
  for (const f of magicVeilFields()) if (d[f] !== undefined) { v[f] = d[f]; delete d[f]; }
  if (Object.keys(v).length) d.veiled = v; else delete d.veiled;
}
function unveilItemMagic(d) {
  if (!d || !d.veiled) return;
  for (const [k, v] of Object.entries(d.veiled)) if (d[k] === undefined) d[k] = v;
  delete d.veiled;
}
// On saving: hidden or shown, as Omni Eyed says (only for whoever may see it).
function settleItemVeil(d) {
  if (!d.gmMade || !canSeeGmSecrets(d)) return;
  if (d.omniEyed) unveilItemMagic(d); else veilItemMagic(d);
}
// A magical item the GM made and hasn't made Omni Eyed: the group keeps it.
// It can be assigned to a party member, not given to one.
function itemStaysWithGroup(it) {
  return !!(it && it.gmMade && !it.omniEyed && (it.veiled || it.type === 'Magic Item' || it.masterwork));
}
// The magic is hidden from you.
function itemMagicHiddenFromMe(it) {
  return !!(it && it.veiled && !canSeeGmSecrets(it));
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
// The item as it goes into a character's own inventory.
function itemLeavingGroup(it) {
  const c = groupItemPayload(it);
  delete c.groupContainer;
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

// The Group Inventory of a group; the GM Inventory (gm) is the GM's own,
// not any one group's.
function showGroupInventory(groupId, gm) {
  if (groupId) activeGroupId = groupId;
  state.activeSkillId = null;
  state.activeView = gm ? 'gmInventory' : 'groupInventory';
  renderSidebar();
  renderGroupInventoryModule();
}
function showGmInventory() { showGroupInventory(null, true); }

// The page shown: { gmPage, group, isGM }, kept so folding a section can
// redraw without loading again.
let groupInvView = null;

// The group's containers are rows too (item.type 'Container'): { name,
// carriedBy (a character's row id), capacity, isDefault }. An item says which
// one it is in with item.groupContainer (the container row's id). New items
// go into the default container.
function groupContainerRows() {
  return groupItemsCache.filter(r => (r.item || {}).type === 'Container')
    .sort((a, b) => String(a.item.name || '').localeCompare(String(b.item.name || ''), undefined, { sensitivity: 'base' }));
}
function groupItemRows() {
  return groupItemsCache.filter(r => (r.item || {}).type !== 'Container');
}
async function groupDefaultContainerId(groupId) {
  const { data } = await sb.from('group_items').select('id, item').eq('group_id', groupId).eq('place', 'group');
  const c = (data || []).find(r => r.item && r.item.type === 'Container' && r.item.isDefault);
  return c ? c.id : null;
}

async function renderGroupInventoryModule() {
  const gmPage = state.activeView === 'gmInventory';
  const main = document.getElementById('main');
  main.innerHTML = `<div class="panel"><div class="panel-body">Loading…</div></div>`;
  if (!myGroups.length) await fetchMyGroups();
  const title = gmPage ? 'GM Inventory' : 'Group Inventory';
  const placeholder = text => { main.innerHTML = `<div class="panel"><div class="panel-header"><h2>${title}</h2></div><div class="panel-body"><div class="note placeholder">${text}</div></div></div>`; };
  const group = gmPage ? null : myGroups.find(g => g.id === activeGroupId);
  if (gmPage && !amIGM()) { placeholder('Only a GM can open the GM Inventory.'); return; }
  if (!gmPage && !group) { placeholder('Open a group first (File → Groups).'); return; }
  const isGM = gmPage || group.myRole === 'gm';
  const [{ data: rows, error }, { data: roster }] = await Promise.all([
    gmPage
      ? sb.from('group_items').select('*').eq('place', 'gm').eq('created_by', currentUser.id).order('created_at', { ascending: true })
      : sb.from('group_items').select('*').eq('group_id', group.id).eq('place', 'group').order('created_at', { ascending: true }),
    gmPage ? Promise.resolve({ data: [] }) : sb.from('group_roster').select('id, owner_id, name, is_npc').eq('group_id', group.id)
  ]);
  if (state.activeView !== (gmPage ? 'gmInventory' : 'groupInventory') || (!gmPage && activeGroupId !== group.id)) return; // moved on meanwhile
  groupItemsError = error ? groupItemsErrorText(error) : '';
  groupItemsCache = rows || [];
  groupItemsRoster = (roster || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  groupInvView = { gmPage, group, isGM, title };
  drawGroupInventory();
}

// ▾/▸ on a section header (kept apart from the character Inventory's folds).
function toggleGroupItemSection(key) {
  const k = 'grp:' + key;
  if (collapsedItemGroups.has(k)) collapsedItemGroups.delete(k); else collapsedItemGroups.add(k);
  drawGroupInventory();
}

function drawGroupInventory() {
  const v = groupInvView;
  const main = document.getElementById('main');
  if (!v || !main) return;
  const { gmPage, group, isGM, title } = v;
  const rosterOpts = (selected, blank) => `<option value="">${blank}</option>` + groupItemsRoster.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${escapeHtml(c.name || 'Unnamed')}</option>`).join('');
  const num = x => (parseFloat(x) || 0).toLocaleString();
  const containers = gmPage ? [] : groupContainerRows();
  const containerOf = it => containers.find(c => c.id === it.groupContainer) || null;
  const items = groupItemRows();
  const starred = items.filter(r => r.starred).length;
  const showEye = gmPage || isGM;
  const cols = gmPage ? 11 : 12 + (showEye ? 1 : 0);

  const rowHtml = r => {
    const it = r.item || {};
    const star = r.starred ? `<span class="group-star" title="New from the GM">★</span> ` : '';
    const eye = showEye ? `<td style="text-align:center">${it.gmMade && canSeeGmSecrets(it) ? (it.omniEyed ? 'Y' : 'N') : ''}</td>` : '';
    const box = containerOf(it);
    const edit = `<td class="item-edit" title="${r.starred ? 'Open (accepts it)' : 'Edit'}" onclick="openGroupItemModal('${r.id}')">✎</td>`;
    const del = isGM ? `<td class="item-del" title="Delete" onclick="deleteGroupItem('${r.id}')">✕</td>` : '<td></td>';
    return `<tr class="item-row${r.starred ? ' group-item-new' : ''}" style="${it.masterwork ? 'font-style:italic' : ''}">
      <td>${star}${escapeHtml(it.name || '')}</td>
      <td>${escapeHtml(it.itemNo || '')}</td>
      <td class="item-kind">${escapeHtml(itemKindLabel(it))}</td>
      ${gmPage ? '' : `<td class="item-kind">${box ? escapeHtml(box.item.name || '') : '—'}</td>`}
      <td class="item-qty">${escapeHtml(it.qty || 1)}</td>
      ${gmPage ? `<td>${num(it.weight)}</td>` : `<td style="text-align:center">${it.masterwork || it.type === 'Magic Item' ? '✓' : ''}</td>`}
      <td>${num(it.worth)}</td>
      ${eye}
      ${gmPage ? '' : `<td><select class="group-item-select" title="Who may use it: the group still owns it" onchange="assignGroupItem('${r.id}', this.value)">${rosterOpts(r.assigned_char_id, '— nobody —')}</select></td>`}
      <td class="item-kind">${escapeHtml(it.notes || '')}</td>
      ${gmPage
        ? `<td><button class="btn btn-gold item-spell-btn" title="Move it to one of your groups' inventories, starred" onclick="gmItemToGroup('${r.id}')">→ Group</button></td>`
        : `<td class="group-item-actions">${r.starred ? `<button class="btn btn-gold item-spell-btn" onclick="acceptGroupItem('${r.id}')">Accept</button>` : ''}${itemStaysWithGroup(it) ? `<span class="note">Assign only${infoTip('A magical item that is not Omni Eyed stays with the group: it can be assigned to a party member, not given to one.')}</span>` : `<select class="group-item-select" title="Give it to a party member: it becomes theirs" onchange="moveGroupItem('${r.id}', this.value)">${rosterOpts('', 'Give to…')}</select>`}</td>`}
      ${edit}${del}</tr>`;
  };

  // sections by kind, as on a character's Inventory; within one, by container then name
  const sectionOf = it => { const k = inventorySectionOf(it); return INVENTORY_SECTIONS.includes(k) ? k : 'Items'; };
  const rank = it => { const i = containers.findIndex(c => c.id === it.groupContainer); return i < 0 ? containers.length : i; };
  const body = INVENTORY_SECTIONS.map(section => {
    const rows = items.filter(r => sectionOf(r.item || {}) === section)
      .sort((a, b) => (rank(a.item) - rank(b.item)) || String(a.item.name || '').localeCompare(String(b.item.name || ''), undefined, { sensitivity: 'base' }));
    if (!rows.length) return '';
    const hidden = collapsedItemGroups.has('grp:' + section);
    return `<tr class="item-group" data-group="${escapeHtml(section)}" title="${hidden ? 'Show' : 'Hide'} these items" onclick="toggleGroupItemSection(this.dataset.group)"><td colspan="${cols}"><span class="item-group-toggle">${hidden ? '▸' : '▾'}</span>${escapeHtml(section)}<span class="item-group-stats">(${rows.length})</span></td></tr>` +
      (hidden ? '' : rows.map(rowHtml).join(''));
  }).join('');

  const eyeHead = showEye ? `<th>Omni Eyed${infoTip("GM only. Y: players see the item's magic (modifiers, spells, effect). N: they don't, and it doesn't count for them.")}</th>` : '';
  const head = `<th>Item</th><th>Item #</th><th>Type</th>${gmPage ? '' : '<th>Container</th>'}<th>Qty</th>${gmPage ? '<th>Weight</th>' : '<th>MW/Magic</th>'}<th>Worth</th>${eyeHead}` +
    (gmPage ? '' : `<th>Assigned To${infoTip('Assigning lets that character use the item: it shows in their inventory and works like their own, but the group still owns it. Give to… makes it theirs for good.')}</th>`) +
    `<th>Notes</th><th></th><th></th><th></th>`;
  const sum = (list, f) => list.reduce((s, r) => s + (parseFloat((r.item || {})[f]) || 0) * (parseFloat((r.item || {}).qty) || 1), 0);

  // the containers: who carries each, which is the default, what's in it
  const containerTable = gmPage ? '' : `
      <div class="section-label">Containers${infoTip('New items go into the default container. Carried By says which party member has it.')}</div>
      <table class="item-table inventory-table">
        <thead><tr><th>Container</th><th>Carried By</th><th>Default</th><th>Items</th><th>Weight</th><th>Capacity</th><th>Available Capacity</th><th>Worth</th><th></th><th></th></tr></thead>
        <tbody>${containers.map(c => {
          const inIt = items.filter(r => (r.item || {}).groupContainer === c.id);
          const w = sum(inIt, 'weight');
          const cap = parseFloat(c.item.capacity);
          const left = cap > 0 ? cap - w : null;
          return `<tr>
            <td>${escapeHtml(c.item.name || '')}${c.item.isDefault ? ' <span class="item-group-stats">(default)</span>' : ''}</td>
            <td><select class="group-item-select" onchange="setGroupContainerCarrier('${c.id}', this.value)">${rosterOpts(c.item.carriedBy, '— nobody —')}</select></td>
            <td style="text-align:center"><input type="radio" name="grp-default-container" ${c.item.isDefault ? 'checked' : ''} title="New items go here" onchange="setGroupContainerDefault('${c.id}')"></td>
            <td>${inIt.length.toLocaleString()}</td>
            <td>${w.toLocaleString()}</td>
            <td>${cap > 0 ? cap.toLocaleString() : 'no limit'}</td>
            <td style="${left !== null && left < 0 ? 'color:#c05050' : ''}">${left === null ? '—' : left.toLocaleString() + (left < 0 ? ' OVER' : '')}</td>
            <td>${sum(inIt, 'worth').toLocaleString()}</td>
            <td class="item-edit" title="Edit" onclick="openGroupContainerModal('${c.id}')">✎</td>
            <td class="item-del" title="Delete" onclick="deleteGroupContainer('${c.id}')">✕</td>
          </tr>`;
        }).join('') || '<tr><td colspan="10" class="note">No containers yet.</td></tr>'}</tbody>
      </table>
      <button class="btn btn-dim" onclick="openGroupContainerModal(null)">Add Container</button>`;

  main.innerHTML = `
  <div class="panel plain-font">
    <div class="panel-header inventory-header"><h2>${title}${group ? ' — ' + escapeHtml(group.name) : ''}</h2>
      <div class="computed-item inventory-worth"><span class="ci-label">Weight</span><span class="ci-value">${sum(items, 'weight').toLocaleString()}</span></div>
      <div class="computed-item inventory-worth"><span class="ci-label">Total Worth</span><span class="ci-value">${sum(items, 'worth').toLocaleString()}</span></div>
    </div>
    <div class="panel-body">
      ${groupItemsError ? `<div class="warn">${escapeHtml(groupItemsError)}</div>` : ''}
      ${gmPage ? '<div class="note">Only you see this list. → Group moves an item into one of your groups, starred until someone accepts it.</div>' : starred ? `<div class="note">★ ${starred} new item${starred === 1 ? '' : 's'} from the GM: Accept or open ${starred === 1 ? 'it' : 'them'}.</div>` : ''}
      <table class="item-table inventory-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${cols}" class="note">${gmPage ? 'No items yet. Use Add Item below.' : 'No group treasure yet. Use Add Item below, or Give to Group in an item\'s ✎ on your Inventory.'}</td></tr>`}</tbody>
      </table>
      ${groupItemsError ? '' : `<button class="btn btn-gold" onclick="openGroupItemModal(null, '${gmPage ? 'gm' : 'group'}')">Add Item</button>`}
      ${groupItemsError ? '' : containerTable}
      ${gmPage ? '' : `<div style="display:flex;gap:6px;margin-top:12px">
        <button class="btn btn-dim" onclick="showGroupModule()">👥 Group Page</button>
      </div>`}
    </div>
  </div>`;
}

// ---------- the group's containers ----------

let groupContainerDraft = null;
function openGroupContainerModal(id) {
  const row = id ? groupItemsCache.find(r => r.id === id) : null;
  groupContainerDraft = row ? { id: row.id, ...row.item } : { id: null, type: 'Container', name: '', carriedBy: '', capacity: '', isDefault: !groupContainerRows().length };
  const d = groupContainerDraft;
  const opts = `<option value="">— nobody —</option>` + groupItemsRoster.map(c => `<option value="${c.id}" ${c.id === d.carriedBy ? 'selected' : ''}>${escapeHtml(c.name || 'Unnamed')}</option>`).join('');
  openModal(`
    <h3>${row ? 'Edit Container' : 'Add Container'}</h3>
    <div class="form-row">
      <div class="form-group w-lg"><label>Name</label><input class="w-full" value="${escapeHtml(d.name || '')}" oninput="groupContainerDraft.name=this.value"></div>
      <div class="form-group w-lg"><label>Carried By</label><select class="w-full" onchange="groupContainerDraft.carriedBy=this.value">${opts}</select></div>
      <div class="form-group w-sm"><label>Capacity</label><input class="w-full" type="number" min="0" value="${escapeHtml(d.capacity || '')}" oninput="groupContainerDraft.capacity=this.value"></div>
    </div>
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" ${d.isDefault ? 'checked' : ''} onchange="groupContainerDraft.isDefault=this.checked"> Default: new items go here</label>
    <div id="gc-error" class="warn" style="display:none"></div>
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="groupContainerDraft=null;closeModal()">Cancel</button>
      <button class="btn btn-gold" onclick="confirmGroupContainer()">${row ? 'Save' : 'Add Container'}</button>
    </div>`);
}
async function confirmGroupContainer() {
  const d = groupContainerDraft;
  const group = groupInvView && groupInvView.group;
  if (!d || !group) return;
  const name = String(d.name || '').trim();
  const err = text => { const e = document.getElementById('gc-error'); e.textContent = text; e.style.display = 'block'; };
  if (!name) { err('Give the container a name.'); return; }
  if (groupContainerRows().some(c => c.id !== d.id && String(c.item.name || '').trim().toLowerCase() === name.toLowerCase())) { err('The group already has a container by that name.'); return; }
  const item = { type: 'Container', name, carriedBy: d.carriedBy || null, capacity: parseFloat(d.capacity) > 0 ? parseFloat(d.capacity) : '', isDefault: !!d.isDefault };
  const { error } = d.id
    ? await sb.from('group_items').update({ item }).eq('id', d.id)
    : await sb.from('group_items').insert({ group_id: group.id, place: 'group', item, created_by: currentUser.id });
  if (error) { err('Could not save: ' + error.message); return; }
  // only one default
  if (item.isDefault) await clearOtherGroupDefaults(d.id);
  groupContainerDraft = null;
  closeModal();
  renderGroupInventoryModule();
}
// The default is unticked on every other container (id: the one that keeps
// it; null = the one just added, found by name).
async function clearOtherGroupDefaults(keepId) {
  const { data } = await sb.from('group_items').select('id, item').eq('group_id', groupInvView.group.id).eq('place', 'group');
  const defaults = (data || []).filter(r => r.item && r.item.type === 'Container' && r.item.isDefault);
  const keep = keepId || (defaults.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || {}).id;
  for (const r of defaults) if (r.id !== keep) await sb.from('group_items').update({ item: { ...r.item, isDefault: false } }).eq('id', r.id);
}
async function setGroupContainerDefault(id) {
  const row = groupItemsCache.find(r => r.id === id);
  if (!row) return;
  if (!await updateGroupItemRow(id, { item: { ...row.item, isDefault: true } })) return;
  await clearOtherGroupDefaults(id);
  renderGroupInventoryModule();
}
async function setGroupContainerCarrier(id, charId) {
  const row = groupItemsCache.find(r => r.id === id);
  if (!row) return;
  if (await updateGroupItemRow(id, { item: { ...row.item, carriedBy: charId || null } })) renderGroupInventoryModule();
}
// Deleting a container: what's in it goes to the default container (or none).
async function deleteGroupContainer(id) {
  const row = groupItemsCache.find(r => r.id === id);
  if (!row) return;
  const inIt = groupItemRows().filter(r => (r.item || {}).groupContainer === id);
  const def = groupContainerRows().find(c => c.item.isDefault && c.id !== id);
  if (!await appConfirm(`Delete the container "${row.item.name || ''}"?${inIt.length ? ` Its ${inIt.length} item${inIt.length === 1 ? '' : 's'} go${inIt.length === 1 ? 'es' : ''} to ${def ? '"' + def.item.name + '"' : 'no container'}.` : ''}`, 'Delete')) return;
  for (const r of inIt) {
    const item = { ...r.item };
    if (def) item.groupContainer = def.id; else delete item.groupContainer;
    if (!await updateGroupItemRow(r.id, { item })) return;
  }
  const { error } = await sb.from('group_items').delete().eq('id', id);
  if (error) alert('Could not delete: ' + error.message);
  renderGroupInventoryModule();
}

// ---------- the item popup, saving to the group ----------

// Add Item / ✎ on either page: the inventory's item popup (renderAddItemModal),
// saving to group_items. Opening a starred item accepts it.
function openGroupItemModal(rowId, place) {
  const row = rowId ? groupItemsCache.find(r => r.id === rowId) : null;
  if (rowId && !row) return;
  if (row && row.starred) acceptGroupItem(row.id, true);
  place = row ? row.place : place;
  openAddItemModal({ target: { groupId: place === 'gm' ? null : activeGroupId, place, rowId: row ? row.id : null } });
  if (!row) {
    const def = place === 'group' && groupContainerRows().find(c => c.item.isDefault);
    if (def) itemDraft.groupContainer = def.id;
    return;
  }
  itemDraft = JSON.parse(JSON.stringify(row.item || {}));
  if (canSeeGmSecrets(itemDraft)) unveilItemMagic(itemDraft); // the GM edits its magic in the open
  itemPicks = itemPicksFromItem(itemDraft);
  for (const k of ['weaponClass', 'itemClass', 'magicItemClass']) if (itemPicks[k] === ITEM_PICK_CUSTOM) delete itemDraft[k];
  editingItemIdx = 'group';
  renderAddItemModal();
}
// Whether the popup's new item is being made by a GM (in the GM Inventory,
// or in a group they GM).
function popupMakerIsGM(t) {
  return !!t && (t.place === 'gm' ? amIGM() : isGroupGM(t.groupId));
}

// confirmAddItem, for an item in the group's lists.
async function saveGroupItemFromPopup(d) {
  const t = itemPopupTarget;
  const isGM = popupMakerIsGM(t);
  const row = t.rowId ? groupItemsCache.find(r => r.id === t.rowId) : null;
  const payload = groupItemPayload(d);
  const { error } = row
    ? await sb.from('group_items').update({ item: payload, starred: false }).eq('id', row.id)
    : await sb.from('group_items').insert({ group_id: t.groupId, place: t.place, item: payload, starred: t.place === 'group' && isGM, created_by: currentUser.id });
  if (error) { const err = document.getElementById('ai-error'); if (err) { err.textContent = groupItemsErrorText(error); err.style.display = 'block'; } return; }
  const again = !row && addNextItem;
  itemDraft = null; editingItemIdx = null;
  if (again) { openAddItemModal({ keepAddNext: true, justAdded: d.name, target: { ...t } }); if (d.groupContainer) itemDraft.groupContainer = d.groupContainer; }
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
// → Group in the GM Inventory: pick which of your groups gets it.
function gmItemToGroup(id) {
  const row = groupItemsCache.find(r => r.id === id);
  const groups = (myGroups || []).filter(g => g.myRole === 'gm');
  if (!row || !groups.length) return;
  openModal(`
    <h3>Move to a Group</h3>
    <div class="form-group"><label>“${escapeHtml((row.item || {}).name || 'This item')}” goes to</label>
      <select id="gm-to-group" class="w-lg">${groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}</select></div>
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="closeModal()">Cancel</button>
      <button class="btn btn-gold" onclick="confirmGmItemToGroup('${id}', document.getElementById('gm-to-group').value)">Move</button>
    </div>`);
}
async function confirmGmItemToGroup(id, groupId) {
  const row = groupItemsCache.find(r => r.id === id);
  if (!row || !isGroupGM(groupId)) return;
  const item = { ...(row.item || {}), gmGroupId: groupId };
  if (!item.gmBy) item.gmBy = currentUser.id;
  const def = await groupDefaultContainerId(groupId);
  if (def) item.groupContainer = def; else delete item.groupContainer;
  if (await updateGroupItemRow(id, { place: 'group', group_id: groupId, starred: true, item })) { closeModal(); renderGroupInventoryModule(); }
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
// Give to…: the item becomes that character's. One of your own characters
// takes it straight away; anyone else's gets it the next time their owner's
// app loads (see syncGroupItemsForMyCharacters).
async function moveGroupItem(id, charId) {
  const row = groupItemsCache.find(r => r.id === id);
  const who = groupItemsRoster.find(c => c.id === charId);
  if (!row || !who) { renderGroupInventoryModule(); return; }
  if (itemStaysWithGroup(row.item)) { alert('This magical item is not Omni Eyed: it can only be assigned, not given away.'); renderGroupInventoryModule(); return; }
  if (!await appConfirm(`Give "${(row.item || {}).name || 'this item'}" to ${who.name || 'this character'}? It leaves the group's inventory and becomes theirs.`, 'Give')) { renderGroupInventoryModule(); return; }
  const appId = myCharAppIdOfRow(charId);
  if (appId && state.characters[appId]) {
    const char = state.characters[appId];
    // the copy shown as assigned (on whichever of your characters) goes; the real item takes its place
    dropAssignedCopies(row.id);
    char.items = char.items || [];
    char.items.push({ ...itemLeavingGroup(row.item || {}), fromGroupItem: row.id });
    clearTimeout(saveStateTimer); saveStateTimer = null;
    await flushCharactersToSupabase();
    const { error } = await sb.from('group_items').delete().eq('id', row.id);
    if (error) alert('The item was added to ' + (who.name || 'the character') + ', but could not be taken out of the group: ' + error.message);
  } else {
    if (!await updateGroupItemRow(id, { place: 'delivery', to_char_id: charId, assigned_char_id: null, starred: false })) return;
    dropAssignedCopies(row.id); // it was assigned to one of yours: no longer
  }
  renderGroupInventoryModule();
}
// An item that stops being assigned: its copies leave your characters at once
// (other players' apps drop theirs at their next sync).
function dropAssignedCopies(rowId) {
  for (const char of Object.values(state.characters)) {
    if ((char.items || []).some(it => it._groupItem && it._groupItem.id === rowId)) char.items = char.items.filter(it => !(it._groupItem && it._groupItem.id === rowId));
  }
  delete groupItemSynced[rowId];
  delete groupItemShownOn[rowId];
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
  const item = groupItemPayload(it);
  const def = await groupDefaultContainerId(groupId);
  if (def) item.groupContainer = def;
  const { error } = await sb.from('group_items').insert({ group_id: groupId, place: 'group', item, starred: isGM, created_by: currentUser.id });
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
    if (!(char.items || []).some(it => it.fromGroupItem === row.id)) (char.items = char.items || []).push({ ...itemLeavingGroup(row.item || {}), fromGroupItem: row.id });
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
