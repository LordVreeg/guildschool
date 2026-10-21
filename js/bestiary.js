// ============================================================
// BESTIARY (foe templates) -- private to the GM who created them,
// not tied to any character or group. See project_combat_initiative_tracker_spec
// memory for the full design; this is the first piece of it (the
// combat/initiative tracker itself isn't built yet).
// ============================================================
const BESTIARY_BONUS_ABILITIES = ['Light poison', 'Light spell use', 'Quick movement', 'Damage resistance', 'Missiles', "Darksight 25'+", 'Web / minor impair move', 'Wallclimb / swim / flight', 'Hide', 'Special or magic to hit'];
const BESTIARY_SPECIAL_ABILITIES = ['Poison', '25+ SP caster', '12%+ crit', 'Undead perm damage', '15%+ magic resist', '10%+ magic-to-hit', 'Regeneration', 'Invisibility', 'Hard to kill', 'Minor Breath Weapon'];
const BESTIARY_EXCEPTIONAL_ABILITIES = ['60+ SP spells', '50%+ magic resist', 'Major Breath Weapon'];

let bestiaryCache = [];
let bestiaryTab = 'active';
let bestiaryFilter = '';
let bestiarySelected = new Set();
let bestiaryEditingId = null; // null = list view, 'new' = new entry, or an existing id
let bestiaryDraft = null;
let customBestiaryTemplates = []; // GM's own saved templates, from bestiary_templates -- alongside the built-in BESTIARY_RACE_TEMPLATES

async function fetchCustomBestiaryTemplates() {
  const { data, error } = await sb.from('bestiary_templates').select('*').order('name', { ascending: true });
  if (!error) customBestiaryTemplates = data || [];
}

function showBestiaryModule() {
  state.activeSkillId = null;
  state.activeView = 'bestiary';
  bestiaryEditingId = null;
  renderBestiaryModule();
}

// XP = HP^2*.15 + (100-AV)*HP*.01 + PR*HP*.015 + Bmod*HP*.012 + AvgDam*HP*.1
//    + Multi*HP*.05 + 1.5*HP*bonusCount + 6.25*HP*specialCount + 10*HP*exceptionalCount
// Reverse-engineered from the user's "Monster/Foe EXP Calculator" spreadsheet
// (its actual cell formulas, not just one example's computed values).
function computeFoeXP(e) {
  const hp = parseFloat(e.max_hp) || parseFloat(e.avg_hp) || 0;
  const av = parseFloat(e.avoidance) || 0;
  const pr = parseFloat(e.protection) || 0;
  const bmod = parseFloat(e.bmod) || 0;
  const avgDam = parseFloat(e.avg_damage) || 0;
  const multi = parseFloat(e.multi) || 0;
  const bonus = (e.bonus_abilities || []).length;
  const special = (e.special_abilities || []).length;
  const exceptional = (e.exceptional_abilities || []).length;
  return hp*hp*0.15
    + (100-av)*hp*0.01
    + pr*hp*0.015
    + bmod*hp*0.012
    + avgDam*hp*0.1
    + multi*hp*0.05
    + 1.5*hp*bonus
    + 6.25*hp*special
    + 10*hp*exceptional;
}

async function renderBestiaryModule() {
  await fetchMyGroups();
  await fetchCustomBestiaryTemplates();
  if (bestiaryEditingId) { renderBestiaryEditor(); return; }
  const { data, error } = await sb.from('bestiary_entries').select('*').order('location', { ascending: true }).order('name', { ascending: true });
  if (error) {
    document.getElementById('main').innerHTML = `<div class="panel"><div class="panel-body" style="color:var(--red-b)">Failed to load bestiary: ${escapeHtml(error.message)}</div></div>`;
    return;
  }
  bestiaryCache = data || [];
  bestiarySelected = new Set();

  document.getElementById('main').innerHTML = `
  <div class="panel">
    <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center">
      <h2>Beastiary</h2>
      <button class="btn btn-neon" onclick="openNewBestiaryEntry()">+ New Foe</button>
    </div>
    <div class="panel-body">
      <div class="note" style="margin-bottom:10px">Your personal library of foe templates — private to you, not visible to players or other GMs. Keep the foes you use now in <b>Active</b>; tick the rest and Archive them. Archived foes stay safe here but drop out of the Add Combatants list.</div>
      <div id="bestiary-tabs" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px"></div>
      <div id="bestiary-list"></div>
    </div>
  </div>`;
  paintBestiary();
}

// A foe is archived only when the schema_v27 column says so; before that
// migration runs every row reads as active, so nothing disappears.
function bestiaryIsArchived(e) { return !e.is_temp_pc && e.archived === true; }

function bestiaryVisibleRows() {
  const q = bestiaryFilter.trim().toLowerCase();
  return bestiaryCache.filter(e => {
    if (bestiaryIsArchived(e) !== (bestiaryTab === 'archive')) return false;
    if (!q) return true;
    return [e.name, e.race, e.location].some(v => v && String(v).toLowerCase().includes(q));
  });
}

function paintBestiary() {
  const tabsEl = document.getElementById('bestiary-tabs');
  const listEl = document.getElementById('bestiary-list');
  if (!tabsEl || !listEl) return;
  const groupNameById = {};
  for (const g of myGroups) groupNameById[g.id] = g.name;
  const activeCount = bestiaryCache.filter(e => !bestiaryIsArchived(e)).length;
  const archiveCount = bestiaryCache.length - activeCount;
  const isArchiveTab = bestiaryTab === 'archive';
  const tabBtn = (key, label, n) => `<button class="btn ${bestiaryTab === key ? 'btn-gold' : 'btn-dim'}" onclick="setBestiaryTab('${key}')">${label} (${n})</button>`;
  const rows = bestiaryVisibleRows();
  const selectable = rows.filter(e => !e.is_temp_pc);
  const selCount = selectable.filter(e => bestiarySelected.has(e.id)).length;
  const allTicked = selectable.length > 0 && selCount === selectable.length;
  tabsEl.innerHTML = `
    ${tabBtn('active', 'Active', activeCount)}${tabBtn('archive', 'Archive', archiveCount)}
    <input type="text" id="bestiary-filter" placeholder="Filter by name, type or location" value="${escapeHtml(bestiaryFilter)}" oninput="setBestiaryFilter(this.value)" style="flex:1;min-width:160px;max-width:280px">
    <button class="btn btn-dim" ${selCount ? '' : 'disabled'} onclick="archiveSelectedBestiary(${isArchiveTab ? 'false' : 'true'})">${isArchiveTab ? 'Restore' : 'Archive'} selected (${selCount})</button>`;
  if (!rows.length) {
    listEl.innerHTML = bestiaryCache.length === 0
      ? '<div class="note" style="padding:10px 0">No foes yet. Click "+ New Foe" to build one.</div>'
      : `<div class="note" style="padding:10px 0">${bestiaryFilter.trim() ? 'No foes match that filter.' : (isArchiveTab ? 'Nothing archived yet. Tick foes on the Active tab and choose Archive selected.' : 'No active foes. Restore some from the Archive tab, or click "+ New Foe".')}</div>`;
    return;
  }
  listEl.innerHTML = `<table class="skill-table">
    <thead><tr><th style="width:24px"><input type="checkbox" ${allTicked ? 'checked' : ''} ${selectable.length ? '' : 'disabled'} onchange="toggleAllBestiary(this.checked)" title="Tick all shown"></th><th>Name</th><th>Type</th><th>Lvl</th><th>Location</th><th>Prepped for</th><th>HP</th><th>XP</th><th></th></tr></thead>
    <tbody>
      ${rows.map(e => `<tr>
        <td>${e.is_temp_pc ? '' : `<input type="checkbox" ${bestiarySelected.has(e.id) ? 'checked' : ''} onchange="toggleBestiarySelected('${e.id}', this.checked)">`}</td>
        <td style="cursor:pointer;color:var(--gold)" onclick="openEditBestiaryEntry('${e.id}')">${escapeHtml(e.name)}</td>
        <td class="note">${e.race ? escapeHtml(e.race) : '—'}</td>
        <td class="note">${e.level || 1}</td>
        <td class="note">${e.location ? escapeHtml(e.location) : '—'}</td>
        <td class="note">${e.group_id && groupNameById[e.group_id] ? escapeHtml(groupNameById[e.group_id]) : '—'}</td>
        <td>${e.current_hp != null ? `${e.current_hp}/${e.max_hp}` : (e.avg_hp != null ? `avg ${e.avg_hp}` : '—')}</td>
        <td class="skval-cell">${Math.round(computeFoeXP(e) * 10) / 10}</td>
        <td style="white-space:nowrap">
          ${e.is_temp_pc ? '' : `<button class="btn btn-dim" style="font-size:10px;padding:2px 6px" onclick="setBestiaryArchived(['${e.id}'], ${isArchiveTab ? 'false' : 'true'})">${isArchiveTab ? 'Restore' : 'Archive'}</button>`}
          <button class="btn btn-dim" style="font-size:10px;padding:2px 6px" onclick="duplicateBestiaryEntry('${e.id}')">Duplicate</button>
          <button class="btn btn-dim" style="font-size:10px;padding:2px 6px;color:var(--red-b)" onclick="deleteBestiaryEntry('${e.id}')">Delete</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function setBestiaryTab(tab) {
  bestiaryTab = tab;
  bestiarySelected = new Set();
  paintBestiary();
}

function setBestiaryFilter(v) {
  bestiaryFilter = v;
  // Repaint only the list so the filter box keeps focus while typing.
  const keep = document.getElementById('bestiary-filter');
  const pos = keep ? keep.selectionStart : null;
  paintBestiary();
  const again = document.getElementById('bestiary-filter');
  if (again) { again.focus(); if (pos != null) again.setSelectionRange(pos, pos); }
}

function toggleBestiarySelected(id, checked) {
  if (checked) bestiarySelected.add(id); else bestiarySelected.delete(id);
  paintBestiary();
}

function toggleAllBestiary(checked) {
  for (const e of bestiaryVisibleRows()) {
    if (e.is_temp_pc) continue;
    if (checked) bestiarySelected.add(e.id); else bestiarySelected.delete(e.id);
  }
  paintBestiary();
}

function archiveSelectedBestiary(archive) {
  const ids = bestiaryVisibleRows().filter(e => !e.is_temp_pc && bestiarySelected.has(e.id)).map(e => e.id);
  if (ids.length) setBestiaryArchived(ids, archive);
}

async function setBestiaryArchived(ids, archive) {
  const { error } = await sb.from('bestiary_entries').update({ archived: archive }).in('id', ids);
  if (error) {
    alert(/archived/i.test(error.message)
      ? 'The Beastiary archive needs a one-time database update. Run schema_v27_bestiary_archive.sql in the Supabase SQL Editor, then try again.'
      : 'Failed to ' + (archive ? 'archive' : 'restore') + ': ' + error.message);
    return;
  }
  for (const e of bestiaryCache) if (ids.includes(e.id)) e.archived = archive;
  bestiarySelected = new Set();
  paintBestiary();
}

function blankBestiaryDraft() {
  return {
    name: '', race: '', location: '', group_id: null, is_temp_pc: false, hp_formula: '', avg_hp: 0, armor_name: '', shield_name: '',
    avoidance: 0, protection: 0, bmod: 0, avg_damage: 0, multi: 0, crit_bonus: 0,
    level: 1, max_hp: null, current_hp: null,
    cc_fortitude: null, cc_reflex: null, cc_will: null, cc_surprise: null, cc_social: null,
    bonus_abilities: [], special_abilities: [], exceptional_abilities: [],
    attacks: [], level_capable: false, possible_classes: [], items: [], spells: [], notes: ''
  };
}

// Set true by openNewTempCharacter/openEditTempCharacter so Save/Cancel land
// back on the Group page instead of the Beastiary list -- a temp character
// is quick-added FROM a group, not browsed to from the Beastiary tab.
let bestiaryReturnToGroup = false;

// key is "wiki:<name>" (built-in BESTIARY_RACE_TEMPLATES) or "custom:<id>" (this GM's own saved bestiary_templates row)
function loadBestiaryTemplate(key) {
  if (!key) return;
  const idx = key.indexOf(':');
  const kind = key.slice(0, idx), ident = key.slice(idx + 1);
  let t = null;
  if (kind === 'wiki') t = BESTIARY_RACE_TEMPLATES.find(r => r.name === ident);
  else if (kind === 'custom') t = customBestiaryTemplates.find(r => r.id === ident);
  if (!t) return;
  const hasStats = bestiaryDraft.hp_formula || bestiaryDraft.avg_hp || bestiaryDraft.avoidance || bestiaryDraft.protection || (bestiaryDraft.attacks||[]).length;
  if (hasStats && !confirm(`Overwrite this foe's stats with the "${t.name}" template? Name and notes you already typed will be kept where possible.`)) return;
  const keepName = bestiaryDraft.name;
  const clean = JSON.parse(JSON.stringify(t));
  delete clean.id; delete clean.created_by; delete clean.created_at; delete clean.updated_at;
  Object.assign(bestiaryDraft, clean);
  bestiaryDraft.race = t.name;
  bestiaryDraft.name = keepName || t.name;
  bestiaryDraft.avg_hp = Math.round(bestiaryDraft.avg_hp || 0);
  recomputeBestiaryAvgDamage();
  renderBestiaryEditor();
}

// Saves the draft's current stat fields (not name/group/items/spells) as a
// reusable template in bestiary_templates, so a homebrew foe's stat block
// can seed future foes the same way a wiki creature does.
async function saveCurrentAsBestiaryTemplate() {
  const suggested = bestiaryDraft.race || bestiaryDraft.name || '';
  const name = prompt('Save these stats as a new template. Template name:', suggested);
  if (!name || !name.trim()) return;
  const row = {
    name: name.trim(),
    hp_formula: bestiaryDraft.hp_formula || null,
    avg_hp: bestiaryDraft.avg_hp || 0,
    avoidance: bestiaryDraft.avoidance || 0,
    protection: bestiaryDraft.protection || 0,
    bmod: bestiaryDraft.bmod || 0,
    avg_damage: bestiaryDraft.avg_damage || 0,
    multi: bestiaryDraft.multi || 0,
    cc_fortitude: bestiaryDraft.cc_fortitude || null,
    cc_reflex: bestiaryDraft.cc_reflex || null,
    cc_will: bestiaryDraft.cc_will || null,
    cc_surprise: bestiaryDraft.cc_surprise || null,
    cc_social: bestiaryDraft.cc_social || null,
    attacks: bestiaryDraft.attacks || [],
    bonus_abilities: bestiaryDraft.bonus_abilities || [],
    special_abilities: bestiaryDraft.special_abilities || [],
    exceptional_abilities: bestiaryDraft.exceptional_abilities || [],
    level_capable: !!bestiaryDraft.level_capable,
    possible_classes: bestiaryDraft.possible_classes || [],
    notes: bestiaryDraft.notes || null
  };
  const { error } = await sb.from('bestiary_templates').insert({ ...row, created_by: currentUser.id });
  if (error) { alert('Failed to save template: ' + error.message); return; }
  await fetchCustomBestiaryTemplates();
  renderBestiaryEditor();
}

async function deleteCustomBestiaryTemplate() {
  const sel = document.getElementById('bf-race-template');
  const key = sel ? sel.value : '';
  if (!key.startsWith('custom:')) { alert("Select one of your own templates under \"My templates\" first."); return; }
  const id = key.slice(7);
  const t = customBestiaryTemplates.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Delete your custom template "${t.name}"? This cannot be undone.`)) return;
  const { error } = await sb.from('bestiary_templates').delete().eq('id', id);
  if (error) { alert('Failed to delete: ' + error.message); return; }
  await fetchCustomBestiaryTemplates();
  renderBestiaryEditor();
}

function openNewBestiaryEntry() {
  bestiaryEditingId = 'new';
  bestiaryDraft = blankBestiaryDraft();
  renderBestiaryEditor();
}

function openEditBestiaryEntry(id) {
  const e = bestiaryCache.find(x => x.id === id);
  if (!e) return;
  bestiaryEditingId = id;
  bestiaryDraft = JSON.parse(JSON.stringify(e));
  bestiaryDraft.avg_hp = Math.round(bestiaryDraft.avg_hp || 0);
  renderBestiaryEditor();
}

// Quick-add path from a Group page, for a player who hasn't built a real
// character sheet yet -- a temp character is just a Beastiary entry flagged
// is_temp_pc, tied to that specific group, using the exact same editor.
function openNewTempCharacter(groupId) {
  bestiaryEditingId = 'new';
  bestiaryDraft = blankBestiaryDraft();
  bestiaryDraft.group_id = groupId;
  bestiaryDraft.is_temp_pc = true;
  bestiaryReturnToGroup = true;
  state.activeView = 'bestiary';
  renderBestiaryEditor();
}

// Edits a temp character from the Group page directly -- doesn't rely on
// bestiaryCache (the Beastiary list's own cache), since a GM might jump
// here without ever having opened the Beastiary tab this session.
async function openEditTempCharacter(id) {
  const { data: e, error } = await sb.from('bestiary_entries').select('*').eq('id', id).single();
  if (error || !e) { alert('Failed to load: ' + (error ? error.message : 'not found')); return; }
  bestiaryEditingId = id;
  bestiaryDraft = e;
  bestiaryDraft.avg_hp = Math.round(bestiaryDraft.avg_hp || 0);
  bestiaryReturnToGroup = true;
  state.activeView = 'bestiary';
  renderBestiaryEditor();
}

function closeBestiaryEditor() {
  bestiaryEditingId = null;
  bestiaryDraft = null;
  if (bestiaryReturnToGroup) {
    bestiaryReturnToGroup = false;
    state.activeView = 'group';
    renderGroupModule();
    return;
  }
  renderBestiaryModule();
}

function updateBestiaryField(field, value) { bestiaryDraft[field] = value; renderBestiaryEditor(); }
function updateBestiaryNum(field, value) {
  let n = parseFloat(value) || 0;
  if (['avg_hp', 'level', 'max_hp', 'current_hp'].includes(field)) n = Math.round(n); // no partial HP or levels
  bestiaryDraft[field] = n;
  if (field === 'bmod' || field === 'max_hp') fillBlankBestiaryToHits();
  renderBestiaryEditor();
}

// Bmod x Max HP = basic chance to hit (per user clarification). Used as
// each attack's To-Hit default -- fills only attacks whose To-Hit is still
// blank, so a manually-entered override on one attack never gets clobbered
// by a later HP roll or Bmod edit.
function defaultBestiaryToHit() {
  const bmod = parseFloat(bestiaryDraft.bmod) || 0;
  const hp = parseFloat(bestiaryDraft.max_hp);
  if (!hp) return null;
  return Math.round(bmod * hp);
}
function fillBlankBestiaryToHits() {
  const def = defaultBestiaryToHit();
  if (def == null) return;
  for (const a of (bestiaryDraft.attacks || [])) { if (!a.toHit) a.toHit = String(def); }
}

// Rolls a single additive term list like "43+5d10", "d6+12", "24+2d10", "3",
// "d4" -- NdM (N optional, default 1) and flat integer terms added with '+'.
function rollDiceTermList(expr) {
  const terms = String(expr).replace(/\s+/g, '').split('+');
  let total = 0;
  for (const term of terms) {
    if (!term) continue;
    const m = term.match(/^(\d*)[dD](\d+)$/);
    if (m) { total += rollDice(m[1] ? parseInt(m[1], 10) : 1, parseInt(m[2], 10)); continue; }
    const n = parseInt(term, 10);
    if (!isNaN(n)) total += n;
  }
  return total;
}
// One roll of an HP sub-expression: either a dice/flat term list (above) or
// a flat "A-B" range (uniform random integer, inclusive).
function rollHpSubExpr(expr) {
  expr = expr.trim();
  const range = expr.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const lo = parseInt(range[1], 10), hi = parseInt(range[2], 10);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  return rollDiceTermList(expr);
}
// Rolls a foe's HP from its freeform hp_formula and a level. Recognizes the
// "<base> + <per-level>/plev" convention used throughout the Beastiary
// templates -- base rolled once, per-level term rolled once per level above
// 1st and summed in (e.g. "d6 + d4/plev" at level 3 rolls d6, then d4 twice
// more). Strips parenthetical notes. Falls back to rolling the whole string
// as a flat base (no scaling) if it doesn't match that convention -- safer
// than guessing at an unfamiliar formula shape (dragons' "per Age Category",
// Mummy's "(assumes level 14)", etc.).
function rollBestiaryHp(formula, level) {
  if (!formula) return null;
  const clean = String(formula).replace(/\([^)]*\)/g, '').trim();
  const m = clean.match(/^(.+?)\s*\+\s*([^+]+?)\s*\/\s*(?:plev|caster-lev|former\s*level|level)$/i);
  let base = clean, perLevel = null;
  if (m) { base = m[1].trim(); perLevel = m[2].trim(); }
  let total = rollHpSubExpr(base);
  const lv = Math.max(1, Math.round(parseFloat(level)) || 1);
  if (perLevel) { for (let i = 1; i < lv; i++) total += rollHpSubExpr(perLevel); }
  return total;
}
function rollBestiaryHpClick() {
  if (!bestiaryDraft.hp_formula) { alert('Enter an HP formula first.'); return; }
  if (bestiaryDraft.current_hp != null && bestiaryDraft.current_hp !== bestiaryDraft.max_hp) {
    if (!confirm('This foe already has HP tracked (possibly mid-fight). Re-roll and reset Current HP to the new Max HP?')) return;
  }
  const rolled = rollBestiaryHp(bestiaryDraft.hp_formula, bestiaryDraft.level || 1);
  if (rolled == null) { alert("Couldn't parse the HP formula -- enter Max HP by hand."); return; }
  bestiaryDraft.max_hp = rolled;
  bestiaryDraft.current_hp = rolled;
  fillBlankBestiaryToHits();
  renderBestiaryEditor();
}

// Full weapon-quality-vs-Protection ladder from the "Damage Reduction (void-sourced)"
// wiki rule: the creature's stated Protection is the "Magicked" tier; each step away
// from it (better or worse weapon) shifts Protection by 10.
function voidDrTiers() {
  const base = parseFloat(bestiaryDraft.protection) || 0;
  return { base, tiers: [
    ['Normal', base + 30],
    ['Silver', base + 20],
    ['Masterwork', base + 10],
    ['Magicked', base],
    ['Magicked+5%', base - 10],
    ['Magicked+10%', base - 20],
    ['Magicked+15%', base - 30],
    ['Magicked+20%', base - 40],
    ['Magicked+25%', base - 50]
  ] };
}
function voidDrText() {
  const { base, tiers } = voidDrTiers();
  return 'Void Damage Reduction (Protection by weapon quality, ' + base + ' base vs Magicked, ±10 per tier): '
    + tiers.map(([label, val]) => `${label} ${val}`).join(' / ') + '.';
}
function showVoidDrModal() {
  if (!bestiaryDraft) { alert('No foe is currently open for editing.'); return; }
  const { tiers } = voidDrTiers();
  openModal(`
    <h3>Void Damage Reduction</h3>
    <div class="note" style="margin-bottom:10px">Protection by weapon quality, ±10 per tier, based on the Protection value above.</div>
    <table class="skill-table" style="margin-bottom:14px">
      <tbody>
        ${tiers.map(([label,val]) => `<tr><td>${label}</td><td class="skval-cell">${val}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="closeModal()">Close</button>
      <button class="btn btn-gold" onclick="applyVoidDrToNotes()">Insert into Notes</button>
    </div>
  `);
}
function applyVoidDrToNotes() {
  const text = voidDrText();
  bestiaryDraft.notes = bestiaryDraft.notes ? bestiaryDraft.notes.trim() + ' ' + text : text;
  closeModal();
  renderBestiaryEditor();
}

// Average damage per hit for the "dividing die" mechanic used throughout the
// wiki's Bestiary: roll damage dice, add a flat bonus, then divide by an
// INDEPENDENTLY rolled die (e.g. "((2d4+11)/D6)+0"). That division isn't a
// flat /6 -- the divisor is itself uniform over 1..N, so small rolls skew the
// average up. True expected value is E[numerator] * H(N)/N, where H(N) is
// the Nth harmonic number (sum of 1/k for k=1..N).
function harmonicAvgFactor(n) {
  n = Math.round(n);
  if (!n || n < 1) return 1;
  let sum = 0;
  for (let k = 1; k <= n; k++) sum += 1 / k;
  return sum / n;
}
// Averages a plain additive dice expression like "2d4+11" or "1d8+1d6+11".
// Returns null if any term can't be parsed (rather than guessing).
function avgDiceExprValue(expr) {
  if (!expr) return null;
  const terms = String(expr).replace(/\s+/g, '').split('+');
  let sum = 0;
  for (const term of terms) {
    if (!term) return null;
    const m = term.match(/^(\d+)[dD](\d+)$/);
    if (m) { sum += parseInt(m[1], 10) * (parseInt(m[2], 10) + 1) / 2; continue; }
    const n = parseFloat(term);
    if (isNaN(n)) return null;
    sum += n;
  }
  return sum;
}
// dividingDie: pass a number when it's known separately (a matched WEAPONS
// catalog entry, whose damage_dice is just the numerator). Otherwise pass
// null and this parses the full wiki notation "((expr)/dN)+flat" out of the
// raw text itself. Returns null if it can't confidently compute a number.
function computeAttackAvgDamage(damageDiceText, dividingDie) {
  const text = (damageDiceText || '').trim();
  if (!text) return null;
  if (dividingDie) {
    const avg = avgDiceExprValue(text);
    return avg == null ? null : avg * harmonicAvgFactor(dividingDie);
  }
  const m = text.match(/\(\(([^)]+)\)\s*\/\s*[dD](\d+)\)\s*\+?\s*(-?\d+(?:\.\d+)?)?/);
  if (!m) return null;
  const avg = avgDiceExprValue(m[1].trim());
  if (avg == null) return null;
  const trailFlat = m[3] ? parseFloat(m[3]) : 0;
  return avg * harmonicAvgFactor(parseInt(m[2], 10)) + trailFlat;
}
// Recomputes avg_damage from the primary (first) attack whenever attacks
// change -- if it can't be confidently parsed, leaves whatever's there
// (usually 0, or a value the GM entered by hand) rather than clobbering it.
function recomputeBestiaryAvgDamage() {
  const a = (bestiaryDraft.attacks || [])[0];
  if (!a) return;
  let result = null;
  if (a.weaponName) {
    const def = WEAPONS.find(w => w.name === a.weaponName);
    if (def && def.dividing_die) result = computeAttackAvgDamage(a.damageDice, def.dividing_die);
  }
  if (result == null) result = computeAttackAvgDamage(a.damageDice, null);
  if (result != null && isFinite(result)) bestiaryDraft.avg_damage = Math.round(result * 100) / 100;
}

function selectBestiaryArmor(name) {
  bestiaryDraft.armor_name = name || '';
  const def = ARMOR.find(a => a.name === name);
  if (def) { bestiaryDraft.avoidance = def.av; bestiaryDraft.protection = def.pr; }
  renderBestiaryEditor();
}
function selectBestiaryShield(name) {
  bestiaryDraft.shield_name = name || '';
  const def = SHIELDS.find(s => s.name === name);
  if (def) { bestiaryDraft.protection = (parseFloat(bestiaryDraft.protection) || 0) + def.pr; }
  renderBestiaryEditor();
}

function addBestiaryAttack() {
  bestiaryDraft.attacks = bestiaryDraft.attacks || [];
  bestiaryDraft.attacks.push({ name: '', weaponName: '', toHit: '', damageDice: '', speed: '' });
  recomputeBestiaryAvgDamage();
  fillBlankBestiaryToHits();
  renderBestiaryEditor();
}
function removeBestiaryAttack(idx) { bestiaryDraft.attacks.splice(idx, 1); recomputeBestiaryAvgDamage(); renderBestiaryEditor(); }
function updateBestiaryAttack(idx, field, value) { bestiaryDraft.attacks[idx][field] = value; recomputeBestiaryAvgDamage(); renderBestiaryEditor(); }
function selectBestiaryAttackWeapon(idx, name) {
  const a = bestiaryDraft.attacks[idx];
  a.weaponName = name || '';
  const def = WEAPONS.find(w => w.name === name);
  if (def) {
    a.damageDice = def.damage_dice || '';
    a.speed = def.speed_melee != null ? String(def.speed_melee) : '';
    if (!a.name) a.name = def.name;
  }
  recomputeBestiaryAvgDamage();
  fillBlankBestiaryToHits();
  renderBestiaryEditor();
}

function toggleBestiaryAbility(field, value, checked) {
  const arr = bestiaryDraft[field] || (bestiaryDraft[field] = []);
  const idx = arr.indexOf(value);
  if (checked && idx === -1) arr.push(value);
  if (!checked && idx !== -1) arr.splice(idx, 1);
  renderBestiaryEditor();
}

function addBestiaryItem() {
  bestiaryDraft.items = bestiaryDraft.items || [];
  bestiaryDraft.items.push({ name: '', qty: 1, worth: 0 });
  renderBestiaryEditor();
}
function removeBestiaryItem(idx) { bestiaryDraft.items.splice(idx, 1); renderBestiaryEditor(); }
function updateBestiaryItem(idx, field, value) {
  bestiaryDraft.items[idx][field] = (field === 'qty' || field === 'worth') ? (parseFloat(value) || 0) : value;
  renderBestiaryEditor();
}

function addBestiarySpell() {
  const sel = document.getElementById('bf-spell-add');
  const name = sel ? sel.value : '';
  if (!name) return;
  bestiaryDraft.spells = bestiaryDraft.spells || [];
  if (!bestiaryDraft.spells.includes(name)) bestiaryDraft.spells.push(name);
  renderBestiaryEditor();
}
function removeBestiarySpell(name) {
  bestiaryDraft.spells = (bestiaryDraft.spells || []).filter(s => s !== name);
  renderBestiaryEditor();
}

function bestiaryAbilityGroup(title, options, field) {
  const selected = bestiaryDraft[field] || [];
  return `<div class="form-group" style="flex:1;background:var(--input-bg);border:1px solid var(--border);padding:8px">
    <div style="font-size:11px;color:var(--gold);font-weight:bold;margin-bottom:4px">${title}</div>
    ${options.map(o => `<label style="display:flex;gap:5px;font-size:12px;margin-bottom:3px;align-items:center;cursor:pointer">
      <input type="checkbox" ${selected.includes(o)?'checked':''} onchange="toggleBestiaryAbility('${field}','${o.replace(/'/g,"\\'")}',this.checked)">${escapeHtml(o)}
    </label>`).join('')}
  </div>`;
}

function renderBestiaryEditor() {
  const d = bestiaryDraft;
  const xp = computeFoeXP(d);
  document.getElementById('main').innerHTML = `
  <div class="panel">
    <div class="panel-header" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="flex:1">
        <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Beastiary entry</div>
        <input value="${escapeHtml(d.name||'')}" placeholder="Foe name" style="font-family:'Cormorant Garamond','Georgia',serif;font-style:italic;font-weight:bold;font-size:22px;color:var(--header-text);border:1px solid transparent;width:100%;background:transparent" onchange="updateBestiaryField('name',this.value)">
      </div>
      <span class="type-badge" style="color:var(--red-b);border-color:var(--red-b)">GM only</span>
    </div>
    <div class="panel-body">
      <div class="form-row">
        <div class="form-group" style="flex:1"><label>Race / type</label>
          <input style="width:100%" value="${escapeHtml(d.race||'')}" placeholder="Goblin, Wight, Human bandit..." onchange="updateBestiaryField('race',this.value)">
        </div>
        <div class="form-group" style="flex:1"><label>Location</label>
          <input style="width:100%" value="${escapeHtml(d.location||'')}" placeholder="e.g. GA r3" onchange="updateBestiaryField('location',this.value)">
        </div>
        <div class="form-group" style="flex:1"><label>Prepped for group (optional)</label>
          <select onchange="updateBestiaryField('group_id', this.value || null)">
            <option value="">— none / reusable anywhere —</option>
            ${myGroups.map(g => `<option value="${g.id}" ${d.group_id===g.id?'selected':''}>${escapeHtml(g.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row" style="align-items:flex-end;margin-bottom:10px">
        <div class="form-group" style="flex:1"><label>Load base stats from a template</label>
          <select id="bf-race-template">
            <option value="">— pick a template —</option>
            <optgroup label="Wiki creatures">
              ${BESTIARY_RACE_TEMPLATES.map(t=>`<option value="wiki:${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('')}
            </optgroup>
            ${customBestiaryTemplates.length ? `<optgroup label="My templates">
              ${customBestiaryTemplates.map(t=>`<option value="custom:${t.id}">${escapeHtml(t.name)}</option>`).join('')}
            </optgroup>` : ''}
          </select>
        </div>
        <div class="form-group"><button class="btn btn-dim" onclick="loadBestiaryTemplate(document.getElementById('bf-race-template').value)">Load</button></div>
        <div class="form-group"><button class="btn btn-dim" style="color:var(--red-b)" onclick="deleteCustomBestiaryTemplate()">Delete selected</button></div>
      </div>
      <div class="note" style="margin-bottom:10px">"Wiki creatures" come from the current wiki Bestiary. "My templates" are ones you've saved yourself -- see the button below. Loading fills in stats -- still fully editable after. "Delete selected" only works on your own templates.</div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group"><button class="btn btn-dim" onclick="saveCurrentAsBestiaryTemplate()">Save current stats as a new template</button></div>
      </div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Core stats</div>
      <div class="form-row">
        <div class="form-group"><label>HP formula</label><input class="w150" value="${escapeHtml(d.hp_formula||'')}" onchange="updateBestiaryField('hp_formula',this.value)" placeholder="d6 + d4/plev"></div>
        <div class="form-group"><label>Avg HP</label><input type="number" class="w80" value="${d.avg_hp||0}" onchange="updateBestiaryNum('avg_hp',this.value)"></div>
        <div class="form-group"><label>Avoidance</label><input type="number" class="w80" value="${d.avoidance||0}" onchange="updateBestiaryNum('avoidance',this.value)"></div>
        <div class="form-group"><label>Protection</label><input type="number" class="w80" value="${d.protection||0}" onchange="updateBestiaryNum('protection',this.value)"></div>
        <div class="form-group"><label>Bmod</label><input type="number" class="w80" value="${d.bmod||0}" onchange="updateBestiaryNum('bmod',this.value)"></div>
        <div class="form-group"><label>Avg damage</label><input type="number" class="w80" value="${d.avg_damage||0}" onchange="updateBestiaryNum('avg_damage',this.value)"></div>
        <div class="form-group"><label>Multi</label><input type="number" class="w80" value="${d.multi||0}" onchange="updateBestiaryNum('multi',this.value)"></div>
        <div class="form-group"><label>Crit Bonus</label><input type="number" class="w80" value="${d.crit_bonus||0}" onchange="updateBestiaryNum('crit_bonus',this.value)"></div>
      </div>
      <div class="note" style="margin-bottom:10px">Bmod × Avg HP = ${Math.round((parseFloat(d.bmod)||0) * (parseFloat(d.avg_hp)||0) * 100) / 100} -- basic chance to hit.</div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group"><button class="btn btn-dim" onclick="showVoidDrModal()">⛓ Void DR continuum</button></div>
        <div class="note" style="flex:1;align-self:center">Shows the full Normal/Silver/Masterwork/Magicked/+5%/+10%/+15%/+20%/+25% Protection ladder (±10 per tier off the Protection value above) in a popup, with an option to insert it into Notes below.</div>
      </div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px">Hit points (this foe)</div>
      <div class="form-row" style="align-items:flex-end">
        <div class="form-group"><label>Level</label><input type="number" class="w80" value="${d.level||1}" onchange="updateBestiaryNum('level',this.value)"></div>
        <div class="form-group"><button class="btn btn-dim" onclick="rollBestiaryHpClick()">🎲 Roll HP</button></div>
        <div class="form-group"><label>Max HP</label><input type="number" class="w80" value="${d.max_hp!=null?d.max_hp:''}" onchange="updateBestiaryNum('max_hp',this.value)"></div>
        <div class="form-group"><label>Current HP</label><input type="number" class="w80" value="${d.current_hp!=null?d.current_hp:''}" onchange="updateBestiaryNum('current_hp',this.value)"></div>
      </div>
      <div class="note" style="margin-bottom:10px">Rolls from the HP formula above using Level (for level-capable foes, "d4 per former level" rolls an extra d4 for each level past 1st) -- separate from Avg HP, which is just the XP-calc baseline. Current HP is what actually drops as this foe takes damage; edit it directly during a fight.</div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px">CCs (Circumstance Checks)</div>
      <div class="form-row">
        <div class="form-group"><label>Fortitude</label><input type="number" class="w80" value="${d.cc_fortitude||0}" onchange="updateBestiaryNum('cc_fortitude',this.value)"></div>
        <div class="form-group"><label>Reflex</label><input type="number" class="w80" value="${d.cc_reflex||0}" onchange="updateBestiaryNum('cc_reflex',this.value)"></div>
        <div class="form-group"><label>Will</label><input type="number" class="w80" value="${d.cc_will||0}" onchange="updateBestiaryNum('cc_will',this.value)"></div>
        <div class="form-group"><label>Surprise</label><input type="number" class="w80" value="${d.cc_surprise||0}" onchange="updateBestiaryNum('cc_surprise',this.value)"></div>
        <div class="form-group"><label>Social</label><input type="number" class="w80" value="${d.cc_social||0}" onchange="updateBestiaryNum('cc_social',this.value)"></div>
      </div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px">Armor &amp; shield</div>
      <div class="form-row">
        <div class="form-group"><label>Armor</label>
          <select onchange="selectBestiaryArmor(this.value)">
            <option value="">— custom / none —</option>
            ${ARMOR.map(a=>`<option ${d.armor_name===a.name?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Shield</label>
          <select onchange="selectBestiaryShield(this.value)">
            <option value="">— none —</option>
            ${SHIELDS.map(s=>`<option ${d.shield_name===s.name?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="note">Picking an Armor/Shield pre-fills Avoidance/Protection above — still editable after, for a raggedy or masterwork copy.</div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px">Attacks</div>
      <table class="skill-table">
        <thead><tr><th>Name</th><th>Weapon</th><th>To-hit</th><th>Crit %</th><th>Fumble %</th><th>Damage dice</th><th>Speed</th><th></th></tr></thead>
        <tbody>
          ${(d.attacks||[]).map((a,i)=>{
            const cf = bestiaryCritFumble(a.toHit, d.crit_bonus);
            return `<tr>
            <td><input value="${escapeHtml(a.name||'')}" onchange="updateBestiaryAttack(${i},'name',this.value)"></td>
            <td><select onchange="selectBestiaryAttackWeapon(${i},this.value)">
              <option value="">— natural —</option>
              ${WEAPONS.map(w=>`<option ${a.weaponName===w.name?'selected':''}>${escapeHtml(w.name)}</option>`).join('')}
            </select></td>
            <td><input value="${escapeHtml(a.toHit||'')}" onchange="updateBestiaryAttack(${i},'toHit',this.value)" class="w60"></td>
            <td class="note">${fmtCrit(cf.critChance)}</td>
            <td class="note">${fmtFumble(cf.fumbleThreshold)}</td>
            <td><input value="${escapeHtml(a.damageDice||'')}" onchange="updateBestiaryAttack(${i},'damageDice',this.value)"></td>
            <td><input value="${escapeHtml(a.speed||'')}" onchange="updateBestiaryAttack(${i},'speed',this.value)" class="w60"></td>
            <td style="text-align:center;color:var(--red-b);cursor:pointer" onclick="removeBestiaryAttack(${i})">✕</td>
          </tr>`;
          }).join('')}
          ${(d.attacks||[]).length===0 ? '<tr><td colspan="8" class="note" style="padding:8px 0">No attacks yet.</td></tr>' : ''}
        </tbody>
      </table>
      <button class="btn btn-dim" onclick="addBestiaryAttack()">+ Add attack</button>
      <div class="note" style="margin-top:6px">To-Hit defaults to Bmod × Max HP once both are set -- only fills a blank To-Hit, so per-attack overrides you type stick even after re-rolling HP or changing Bmod.</div>
      <div class="note" style="margin-top:2px">Crit %/Fumble % are computed the same way as a character weapon's: 7 + To-hit÷10 + .10×Crit Bonus (capped at half To-hit, floor 3); Fumble is 93-up unless To-hit itself is higher.</div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px">Abilities</div>
      <div class="form-row" style="align-items:flex-start">
        ${bestiaryAbilityGroup('Bonus (+1.5×HP each)', BESTIARY_BONUS_ABILITIES, 'bonus_abilities')}
        ${bestiaryAbilityGroup('Special (+6.25×HP each)', BESTIARY_SPECIAL_ABILITIES, 'special_abilities')}
        ${bestiaryAbilityGroup('Exceptional (+10×HP each)', BESTIARY_EXCEPTIONAL_ABILITIES, 'exceptional_abilities')}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--header-bg);color:var(--header-text);padding:12px 16px;margin:16px 0">
        <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px">XP value</div>
        <div style="font-size:26px;font-weight:bold;color:var(--gold-dim)">${Math.round(xp*10)/10}</div>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:1"><label>Level capable?</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px"><input type="checkbox" ${d.level_capable?'checked':''} onchange="updateBestiaryField('level_capable',this.checked)">Individuals can vary in level</label>
        </div>
        <div class="form-group" style="flex:2"><label>Possible classes (comma separated)</label>
          <input style="width:100%" value="${escapeHtml((d.possible_classes||[]).join(', '))}" onchange="updateBestiaryField('possible_classes', this.value.split(',').map(s=>s.trim()).filter(Boolean))">
        </div>
      </div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px">Items carried</div>
      <table class="item-table">
        <thead><tr><th>Name</th><th>Qty</th><th>Worth</th><th></th></tr></thead>
        <tbody>
          ${(d.items||[]).map((it,i)=>`<tr>
            <td><input value="${escapeHtml(it.name||'')}" onchange="updateBestiaryItem(${i},'name',this.value)"></td>
            <td class="item-qty"><input type="number" value="${it.qty||1}" onchange="updateBestiaryItem(${i},'qty',this.value)"></td>
            <td class="item-qty"><input type="number" value="${it.worth||0}" onchange="updateBestiaryItem(${i},'worth',this.value)"></td>
            <td class="item-del" onclick="removeBestiaryItem(${i})">✕</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <button class="btn btn-dim" onclick="addBestiaryItem()">+ Add item</button>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px">Spells known</div>
      ${(d.spells||[]).length ? `<div style="margin-bottom:6px">${d.spells.map(s=>`<span class="type-badge" style="cursor:pointer;margin:0 4px 4px 0" onclick="removeBestiarySpell('${s.replace(/'/g,"\\'")}')" title="Click to remove">${escapeHtml(s)} ✕</span>`).join('')}</div>` : '<div class="note" style="margin-bottom:6px">None yet.</div>'}
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <select id="bf-spell-add">
            <option value="">— add a spell —</option>
            ${SPELLS.map(s=>`<option>${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><button class="btn btn-dim" onclick="addBestiarySpell()">+ Add</button></div>
      </div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px">Notes</div>
      <textarea id="bf-notes-textarea" style="width:100%;min-height:70px" onchange="updateBestiaryField('notes',this.value)" placeholder="Racial traits, darksight, description...">${escapeHtml(d.notes||'')}</textarea>

      <div class="modal-actions" style="margin-top:14px">
        ${bestiaryEditingId !== 'new' ? `<button class="btn btn-red" onclick="deleteBestiaryEntry('${bestiaryEditingId}')">Delete</button><button class="btn btn-dim" onclick="duplicateBestiaryEntry('${bestiaryEditingId}')">Duplicate</button>` : ''}
        <button class="btn btn-dim" onclick="closeBestiaryEditor()">Cancel</button>
        <button class="btn btn-gold" onclick="saveBestiaryEntry()">Save</button>
      </div>
    </div>
  </div>`;
}

async function saveBestiaryEntry() {
  if (!bestiaryDraft.name || !bestiaryDraft.name.trim()) { alert('Name is required.'); return; }
  const row = {
    group_id: bestiaryDraft.group_id || null,
    name: bestiaryDraft.name.trim(),
    race: bestiaryDraft.race || null,
    location: bestiaryDraft.location || null,
    hp_formula: bestiaryDraft.hp_formula || null,
    avg_hp: bestiaryDraft.avg_hp || 0,
    armor_name: bestiaryDraft.armor_name || null,
    shield_name: bestiaryDraft.shield_name || null,
    avoidance: bestiaryDraft.avoidance || 0,
    protection: bestiaryDraft.protection || 0,
    bmod: bestiaryDraft.bmod || 0,
    avg_damage: bestiaryDraft.avg_damage || 0,
    multi: bestiaryDraft.multi || 0,
    crit_bonus: bestiaryDraft.crit_bonus || 0,
    level: bestiaryDraft.level || 1,
    max_hp: bestiaryDraft.max_hp != null ? bestiaryDraft.max_hp : null,
    current_hp: bestiaryDraft.current_hp != null ? bestiaryDraft.current_hp : null,
    cc_fortitude: bestiaryDraft.cc_fortitude || null,
    cc_reflex: bestiaryDraft.cc_reflex || null,
    cc_will: bestiaryDraft.cc_will || null,
    cc_surprise: bestiaryDraft.cc_surprise || null,
    cc_social: bestiaryDraft.cc_social || null,
    bonus_abilities: bestiaryDraft.bonus_abilities || [],
    special_abilities: bestiaryDraft.special_abilities || [],
    exceptional_abilities: bestiaryDraft.exceptional_abilities || [],
    attacks: bestiaryDraft.attacks || [],
    level_capable: !!bestiaryDraft.level_capable,
    possible_classes: bestiaryDraft.possible_classes || [],
    items: bestiaryDraft.items || [],
    spells: bestiaryDraft.spells || [],
    notes: bestiaryDraft.notes || null,
    is_temp_pc: !!bestiaryDraft.is_temp_pc
  };
  let error;
  if (bestiaryEditingId === 'new') {
    ({ error } = await sb.from('bestiary_entries').insert({ ...row, created_by: currentUser.id }));
  } else {
    ({ error } = await sb.from('bestiary_entries').update(row).eq('id', bestiaryEditingId));
  }
  if (error) { alert('Failed to save: ' + error.message); return; }
  bestiaryEditingId = null;
  bestiaryDraft = null;
  if (bestiaryReturnToGroup) {
    bestiaryReturnToGroup = false;
    state.activeView = 'group';
    renderGroupModule();
    return;
  }
  renderBestiaryModule();
}

async function duplicateBestiaryEntry(id) {
  const e = bestiaryCache.find(x => x.id === id);
  if (!e) return;
  const row = { ...e };
  delete row.id;
  delete row.created_at;
  delete row.updated_at;
  if ('archived' in row) row.archived = false;
  row.created_by = currentUser.id;
  row.name = row.name + ' (copy)';
  const { error } = await sb.from('bestiary_entries').insert(row);
  if (error) { alert('Failed to duplicate: ' + error.message); return; }
  renderBestiaryModule();
}

async function deleteBestiaryEntry(id) {
  if (!confirm('Delete this bestiary entry? This cannot be undone.')) return;
  const { error } = await sb.from('bestiary_entries').delete().eq('id', id);
  if (error) { alert('Failed to delete: ' + error.message); return; }
  if (bestiaryEditingId === id) { bestiaryEditingId = null; bestiaryDraft = null; }
  renderBestiaryModule();
}
