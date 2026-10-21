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
  saveStateTimer = setTimeout(flushCharactersToSupabase, 800);
}

async function flushCharactersToSupabase() {
  if (!currentUser) return;
  for (const [appId, charData] of Object.entries(state.characters)) {
    const rowId = charRowIds[appId];
    const hpStatus = computeHpStatus(charData);
    if (rowId) {
      const { error } = await sb.from('characters').update({ data: charData, hp_damaged: hpStatus.damaged, hp_critical: hpStatus.critical }).eq('id', rowId);
      if (error) console.error('Save failed for', appId, error);
    } else {
      const { data, error } = await sb.from('characters')
        .insert({ owner_id: currentUser.id, data: charData, hp_damaged: hpStatus.damaged, hp_critical: hpStatus.critical })
        .select('id').single();
      if (error) console.error('Create failed for', appId, error);
      else charRowIds[appId] = data.id;
    }
  }
}

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
