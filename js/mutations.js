// ============================================================
// MUTATIONS
// ============================================================
function selectChar(id) {
  state.activeChar = id || null;
  state.activeSkillId = null;
  state.activeView = 'overview';
  renderApp();
}

// Overview layout, saved with the character: collapse a section, or move it
// one place among the sections currently shown.
function toggleOverviewSection(key) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const layout = char.overviewLayout || (char.overviewLayout = {});
  const collapsed = layout.collapsed || (layout.collapsed = {});
  if (collapsed[key]) delete collapsed[key]; else collapsed[key] = true;
  saveState();
  renderOverview();
}
function moveOverviewSection(key, dir) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const keys = [...document.querySelectorAll('#main [data-section]')].map(el => el.dataset.section);
  const i = keys.indexOf(key), j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return;
  [keys[i], keys[j]] = [keys[j], keys[i]];
  const layout = char.overviewLayout || (char.overviewLayout = {});
  // Keep the places of sections not shown right now (e.g. a skill type the
  // character no longer has) after the ones that are.
  layout.order = keys.concat((layout.order || []).filter(k => !keys.includes(k)));
  saveState();
  renderOverview();
}

function updateCCBonus(ccName, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.ccBonuses) char.ccBonuses = {};
  char.ccBonuses[ccName] = parseFloat(value) || 0;
  saveState();
  renderGeneralModule();
}

function setAllCCBonus() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const val = prompt('Set this bonus on all 5 Circumstance Checks (e.g. a Luckstone):');
  if (val === null || val.trim() === '') return;
  const num = parseFloat(val) || 0;
  char.ccBonuses = { reflex: num, fortitude: num, will: num, surprise: num, social: num };
  saveState();
  renderGeneralModule();
}

function updateChar(field, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  char[field] = value;
  if (field === 'guild' && value) {
    // Starting skills are granted before the player has picked a guild (see
    // createChar), so they're tagged with guildName: ''. Once the primary
    // Guild/School is picked, backfill those still-unassigned skills to it
    // rather than leaving them permanently un-guilded. Skills already tagged
    // to a specific guild (e.g. via a secondary/tertiary guild) are left
    // alone.
    for (const si of (char.skills || [])) {
      if (!si.guildName) si.guildName = value;
    }
  }
  saveState();
  renderCharSelect();
}

// The Add/Edit Item popup edits itemDraft; the inventory only changes when
// it is confirmed (see openAddItemModal / openEditItemModal in modals.js).
// editingItemIdx is the item being edited, or null when adding a new one.
let itemDraft = null;
let editingItemIdx = null;
// Which dropdowns have been chosen, by step key (see itemPickSteps): a catalog
// name, or ITEM_PICK_CUSTOM. A missing key means it still reads "— select —".
let itemPicks = {};
// "Add next item": after Add, keep the popup open with a fresh item.
let addNextItem = false;
const ITEM_PICK_CUSTOM = '__custom__';

// The popup's dropdowns for a draft, in order: Type, then the type's class
// and/or catalog pickers. key is the draft field a class step sets; apply
// fills the draft from a catalog pick; custom adds "— custom —" at the bottom.
function itemPickSteps(d) {
  const steps = [{ key: 'type', label: 'Type', options: ITEM_TYPES, labelOf: itemTypeLabel }];
  if (d.type === 'Weapon') {
    steps.push({ key: 'weaponClass', label: 'Weapon Class', options: WEAPON_CLASSES, custom: true });
    if (d.weaponClass) {
      const cat = Object.entries(WEAPON_CATEGORY_TO_SKILL).find(([c, sk]) => sk === d.weaponClass);
      const models = cat ? weaponModelsForClass(d.weaponClass, cat[0]) : [];
      steps.push({ key: 'weaponModel', label: 'Model', options: models.map(m => m.name), custom: true, apply: applyWeaponModel });
    }
  } else if (d.type === 'Armor') {
    steps.push({ key: 'armorType', label: 'Armor Type', options: ARMOR.map(a => a.name), custom: true, apply: applyArmorType });
  } else if (d.type === 'Shield') {
    steps.push({ key: 'shieldType', label: 'Shield Type', options: SHIELDS.map(s => s.name), custom: true, apply: applyShieldType });
  } else if (d.type === 'Coin') {
    steps.push({ key: 'coin', label: 'Coin', options: COINAGE.map(c => `${c.name} (${c.metal})`), apply: applyCoinType });
  } else if (d.type === 'Ammunition') {
    steps.push({ key: 'ammoBase', label: 'Ammunition', options: AMMUNITION.map(a => a.name), custom: true, apply: applyAmmoType });
  } else if (d.type === 'Item') {
    steps.push({ key: 'itemClass', label: 'Item Class', options: [...new Set(BASIC_ITEMS.map(b => b.class))].sort(), custom: true });
    if (d.itemClass) {
      steps.push({ key: 'basicItemName', label: 'Item', options: BASIC_ITEMS.filter(b => b.class === d.itemClass).map(b => b.name), custom: true, apply: applyBasicItem });
    }
  } else if (d.type === 'Magic Item') {
    steps.push({ key: 'magicItemClass', label: 'Magic Item Class', options: MAGIC_ITEM_CLASSES, custom: true });
  }
  return steps;
}

// For editing: read back which dropdowns an existing item has chosen. A
// catalog pick or class that isn't in the list (custom, left blank, or renamed since) reads as
// "— custom —", so an item typed by hand can still be edited.
function itemPicksFromItem(item) {
  const picks = {};
  const d = { type: item.type };
  for (let i = 0; ; i++) {
    const steps = itemPickSteps(d);
    if (i >= steps.length) break;
    const s = steps[i];
    let v = s.key === 'coin' ? (COINAGE.find(c => c.name === item.name) ? s.options[COINAGE.findIndex(c => c.name === item.name)] : undefined) : item[s.key];
    if (!s.options.includes(v)) v = s.custom ? ITEM_PICK_CUSTOM : undefined;
    if (v === undefined) break;
    picks[s.key] = v;
    if (!s.apply && s.key !== 'type') { if (v !== ITEM_PICK_CUSTOM) d[s.key] = v; }
    if (s.key === 'type') d.type = v;
  }
  return picks;
}

// Every dropdown has a real choice, so the rest of the item can be filled in.
function itemPicksComplete(d) {
  return itemPickSteps(d).every(s => itemPicks[s.key] !== undefined);
}

// Changing any dropdown starts the item over: it keeps the choices above that
// dropdown, clears everything below it and every field, then refills the
// fields from the catalog pick.
function setItemPick(key, value) {
  if (!itemDraft) return;
  const keys = itemPickSteps(itemDraft).map(s => s.key);
  const idx = keys.indexOf(key);
  const picks = {};
  for (const k of keys.slice(0, idx)) if (itemPicks[k] !== undefined) picks[k] = itemPicks[k];
  if (value !== '') picks[key] = value;
  itemPicks = picks;
  const d = { type: picks.type || '', name: '', qty: 1, weight: 0, worth: '', notes: '', location: '', masterwork: false };
  for (let i = 1; ; i++) {
    const steps = itemPickSteps(d);
    if (i >= steps.length) break;
    const s = steps[i], v = picks[s.key];
    if (v === undefined) break;
    if (s.apply) {
      if (v !== ITEM_PICK_CUSTOM) {
        s.apply(d, v);
        if (!String(d.name || '').trim()) d.name = v;
      }
    } else if (v !== ITEM_PICK_CUSTOM) d[s.key] = v;
  }
  itemDraft = d;
  renderAddItemModal();
}

function setAddItemField(field, value) {
  if (!itemDraft) return;
  itemDraft[field] = value;
}

function confirmAddItem() {
  const char = state.characters[state.activeChar];
  const d = itemDraft;
  if (!char || !d || !itemPicksComplete(d)) return;
  d.name = String(d.name || '').trim();
  if (!d.name) {
    const err = document.getElementById('ai-error');
    err.textContent = 'Give the item a name.';
    err.style.display = 'block';
    return;
  }
  delete d.coin;
  if (!char.items) char.items = [];
  const editing = editingItemIdx !== null && char.items[editingItemIdx];
  if (editing) char.items[editingItemIdx] = d;
  else char.items.push(d);
  itemDraft = null;
  editingItemIdx = null;
  saveState();
  renderInventoryModule();
  if (!editing && addNextItem) { openAddItemModal({ keepAddNext: true, justAdded: d.name }); return; }
  closeModal();
}

// Storage Locations: containers are the keys of char.storageCapacities (a
// capacity, or null for no limit) plus any location an item already names;
// char.storageOnPerson marks the ones worn/carried, whose weight counts
// toward Weight Carried. The Add/Edit Container popup edits containerDraft;
// editingContainerName is the container being edited, or null when adding.
let containerDraft = null;
let editingContainerName = null;

function confirmContainer() {
  const char = state.characters[state.activeChar];
  const d = containerDraft;
  if (!char || !d) return;
  const err = msg => { const el = document.getElementById('ct-error'); el.textContent = msg; el.style.display = 'block'; };
  const name = String(d.name || '').trim();
  const reserved = ['on person', 'carried', ON_PERSON_LOCATION.toLowerCase()];
  if (!name) return err('Give the container a name.');
  if (reserved.includes(name.toLowerCase())) return err('"' + name + '" is reserved for items carried on your person.');
  if (name !== editingContainerName && itemLocations(char).some(l => l.toLowerCase() === name.toLowerCase())) return err('There is already a container called "' + name + '".');
  const capText = String(d.capacity === undefined || d.capacity === null ? '' : d.capacity).trim();
  const capacity = capText === '' ? null : parseFloat(capText);
  if (capacity !== null && !(capacity >= 0)) return err('Capacity must be a number (or blank for no limit).');

  if (!char.storageCapacities) char.storageCapacities = {};
  if (!char.storageOnPerson) char.storageOnPerson = {};
  const old = editingContainerName;
  if (old !== null && old !== name) {
    // Renaming: the items inside follow the container
    delete char.storageCapacities[old];
    if (char.storageOrder) char.storageOrder = char.storageOrder.map(n => n === old ? name : n);
    delete char.storageOnPerson[old];
    for (const it of char.items || []) if ((it.location || '').trim() === old) it.location = name;
  }
  char.storageCapacities[name] = capacity;
  if (d.onPerson) char.storageOnPerson[name] = true; else delete char.storageOnPerson[name];
  containerDraft = null;
  editingContainerName = null;
  saveState();
  closeModal();
  renderInventoryModule();
}

// Deleting a container moves whatever is in it to moveTo ('' = On Person,
// or another container's name).
function confirmDeleteContainer(name, moveTo) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  for (const it of char.items || []) if ((it.location || '').trim() === name) it.location = moveTo || '';
  if (char.storageCapacities) delete char.storageCapacities[name];
  if (char.storageOnPerson) delete char.storageOnPerson[name];
  if (char.storageOrder) char.storageOrder = char.storageOrder.filter(n => n !== name);
  collapsedItemGroups.delete(name);
  saveState();
  closeModal();
  renderInventoryModule();
}

// ▲/▼: move a container one place in char.storageOrder (saved with the character).
function moveContainer(name, dir) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const list = itemLocations(char);
  const i = list.indexOf(name), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  char.storageOrder = list;
  saveState();
  renderInventoryModule();
}

// Show/hide a location's items in the Items list (not saved).
let collapsedItemGroups = new Set();
function toggleItemGroup(name) {
  if (collapsedItemGroups.has(name)) collapsedItemGroups.delete(name); else collapsedItemGroups.add(name);
  renderInventoryModule();
}

function updateItem(idx, field, value) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  char.items[idx][field] = value;
  saveState();
  if (state.activeView === 'inventory' && (field === 'weight' || field === 'qty' || field === 'worth' || field === 'av' || field === 'pr')) renderInventoryModule();
}

// Catalog picks: each apply* fills an item's stats from the catalog entry.
// Used by the inventory table's dropdowns (select*) and the Add Item popup.
function applyArmorType(item, armorName) {
  item.armorType = armorName;
  const def = ARMOR.find(a => a.name === armorName);
  if (def) {
    item.av = def.av;
    item.pr = def.pr;
    item.weight = def.weight;
    if (!item.worth) item.worth = def.cost;
  }
}
function applyWeaponModel(item, weaponName) {
  item.weaponModel = weaponName;
  const def = WEAPONS.find(w => w.name === weaponName);
  if (def) {
    item.weight = def.weight;
    if (!item.worth) item.worth = def.cost;
    item.stn1h = def.stn_1h; item.stn2h = def.stn_2h; item.stmod = def.stmod;
    item.cdn1h = def.cdn_1h; item.cdn2h = def.cdn_2h; item.cdmod = def.cdmod;
    item.damageDice = def.damage_dice; item.dividingDie = def.dividing_die;
    item.speedMissile = def.speed_missile; item.speedMelee = def.speed_melee; item.speedReadied = def.speed_readied;
    item.weaponProtection = def.protection; item.threatRange = def.threat_range; item.range = def.range;
    if (def.notes && !String(item.notes || '').trim()) item.notes = def.notes;
  }
}
function applyCoinType(item, coinName) {
  const def = COINAGE.find(c => `${c.name} (${c.metal})` === coinName);
  if (def) {
    item.name = def.name;
    item.weight = def.weight;
    item.worth = def.worthInHorn;
  }
}
function applyAmmoType(item, ammoName) {
  if (!ammoName) { delete item.ammoBase; return; } // "— custom —"
  const def = AMMUNITION.find(a => a.name === ammoName);
  if (def) {
    item.ammoBase = def.name;
    item.name = def.name;
    item.damageDice = def.damage_dice;
    item.dividingDie = def.dividing_die;
    item.weight = def.weight;
    if (!item.worth) item.worth = def.cost;
  }
}
function applyShieldType(item, shieldName) {
  item.shieldType = shieldName;
  const def = SHIELDS.find(s => s.name === shieldName);
  if (def) {
    item.av = def.av;
    item.pr = def.pr;
    item.weight = def.weight;
    if (!item.worth) item.worth = def.cost;
  }
}
function applyBasicItem(item, itemName) {
  const def = BASIC_ITEMS.find(b => b.class === item.itemClass && b.name === itemName);
  item.basicItemName = itemName;
  if (def) {
    item.name = def.name;
    item.weight = def.weight;
    item.worth = def.worth;
    item.notes = def.notes;
  }
}

function selectArmorType(idx, armorName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  applyArmorType(char.items[idx], armorName);
  saveState();
  renderInventoryModule();
}

function updateCombatExtra(field, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.combatExtras) char.combatExtras = {};
  char.combatExtras[field] = value;
  saveState();
  renderCombatModule();
}

function updateOtherBonus(idx, field, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.combatExtras) char.combatExtras = {};
  if (!char.combatExtras.otherBonuses) char.combatExtras.otherBonuses = [{},{},{}];
  while (char.combatExtras.otherBonuses.length < 3) char.combatExtras.otherBonuses.push({});
  char.combatExtras.otherBonuses[idx][field] = value;
  saveState();
  renderCombatModule();
}

function updateSpellState(poolName, field, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (char.playGroupId) {
    const grp = myGroups.find(g => g.id === char.playGroupId);
    if (grp) settleCharacterRecovery(char, grp.clock_seconds, {});
  }
  if (!char.spellState) char.spellState = {};
  if (!char.spellState[poolName]) char.spellState[poolName] = {};
  char.spellState[poolName][field] = parseFloat(value) || 0;
  saveState();
  renderSpellModule();
  if (openSpellPool && document.getElementById('modal-overlay').classList.contains('open')) renderSpellPoolModal();
}

function updateSpellEnhancer(poolName, field, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.spellEnhancers) char.spellEnhancers = {};
  if (!char.spellEnhancers[poolName]) char.spellEnhancers[poolName] = {};
  char.spellEnhancers[poolName][field] = parseFloat(value) || 0;
  saveState();
  renderSpellModule();
  if (openSpellPool && document.getElementById('modal-overlay').classList.contains('open')) renderSpellPoolModal();
}

let hardcastState = null;

function openHardcastModal(spellbookIdx) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const sp = (char.spellbook||[])[spellbookIdx];
  if (!sp) return;
  const catalogEntry = SPELLS.find(s => s.name === sp.name && s.school === sp.school);
  if (!catalogEntry || !catalogEntry.costs) return;
  const majorPool = SPELL_SCHOOL_TO_POOL[sp.school];
  hardcastState = {
    spellbookIdx, spellName: sp.name, school: sp.school, baseCosts: {...catalogEntry.costs},
    majorPool, spellSuccessBase: parseFloat(catalogEntry.spellSuccess) || 0,
    duration: catalogEntry.duration || '',
    castMode: 'hardcast',
    substitute: {}, // { 'Death SP': true/false } — hardcast only
    overcastSpirit: 0, overcastMajor: 0, // hardcast only
  };
  renderHardcastModal();
}

function setCastMode(mode) {
  hardcastState.castMode = mode;
  renderHardcastModal();
}

function toggleHardcastSubstitute(poolKey) {
  hardcastState.substitute[poolKey] = !hardcastState.substitute[poolKey];
  renderHardcastModal();
}

function updateHardcastOvercast(field, value) {
  hardcastState[field] = Math.max(0, parseInt(value) || 0);
  renderHardcastModal();
}

// Shared cost computation for all three cast modes.
function computeCastCosts(hs, poolByName) {
  const mode = hs.castMode || 'hardcast';
  let finalCosts = {};
  let notes = [];
  let missingPools = [];

  for (const [school, amount] of Object.entries(hs.baseCosts)) {
    const poolName = COST_KEY_TO_POOL[school] || `${school} SP`;
    const poolInfo = poolByName[poolName];
    let componentCost = amount;

    if (mode === 'scroll' || mode === 'plaque') {
      if (!poolInfo) missingPools.push(poolName);
      const mult = mode === 'plaque' ? 0.5 : 0.1;
      const floor = Math.max(1, Math.ceil(amount * 0.1));
      componentCost = Math.max(floor, Math.ceil(amount * mult));
    } else if (mode === 'hardcast') {
      const reduction = poolInfo ? poolInfo.spReduction : 0;
      if (reduction) {
        const floor = Math.max(1, Math.ceil(amount * 0.1));
        componentCost = Math.max(floor, amount - reduction);
      }
    }

    if (mode === 'hardcast' && poolName !== 'Spirit SP' && hs.substitute[poolName]) {
      const ratio = poolInfo ? poolInfo.conversionRatio : 3;
      const spiritNeeded = Math.ceil(componentCost * ratio);
      finalCosts['Spirit SP'] = (finalCosts['Spirit SP']||0) + spiritNeeded;
      notes.push(`${school} ${componentCost} substituted → ${spiritNeeded} Spirit (${ratio}:1)`);
    } else {
      finalCosts[poolName] = (finalCosts[poolName]||0) + componentCost;
    }
  }

  if (mode === 'hardcast') {
    finalCosts['Spirit SP'] = (finalCosts['Spirit SP']||0) + hs.overcastSpirit;
    if (hs.majorPool && hs.majorPool !== 'Spirit SP') {
      finalCosts[hs.majorPool] = (finalCosts[hs.majorPool]||0) + hs.overcastMajor;
    }
  }

  return { finalCosts, notes, missingPools };
}

// Scroll/Plaque-specific ability checks — separate from simple current-SP shortfalls.
function checkCastEligibility(hs, poolByName) {
  const mode = hs.castMode || 'hardcast';
  const issues = [];
  if (mode === 'scroll' || mode === 'plaque') {
    for (const [school, amount] of Object.entries(hs.baseCosts)) {
      const poolName = COST_KEY_TO_POOL[school] || `${school} SP`;
      const poolInfo = poolByName[poolName];
      if (!poolInfo) {
        issues.push(`No training at all in ${poolName} — ${mode === 'scroll' ? 'scrolls' : 'plaques'} require every power source the spell needs (no Spirit substitution).`);
        continue;
      }
      if (mode === 'plaque' && poolInfo.maxSP < amount) {
        issues.push(`${poolName}: max SP (${poolInfo.maxSP}) is below the spell's full cost (${amount}) — plaques only work for spells you could already hardcast.`);
      }
      if (mode === 'scroll' && amount > poolInfo.maxSP * 2) {
        issues.push(`${poolName}: spell's full cost (${amount}) exceeds twice your max SP (${poolInfo.maxSP*2}) — too powerful to scrollcast.`);
      }
    }
  }
  return issues;
}

function renderHardcastModal() {
  const char = state.characters[state.activeChar];
  const hs = hardcastState;
  const mode = hs.castMode || 'hardcast';
  const pools = computeSpellPools(char);
  const poolByName = {};
  for (const p of pools) poolByName[p.name] = p;

  const { finalCosts, notes, missingPools } = computeCastCosts(hs, poolByName);
  const eligibilityIssues = checkCastEligibility(hs, poolByName);

  const spiritSuccessSkval = getSkillSkval(char, 'Spirit Success');
  const majorSuccessSkillMap = {
    'Animist SP':'Animist Success','Artificer SP':'Artificer Success','House of Air SP':'Air Success',
    'House of Chaos SP':'Chaos SP success','House of Death SP':'Death Success','House of Earth SP':'Earth Success',
    'House of Fire SP':'Fire Success','House of Order SP':'Order SP Success','House of Water SP':'Water Success',
    'Necromantic SP':'Necromantic Success','Restorative SP':'Restorative Success','Shade SP':'Shade Success',
    'House of Life SP':'House of Life Success','Mentalist SP':'Mentalist Success',
  };
  const majorSuccessSkillName = majorSuccessSkillMap[hs.majorPool];
  const majorSuccessSkval = majorSuccessSkillName ? getSkillSkval(char, majorSuccessSkillName) : 0;
  const majorPoolInfo = poolByName[hs.majorPool];
  const successBonus = majorPoolInfo ? majorPoolInfo.successBonus : 0;
  const overcastBonus = mode === 'hardcast' ? (hs.overcastSpirit + hs.overcastMajor) : 0;
  const totalSuccess = Math.round((hs.spellSuccessBase + spiritSuccessSkval + majorSuccessSkval + successBonus + overcastBonus) * 10) / 10;
  hs.totalSuccess = totalSuccess;

  const shortfalls = Object.entries(finalCosts).filter(([poolName, needed]) => {
    const info = poolByName[poolName];
    return !info || info.currentSP < needed;
  });
  const canCast = shortfalls.length === 0 && eligibilityIssues.length === 0;

  const modeBtn = (m, label) => `<button class="btn ${mode===m?'btn-gold':'btn-dim'}" onclick="setCastMode('${m}')">${label}</button>`;

  openModal(`
    <h3>Cast: ${hs.spellName}</h3>
    <div class="note" style="margin-bottom:10px">${hs.school} — base cost ${Object.entries(hs.baseCosts).map(([s,v])=>`${s} ${v}`).join(', ')}${hs.duration ? ` — duration ${escapeHtml(hs.duration)}` : ''}</div>

    <div style="display:flex;gap:8px;margin-bottom:12px">
      ${modeBtn('hardcast','Hardcast')} ${modeBtn('plaque','Plaque')} ${modeBtn('scroll','Scrollcast')}
    </div>
    <div class="note" style="margin-bottom:10px">
      ${mode==='hardcast' ? 'Full SP cost from your own pools. Spirit substitution and overcasting for extra success are both available.' : ''}
      ${mode==='plaque' ? 'Half SP cost, but only for a spell you could already hardcast — no substitution, must have every power source type trained, and no overcasting.' : ''}
      ${mode==='scroll' ? '1/10 SP cost, and can exceed your own ability (up to 2× your max in any pool) — but requires every power source type trained, no substitution, no overcasting.' : ''}
    </div>

    ${mode === 'hardcast' ? `
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Substitute with Spirit?</div>
    ${Object.entries(hs.baseCosts).filter(([s])=>s!=='Spirit').map(([school, amount]) => {
      const poolName = COST_KEY_TO_POOL[school] || `${school} SP`;
      const info = poolByName[poolName];
      const ratio = info ? info.conversionRatio : 3;
      return `<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer">
        <input type="checkbox" ${hs.substitute[poolName]?'checked':''} onchange="toggleHardcastSubstitute('${poolName}')">
        ${school} ${amount} → ${ratio}:1 Spirit substitution (would cost ${Math.ceil(amount*ratio)} Spirit instead)
      </label>`;
    }).join('') || '<div class="note">No non-Spirit components to substitute.</div>'}

    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Add Points to Increase Success (+1% each)</div>
    <div class="form-row">
      <div class="form-group"><label>Extra Spirit</label><input type="number" class="w-sm" value="${hs.overcastSpirit}" onchange="updateHardcastOvercast('overcastSpirit',this.value)"></div>
      ${hs.majorPool && hs.majorPool !== 'Spirit SP' ? `<div class="form-group"><label>Extra ${hs.school}</label><input type="number" class="w-sm" value="${hs.overcastMajor}" onchange="updateHardcastOvercast('overcastMajor',this.value)"></div>` : ''}
    </div>
    ` : ''}

    ${eligibilityIssues.length ? `<hr class="divider"><div class="note" style="color:#c05050">${eligibilityIssues.join('<br>')}</div>` : ''}

    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Final Cost & Success</div>
    <table class="skill-table" style="margin-bottom:8px">
      <thead><tr><th>Pool</th><th>SP Needed</th><th>Current SP</th><th></th></tr></thead>
      <tbody>
        ${Object.entries(finalCosts).map(([poolName, needed]) => {
          const info = poolByName[poolName];
          const short = !info || info.currentSP < needed;
          return `<tr><td>${poolName}</td><td>${needed}</td><td>${info ? info.currentSP : '—'}</td><td style="color:${short?'#c05050':'var(--trained-b)'}">${short ? 'SHORT' : 'OK'}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="computed-item" style="margin-bottom:8px"><span class="ci-label">Success Chance (before the GM's d50)</span><span class="ci-value skval" style="font-size:20px">${totalSuccess}</span></div>
    <div class="note">Base ${hs.spellSuccessBase} + Spirit Success [${spiritSuccessSkval}] + ${hs.school} Success [${majorSuccessSkval}] + Magic Bonus [${successBonus}]${mode==='hardcast' ? ` + Overcast [${overcastBonus}]` : ''}</div>

    <div class="modal-actions">
      <button class="btn btn-dim" onclick="closeModal()">Cancel</button>
      <button class="btn btn-gold" ${canCast ? '' : 'disabled title="Not enough SP, or this spell doesn\'t qualify for this cast mode"'} onclick="confirmHardcast()">Cast</button>
    </div>`);
}

function confirmHardcast() {
  const char = state.characters[state.activeChar];
  if (!char || !hardcastState) return;
  const hs = hardcastState;
  if (char.playGroupId) {
    const grp = myGroups.find(g => g.id === char.playGroupId);
    if (grp) settleCharacterRecovery(char, grp.clock_seconds, {});
  }
  const pools = computeSpellPools(char);
  const poolByName = {};
  for (const p of pools) poolByName[p.name] = p;

  const { finalCosts } = computeCastCosts(hs, poolByName);

  if (!char.spellState) char.spellState = {};
  for (const [poolName, needed] of Object.entries(finalCosts)) {
    const info = poolByName[poolName];
    const currentBefore = info ? info.currentSP : 0;
    if (!char.spellState[poolName]) char.spellState[poolName] = {};
    char.spellState[poolName].current = currentBefore - needed;
  }
  saveState();
  // SP is spent either way -- hardcastState stays alive through resolving
  // success and (if successful) marking a duration, closed out at the end
  // of that chain rather than here.
  openSpellResolveModal();
}

// Two rolls, per the Spell Success Rules: the GM's random roll (normally a
// d50) is added to the caster's success %, setting the target; the caster
// then rolls a d100 and must roll at or under that target. Either roll can be
// typed in (physical dice) or rolled online. Only on success does marking a
// duration make sense (see openMarkDurationModal).
function openSpellResolveModal() {
  const hs = hardcastState;
  if (!hs) return;
  openModal(`
    <h3>Resolve: ${escapeHtml(hs.spellName)}</h3>
    <div class="note" style="margin-bottom:10px">Success chance ${hs.totalSuccess}% plus the GM's d50 roll sets the target. Then the caster rolls d100 and must roll at or under the target to succeed.</div>

    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">1. GM roll (d50)</div>
    <div class="form-row" style="align-items:flex-end;margin-bottom:6px">
      <div class="form-group"><label>d50</label><input type="number" id="spell-gm-roll" class="w-sm" min="1" max="50" oninput="updateSpellResolve()"></div>
      <div class="form-group"><button class="btn btn-dim" onclick="rollSpellDie('spell-gm-roll',50)">Roll d50</button></div>
    </div>
    <div class="computed-item" style="margin-bottom:12px"><span class="ci-label">Target</span><span class="ci-value skval" id="spell-target" style="font-size:20px">—</span></div>

    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">2. Caster roll (d100)</div>
    <div class="form-row" style="align-items:flex-end;margin-bottom:6px">
      <div class="form-group"><label>d100</label><input type="number" id="spell-cast-roll" class="w-sm" min="1" max="100" oninput="updateSpellResolve()"></div>
      <div class="form-group"><button class="btn btn-dim" onclick="rollSpellDie('spell-cast-roll',100)">Roll d100</button></div>
    </div>
    <div id="spell-resolve-result" style="min-height:22px;font-weight:bold;margin-bottom:8px"></div>

    <div class="modal-actions"><button class="btn btn-dim" onclick="skipSpellResolve()">Skip</button><button class="btn btn-gold" onclick="confirmSpellResolve()">Confirm</button></div>`);
}

function rollSpellDie(inputId, sides) {
  const input = document.getElementById(inputId);
  if (input) input.value = rollDie(sides);
  updateSpellResolve();
}

// Reads both rolls and shows the target and, once both are in, the outcome.
// Returns { gm, cast, target, success } with nulls for whatever is missing.
function readSpellResolve() {
  const hs = hardcastState;
  const g = document.getElementById('spell-gm-roll'), c = document.getElementById('spell-cast-roll');
  const gm = g ? parseInt(g.value) : NaN, cast = c ? parseInt(c.value) : NaN;
  const gmOk = gm >= 1 && gm <= 50, castOk = cast >= 1 && cast <= 100;
  const target = hs && gmOk ? Math.round((hs.totalSuccess + gm) * 10) / 10 : null;
  return { gm: gmOk ? gm : null, cast: castOk ? cast : null, target, success: target != null && castOk ? cast <= target : null };
}

function updateSpellResolve() {
  const hs = hardcastState;
  if (!hs) return;
  const r = readSpellResolve();
  const tEl = document.getElementById('spell-target');
  if (tEl) tEl.textContent = r.target != null ? `${hs.totalSuccess} + ${r.gm} = ${r.target}` : '—';
  const out = document.getElementById('spell-resolve-result');
  if (out) {
    if (r.success == null) out.innerHTML = '';
    else out.innerHTML = r.success
      ? `<span style="color:var(--trained-b)">Success — rolled ${r.cast} against ${r.target}</span>`
      : `<span style="color:#c05050">Failed — rolled ${r.cast} against ${r.target}</span>`;
  }
}

function skipSpellResolve() {
  hardcastState = null;
  closeModal();
  renderSpellModule();
}

function confirmSpellResolve() {
  const hs = hardcastState;
  if (!hs) return;
  const r = readSpellResolve();
  if (r.gm == null || r.cast == null) { alert('Enter or roll both the GM d50 and the caster d100.'); return; }
  hs.gmRoll = r.gm; hs.castRoll = r.cast; hs.finalTarget = r.target;
  const char = state.characters[state.activeChar];
  if (r.success && char && char.playGroupId) {
    openMarkDurationModal(r.cast);
  } else {
    hardcastState = null;
    closeModal();
    renderSpellModule();
  }
}

// Only reachable on a successful cast for a character linked to a group --
// no group means nowhere to show the flag, so there's nothing to mark
// against. The player reads the spell's own duration text (shown here for
// reference) and enters the result themselves rather than the app trying
// to parse it (durations are free text and wildly inconsistent).
function openMarkDurationModal(roll) {
  const hs = hardcastState;
  if (!hs) return;
  openModal(`
    <h3>${escapeHtml(hs.spellName)} — Success!</h3>
    <div class="note" style="margin-bottom:8px">Rolled ${roll} against a target of ${hs.finalTarget} (${hs.totalSuccess}% + GM d50 ${hs.gmRoll}).${hs.duration ? ` Listed duration: ${escapeHtml(hs.duration)}` : ''}</div>
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:8px">
      <input type="checkbox" id="mark-duration-check" onchange="document.getElementById('mark-duration-fields').style.display=this.checked?'flex':'none'">
      Mark duration?
    </label>
    <div id="mark-duration-fields" class="form-row" style="display:none">
      <div class="form-group"><label>Amount</label><input type="number" id="mark-duration-amt" class="w-sm" value="1" min="0"></div>
      <div class="form-group"><label>Unit</label>
        <select id="mark-duration-unit">
          <option value="60">Minutes</option>
          <option value="3600" selected>Hours</option>
          <option value="79200">Days</option>
          <option value="633600">Hawaaks (8 days)</option>
          <option value="4752000">Goesi (60 days)</option>
        </select>
      </div>
    </div>
    <div class="modal-actions"><button class="btn btn-gold" onclick="finishSpellCastWithDuration()">Done</button></div>`);
}

async function finishSpellCastWithDuration() {
  const hs = hardcastState;
  const char = state.characters[state.activeChar];
  const markCheck = document.getElementById('mark-duration-check');
  const marked = markCheck && markCheck.checked;
  if (marked && char && char.playGroupId) {
    const amt = parseFloat(document.getElementById('mark-duration-amt').value) || 0;
    const unitSec = parseInt(document.getElementById('mark-duration-unit').value) || 3600;
    const durationSeconds = amt * unitSec;
    const grp = myGroups.find(g => g.id === char.playGroupId);
    const rowId = charRowIds[state.activeChar];
    if (grp && rowId && durationSeconds > 0) {
      const castAt = grp.clock_seconds;
      const { error } = await sb.from('character_spell_effects').insert({
        character_id: rowId, group_id: grp.id, spell_name: hs.spellName,
        cast_at_seconds: castAt, expires_at_seconds: castAt + durationSeconds
      });
      if (error) alert('Cast succeeded, but failed to save the duration flag: ' + error.message);
    }
  }
  hardcastState = null;
  closeModal();
  renderSpellModule();
}

// A spellbook entry with nothing in it (the old "+ Add Spell" added these blank).
function isBlankSpell(sp) {
  return !String(sp.school || '').trim() && !String(sp.name || '').trim() && !String(sp.notes || '').trim();
}

// The Add Spell popup (openAddSpellModal in modals.js) builds spellDraft:
// pick a school, then a spell; the SP cost comes from the catalog. A school
// with no catalog entries takes a typed name instead (cost 0).
let spellDraft = null;
let addNextSpell = false;
function setSpellDraftSchool(school) {
  if (!spellDraft) return;
  spellDraft = { school, name: '', cost: 0, notes: '' };
  renderAddSpellModal();
}
function setSpellDraftName(name, typed) {
  if (!spellDraft) return;
  spellDraft.name = name;
  const def = SPELLS.find(sp => sp.name === name && sp.school === spellDraft.school);
  spellDraft.cost = def ? def.cost : 0;
  if (!typed) renderAddSpellModal();
  else { const btn = document.getElementById('as-add'); if (btn) btn.disabled = !String(name).trim(); }
}
function confirmAddSpell() {
  const char = state.characters[state.activeChar];
  const d = spellDraft;
  if (!char || !d || !d.school || !String(d.name || '').trim()) return;
  if (!char.spellbook) char.spellbook = [];
  char.spellbook.push({ school: d.school, name: String(d.name).trim(), cost: d.cost || 0, notes: '' });
  spellDraft = null;
  saveState();
  renderSpellModule();
  if (addNextSpell) { openAddSpellModal({ keepAddNext: true, justAdded: d.name }); return; }
  closeModal();
}

function updateSpell(idx, field, value) {
  const char = state.characters[state.activeChar];
  if (!char || !char.spellbook || !char.spellbook[idx]) return;
  char.spellbook[idx][field] = value;
  saveState();
  renderSpellModule();
}

function removeSpell(idx) {
  const char = state.characters[state.activeChar];
  if (!char || !char.spellbook || !char.spellbook[idx]) return;
  if (!confirm(`Remove "${char.spellbook[idx].name || 'this spell'}" from the spellbook?`)) return;
  char.spellbook.splice(idx, 1);
  saveState();
  renderSpellModule();
}

function updateHPState(field, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (char.playGroupId) {
    const grp = myGroups.find(g => g.id === char.playGroupId);
    if (grp) settleCharacterRecovery(char, grp.clock_seconds, {});
  }
  if (!char.hpState) char.hpState = {};
  char.hpState[field] = (field === 'system') ? value : (parseFloat(value) || 0);
  saveState();
  renderCombatModule();
}

function updateWeaponField(idx, field, value) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  char.items[idx][field] = value;
  saveState();
  renderCombatModule();
}

function selectWeaponModel(idx, weaponName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  applyWeaponModel(char.items[idx], weaponName);
  saveState();
  renderInventoryModule();
}

function selectCoinType(idx, coinName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  applyCoinType(char.items[idx], coinName);
  saveState();
  renderInventoryModule();
}

function selectAmmoType(idx, ammoName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  applyAmmoType(char.items[idx], ammoName);
  saveState();
  renderInventoryModule();
}

function selectShieldType(idx, shieldName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  applyShieldType(char.items[idx], shieldName);
  saveState();
  renderInventoryModule();
}

function selectBasicItem(idx, itemName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  applyBasicItem(char.items[idx], itemName);
  saveState();
  renderInventoryModule();
}

function removeItem(idx) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  if (!confirm(`Delete "${char.items[idx].name || 'this item'}" from the inventory?`)) return;
  char.items.splice(idx, 1);
  saveState();
  renderInventoryModule();
}

function updateAttr(attr, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.attrs) char.attrs = {};
  char.attrs[attr] = parseInt(value) || 0;
  saveState();
}

function updateSkill(skillId, field, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const si = (char.skills || []).find(s => s.id === skillId);
  if (!si) return;
  const wasZero = !si.rawXP || parseFloat(si.rawXP) === 0;
  if (field === 'rawXP' && char.unspentInitialExp > 0) {
    const delta = (parseFloat(value) || 0) - (parseFloat(si.rawXP) || 0);
    if (delta > 0) char.unspentInitialExp = Math.max(0, char.unspentInitialExp - delta);
  }
  si[field] = value;
  // A skill's GuildSchool carries down to all of its sub-skills
  if (field === 'guildName') {
    const subs = skillDescendantIds(skillId, char.skills || []);
    for (const s of char.skills || []) if (subs.has(s.id)) s.guildName = value;
  }
  if (field === 'rawXP' && wasZero && parseFloat(value) > 0 && !si.dropdownOnly) {
    autoPopulateDropdownChildren(char, si);
  }
  saveState();
  renderSkillModule(skillId);
  renderSidebar();
}

function updateRoll(skillId, idx, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const si = (char.skills || []).find(s => s.id === skillId);
  if (!si) return;
  if (!si.rolls) si.rolls = Array(20).fill('');
  si.rolls[idx] = value === '' ? '' : parseInt(value) || 0;
  saveState();
  // Re-render just the computed summary without full re-render
  renderSkillModule(skillId);
  renderSidebar();
}

function rollLevelSlot(skillId, idx) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const si = (char.skills || []).find(s => s.id === skillId);
  if (!si) return;
  const def = SKILLS.find(s => s.name === si.skillName);
  if (!def || !def.per_level) return;
  updateRoll(skillId, idx, rollDiceExpr(def.per_level));
}

function rollAllEmptyLevels(skillId) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const si = (char.skills || []).find(s => s.id === skillId);
  if (!si) return;
  const def = SKILLS.find(s => s.name === si.skillName);
  if (!def || !def.per_level) return;
  if (!si.rolls) si.rolls = Array(20).fill('');
  // Only fill slots up to the skill's current level -- higher slots aren't earned yet.
  const level = Math.min(20, computeSkillValues(si, char, char.skills || []).level);
  for (let i = 0; i < level; i++) {
    if (si.rolls[i] === '' || si.rolls[i] === undefined) si.rolls[i] = rollDiceExpr(def.per_level);
  }
  saveState();
  renderSkillModule(skillId);
  renderSidebar();
}

// A skill's parent among the character's skills: the skill it is linked to
// (parentSkillId), else its parent in the skill catalog, else -- for a
// weapon-bound skill like "Attack versus (Basic Pole Weapons)" -- the skill
// it is bound to. Same idea as the sidebar's nesting, across all types.
function skillParentInstanceId(si, skills) {
  if (si.parentSkillId && skills.some(s => s.id === si.parentSkillId)) return si.parentSkillId;
  const def = SKILLS.find(s => s.name === si.skillName);
  const name = def && def.templated ? si.binding : def && def.parent;
  const want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  const parent = skills.find(s => s.id !== si.id && String(s.skillName || '').trim().toLowerCase() === want);
  return parent ? parent.id : null;
}

// Every skill under skillId, all the way down.
function skillDescendantIds(skillId, skills) {
  const found = new Set();
  let added = true;
  while (added) {
    added = false;
    for (const s of skills) {
      if (found.has(s.id) || s.id === skillId) continue;
      const p = skillParentInstanceId(s, skills);
      if (p === skillId || found.has(p)) { found.add(s.id); added = true; }
    }
  }
  return found;
}

// Removing a skill removes all of its sub-skills with it.
function deleteSkill(skillId) {
  const char = state.characters[state.activeChar];
  const skills = (char && char.skills) || [];
  const si = skills.find(s => s.id === skillId);
  if (!si) return;
  const subs = skillDescendantIds(skillId, skills);
  const subNames = skills.filter(s => subs.has(s.id)).map(s => s.skillName + (s.binding ? ` (${s.binding})` : ''));
  const msg = subNames.length
    ? `Remove ${si.skillName} and its ${subNames.length} sub-skill${subNames.length === 1 ? '' : 's'}?\n\n${subNames.join('\n')}`
    : `Remove ${si.skillName}?`;
  if (!confirm(msg)) return;
  char.skills = skills.filter(s => s.id !== skillId && !subs.has(s.id));
  state.activeSkillId = null;
  state.activeView = 'overview';
  saveState();
  renderSidebar();
  renderOverview();
}

function deleteChar() {
  if (!state.activeChar) { alert('Select a character to delete first.'); return; }
  if (!confirm('Delete this character? This cannot be undone.')) return;
  const appId = state.activeChar;
  const rowId = charRowIds[appId];
  delete state.characters[appId];
  delete charRowIds[appId];
  state.activeChar = null;
  state.activeSkillId = null;
  saveState();
  if (rowId) {
    sb.from('characters').delete().eq('id', rowId).then(({ error }) => {
      if (error) console.error('Delete failed for', appId, error);
    });
  }
  renderApp();
  document.getElementById('main').innerHTML = '<div class="note" style="text-align:center;padding:40px">Character deleted.</div>';
  document.getElementById('sidebar').innerHTML = '<div class="note" style="padding:12px;text-align:center">Select or create a character</div>';
}

function openTransferOwnershipModal() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  openModal(`
    <h3>Transfer Ownership</h3>
    <div class="note" style="margin-bottom:8px;color:#c05050">You will lose access to "${escapeHtml(char.name || 'this character')}" once transferred — the new owner gets full control, and you won't be able to see or edit it anymore (unless you're an admin).</div>
    <div class="form-group" style="margin-bottom:8px"><label>New Owner's Email</label><input class="w-full" id="transfer-email"  type="email"></div>
    <div id="transfer-status" style="font-size:12px;color:var(--red-b);margin-bottom:8px;display:none"></div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-red" onclick="confirmTransferOwnership()">Transfer</button></div>`);
}

async function confirmTransferOwnership() {
  const appId = state.activeChar;
  const char = state.characters[appId];
  const rowId = charRowIds[appId];
  if (!char || !rowId) return;
  const email = document.getElementById('transfer-email').value.trim();
  const statusEl = document.getElementById('transfer-status');
  statusEl.style.display = 'none';
  if (!email) return;
  if (!confirm(`Really transfer "${char.name || 'this character'}" to ${email}? This can't be undone by you -- only an admin could reverse it.`)) return;
  const { error } = await sb.rpc('transfer_character_ownership', { p_character_id: rowId, p_new_owner_email: email });
  if (error) {
    statusEl.textContent = 'Failed to transfer: ' + error.message;
    statusEl.style.display = 'block';
    return;
  }
  delete state.characters[appId];
  delete charRowIds[appId];
  state.activeChar = null;
  state.activeSkillId = null;
  closeModal();
  renderApp();
  document.getElementById('main').innerHTML = '<div class="note" style="text-align:center;padding:40px">Character transferred.</div>';
  document.getElementById('sidebar').innerHTML = '<div class="note" style="padding:12px;text-align:center">Select or create a character</div>';
}
