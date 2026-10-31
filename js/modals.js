// ============================================================
// MODALS
// ============================================================
function openModal(html, opts) {
  const box = document.getElementById('modal-box');
  box.innerHTML = html;
  box.style.maxWidth = (opts && opts.wide) ? '760px' : '';
  // A fixed width keeps a modal whose content changes as you use it (e.g. the
  // guild picker's hover blurb) from resizing; otherwise it fits its content.
  box.style.width = (opts && opts.width) || '';
  // Extra classes for this modal only (e.g. 'plain-font' for the item popup).
  box.className = (opts && opts.className) || '';
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// "Add Item" on the Inventory page: every item field in one popup. The
// item is built in itemDraft (mutations.js) and only added on confirm.
// Every dropdown starts at "— select —", and the other fields and the Add
// button stay locked until each dropdown has a choice.
function openAddItemModal(opts) {
  opts = opts || {};
  itemDraft = { type: '', name: '', qty: 1, weight: 0, worth: '', notes: '', location: '', masterwork: false };
  itemPicks = {};
  editingItemIdx = null;
  resetItemSpellDraft();
  if (!opts.keepAddNext) addNextItem = false;
  renderAddItemModal(opts.justAdded);
}

// ✎ on an inventory row: the same popup, filled in from that item. It edits
// a copy, so Cancel leaves the item untouched.
function openEditItemModal(idx) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  itemDraft = JSON.parse(JSON.stringify(char.items[idx]));
  itemPicks = itemPicksFromItem(itemDraft);
  // A class that is no longer in its list (renamed since) reads as "— custom —",
  // so drop it from the copy too; otherwise the Item step below it stays unfilled.
  for (const k of ['weaponClass', 'itemClass', 'magicItemClass']) if (itemPicks[k] === ITEM_PICK_CUSTOM) delete itemDraft[k];
  editingItemIdx = idx;
  resetItemSpellDraft();
  addNextItem = false;
  renderAddItemModal();
}

function renderAddItemModal(justAdded) {
  const char = state.characters[state.activeChar];
  const d = itemDraft;
  if (!char || !d) return;
  const val = x => escapeHtml(x === undefined || x === null ? '' : x);
  const opt = (value, label, selected) => `<option value="${val(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  // tier: 'sm' | 'md' | 'lg' | 'full' (the field-width tiers), or 'fill' to take the rest of the row
  const field = (label, control, tier) => `<div class="form-group${tier === 'fill' ? '' : tier ? ' w-' + tier : ''}"${tier === 'fill' ? ' style="flex:1;min-width:var(--w-md)"' : ''}><label>${label}</label>${control}</div>`;
  const editing = editingItemIdx !== null;
  const ready = itemPicksComplete(d);
  const lock = ready ? '' : 'disabled';

  // The dropdowns: "— select —" first, then the list, then "— custom —" where the step has one.
  const steps = itemPickSteps(d);
  const dropdowns = steps.map(s => {
    const picked = itemPicks[s.key];
    const options = opt('', '— select —', picked === undefined) +
      s.options.map(o => opt(o, s.labelOf ? s.labelOf(o) : o, picked === o)).join('') +
      (s.custom ? opt(ITEM_PICK_CUSTOM, '— custom —', picked === ITEM_PICK_CUSTOM) : '');
    return field(s.label, `<select class="w-full"  onchange="setItemPick('${s.key}',this.value)">${options}</select>`, s.key === 'type' ? 'md' : 'lg');
  }).join('');

  const hasArmorStats = d.type === 'Armor' || d.type === 'Shield';
  // Carried plus the containers/locations already set up; new ones come from "Add Container".
  const location = (d.location || '').trim();
  const locations = itemLocations(char);
  if (location && !locations.includes(location)) locations.push(location);
  const num = (key, extra) => `<input class="w-full" type="number"  ${extra || ''} ${lock} value="${val(d[key])}" oninput="setAddItemField('${key}',this.value)">`;

  openModal(`
    <h3>${editing ? 'Edit Item' : 'Add Item'}</h3>
    ${justAdded ? `<div class="note" style="margin-bottom:8px;color:var(--gold-dim)">Added “${escapeHtml(justAdded)}”. Next item:</div>` : ''}
    <div class="form-row">${dropdowns}</div>
    <div class="form-row">
      ${field('Name', `<input class="w-full" id="ai-name"  ${lock} value="${val(d.name)}" oninput="setAddItemField('name',this.value)">`, 'full')}
    </div>
    <div class="form-row">
      ${hasArmorStats ? field('AV', num('av'), 'sm') + field('PR', num('pr'), 'sm') : ''}
      ${field('Qty', num('qty', 'min="1"'), 'sm')}
      ${field('Unit Weight', num('weight'), 'sm')}
      ${field('Unit Worth', num('worth'), 'sm')}
      ${d.type === 'Magic Item' ? '' : `<div class="form-group" style="justify-content:flex-end">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding-bottom:6px">
          <input type="checkbox" ${lock} ${d.masterwork ? 'checked' : ''} onchange="setAddItemField('masterwork',this.checked);renderAddItemModal()"> ${d.type === 'Item' ? 'Masterwork' : 'Masterwork / Magic'}
        </label>
      </div>`}
    </div>
    <div class="form-row">
      ${field('Location', `<select class="w-full"  ${lock} onchange="setAddItemField('location',this.value)">${opt('', 'Carried', !location)}${locations.map(l => opt(l, l, location === l)).join('')}</select>`, 'md')}
      ${field('Notes', `<input class="w-full"  ${lock} value="${val(d.notes)}" oninput="setAddItemField('notes',this.value)">`, 'fill')}
    </div>
    ${ready && itemModKinds(d) ? itemModsSectionHtml(d) : ''}
    ${ready && itemCanHoldSpells(d) ? itemSpellsSectionHtml(d) : ''}
    <div class="note" style="margin-top:2px">${ready ? 'Carried items count toward Weight Carried. To put an item in a new bag, stash or other location, add it under Storage Locations first.' : 'Choose from every list above to fill in the rest of the item.'}</div>
    <div id="ai-error" style="color:var(--red-b);font-size:12px;margin-top:8px;display:none"></div>
    <div class="modal-actions" style="align-items:center">
      ${editing ? '' : `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-right:auto">
        <input type="checkbox" ${addNextItem ? 'checked' : ''} onchange="addNextItem=this.checked"> Add next item
      </label>`}
      <button class="btn btn-dim" onclick="itemDraft=null;editingItemIdx=null;addNextItem=false;closeModal()">Cancel</button>
      <button class="btn btn-gold" ${lock} onclick="confirmAddItem()">${editing ? 'Save' : 'Add Item'}</button>
    </div>`, { wide: true, width: 'min(760px, 94vw)', className: 'plain-font' });
}

// The item popup's Magic Modifiers section: the kinds this item type has,
// plus buttons for the ones it can add (see itemModKinds).
function itemModsSectionHtml(d) {
  const k = itemModKinds(d);
  const val = x => escapeHtml(x === undefined || x === null ? '' : x);
  const num = (field, label) => `<div class="form-group"><label>${label}</label><input type="number" class="w-sm" value="${val(d[field])}" oninput="setAddItemField('${field}',this.value)"></div>`;
  const head = (title, kind) => `<div style="font-size:12px;margin:8px 0 2px;color:var(--gold-dim)">${title}${k.optional.includes(kind) ? ` <span class="item-del" style="cursor:pointer;color:var(--red-b)" title="Remove ${title.toLowerCase()}" onclick="removeItemModKind('${kind}')">✕</span>` : ''}</div>`;
  const parts = [];
  if (itemHasModKind(d, 'offense')) parts.push(head('Offense', 'offense') + `<div class="form-row">${num('magicBonusToHit', 'To Hit')}${num('magicDamageBeforeDivider', 'Dmg Before Divider')}${num('magicDamageAfterDivider', 'Dmg After Divider')}${num('magicCritBonus', 'Crit %')}</div>`);
  if (itemHasModKind(d, 'defense')) parts.push(head('Defense', 'defense') + `<div class="form-row">${num('magicAvoidance', 'Avoidance')}${num('magicProtection', 'Protection')}</div><div class="note">Bonuses: Avoidance lowers AV, Protection adds to PR.</div>`);
  if (itemHasModKind(d, 'void')) {
    if (!(d.magicVoid || []).length) d.magicVoid = [{ pool: '', amount: '' }]; // start with one row to fill in
    const pools = spellPoolNames();
    const opt = (v, l, sel) => `<option value="${escapeHtml(v)}" ${sel ? 'selected' : ''}>${escapeHtml(l)}</option>`;
    const rows = (d.magicVoid || []).map((v, i) => `<div class="form-row item-spell-edit" style="align-items:flex-end;margin-bottom:4px">
      <div class="form-group"><label>Spell Pool</label><select class="w-md" onchange="setItemVoidRow(${i},'pool',this.value)">${opt('', '— select —', !v.pool)}${pools.map(p => opt(p, p, v.pool === p)).join('')}</select></div>
      <div class="form-group"><label>Cost Reduction</label><input type="number" min="0" class="w-sm" value="${val(v.amount)}" oninput="setItemVoidRow(${i},'amount',this.value)"></div>
      <div class="form-group"><span class="item-del" style="cursor:pointer;color:var(--red-b);padding:6px 2px" title="Remove" onclick="removeItemVoidRow(${i})">✕</span></div>
    </div>`).join('');
    parts.push(head('Void', 'void') + rows + `<div style="display:flex;align-items:center;gap:12px;margin-top:2px">
      <button type="button" class="btn btn-dim" onclick="addItemVoidRow()">Add pool</button>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" ${d.magicVoidStacks ? 'checked' : ''} onchange="setAddItemField('magicVoidStacks',this.checked)"> Stacks with other items' void bonuses</label>
    </div><div class="note">Spell cost reduction per pool. Only the best single item counts, unless an item is marked as stacking.</div>`);
  }
  const adders = k.optional.filter(kind => !itemHasModKind(d, kind))
    .map(kind => `<button type="button" class="btn btn-dim" onclick="addItemModKind('${kind}')">Add ${kind}</button>`).join(' ');
  return `
    <hr class="divider">
    <div class="form-group"><label>Magic Modifiers</label></div>
    ${parts.join('')}
    ${adders ? `<div style="margin-top:6px;display:flex;gap:6px">${adders}</div>` : ''}`;
}

// The item popup's Spells section (magic items): the spells already on the
// item, then a row to add another at a fixed level with a usage limit.
function itemSpellsSectionHtml(d) {
  const opt = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const schools = Object.keys(SPELL_SCHOOL_TO_POOL).sort();
  const rule = itemSpellRule(d);
  const list = (d.spells || []).map((sp, i) => `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">✦ ${escapeHtml(sp.name)} (${escapeHtml(sp.school)}) · Level ${sp.level} · ${escapeHtml(rule === 'scroll' ? 'one use' : rule === 'potion' ? sp.usesMax + ' use' + (sp.usesMax == 1 ? '' : 's') : sp.usesMax + ' ' + itemSpellPeriodLabel(sp.period))}<span class="item-del" style="cursor:pointer;color:var(--red-b)" title="Remove" onclick="removeItemSpellFromDraft(${i})">✕</span></div>`).join('');
  // One selection row per draft, on a single line, ending with ✕
  const rows = itemSpellDrafts.map((s, i) => {
    const catalog = s.school ? SPELLS.filter(sp => sp.school === s.school).sort((a, b) => a.name.localeCompare(b.name)) : [];
    const spellField = !s.school
      ? '<select class="w-md" disabled><option>— select —</option></select>'
      : catalog.length
        ? `<select class="w-md" onchange="setItemSpellDraft(${i},'name',this.value,true)">${opt('', '— select —', !s.name)}${catalog.map(sp => opt(sp.name, sp.name, s.name === sp.name)).join('')}</select>`
        : `<input class="w-md" value="${escapeHtml(s.name || '')}" placeholder="Type its name" oninput="setItemSpellDraft(${i},'name',this.value)">`;
    return `<div class="form-row item-spell-edit" style="align-items:flex-end;margin-top:6px">
      <div class="form-group"><label>School</label><select class="w-md" onchange="setItemSpellDraft(${i},'school',this.value,true)">${opt('', '— select —', !s.school)}${schools.map(sc => opt(sc, sc, s.school === sc)).join('')}</select></div>
      <div class="form-group"><label>Spell</label>${spellField}</div>
      <div class="form-group"><label>Level</label><input type="number" min="1" class="w-sm" value="${escapeHtml(s.level)}" oninput="setItemSpellDraft(${i},'level',this.value)"></div>
      ${rule === 'scroll' ? '' : `<div class="form-group"><label>Uses</label><input type="number" min="1" class="w-sm" value="${escapeHtml(s.usesMax)}" oninput="setItemSpellDraft(${i},'usesMax',this.value)"></div>`}
      ${rule ? '' : `<div class="form-group"><label>Per</label><select class="w-md" onchange="setItemSpellDraft(${i},'period',this.value)">${ITEM_SPELL_PERIODS.map(([v, l]) => opt(v, l, s.period === v)).join('')}</select></div>`}
      <div class="form-group"><span class="item-del" style="cursor:pointer;color:var(--red-b);padding:6px 2px" title="Remove this spell" onclick="closeItemSpellRow(${i})">✕</span></div>
    </div>`;
  }).join('');
  return `
    <hr class="divider">
    <div class="form-group"><label>Spells</label></div>
    ${list || (rows ? '' : '<div class="note">No spells on this item yet.</div>')}
    ${rows}
    ${rule === 'potion' && (d.spells || []).length + itemSpellDrafts.length >= 1 ? '' : '<div style="margin-top:6px"><button type="button" class="btn btn-dim" onclick="openItemSpellRow()">Add spell</button></div>'}
    ${rule === 'potion' ? '<div class="note">A potion holds exactly one spell. Each cast uses one of its uses; when they run out the potion is gone.</div>' : rule === 'scroll' ? '<div class="note">A scroll holds one or more spells. Each can be cast once and is then gone; the scroll goes with its last spell.</div>' : ''}
    <div class="note">Spells are saved with the item. Each is cast at its fixed level, with no spell points, and always succeeds; a cast uses one of its uses.</div>`;
}

// "Add Container" and ✎ under Storage Locations: name, capacity (blank =
// no limit) and whether it's on the person. Edits a draft; see confirmContainer.
function openAddContainerModal() {
  containerDraft = { name: '', capacity: '', onPerson: false };
  editingContainerName = null;
  renderContainerModal();
}

function openEditContainerModal(name) {
  const char = state.characters[state.activeChar];
  if (!char || name === ON_PERSON_LOCATION) return;
  const cap = (char.storageCapacities || {})[name];
  containerDraft = { name, capacity: cap === undefined || cap === null ? '' : cap, onPerson: !!(char.storageOnPerson || {})[name] };
  editingContainerName = name;
  renderContainerModal();
}

function renderContainerModal() {
  const d = containerDraft;
  if (!d) return;
  const editing = editingContainerName !== null;
  const val = x => escapeHtml(x === undefined || x === null ? '' : x);
  openModal(`
    <h3>${editing ? 'Edit Container' : 'Add Container'}</h3>
    <div class="form-row">
      <div class="form-group" style="width:100%"><label>Name</label>
        <input class="w-full"  value="${val(d.name)}" placeholder="e.g. Backpack, Bank of Igbar, Bag of Holding" oninput="containerDraft.name=this.value">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group w-sm"><label>Capacity</label>
        <input class="w-full" type="number" min="0"  value="${val(d.capacity)}" placeholder="no limit" oninput="containerDraft.capacity=this.value">
      </div>
      <div class="form-group" style="justify-content:flex-end">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding-bottom:6px">
          <input type="checkbox" ${d.onPerson ? 'checked' : ''} onchange="containerDraft.onPerson=this.checked"> On Person
        </label>
      </div>
    </div>
    <div class="note">Capacity is the weight it can hold; leave it blank for no limit. Tick On Person for something you wear or carry (a backpack), so its contents count toward Weight Carried.${editing ? ' Renaming moves its items along with it.' : ''}</div>
    <div id="ct-error" style="color:var(--red-b);font-size:12px;margin-top:8px;display:none"></div>
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="containerDraft=null;editingContainerName=null;closeModal()">Cancel</button>
      <button class="btn btn-gold" onclick="confirmContainer()">${editing ? 'Save' : 'Add Container'}</button>
    </div>`, { width: 'min(460px, 92vw)', className: 'plain-font' });
}

// ✕ under Storage Locations: confirm, and choose where the container's items
// go -- On Person, or another existing container.
function openDeleteContainerModal(name) {
  const char = state.characters[state.activeChar];
  if (!char || name === ON_PERSON_LOCATION) return;
  const inside = (char.items || []).filter(it => !isBlankItem(it) && (it.location || '').trim() === name);
  const others = itemLocations(char).filter(l => l !== name);
  const count = inside.reduce((n, it) => n + (parseFloat(it.qty) || 1), 0);
  const dest = !inside.length ? '' : others.length
    ? `<div class="form-group w-lg" style="margin-top:10px"><label>Move its ${count.toLocaleString()} item${count === 1 ? '' : 's'} to</label>
        <select class="w-full" id="ct-move-to" ><option value="">On Person</option>${others.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('')}</select>
      </div>`
    : `<p style="margin-top:8px">Its ${count.toLocaleString()} item${count === 1 ? '' : 's'} will move to On Person.</p>`;
  openModal(`
    <h3>Delete Container</h3>
    <p>Delete "${escapeHtml(name)}"?</p>
    ${dest}
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="closeModal()">Cancel</button>
      <button class="btn btn-red" data-name="${escapeHtml(name)}" onclick="confirmDeleteContainer(this.dataset.name, (document.getElementById('ct-move-to') || {}).value || '')">Delete</button>
    </div>`, { width: 'min(420px, 92vw)', className: 'plain-font' });
}

// "Add Spell" on the Spells page: pick a school, then a spell. SP cost and
// its breakdown come from the catalog and are read-only. "Add another spell"
// keeps the popup open for the next one.
function openAddSpellModal(opts) {
  opts = opts || {};
  spellDraft = { school: '', name: '', cost: 0, notes: '' };
  if (!opts.keepAddNext) addNextSpell = false;
  renderAddSpellModal(opts.justAdded);
}

function renderAddSpellModal(justAdded) {
  const d = spellDraft;
  if (!d) return;
  const opt = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const schools = Object.keys(SPELL_SCHOOL_TO_POOL).sort();
  const catalog = d.school ? SPELLS.filter(sp => sp.school === d.school).sort((x, y) => x.name.localeCompare(y.name)) : [];
  const def = catalog.find(sp => sp.name === d.name);
  const breakdown = def && def.costs ? spellCostText(def.costs) : '—';
  const char = state.characters[state.activeChar];
  const level = char && d.school ? spellLevel(char, d.school) : 0;
  const spellField = !d.school
    ? `<select class="w-lg" disabled><option>— select —</option></select>`
    : catalog.length
      ? `<select class="w-lg" onchange="setSpellDraftName(this.value)">${opt('', '— select —', !d.name)}${catalog.map(sp => opt(sp.name, sp.name, d.name === sp.name)).join('')}</select>`
      : `<input class="w-lg" value="${escapeHtml(d.name)}" placeholder="Not in the catalog: type its name" oninput="setSpellDraftName(this.value, true)">`;
  openModal(`
    <h3>Add Spell</h3>
    ${justAdded ? `<div class="note" style="margin-bottom:8px;color:var(--gold-dim)">Added “${escapeHtml(justAdded)}”. Next spell:</div>` : ''}
    <div class="form-row">
      <div class="form-group"><label>School</label>
        <select class="w-md" onchange="setSpellDraftSchool(this.value)">${opt('', '— select —', !d.school)}${schools.map(sc => opt(sc, sc, d.school === sc)).join('')}</select>
      </div>
      <div class="form-group"><label>Spell</label>${spellField}</div>
    </div>
    <div class="form-row">
      <div class="computed-item"><span class="ci-label">Level</span><span class="ci-value">${d.school ? level : '—'}</span></div>
      <div class="computed-item"><span class="ci-label">Cost</span><span class="ci-value" style="font-size:13px">${escapeHtml(breakdown)}</span></div>
      <div class="computed-item"><span class="ci-label">Duration</span><span class="ci-value" style="font-size:13px">${escapeHtml(spellDurationText(def && def.duration, level))}</span></div>
      <div class="computed-item"><span class="ci-label">Total Cost</span><span class="ci-value">${d.cost || 0}</span></div>
    </div>
    <div class="modal-actions" style="align-items:center">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-right:auto">
        <input type="checkbox" ${addNextSpell ? 'checked' : ''} onchange="addNextSpell=this.checked"> Add another spell
      </label>
      <button class="btn btn-dim" onclick="spellDraft=null;addNextSpell=false;closeModal()">Cancel</button>
      <button class="btn btn-gold" id="as-add" ${d.school && String(d.name).trim() ? '' : 'disabled'} onclick="confirmAddSpell()">Add Spell</button>
    </div>`, { wide: true, width: 'min(560px, 92vw)' });
}

function openNewCharModal(preset) {
  preset = preset || {};
  const initialExp = preset.initialExp !== undefined ? preset.initialExp : true;
  const initialExpAmount = preset.initialExpAmount !== undefined ? preset.initialExpAmount : 5000;
  const roll = preset.roll || false;
  openModal(`
    <h3>New Character</h3>
    <div class="form-group" style="margin-bottom:10px"><label>Name (leave blank if rolling — race-dependent naming)</label><input id="nc-name" class="w-full"  placeholder="Character name, or leave blank to name after rolling" value="${escapeHtml(preset.name||'')}"></div>
    <hr class="divider">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:8px">
      <input type="checkbox" id="nc-initial-exp" ${initialExp?'checked':''} onchange="document.getElementById('nc-initial-exp-amount').disabled=!this.checked">
      Initial EXP spend
    </label>
    <div class="form-group" style="margin-bottom:10px">
      <label>Starting Raw XP pool to spend on skills</label>
      <input type="number" id="nc-initial-exp-amount" class="w-sm" value="${initialExpAmount}" ${initialExp?'':'disabled'}>
    </div>
    <hr class="divider">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:8px">
      <input type="checkbox" id="nc-roll" ${roll?'checked':''} onchange="document.getElementById('nc-roll-options').style.display=this.checked?'block':'none'">
      Roll new character (attributes, race, subrace, height/weight/age, social background)
    </label>
    <div id="nc-roll-options" style="display:${roll?'block':'none'};margin-bottom:10px">
      <div class="form-row">
        <div class="form-group"><label>Region</label>
          <select id="nc-region">
            ${Object.keys(BASE_RACE_TABLE).map(r=>`<option ${preset.region===r?'selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Gender (affects height calc)</label>
          <select id="nc-gender-roll">
            ${['Male','Female','Other'].map(g=>`<option ${preset.gender===g?'selected':''}>${g}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="note">Race and subrace are single d100 rolls each (no re-roll/choice). Stops after Social Number — does not roll the Acquisitions item chart.</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="openCharTutorial(captureNewCharFormState())">Quick Tutorial</button>
      <button class="btn btn-dim" onclick="closeModal()">Cancel</button>
      <button class="btn btn-gold" onclick="createChar()">Create</button>
    </div>`);
}

// Reads the New Character form's current values so the tutorial round-trip
// ("Quick Tutorial" then "Back to New Character") doesn't lose in-progress input.
function captureNewCharFormState() {
  return {
    name: document.getElementById('nc-name').value,
    initialExp: document.getElementById('nc-initial-exp').checked,
    initialExpAmount: document.getElementById('nc-initial-exp-amount').value,
    roll: document.getElementById('nc-roll').checked,
    region: document.getElementById('nc-region').value,
    gender: document.getElementById('nc-gender-roll').value,
  };
}

let charTutorialReturnState = null;
function openCharTutorial(formPreset) {
  charTutorialReturnState = formPreset || null;
  openModal(`
    <h3>GuildSchool — Quick Tutorial</h3>
    <div style="font-size:13px;line-height:1.5">
    <p>This is the GuildSchool Character Tool. It can be used to transfer a character from another format, to create a new one with a GM, or to totally randomize all the beginning dice rolls.</p>
    <hr class="divider">
    <p><strong>Playing the game</strong></p>
    <p>GuildSchool is, at its heart, a skill based game. Everything is based on the skills of the characters. And while this is true to some degree in any game, a skill based system allows for the creation and development of a character that is unique to that character, as opposed to following a restrictive class template. Some systems leave a lot of blank space; some universal framework, whether it be in combat or in pottery, should allow the characters to grow in the direction they wish.</p>
    <p>Furthermore, one of the major ideas in this particular skill based system is the idea that expertise in a broad-based skill gives you some little ability in specialty skills underneath it. A thief with the basic trap skill has a small amount of skill in finding traps, removing traps, and setting traps. This rule is called the <strong>"dropdown" rule</strong>.</p>
    <p>This is a departure from most systems, and something developed decades ago to model the actual learning experience. There are other skill based systems out there, but in most of them each skill stands alone, and a character who gets better at painting or basic merchant is not assumed to get better at other skills that would be, in reality, related.</p>
    <p>Another major ideal of the GuildSchool game is that one only gets better in skills that are used. Experience points and levels are kept in each skill, and a thief only gets better at finding the aforementioned trap by using that skill. No one gets better at finding traps by killing other creatures, contrary to the design of most RPGs.</p>
    <hr class="divider">
    <p><strong>Start here</strong></p>
    <p>The whole game is skill based, but the world is full of guilds and factions, hundreds of them, and they determine your skills and your social interactions.</p>
    <p>So pick your main Guild/School before anything else. Your guild decides what you are better and worse at: it adjusts how fast every skill levels, so some skills come easily and others slowly.</p>
    <hr class="divider">
    <p><strong>What is in the tool</strong></p>
    <ul style="margin:6px 0 6px 18px;padding:0">
      <li><b>Overview and General Info:</b> your skills at a glance, your identity and your guilds.</li>
      <li><b>Inventory:</b> your weapons, armor, items and storage locations.</li>
      <li><b>Combat page:</b> weapons, armor, shields and hit points, built from whatever you put in your inventory.</li>
      <li><b>Spells page:</b> spell points, the entire spell library, and casting.</li>
      <li><b>Groups:</b> for a GM and their players. A shared game clock, the party roster, session notes, and spell point and hit point recovery as time passes.</li>
      <li><b>Combat module:</b> inside a Group, the GM starts a combat and everyone sees the turn order with initiative, hit points and effects that run over time. GMs also have a Beastiary of foes to draw from.</li>
    </ul>
    </div>
    <div class="modal-actions">
      <button class="btn btn-gold" onclick="openNewCharModal(charTutorialReturnState)">Back to New Character</button>
    </div>`, { wide: true });
}

function rollDie(sides) { return Math.floor(Math.random() * sides) + 1; }
function rollDice(count, sides) { let t = 0; for (let i=0;i<count;i++) t += rollDie(sides); return t; }
function rollDiceExpr(expr) {
  // parses simple expressions like '2d8+1' or '1d4'
  const m = expr.replace(/\s/g,'').match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
  if (!m) return 0;
  const [,count,sides,bonus] = m;
  return rollDice(parseInt(count), parseInt(sides)) + (bonus ? parseInt(bonus) : 0);
}
function roll6d4Keep5() {
  const rolls = [rollDie(4),rollDie(4),rollDie(4),rollDie(4),rollDie(4),rollDie(4)];
  rolls.sort((a,b)=>b-a);
  return rolls.slice(0,5).reduce((a,b)=>a+b,0);
}
function lookupOnTable(rollVal, table, minKey='min', maxKey='max') {
  return table.find(row => rollVal >= row[minKey] && rollVal <= row[maxKey]) || null;
}

function rollNewCharacterData(region, isFemale) {
  const log = [];

  // Step 1: Attributes
  const attrs = {};
  for (const a of ['ST','IN','WI','CD','HE','CH','AP']) {
    attrs[a] = roll6d4Keep5();
  }
  log.push(`Attributes (6d4 keep best 5): ST ${attrs.ST}, IN ${attrs.IN}, WI ${attrs.WI}, CD ${attrs.CD}, HE ${attrs.HE}, CH ${attrs.CH}, AP ${attrs.AP}`);

  // Step 2: Race
  const raceRoll = rollDie(100);
  const raceTable = BASE_RACE_TABLE[region] || BASE_RACE_TABLE['General'];
  const raceRow = lookupOnTable(raceRoll, raceTable);
  let race = raceRow ? raceRow.race : null;
  log.push(`Race roll (d100, ${region}): ${raceRoll} → ${race || 'no match'}`);

  if (!race) {
    return { error: `Race roll ${raceRoll} didn't match any entry for ${region}.`, log };
  }

  // Helper: rolls a single race+subrace pair, retrying if it lands on Cross Mixes itself
  // (a cross of a cross isn't well-defined — treat it as a re-roll rather than recursing).
  function rollSingleRaceSubrace() {
    let attempts = 0;
    while (attempts < 20) {
      attempts++;
      const rr = rollDie(100);
      const row = lookupOnTable(rr, raceTable);
      const r = row ? row.race : null;
      if (!r || r === 'Cross Mixes') continue;
      const subTable = SUBRACE_TABLES[r];
      if (!subTable) continue;
      const sr = rollDie(100);
      const subRow = lookupOnTable(sr, subTable);
      if (!subRow) continue;
      return { race: r, subraceRow: subRow, raceRoll: rr, subraceRoll: sr };
    }
    return null;
  }

  let subraceRow, subraceRoll;
  if (race === 'Cross Mixes') {
    log.push(`Cross Mixes rolled — rolling twice more to determine the cross, averaging all stats.`);
    let first = rollSingleRaceSubrace();
    let second = rollSingleRaceSubrace();
    let crossAttempts = 0;
    while (second && first && second.race === first.race && crossAttempts < 20) {
      // same race rolled twice isn't a cross — re-roll the second one
      second = rollSingleRaceSubrace();
      crossAttempts++;
    }
    if (!first || !second) {
      return { error: `Cross Mixes rolled, but couldn't resolve two distinct component races after retries.`, log };
    }
    log.push(`Cross component 1: ${first.race} (roll ${first.raceRoll}) → ${first.subraceRow.subrace} (roll ${first.subraceRoll})`);
    log.push(`Cross component 2: ${second.race} (roll ${second.raceRoll}) → ${second.subraceRow.subrace} (roll ${second.subraceRoll})`);
    const a = first.subraceRow, b = second.subraceRow;
    const avg = (x,y) => Math.round(((x+y)/2) * 100) / 100;
    // Attribute mods round .5 averages UP rather than leaving a fractional attribute on the sheet.
    const avgAttr = (x,y) => Math.ceil((x+y)/2);
    const crossLabel = `${first.race}/${second.race} Cross (${first.race} (${a.subrace}) × ${second.race} (${b.subrace}))`;
    subraceRow = {
      subrace: 'See notes',
      stMod: avgAttr(a.stMod,b.stMod), inMod: avgAttr(a.inMod,b.inMod), wiMod: avgAttr(a.wiMod,b.wiMod),
      cdMod: avgAttr(a.cdMod,b.cdMod), heMod: avgAttr(a.heMod,b.heMod), chMod: avgAttr(a.chMod,b.chMod), apMod: avgAttr(a.apMod,b.apMod),
      heightMod: avg(a.heightMod,b.heightMod), weightMod: avg(a.weightMod,b.weightMod),
      socMod: avg(a.socMod,b.socMod), startAgeMod: avg(a.startAgeMod,b.startAgeMod), maxAgeMod: avg(a.maxAgeMod,b.maxAgeMod),
      darksight: avg(a.darksight,b.darksight),
      skillBonusText: [a.skillBonusText, b.skillBonusText].filter(Boolean).join(' | '),
    };
    race = 'Cross';
    log.push(`Averaged stats (ties round up): ST${subraceRow.stMod>=0?'+':''}${subraceRow.stMod}, IN${subraceRow.inMod>=0?'+':''}${subraceRow.inMod}, WI${subraceRow.wiMod>=0?'+':''}${subraceRow.wiMod}, CD${subraceRow.cdMod>=0?'+':''}${subraceRow.cdMod}, HE${subraceRow.heMod>=0?'+':''}${subraceRow.heMod}, CH${subraceRow.chMod>=0?'+':''}${subraceRow.chMod}, AP${subraceRow.apMod>=0?'+':''}${subraceRow.apMod}`);
  } else {
    // Subrace (normal path)
    subraceRoll = rollDie(100);
    const subraceTable = SUBRACE_TABLES[race];
    if (!subraceTable) {
      return { error: `No subrace table found for "${race}".`, log };
    }
    subraceRow = lookupOnTable(subraceRoll, subraceTable);
    if (!subraceRow) {
      return { error: `Subrace roll ${subraceRoll} didn't match any entry for "${race}".`, log };
    }
    log.push(`Subrace roll (d100): ${subraceRoll} → ${subraceRow.subrace}`);
    if (subraceRow.subrace === 'TBD') {
      log.push(`Note: this subrace's name is listed as "TBD" in the source wiki itself — not a naming bug here, just not yet named in your world.`);
    }
  }

  // Apply attribute mods
  const finalAttrs = {
    ST: attrs.ST + subraceRow.stMod, IN: attrs.IN + subraceRow.inMod, WI: attrs.WI + subraceRow.wiMod,
    CD: attrs.CD + subraceRow.cdMod, HE: attrs.HE + subraceRow.heMod, CH: attrs.CH + subraceRow.chMod,
    AP: attrs.AP + subraceRow.apMod,
  };
  log.push(`Racial mods applied: ST${subraceRow.stMod>=0?'+':''}${subraceRow.stMod}, IN${subraceRow.inMod>=0?'+':''}${subraceRow.inMod}, WI${subraceRow.wiMod>=0?'+':''}${subraceRow.wiMod}, CD${subraceRow.cdMod>=0?'+':''}${subraceRow.cdMod}, HE${subraceRow.heMod>=0?'+':''}${subraceRow.heMod}, CH${subraceRow.chMod>=0?'+':''}${subraceRow.chMod}, AP${subraceRow.apMod>=0?'+':''}${subraceRow.apMod}`);

  // Step 3: Height, Weight, Age, Max Age
  let height = (rollDice(3,6) + 59) * subraceRow.heightMod;
  if (isFemale) height *= 0.9;
  const weight = (((height*2.2) + rollDice(2,12)) * subraceRow.weightMod) + (6 + ((finalAttrs.ST+finalAttrs.HE)*0.3));
  const startAge = Math.round((10 + rollDice(3,8)) * subraceRow.startAgeMod);
  const maxAge = Math.round((45 + rollDice(4,10)) * subraceRow.maxAgeMod);
  height = Math.round(height);
  const weightRounded = Math.round(weight);
  log.push(`Height: ${height} in, Weight: ${weightRounded} lb, Start Age: ${startAge}, Max Age: ${maxAge}`);

  // Step 4: Social Background
  const socRoll1 = rollDie(100) + subraceRow.socMod;
  const familyRow = lookupOnTable(socRoll1, SOCIAL_CHARTS.familySocialClass);
  const socRoll2 = rollDie(100);
  const parentRow = lookupOnTable(socRoll2, SOCIAL_CHARTS.parentTier);
  log.push(`Social roll 1 (d100${subraceRow.socMod>=0?'+':''}${subraceRow.socMod} soc mod) = ${socRoll1} → Family Class: ${familyRow ? familyRow.class : '?'} (Base ${familyRow ? familyRow.base : '?'})`);
  log.push(`Social roll 2 (d100) = ${socRoll2} → Parent Tier: ${parentRow ? parentRow.tier : '?'} (rolls ${parentRow ? parentRow.dice : '?'})`);

  let socialNumber = null, socialDesc = null, startingWealth = null;
  if (familyRow && parentRow) {
    const diceResult = rollDiceExpr(parentRow.dice);
    socialNumber = familyRow.base + diceResult;
    const descRow = lookupOnTable(socialNumber, SOCIAL_CHARTS.socialNumberDesc);
    socialDesc = descRow ? descRow.desc : null;
    log.push(`Dice roll (${parentRow.dice}) = ${diceResult}, + Base ${familyRow.base} = Social Number ${socialNumber}`);
    if (descRow) log.push(`Social Background: ${descRow.desc} (Acquisition bonus: ${descRow.bonus})`);
    startingWealth = (rollDice(4,6) * 10) + socialNumber;
    log.push(`Starting Wealth: (4d6×10) + Social Number ${socialNumber} = ${startingWealth} Horn`);
  }

  // Starting skills: Guild Lore, Westic, racial language (if one exists)
  const startingSkills = [];
  startingSkills.push({ skillName: 'Guild Lore', xp: 200 });
  startingSkills.push({ skillName: 'Westic (northern common)', xp: 100 + (finalAttrs.IN * 10) });
  const langEntry = RACE_LANGUAGE_MAP[race];
  if (langEntry) {
    const lang = langEntry[subraceRow.subrace] || langEntry.default;
    if (lang) startingSkills.push({ skillName: lang, xp: 100 + (finalAttrs.IN * 10) });
  }
  log.push(`Starting skills: Guild Lore +200, Westic (northern common) +${100 + finalAttrs.IN*10}` + (langEntry && (langEntry[subraceRow.subrace]||langEntry.default) ? `, ${langEntry[subraceRow.subrace]||langEntry.default} +${100 + finalAttrs.IN*10}` : ' (no distinct racial language for this subrace)'));

  // Social Acquisitions Chart rolls
  const acquisitionSkills = [];
  const acquisitionLogItems = [];
  const bonusStr = (familyRow && parentRow) ? (lookupOnTable(socialNumber, SOCIAL_CHARTS.socialNumberDesc)||{}).bonus : null;
  if (bonusStr) {
    const tiers = [];
    const tierRegex = /([+-]?\d+)%\s*x\s*(\d+)\s*rolls?/gi;
    let m;
    while ((m = tierRegex.exec(bonusStr)) !== null) {
      tiers.push({ percent: parseInt(m[1]), count: parseInt(m[2]) });
    }
    const seenItems = new Set();
    for (const tier of tiers) {
      for (let i = 0; i < tier.count; i++) {
        let rawRoll, modRoll, entry;
        let attempts = 0;
        do {
          rawRoll = rollDie(100);
          modRoll = Math.round(rawRoll * (1 + tier.percent/100));
          entry = ACQUISITIONS_CHART.find(e => modRoll >= e.min && modRoll <= e.max);
          attempts++;
        } while (entry && entry.type === 'item' && seenItems.has(entry.raw) && attempts < 20);

        if (!entry) {
          acquisitionLogItems.push(`Acquisition roll ${rawRoll} (${tier.percent>=0?'+':''}${tier.percent}% → ${modRoll}): no matching chart entry`);
          continue;
        }
        if (entry.type === 'item') seenItems.add(entry.raw);
        if (entry.type === 'skill' && entry.skillName) {
          acquisitionSkills.push({ skillName: entry.skillName, xp: entry.xp, note: entry.orChoice });
          acquisitionLogItems.push(`Acquisition roll ${rawRoll} (${tier.percent>=0?'+':''}${tier.percent}% → ${modRoll}): ${entry.raw}${entry.orChoice ? ' — '+entry.orChoice : ''}`);
        } else {
          acquisitionLogItems.push(`Acquisition roll ${rawRoll} (${tier.percent>=0?'+':''}${tier.percent}% → ${modRoll}): ${entry.raw}`);
        }
      }
    }
  }
  log.push(...acquisitionLogItems.length ? ['Social Acquisitions:', ...acquisitionLogItems] : []);

  return {
    attrs: finalAttrs, race, subrace: subraceRow.subrace, height, weight: weightRounded,
    age: startAge, maxAge, darksight: subraceRow.darksight, socialNumber, socialDesc, startingWealth,
    acquisitionBonus: bonusStr, startingSkills, acquisitionSkills, acquisitionLogItems,
    crossLabel: typeof crossLabel !== 'undefined' ? crossLabel : null,
    log
  };
}

function createChar() {
  let name = document.getElementById('nc-name').value.trim();
  const rollChecked = document.getElementById('nc-roll') && document.getElementById('nc-roll').checked;
  if (!name && !rollChecked) return;
  const id = 'char_' + Date.now();
  const char = { id, name: name || 'Unnamed', attrs: {ST:12,IN:12,WI:12,CD:12,HE:12,CH:12,AP:12}, skills: [], guild: '', guild2: '', guild3: '', welcomeShown: false };

  const initialExpChecked = document.getElementById('nc-initial-exp') && document.getElementById('nc-initial-exp').checked;
  if (initialExpChecked) {
    const amount = parseFloat(document.getElementById('nc-initial-exp-amount').value) || 0;
    if (amount > 0) char.unspentInitialExp = amount;
  }

  if (rollChecked) {
    const region = document.getElementById('nc-region').value;
    const gender = document.getElementById('nc-gender-roll').value;
    const rolled = rollNewCharacterData(region, gender === 'Female');
    if (rolled.error) {
      alert(rolled.error + '\n\nCreating with default attributes instead — adjust race/subrace manually.');
    } else {
      char.attrs = rolled.attrs;
      char.race = rolled.race;
      char.subrace = rolled.subrace;
      char.height = rolled.height + ' in';
      char.bodyWeight = rolled.weight + ' lb';
      char.age = rolled.age;
      char.maxAge = rolled.maxAge;
      char.darksight = rolled.darksight;
      char.gender = gender;
      char.socialNumber = rolled.socialNumber;
      char.startingWealth = rolled.startingWealth;
      char.historyNotes = (char.historyNotes||'') + `\n[Rolled character generation log]\n` + rolled.log.join('\n');
      char.skills = char.skills || [];
      const allGrants = [...(rolled.startingSkills||[]), ...(rolled.acquisitionSkills||[])];
      for (const grant of allGrants) {
        const def = findSkillDef(grant.skillName);
        if (!def) continue; // unresolved skill names are already logged in history, not silently created
        const existing = char.skills.find(s => s.skillName === grant.skillName);
        if (existing) {
          existing.rawXP = (parseFloat(existing.rawXP) || 0) + grant.xp;
          continue;
        }
        const skillId = 'sk_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        char.skills.push({
          id: skillId, skillName: grant.skillName,
          guildName: char.guild || '',
          dropdownOnly: false,
          parentSkillId: '',
          rawXP: grant.xp,
          racialExpmod: lookupRacialBonus(char, grant.skillName),
          rolls: Array(20).fill(''),
          bonusItem: 0, bonusRace: 0, bonusMagic: 0, bonusOther: 0,
          binding: '', notes: grant.note || ''
        });
        autoPopulateDropdownChildren(char, char.skills[char.skills.length - 1]);
      }
      if (!name) char.name = rolled.crossLabel ? `Unnamed ${rolled.crossLabel}` : `Unnamed ${rolled.race} (${rolled.subrace})`;
    }
  }

  state.characters[id] = char;
  state.activeChar = id;
  state.activeSkillId = null;
  state.activeView = 'general';
  saveState();
  closeModal();
  renderApp();
}

let addSkillModalMode = 'other';

function openAddSkillModal() {
  const char = state.characters[state.activeChar];
  const guildTabs = [
    char && char.guild ? { key: 'primary', label: `Primary Guild (${char.guild})` } : null,
    char && char.guild2 ? { key: 'secondary', label: `Secondary Guild (${char.guild2})` } : null,
    char && char.guild3 ? { key: 'tertiary', label: `Tertiary Guild (${char.guild3})` } : null,
  ].filter(Boolean);

  addSkillModalMode = guildTabs.length ? guildTabs[0].key : 'other';

  openModal(`
    <h3>Add Skill</h3>
    <div class="form-group" style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap">
      ${guildTabs.map(g => `<button class="btn btn-dim" id="skill-mode-${g.key}" onclick="setAddSkillMode('${g.key}')">${g.label}</button>`).join('')}
      <button class="btn btn-dim" id="skill-mode-other" onclick="setAddSkillMode('other')">Other (All Skills)</button>
    </div>
    <div class="form-group" style="margin-bottom:8px"><label>Filter</label>
      <input class="w-full" id="skill-filter"  placeholder="Type to search..." oninput="filterSkillList(this.value)">
    </div>
    <div id="skill-list" style="max-height:300px;overflow-y:auto;border:1px solid var(--border)"></div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button></div>`);

  renderAddSkillList();
}

function setAddSkillMode(mode) {
  addSkillModalMode = mode;
  const filterInput = document.getElementById('skill-filter');
  if (filterInput) filterInput.value = '';
  renderAddSkillList();
}

function renderAddSkillList() {
  const char = state.characters[state.activeChar];
  const typeOrder = SKILL_TYPE_ORDER;
  const isGuildMode = addSkillModalMode === 'primary' || addSkillModalMode === 'secondary' || addSkillModalMode === 'tertiary';
  const listEl = document.getElementById('skill-list');

  if (isGuildMode) {
    // Guild tables cover most of the skill list at varying bonus levels rather than
    // a clean specialty/baseline split, so instead of hiding skills we surface the
    // guild's best bonuses first — that's what actually cuts down the scrolling.
    const guildName = addSkillModalMode === 'primary' ? char.guild : addSkillModalMode === 'secondary' ? char.guild2 : char.guild3;
    const ranked = SKILLS
      .map(s => ({ s, bonus: getGuildBase(guildName, s.name) }))
      .filter(x => x.bonus > 0)
      .sort((a, b) => b.bonus - a.bonus);

    listEl.innerHTML = ranked.length ? ranked.map(({s, bonus}) => `
      <div class="sidebar-item skill-opt" onclick="addSkill('${s.name.replace(/'/g,"\\'")}')" data-name="${s.name.toLowerCase()}" style="padding:5px 12px;border-bottom:1px solid rgba(179,154,102,.3);display:flex;justify-content:space-between;gap:8px">
        <span>${s.name}</span>
        <span style="display:flex;gap:8px;align-items:center;white-space:nowrap">
          <span style="font-size:10px;color:var(--gold-dim)">${bonus.toFixed(3)}</span>
          <span class="lv" style="font-size:10px">${s.parent ? '↳ '+s.parent : 'Base'}</span>
        </span>
      </div>`).join('') : '<div class="note" style="padding:10px">No skills found for this guild.</div>';
  } else {
    const byType = {};
    for (const s of SKILLS) {
      if (!byType[s.type]) byType[s.type] = [];
      byType[s.type].push(s);
    }
    const sortedTypes = typeOrder.filter(t => byType[t]).concat(Object.keys(byType).filter(t => !typeOrder.includes(t)));

    listEl.innerHTML = sortedTypes.length ? sortedTypes.map(type => `
      <div style="padding:3px 8px;background:var(--header-bg);color:var(--header-text);font-size:10px;text-transform:uppercase">${type}</div>
      ${(byType[type]||[]).map(s => `
      <div class="sidebar-item skill-opt" onclick="addSkill('${s.name.replace(/'/g,"\\'")}')" data-name="${s.name.toLowerCase()}" style="padding:5px 12px;border-bottom:1px solid rgba(179,154,102,.3)">
        <span>${s.name}</span>
        <span class="lv" style="font-size:10px">${s.parent ? '↳ '+s.parent : 'Base'}</span>
      </div>`).join('')}
    `).join('') : '<div class="note" style="padding:10px">No skills found.</div>';
  }

  ['primary','secondary','tertiary','other'].forEach(m => {
    const btn = document.getElementById('skill-mode-'+m);
    if (btn) btn.classList.toggle('btn-gold', m === addSkillModalMode);
  });
}

function filterSkillList(val) {
  const v = val.toLowerCase();
  document.querySelectorAll('.skill-opt').forEach(el => {
    el.style.display = el.dataset.name.includes(v) ? '' : 'none';
  });
}

function lookupRacialBonus(character, skillName) {
  const raceTable = RACIAL_BONUSES[character.race];
  if (!raceTable) return 0;
  const subraceList = raceTable[character.subrace];
  if (!subraceList) return 0;
  const entry = subraceList.find(e => e.skill === skillName);
  return entry ? entry.bonus : 0;
}

function autoPopulateDropdownChildren(character, parentInst) {
  const parentDef = findSkillDef(parentInst.skillName);
  if (!parentDef) return 0;
  const existingKeys = new Set((character.skills||[]).map(s => s.skillName + '|' + (s.binding||'')));
  let added = 0;

  function addChild(childDef, binding) {
    const key = childDef.name + '|' + (binding||'');
    if (existingKeys.has(key)) return;
    // Self-heal: an existing instance of this skill with no binding, whose Parent Skill
    // reference points at the weapon being trained now, is almost certainly the same
    // skill that was never properly bound — fix it instead of creating a duplicate.
    if (binding) {
      const orphan = (character.skills||[]).find(s =>
        s.skillName === childDef.name && !s.binding && s.parentSkillId === parentInst.id
      );
      if (orphan) {
        orphan.binding = binding;
        existingKeys.add(key);
        return;
      }
    }
    const id = 'sk_' + Date.now() + '_' + Math.random().toString(36).slice(2,6) + '_' + added;
    character.skills.push({
      id, skillName: childDef.name,
      guildName: parentInst.guildName || character.guild || '',
      dropdownOnly: true,
      parentSkillId: parentInst.id,
      rawXP: 0,
      racialExpmod: lookupRacialBonus(character, childDef.name),
      rolls: Array(20).fill(''),
      bonusItem: 0, bonusRace: 0, bonusMagic: 0, bonusOther: 0,
      binding: binding || '', notes: ''
    });
    existingKeys.add(key);
    added++;
  }

  // Direct dropdown children matched by literal parent field (e.g. Sculpt under Basic Artist)
  const directChildren = SKILLS.filter(s =>
    s.parent && s.parent.trim().toLowerCase() === parentDef.name.trim().toLowerCase() &&
    !s.templated && s.dropdown !== null && s.dropdown !== undefined
  );
  for (const c of directChildren) addChild(c, '');

  // Special case: every Basic weapon skill shares the same 5 templated combat dropdowns,
  // bound to that specific weapon class. Single weap spec is excluded — it binds to one
  // specific weapon item, not a class, so it can't be auto-decided here.
  // The weapon class can come from the skill itself being the base weapon skill (e.g.
  // populating from "Basic Spears"), or from a sibling templated skill already bound to
  // that class (e.g. populating the rest from "Damage Bonus" bound to "Basic Spears") —
  // covers old characters where the base weapon skill entry was never added directly.
  const weaponClass = WEAPON_CLASSES.includes(parentDef.name) ? parentDef.name
    : (WEAPON_CLASSES.includes(parentInst.binding) ? parentInst.binding : null);
  if (weaponClass) {
    const sharedTemplated = ['Attack versus', 'Damage Bonus', 'Initiative bonus', 'Multiple attack', 'Parry'];
    for (const name of sharedTemplated) {
      const def = findSkillDef(name);
      if (def) addChild(def, weaponClass);
    }
  }

  return added;
}

function manualPopulateChildren(skillId) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const si = (char.skills || []).find(s => s.id === skillId);
  if (!si) return;
  const added = autoPopulateDropdownChildren(char, si);
  saveState();
  renderSkillModule(skillId);
  renderSidebar();
  alert(added > 0 ? `Added ${added} dropdown skill(s).` : 'Nothing to add — all dropdown children already present.');
}

function addSkill(skillName) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.skills) char.skills = [];
  const def = findSkillDef(skillName);
  const id = 'sk_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const guildForSkill = (addSkillModalMode === 'secondary' && char.guild2) ? char.guild2
    : (addSkillModalMode === 'tertiary' && char.guild3) ? char.guild3
    : char.guild || '';
  char.skills.push({
    id, skillName,
    guildName: guildForSkill,
    dropdownOnly: false,
    parentSkillId: '',
    rawXP: 0,
    racialExpmod: lookupRacialBonus(char, skillName),
    rolls: Array(20).fill(''),
    bonusItem: 0, bonusRace: 0, bonusMagic: 0, bonusOther: 0,
    binding: '', notes: ''
  });
  state.activeSkillId = id;
  state.activeView = 'skill';
  saveState();
  closeModal();
  renderApp();
}
