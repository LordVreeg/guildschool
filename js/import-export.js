// ============================================================
// IMPORT / EXPORT
// ============================================================
function printCharacterSheet() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  document.getElementById('print-view').innerHTML = buildCharacterSheetHtml(char);
  window.print();
}

function buildCharacterSheetHtml(char) {
  const a = char.attrs || {};
  const cc = computeCC(char);
  const w = computeWeight(char);
  const sp = computeSpeed(char);
  const hp = computeHP(char);
  const armor = computeArmor(char);
  const skills = char.skills || [];
  const items = char.items || [];
  const spellPools = computeSpellPools(char);
  const spellbook = char.spellbook || [];
  const totalXP = skills.reduce((sum, si) => sum + (parseFloat(si.rawXP) || 0), 0);

  const skillRows = skills.map(si => {
    const def = findSkillDef(si.skillName);
    const vals = computeSkillValues(si, char, skills);
    return `<tr><td>${def ? def.type : ''}</td><td>${si.skillName}${si.binding ? ' ('+si.binding+')' : ''}</td><td>${si.dropdownOnly ? 'Dropdown' : 'Trained'}</td><td>${vals.level}</td><td>${vals.skval}</td></tr>`;
  }).join('');

  const itemRows = items.map(it => `<tr style="${it.masterwork?'font-style:italic':''}"><td>${it.name||''}</td><td>${it.type||''}</td><td>${it.qty||1}</td><td>${it.weight||0}</td><td>${it.worth||0}</td><td>${it.location||'Carried'}</td></tr>`).join('');

  const weaponPanels = allCombatWeapons(char).map(it => {
    const wv = computeWeapon(char, it);
    return `<h2>${it.name} ${it.weaponModel ? '— '+it.weaponModel : ''}</h2>
      <div class="pv-item"><b>Damage</b>${it.damageDice||'—'} / ${it.dividingDie||'—'}</div>
      <table><tr><th></th><th>To-Hit</th><th>Dmg Bonus</th><th>Speed</th><th>Parry</th><th>Parry Used</th><th>Multi Atk</th><th>Crit %</th><th>Fumble %</th></tr>
      ${wv.oneHand ? `<tr><td>1H</td><td>${Math.round(wv.oneHand.hit)}</td><td>${Math.round(wv.oneHand.dmgBonus)}</td><td>${Math.round(wv.oneHand.speed)}</td><td>${wv.parrySkval}</td><td>${wv.parryPointsUsed}</td><td>${wv.multipleAttackSkval}</td><td>${fmtCrit(wv.oneHand.critChance)}</td><td>${fmtFumble(wv.oneHand.fumbleThreshold)}</td></tr>` : ''}
      ${wv.twoHand ? `<tr><td>2H</td><td>${Math.round(wv.twoHand.hit)}</td><td>${Math.round(wv.twoHand.dmgBonus)}</td><td>${Math.round(wv.twoHand.speed)}</td><td>${wv.parrySkval}</td><td>${wv.parryPointsUsed}</td><td>${wv.multipleAttackSkval}</td><td>${fmtCrit(wv.twoHand.critChance)}</td><td>${fmtFumble(wv.twoHand.fumbleThreshold)}</td></tr>` : ''}
      </table>`;
  }).join('');

  const spellPoolRows = spellPools.map(p => `<tr><td>${p.name}</td><td>${p.maxSP}</td><td>${p.currentSP}</td><td>${p.usedSP}</td></tr>`).join('');
  const spellbookRows = spellbook.map(s => `<tr><td>${s.name||''}</td><td>${s.school||''}</td><td>${s.cost||0}</td></tr>`).join('');

  const html = `
    <h1>${char.name} ${char.isNPC ? '(NPC)' : ''}</h1>
    <div class="pv-row">
      <div class="pv-item"><b>Race</b>${char.race||'—'} ${char.subrace||''}</div>
      <div class="pv-item"><b>Guild</b>${char.guild||'—'}</div>
      <div class="pv-item"><b>Total Raw XP</b>${totalXP.toLocaleString()}</div>
      <div class="pv-item"><b>Age</b>${char.age||'—'}</div>
      <div class="pv-item"><b>Max Age</b>${char.maxAge||'—'}</div>
      <div class="pv-item"><b>Height</b>${char.height||'—'}</div>
      <div class="pv-item"><b>Gender</b>${char.gender||'—'}</div>
      <div class="pv-item"><b>Weight</b>${char.bodyWeight||'—'}</div>
      <div class="pv-item"><b>Darksight</b>${char.darksight||'—'}</div>
      <div class="pv-item"><b>Locale</b>${char.locale||'—'}</div>
      <div class="pv-item"><b>Group</b>${(myGroups.find(g=>g.id===char.playGroupId)||{}).name||'—'}</div>
      <div class="pv-item"><b>Starting Social Tier</b>${char.socialNumber!==undefined?char.socialNumber:'—'}</div>
      <div class="pv-item"><b>Current Social Tier</b>${char.currentSocialNumber!==undefined&&char.currentSocialNumber!==null?char.currentSocialNumber:'—'}</div>
    </div>
    ${char.appearanceNotes ? `<h2>Appearance</h2><div class="pv-item">${char.appearanceNotes}</div>` : ''}
    ${char.personalNotes ? `<h2>Personal Notes</h2><div class="pv-item">${char.personalNotes}</div>` : ''}
    <h2>Attributes</h2>
    <div class="pv-row">
      ${['ST','IN','WI','CD','HE','CH','AP'].map(k=>`<div class="pv-item"><b>${k}</b>${a[k]||'—'}</div>`).join('')}
    </div>
    <h2>Circumstance Checks</h2>
    <div class="pv-row">
      ${Object.entries(cc).map(([k,v])=>`<div class="pv-item"><b>${k}</b>${v.value}</div>`).join('')}
    </div>
    <h2>Hit Points ${hp.system==='collegium' ? '(Collegium)' : '(Standard)'}</h2>
    <div class="pv-row">
      ${hp.system==='collegium' ? `
        <div class="pv-item"><b>Physical</b>${hp.physicalCurrent} / ${hp.physicalMax}</div>
        <div class="pv-item"><b>Endurance</b>${hp.enduranceCurrent} / ${hp.enduranceMax}</div>
      ` : `<div class="pv-item"><b>HP</b>${hp.currentHP} / ${hp.totalHP}</div>`}
      <div class="pv-item"><b>Weight</b>${w.carried} / ${w.possible}</div>
      <div class="pv-item"><b>Base Speed</b>${Math.round(sp.baseSpeed)} ft/s</div>
      <div class="pv-item"><b>Adjusted Speed</b>${Math.round(sp.adjustedSpeed)} ft/s</div>
      <div class="pv-item"><b>Dash/Rout Speed</b>${Math.round(sp.dashRoutSpeed)} ft/s</div>
      <div class="pv-item"><b>Dash/Rout Max Distance</b>${Math.round(sp.dashRoutMaxDistance)} yds</div>
    </div>
    <h2>Combat — AV / PR</h2>
    <div class="pv-row">
      <div class="pv-item"><b>AV (Shield)</b>${Math.round(armor.withShield.totalAV)}</div>
      <div class="pv-item"><b>PR (Shield)</b>${Math.round(armor.withShield.totalPR)}</div>
      <div class="pv-item"><b>AV (No Shield/2H)</b>${Math.round(armor.withoutShield.totalAV)}</div>
      <div class="pv-item"><b>PR (No Shield/2H)</b>${Math.round(armor.withoutShield.totalPR)}</div>
    </div>
    ${weaponPanels}
    <h2>Skills</h2>
    <table><tr><th>Type</th><th>Skill</th><th>Status</th><th>Level</th><th>Skval</th></tr>${skillRows}</table>
    ${spellPools.length ? `<h2>Spell Points</h2><table><tr><th>Pool</th><th>Max</th><th>Current</th><th>Used</th></tr>${spellPoolRows}</table>` : ''}
    ${spellbook.length ? `<h2>Spellbook</h2><table><tr><th>Spell</th><th>School</th><th>Cost</th></tr>${spellbookRows}</table>` : ''}
    <h2>Weapons, Armor & Items</h2>
    <table><tr><th>Item</th><th>Type</th><th>Qty</th><th>Weight</th><th>Worth</th><th>Location</th></tr>${itemRows}</table>
    ${char.itemNotes ? `<h2>Item Notes</h2><div class="pv-item">${char.itemNotes}</div>` : ''}
    ${char.historyNotes ? `<h2>History</h2><div class="pv-item">${char.historyNotes}</div>` : ''}
    ${char.relationshipNotes ? `<h2>Relationships</h2><div class="pv-item">${char.relationshipNotes}</div>` : ''}
  `;

  return html;
}

function addCustomSkill() {
  const name = document.getElementById('ns-name').value.trim();
  if (!name) { alert('Skill name is required.'); return; }
  if (findSkillDef(name)) { alert('A skill with this name already exists.'); return; }
  const skill = {
    type: document.getElementById('ns-type').value,
    name,
    base_xp: null,
    attmod: document.getElementById('ns-attmod').value.trim(),
    base: parseFloat(document.getElementById('ns-base').value) || 0,
    per_level: document.getElementById('ns-perlevel').value.trim(),
    commonality: parseInt(document.getElementById('ns-comm').value) || 1,
    parent: document.getElementById('ns-parent').value.trim(),
    subskills: '',
    dropdown: document.getElementById('ns-dropdown').value ? parseFloat(document.getElementById('ns-dropdown').value) : null,
    templated: false,
  };
  SKILLS.push(skill);
  const custom = loadCustomData();
  custom.customSkills.push(skill);
  saveCustomData(custom);
  renderUtilitiesModule();
  alert(`"${name}" added to the master skill list.`);
}

function removeCustomSkill(idx) {
  if (!confirm('Remove this custom skill? Characters already using it will keep it, but new lookups will fail.')) return;
  const custom = loadCustomData();
  const skill = custom.customSkills[idx];
  custom.customSkills.splice(idx, 1);
  saveCustomData(custom);
  const i = SKILLS.indexOf(findSkillDef(skill.name));
  if (i >= 0) SKILLS.splice(i, 1);
  renderUtilitiesModule();
}

function addCustomGuildBonus() {
  const existingGuild = document.getElementById('ge-guild').value;
  const newGuild = document.getElementById('ge-newguild').value.trim();
  const guildName = newGuild || existingGuild;
  const skillName = document.getElementById('ge-skill').value.trim();
  const bxp = parseFloat(document.getElementById('ge-bxp').value);
  if (!guildName) { alert('Pick or name a guild.'); return; }
  if (!skillName) { alert('Skill name is required.'); return; }
  if (isNaN(bxp)) { alert('EXPMOD value is required.'); return; }
  if (!findSkillDef(skillName)) {
    if (!confirm(`"${skillName}" isn't in the master skill list yet. Set the EXPMOD anyway?`)) return;
  }
  if (!GUILDS[guildName]) GUILDS[guildName] = {};
  GUILDS[guildName][skillName] = bxp;
  const custom = loadCustomData();
  if (!custom.customGuildBonuses[guildName]) custom.customGuildBonuses[guildName] = {};
  custom.customGuildBonuses[guildName][skillName] = bxp;
  saveCustomData(custom);
  renderUtilitiesModule();
  alert(`${guildName} — ${skillName}: ${bxp} saved.`);
}

function removeCustomGuildBonus(guildName, skillName) {
  if (!confirm('Remove this guild EXPMOD entry?')) return;
  const custom = loadCustomData();
  if (custom.customGuildBonuses[guildName]) {
    delete custom.customGuildBonuses[guildName][skillName];
    if (Object.keys(custom.customGuildBonuses[guildName]).length === 0) delete custom.customGuildBonuses[guildName];
  }
  saveCustomData(custom);
  if (GUILDS[guildName]) delete GUILDS[guildName][skillName];
  renderUtilitiesModule();
}

function exportCustomData() {
  const custom = loadCustomData();
  const blob = new Blob([JSON.stringify(custom, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'guildschool_custom_data.json';
  a.click();
}

// Both importers read the file, check it, and show what they found in a
// report before anything changes; nothing is imported until "Import".
function pickJsonFile(onParsed) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = e => {
    const file = e.target.files[0];
    document.body.removeChild(input);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      let parsed;
      try { parsed = JSON.parse(ev.target.result); } catch (err) { alert('Could not read this file as valid JSON: ' + err.message); return; }
      onParsed(parsed, file.name);
    };
    reader.readAsText(file);
  };
  input.click();
}

// One report section: a heading with a count, and the entries (collapsed when long).
function importReportSection(title, entries, tone) {
  if (!entries.length) return '';
  const color = tone === 'bad' ? 'color:#c05050' : tone === 'warn' ? 'color:var(--gold-dim)' : '';
  const list = `<ul style="margin:4px 0 0 18px">${entries.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
  return `<div style="margin-top:8px"><div style="${color}"><b>${escapeHtml(title)}</b> (${entries.length})</div>${entries.length > 8 ? `<details><summary style="cursor:pointer">Show all</summary>${list}</details>` : list}</div>`;
}

function showImportReport(title, summary, sectionsHtml, canImport, onImport) {
  openModal(`
    <h3>${escapeHtml(title)}</h3>
    <div>${summary}</div>
    ${sectionsHtml || '<div class="note" style="margin-top:8px">No problems found.</div>'}
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="pendingImport=null;closeModal()">Cancel</button>
      <button class="btn btn-gold" ${canImport ? '' : 'disabled'} onclick="${onImport}">Import</button>
    </div>`, { wide: true });
}
let pendingImport = null;

// Utilities > Import Custom Data. Checks the file first: custom skills that
// already exist (catalog or custom, ignoring case) are skipped instead of
// duplicated, malformed skills and non-numeric guild EXPMODs are left out,
// and EXPMODs for skills that aren't in the catalog are flagged.
function importCustomData() {
  pickJsonFile(imported => {
    const r = checkCustomImport(imported);
    if (r.fatal) { alert(r.fatal); return; }
    pendingImport = r;
    const summary = `${r.skills.length} custom skill${r.skills.length === 1 ? '' : 's'} and ${r.rateCount} guild EXPMOD${r.rateCount === 1 ? '' : 's'} to import.`;
    showImportReport('Import Custom Data', summary,
      importReportSection('Left out (malformed)', r.malformed, 'bad') +
      importReportSection('Skills skipped (already exist)', r.duplicates, 'warn') +
      importReportSection('Guild EXPMODs for skills not in the catalog', r.unknownRateSkills, 'warn') +
      importReportSection('New guilds', r.newGuilds, '') +
      importReportSection('New custom skills', r.skills.map(sk => `${sk.name} (${sk.type})`), ''),
      r.skills.length + r.rateCount > 0, 'confirmCustomImport()');
  });
}

function checkCustomImport(imported) {
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) return { fatal: 'This file isn\'t GuildSchool custom data.' };
  const r = { skills: [], rates: {}, rateCount: 0, malformed: [], duplicates: [], unknownRateSkills: [], newGuilds: [] };
  const seen = new Set();
  if (imported.customSkills !== undefined && !Array.isArray(imported.customSkills)) r.malformed.push('customSkills isn\'t a list');
  for (const [i, sk] of (Array.isArray(imported.customSkills) ? imported.customSkills : []).entries()) {
    if (!sk || typeof sk !== 'object' || typeof sk.name !== 'string' || !sk.name.trim() || typeof sk.type !== 'string' || !sk.type.trim()) { r.malformed.push(`custom skill #${i + 1}: needs a name and a type`); continue; }
    const key = normalizeSkillName(sk.name);
    if (findSkillDef(sk.name) || seen.has(key)) { r.duplicates.push(sk.name); continue; }
    seen.add(key);
    r.skills.push(sk);
  }
  const bonuses = imported.customGuildBonuses;
  if (bonuses !== undefined && (!bonuses || typeof bonuses !== 'object' || Array.isArray(bonuses))) r.malformed.push('customGuildBonuses isn\'t a guild → skill → EXPMOD table');
  else for (const [guild, rates] of Object.entries(bonuses || {})) {
    if (!rates || typeof rates !== 'object' || Array.isArray(rates)) { r.malformed.push(`${guild}: not a skill → EXPMOD table`); continue; }
    for (const [skill, v] of Object.entries(rates)) {
      const num = typeof v === 'number' ? v : parseFloat(v);
      if (!isFinite(num)) { r.malformed.push(`${guild} / ${skill}: EXPMOD "${v}" isn't a number`); continue; }
      if (!findSkillDef(skill) && !seen.has(normalizeSkillName(skill))) r.unknownRateSkills.push(`${guild} / ${skill}`);
      (r.rates[guild] = r.rates[guild] || {})[skill] = num;
      r.rateCount++;
    }
    if (r.rates[guild] && !GUILDS[guild]) r.newGuilds.push(guild);
  }
  return r;
}

function confirmCustomImport() {
  const r = pendingImport;
  if (!r || !r.rates) return;
  pendingImport = null;
  const custom = loadCustomData();
  custom.customSkills.push(...r.skills);
  for (const g in r.rates) {
    if (!custom.customGuildBonuses[g]) custom.customGuildBonuses[g] = {};
    Object.assign(custom.customGuildBonuses[g], r.rates[g]);
  }
  saveCustomData(custom);
  applyCustomData();
  closeModal();
  renderUtilitiesModule();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'guildschool_characters.json';
  a.click();
}

// Import JSON (characters). Checks every character before importing:
// characters that would overwrite one already here (same id), skill names
// that only differ from the catalog by case (renamed to the catalog's
// spelling), skills not in the catalog (kept, but flagged), and malformed
// entries (left out).
function importData() {
  pickJsonFile(imported => {
    const r = checkCharacterImport(imported);
    if (r.fatal) { alert(r.fatal); return; }
    pendingImport = r;
    const n = Object.keys(r.chars).length;
    const summary = `${n} character${n === 1 ? '' : 's'} to import: ${r.added.length} new, ${r.overwrites.length} replacing one already here.`;
    showImportReport('Import Characters', summary,
      importReportSection('Will REPLACE the character already here', r.overwrites, 'bad') +
      importReportSection('Not imported (malformed)', r.skipped, 'bad') +
      importReportSection('Entries left out (malformed)', r.malformed, 'bad') +
      importReportSection('Skills not in the skill catalog (kept, but their values can\'t be calculated)', r.unknownSkills, 'warn') +
      importReportSection('Skill names fixed to the catalog\'s spelling', r.caseFixes, '') +
      importReportSection('New characters', r.added, ''),
      n > 0, 'confirmCharacterImport()');
  });
}

function checkCharacterImport(imported) {
  if (!imported || typeof imported !== 'object' || !imported.characters || typeof imported.characters !== 'object' || Array.isArray(imported.characters)) {
    return { fatal: 'This file doesn\'t contain any character data (no "characters" object). Make sure you selected a GuildSchool character export.' };
  }
  const r = { chars: {}, added: [], overwrites: [], skipped: [], malformed: [], unknownSkills: [], caseFixes: [] };
  for (const [id, c] of Object.entries(imported.characters)) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) { r.skipped.push(`${id}: not a character record`); continue; }
    const ch = JSON.parse(JSON.stringify(c));
    const who = ch.name || '(unnamed)';
    if (ch.skills !== undefined && !Array.isArray(ch.skills)) { r.malformed.push(`${who}: skills isn't a list, imported with no skills`); ch.skills = []; }
    ch.skills = (ch.skills || []).filter((si, i) => {
      if (!si || typeof si !== 'object' || typeof si.skillName !== 'string' || !si.skillName.trim()) { r.malformed.push(`${who}: skill #${i + 1} has no skill name`); return false; }
      const def = findSkillDef(si.skillName);
      if (!def) r.unknownSkills.push(`${who}: ${si.skillName}`);
      else if (def.name !== si.skillName) { r.caseFixes.push(`${who}: "${si.skillName}" → "${def.name}"`); si.skillName = def.name; }
      return true;
    });
    if (ch.items !== undefined && !Array.isArray(ch.items)) { r.malformed.push(`${who}: items isn't a list, imported with no items`); ch.items = []; }
    if (Array.isArray(ch.items)) ch.items = ch.items.filter((it, i) => { if (it && typeof it === 'object') return true; r.malformed.push(`${who}: item #${i + 1} isn't an item`); return false; });
    if (state.characters[id]) r.overwrites.push(`${who}${state.characters[id].name && state.characters[id].name !== who ? ` (replaces "${state.characters[id].name}")` : ''}`);
    else r.added.push(who);
    r.chars[id] = ch;
  }
  return r;
}

function confirmCharacterImport() {
  const r = pendingImport;
  if (!r || !r.chars) return;
  pendingImport = null;
  Object.assign(state.characters, r.chars);
  saveState();
  closeModal();
  renderApp();
}
