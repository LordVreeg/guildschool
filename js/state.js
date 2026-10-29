// ============================================================
// STATE
// ============================================================
let state = { characters: {}, activeChar: null, activeSkillId: null };

async function loadState() {
  if (!currentUser) return;
  try {
    const { data, error } = await sb
      .from('characters')
      .select('id, data, group_id')
      .eq('owner_id', currentUser.id);
    if (error) throw error;
    const characters = {};
    charRowIds = {};
    for (const row of data) {
      const appId = row.data && row.data.id;
      if (!appId) continue;
      row.data.playGroupId = row.group_id || null;
      characters[appId] = row.data;
      charRowIds[appId] = row.id;
      savedCharJson[appId] = JSON.stringify(row.data);
      lastSheetHpState[row.id] = stableJson(row.data.hpState || null);
    }
    state.characters = characters;
    state.activeChar = localStorage.getItem('gs_active_char') || Object.keys(characters)[0] || null;
  } catch (e) {
    console.error('Failed to load characters from Supabase', e);
    alert('Could not load your characters. Check your connection and try reloading the page.');
  }
}

let saveStateTimer = null;
function saveState() {
  if (state.activeChar) localStorage.setItem('gs_active_char', state.activeChar);
  dirtySinceExport = true;
  updateExportIndicator();
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(async () => {
    saveStateTimer = null;
    flushBusy = true;
    try { await flushCharactersToSupabase(); } finally { flushBusy = false; }
  }, 800);
}
let flushBusy = false;

// What each character looked like the last time it was loaded from / saved to
// Supabase (JSON). A save only writes characters that differ from this, so an
// untouched character's stale in-memory copy can never overwrite HP or spell
// points that a GM (combat page, nightly recovery) wrote to it meanwhile.
let savedCharJson = {};

async function flushCharactersToSupabase() {
  if (!currentUser) return;
  for (const [appId, charData] of Object.entries(state.characters)) {
    const rowId = charRowIds[appId];
    const json = JSON.stringify(charData);
    if (rowId && savedCharJson[appId] === json) continue;
    const hpStatus = computeHpStatus(charData);
    if (rowId) {
      const { error } = await sb.from('characters').update({ data: charData, hp_damaged: hpStatus.damaged, hp_critical: hpStatus.critical }).eq('id', rowId);
      if (error) { console.error('Save failed for', appId, error); continue; }
      savedCharJson[appId] = json;
      pushSheetHpToCombats(charData, rowId);
    } else {
      const { data, error } = await sb.from('characters')
        .insert({ owner_id: currentUser.id, data: charData, hp_damaged: hpStatus.damaged, hp_critical: hpStatus.critical })
        .select('id').single();
      if (error) console.error('Create failed for', appId, error);
      else { charRowIds[appId] = data.id; savedCharJson[appId] = json; }
    }
  }
}

// Sheet -> combat. A character sitting in an active/paused encounter has its
// own HP copy on the combatant row; when the sheet's HP differs from that copy
// (damage typed on the sheet, a recovery roll, a level-up changing max HP),
// push it across so the combat page matches. The owner is allowed to update
// their own combatant rows (combat_combatants_update policy).
// Only a genuine change to the sheet's hpState triggers a push: lastSheetHpState
// is what the sheet held when loaded, last pushed, or last pulled/patched from
// the database, so an unrelated edit on a slightly stale sheet can't overwrite
// HP the GM just changed in combat.
let lastSheetHpState = {}; // characters.id -> stableJson(hpState)
async function pushSheetHpToCombats(charData, rowId) {
  const hpJson = stableJson(charData.hpState || null);
  if (lastSheetHpState[rowId] === hpJson) return;
  const hp = computeHP(charData);
  const collegium = hp.system === 'collegium';
  const fields = collegium
    ? { hp_system: 'collegium', physical_current: hp.physicalCurrent, physical_max: hp.physicalMax, endurance_current: hp.enduranceCurrent, endurance_max: hp.enduranceMax,
        current_hp: hp.physicalCurrent + hp.enduranceCurrent, max_hp: hp.physicalMax + hp.enduranceMax }
    : { hp_system: 'standard', current_hp: hp.currentHP, max_hp: hp.totalHP };
  const { data: rows, error } = await sb.from('combat_combatants')
    .select('id, combat_encounters!inner(status)')
    .eq('character_id', rowId)
    .in('combat_encounters.status', ['active', 'paused']);
  if (error) { console.error('Sheet HP -> combat lookup failed', error); return; }
  if (rows && rows.length) {
    const { error: uErr } = await sb.from('combat_combatants').update(fields).in('id', rows.map(r => r.id));
    if (uErr) { console.error('Sheet HP -> combat update failed', uErr); return; }
  }
  lastSheetHpState[rowId] = hpJson;
}

// Combat/recovery -> sheet. The GM changes a character's HP (combat page) or
// HP and spell points (nightly recovery) straight in the database, so a sheet
// that's already open has to pick those up or it would show the old numbers
// and, on its next save, write them back. While this user has a character in
// an active/paused combat, poll every few seconds for that character's
// hpState/spellState/recoveryState and fold any change into the open sheet.
// Skips a character with an unsaved local edit (the save timer is pending).
// Postgres jsonb returns object keys in its own order, so compare with sorted keys.
function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const SHEET_PULL_FIELDS =['hpState', 'spellState', 'recoveryState'];
let sheetPullBusy = false;
async function pullCombatChangesToSheet() {
  if (!currentUser || sheetPullBusy || document.hidden || saveStateTimer || flushBusy) return;
  const rowIds = Object.values(charRowIds);
  if (!rowIds.length) return;
  sheetPullBusy = true;
  try {
    const { data: inCombat, error } = await sb.from('combat_combatants')
      .select('character_id, combat_encounters!inner(status)')
      .in('character_id', rowIds)
      .in('combat_encounters.status', ['active', 'paused']);
    if (error || !inCombat || !inCombat.length) return;
    const ids = [...new Set(inCombat.map(r => r.character_id))];
    const { data: rows, error: cErr } = await sb.from('characters')
      .select('id, hpState:data->hpState, spellState:data->spellState, recoveryState:data->recoveryState')
      .in('id', ids);
    if (cErr || !rows || saveStateTimer || flushBusy) return;
    let changed = false;
    for (const row of rows) {
      const appId = Object.keys(charRowIds).find(k => charRowIds[k] === row.id);
      const char = appId && state.characters[appId];
      if (!char) continue;
      let charChanged = false;
      for (const f of SHEET_PULL_FIELDS) {
        const remote = row[f];
        if (remote == null || stableJson(remote) === stableJson(char[f] || null)) continue;
        char[f] = remote;
        charChanged = true;
      }
      if (charChanged) {
        savedCharJson[appId] = JSON.stringify(char);
        lastSheetHpState[row.id] = stableJson(char.hpState || null);
        changed = true;
      }
    }
    if (changed) refreshAfterPull();
  } finally {
    sheetPullBusy = false;
  }
}

// Repaint whatever HP/spell-bearing page is showing so the pulled numbers
// appear; leave other views (and any open popup) alone.
function refreshAfterPull() {
  if (document.getElementById('modal-overlay').classList.contains('open')) return;
  const a = document.activeElement;
  if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.closest('#main')) return; // mid-edit; next poll retries

  const view = state.activeView;
  if (view === 'combat') renderCombatModule();
  else if (view === 'spell') renderSpellModule();
}
setInterval(pullCombatChangesToSheet, 8000);

let dirtySinceExport = false;

function loadCustomData() {
  const defaults = {
    customSkills: [], customGuildBonuses: {},
    locales: ['Igbar', 'Ocodig', 'Hopiton', 'Steel Isle Town', 'Steel Isle', 'Grey March', 'Miston'],
    groups: []
  };
  try {
    const raw = localStorage.getItem('gs_custom_data');
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const merged = { ...defaults, ...parsed };
    // A browser that already saved its own locale list would otherwise never see locales added to the defaults later.
    merged.locales = [...defaults.locales, ...(parsed.locales || []).filter(l => !defaults.locales.includes(l))];
    return merged;
  } catch(e) {
    return defaults;
  }
}

function saveCustomData(customData) {
  localStorage.setItem('gs_custom_data', JSON.stringify(customData));
}

function addNewChoice(listKey, value) {
  const custom = loadCustomData();
  if (!custom[listKey]) custom[listKey] = [];
  if (!custom[listKey].includes(value)) custom[listKey].push(value);
  saveCustomData(custom);
}

function handleChoiceSelect(selectEl, char, field, listKey) {
  const val = selectEl.value;
  if (val === '__addnew__') {
    const newVal = prompt(`Enter a new ${field === 'locale' ? 'Locale' : 'Group'}:`);
    if (newVal && newVal.trim()) {
      addNewChoice(listKey, newVal.trim());
      updateChar(field, newVal.trim());
    }
    renderGeneralModule();
  } else {
    updateChar(field, val);
  }
}

function applyCustomData() {
  const custom = loadCustomData();
  for (const skill of custom.customSkills) {
    if (!SKILLS.find(s => s.name === skill.name)) SKILLS.push(skill);
  }
  for (const guildName in custom.customGuildBonuses) {
    if (!GUILDS[guildName]) GUILDS[guildName] = {};
    Object.assign(GUILDS[guildName], custom.customGuildBonuses[guildName]);
  }
}

window.addEventListener('beforeunload', (e) => {
  if (dirtySinceExport && Object.keys(state.characters || {}).length > 0) {
    e.preventDefault();
    e.returnValue = 'You have unexported character changes. Export JSON before leaving to avoid losing them.';
    return e.returnValue;
  }
});
