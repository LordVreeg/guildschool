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
    const def = SKILLS.find(s => s.name === si.skillName);
    const vals = computeSkillValues(si, char, skills);
    return `<tr><td>${def ? def.type : ''}</td><td>${si.skillName}${si.binding ? ' ('+si.binding+')' : ''}</td><td>${si.dropdownOnly ? 'Dropdown' : 'Trained'}</td><td>${vals.level}</td><td>${vals.skval}</td></tr>`;
  }).join('');

  const itemRows = items.map(it => `<tr style="${it.masterwork?'font-style:italic':''}"><td>${it.name||''}</td><td>${it.type||''}</td><td>${it.qty||1}</td><td>${it.weight||0}</td><td>${it.worth||0}</td><td>${it.location||'Carried'}</td></tr>`).join('');

  const weaponPanels = items.filter(it => it.type === 'Weapon').concat(handFootWeapon(char) ? [handFootWeapon(char)] : []).map(it => {
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
  if (SKILLS.find(s => s.name === name)) { alert('A skill with this name already exists.'); return; }
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
  const i = SKILLS.findIndex(s => s.name === skill.name);
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
  if (!SKILLS.find(s => s.name === skillName)) {
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

function importCustomData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) { document.body.removeChild(input); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        const custom = loadCustomData();
        if (imported.customSkills) custom.customSkills.push(...imported.customSkills);
        if (imported.customGuildBonuses) {
          for (const g in imported.customGuildBonuses) {
            if (!custom.customGuildBonuses[g]) custom.customGuildBonuses[g] = {};
            Object.assign(custom.customGuildBonuses[g], imported.customGuildBonuses[g]);
          }
        }
        saveCustomData(custom);
        applyCustomData();
        renderUtilitiesModule();
        alert('Custom data imported.');
      } catch(err) {
        alert('Could not read this file: ' + err.message);
      }
      document.body.removeChild(input);
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'guildschool_characters.json';
  a.click();
  dirtySinceExport = false;
  localStorage.setItem('gs_last_export', new Date().toISOString());
  updateExportIndicator();
}

function updateExportIndicator() {
  const el = document.getElementById('export-indicator');
  if (!el) return;
  const last = localStorage.getItem('gs_last_export');
  if (!last) {
    el.textContent = dirtySinceExport ? 'Never exported' : '';
    el.style.color = dirtySinceExport ? '#c05050' : 'var(--text-dim)';
    return;
  }
  const d = new Date(last);
  const label = d.toLocaleString();
  if (dirtySinceExport) {
    el.textContent = `Unsaved changes since ${label}`;
    el.style.color = '#c05050';
  } else {
    el.textContent = `Exported ${label}`;
    el.style.color = 'var(--text-dim)';
  }
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) { document.body.removeChild(input); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported.characters && Object.keys(imported.characters).length > 0) {
          const count = Object.keys(imported.characters).length;
          Object.assign(state.characters, imported.characters);
          saveState();
          renderApp();
          alert(`Import successful: ${count} character(s) loaded.`);
        } else {
          alert('This file doesn\'t contain any character data (no "characters" key found). Make sure you selected the right export file.');
        }
      } catch(err) {
        alert('Could not read this file as valid JSON: ' + err.message);
      }
      document.body.removeChild(input);
    };
    reader.readAsText(file);
  };
  input.click();
}
