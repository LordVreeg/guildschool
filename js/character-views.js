function showSkillModule(skillId) {
  state.activeSkillId = skillId;
  state.activeView = 'skill';
  focusSkillInSidebar(skillId);
  renderSidebar();
  renderSkillModule(skillId);
}

function renderOverview() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const skills = char.skills || [];
  const byType = {};
  for (const si of skills) {
    const def = findSkillDef(si.skillName);
    const type = def ? def.type : UNKNOWN_SKILL_TYPE;
    if (!byType[type]) byType[type] = [];
    byType[type].push(si);
  }
  for (const type in byType) byType[type] = sortSkillsForDisplay(type, byType[type]);
  const typeOrder = SKILL_TYPE_ORDER;
  const sortedTypes = typeOrder.filter(t => byType[t]).concat(Object.keys(byType).filter(t => !typeOrder.includes(t)));

  let totalXP = 0;
  for (const si of skills) totalXP += parseFloat(si.rawXP) || 0;

  // Each section is { key, header, body }; they render in the character's
  // saved order, each collapsible and movable (see overviewSectionsHtml).
  const sections = [];
  sections.push({ key: 'summary', header: `<h2 style="font-family:'Cormorant Garamond','Georgia',serif;font-style:italic;font-weight:bold">${char.name}</h2>${char.nickname ? `<span class="type-badge" style="font-style:italic">"${char.nickname}"</span>` : ''}${char.isNPC ? '<span class="type-badge" style="color:var(--gold)">NPC</span>' : ''}<span class="type-badge">${char.race || ''} ${char.subrace || ''}</span><span class="type-badge">${char.guild || ''}</span>`, body: `
      ${mainGuildBannerHtml(char, false)}
      <div class="form-row" style="margin-bottom:4px">
        ${['ST','IN','WI','CD','HE','CH','AP'].map(a=>`<div class="computed-item"><span class="ci-label">${a}</span><span class="ci-value">${(char.attrs||{})[a]||'—'}</span></div>`).join('')}
        <div class="computed-item" style="margin-left:auto"><span class="ci-label">Total Raw XP</span><span class="ci-value">${totalXP.toLocaleString()}</span></div>
        ${char.unspentInitialExp > 0 ? `<div class="computed-item"><span class="ci-label">Unspent Initial Raw XP</span><span class="ci-value" style="color:var(--gold)">${char.unspentInitialExp.toLocaleString()}</span></div>` : ''}
      </div>
  `});

  for (const type of sortedTypes) {
    let html = `<table class="skill-table"><thead><tr><th>Skill</th><th>Sub of</th><th>Guild</th><th>EXPMOD</th><th>Raw XP</th><th>Adj XP</th><th>Level</th><th>Attrib</th><th>Rolls</th><th>Dropdown</th><th>Skval</th></tr></thead><tbody>`;
    for (const si of byType[type]) {
      const vals = computeSkillValues(si, char, char.skills || []);
      const rowCls = si.dropdownOnly ? 'dropdown-row' : '';
      const def = findSkillDef(si.skillName);
      const subOf = def && def.templated ? (si.binding || '—') : (def && def.parent ? def.parent : 'None');
      html += `<tr class="${rowCls}" onclick="showSkillModule('${si.id}')">
        <td>${si.skillName}${si.binding ? ` <span style="color:var(--text-dim)">(${si.binding})</span>` : ''}${si.dropdownOnly ? ' <span style="font-size:10px;color:#7a7acf">[D]</span>' : ''}</td>
        <td style="color:var(--text-dim)">${subOf}</td>
        <td>${si.guildName || '—'}</td>
        <td>${vals.expmod.toFixed(3)}</td>
        <td>${(parseFloat(si.rawXP)||0).toLocaleString()}</td>
        <td>${Math.round(vals.adjXP).toLocaleString()}</td>
        <td class="level-cell">${vals.level}</td>
        <td>${vals.attribBonus}</td>
        <td>${vals.rollTotal}</td>
        <td>${vals.dropdownBonus}</td>
        <td class="skval-cell">${vals.skval}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    if (type === UNKNOWN_SKILL_TYPE) html = `<div class="note skill-unknown" style="padding:6px 10px">These skills don't match any skill in the skill catalog (by name, ignoring case), so their values can't be calculated. Fix the name or add the skill under Utilities.</div>` + html;
    sections.push({ key: 'type:' + type, header: `<h2>${type === UNKNOWN_SKILL_TYPE ? '⚠ Not in skill catalog' : type}</h2><span class="type-badge">${byType[type].length}</span>`, body: html, flush: true });
  }

  document.getElementById('main').innerHTML = overviewSectionsHtml(char, sections);
}

// The Overview's sections in the character's saved order (char.overviewLayout:
// { order: [keys], collapsed: { key: true } }); sections not placed yet keep
// their default position. Each header collapses its section, and has ▲/▼.
function overviewSectionsHtml(char, sections) {
  const layout = char.overviewLayout || {};
  const order = layout.order || [];
  const collapsed = layout.collapsed || {};
  const rank = (sec, i) => { const r = order.indexOf(sec.key); return r < 0 ? order.length + i : r; };
  const ordered = sections.map((sec, i) => ({ sec, r: rank(sec, i) })).sort((a, b) => a.r - b.r).map(x => x.sec);
  return ordered.map((sec, i) => {
    const shut = !!collapsed[sec.key];
    const move = (dir, glyph, disabled) => `<button type="button" class="btn btn-dim section-move" title="Move ${dir < 0 ? 'up' : 'down'}" ${disabled ? 'disabled' : ''} onclick="event.stopPropagation();moveOverviewSection(this.closest('[data-section]').dataset.section, ${dir})">${glyph}</button>`;
    return `<div class="panel overview-section" data-section="${escapeHtml(sec.key)}">
      <div class="panel-header" title="${shut ? 'Show' : 'Hide'} this section" onclick="toggleOverviewSection(this.closest('[data-section]').dataset.section)">
        <span class="section-toggle">${shut ? '▸' : '▾'}</span>${sec.header}
        <span class="section-moves">${move(-1, '▲', i === 0)}${move(1, '▼', i === ordered.length - 1)}</span>
      </div>
      ${shut ? '' : `<div class="panel-body"${sec.flush ? ' style="padding:0"' : ''}>${sec.body}</div>`}
    </div>`;
  }).join('');
}

// Weight Possible / Carried with its bar, shown on General Info and on the
// Inventory page (where carried items change it).
function weightSummaryHtml(char) {
  const w = computeWeight(char);
  const pct = w.possible > 0 ? Math.min(100, (w.carried / w.possible) * 100) : 0;
  const over = w.carried > w.possible;
  return `
  <div class="form-row" style="margin-bottom:4px">
    <div class="computed-item"><span class="ci-label">Weight Possible</span><span class="ci-value">${w.possible.toLocaleString()}</span></div>
    <div class="computed-item"><span class="ci-label">Weight Carried</span><span class="ci-value" style="color:${over?'#c05050':'var(--gold)'}">${w.carried.toLocaleString()}</span></div>
  </div>
  <div class="weight-bar-track"><div class="weight-bar-fill ${over?'over':''}" style="width:${pct}%"></div></div>
  <div class="note" style="margin-top:2px">ST×90 + HE×10 + (Basic Move skval×10) + (Ignore Encumbrance skval×10)</div>
  `;
}

function renderGeneralModule() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const customChoices = loadCustomData();
  const a = char.attrs || {};
  const races = ['Human','Omwo~','Gartier','Gnollic','Orcash','Goblic','Ograk Strain','FratreCanis','Klaxik','Hobytalia','Gnomic','Cross'];
  const subraces = {
    'Human': ['Mixed','Southern','Gwynellian','Omnian','Delvan','Grey March','Gesana'],
    'Omwo~': ['Meadow (Metto~)','Seafaring (Cmao)','Vale (Vanir)','Wood (Wolden)','Noble (Huet)','High (Imo)'],
    'Klaxik': ['Hill','Hybern','Black','Gastax','Deep (Kann)'],
    'Hobytalia': ['Burrowed','Gastax','Red','Shrum','Underearth'],
    'Gnomic': ['Grey','Deep','Half-Orc-Gnome','Brotherhood'],
    'Orcash': ['Mixed','Orcashgrak','Zyjmanese'],
    'Gartier': ['Mixed','Dexter (White Bear)','New'],
    'FratreCanis': ['Common','Gnollic'],
    'Cross': ['See notes'],
  };
  const totalXP = (char.skills || []).reduce((sum, si) => sum + (parseFloat(si.rawXP) || 0), 0);

  document.getElementById('main').innerHTML = `
  <div class="panel">
    <div class="panel-header"><h2 style="font-family:'Cormorant Garamond','Georgia',serif;font-style:italic;font-weight:bold">General Information — ${char.name}</h2>
      <div class="computed-item" style="margin-left:auto"><span class="ci-label">Total Raw XP</span><span class="ci-value" style="font-size:16px">${totalXP.toLocaleString()}</span></div>
      ${char.unspentInitialExp > 0 ? `<div class="computed-item"><span class="ci-label">Unspent Initial Raw XP</span><span class="ci-value" style="font-size:16px">${char.unspentInitialExp.toLocaleString()}</span></div>` : ''}
    </div>
    <div class="panel-body">
      ${mainGuildBannerHtml(char, true)}
      <div class="form-row">
        <div class="form-group id-field"><label>Name</label><input class="w-lg" value="${char.name||''}" onchange="updateChar('name',this.value)"></div>
        <div class="form-group id-field"><label>Nickname / Title</label><input class="w-lg" value="${char.nickname||''}" onchange="updateChar('nickname',this.value)"></div>
        <div class="form-group id-field"><label>Race</label>
          <input class="w-md" list="race-datalist" value="${char.race||''}" placeholder="e.g. Kobold" onchange="updateChar('race',this.value);renderGeneralModule()">
          <datalist id="race-datalist">${races.map(r=>`<option value="${r}">`).join('')}</datalist>
        </div>
        <div class="form-group id-field"><label>Subrace</label>
          <input class="w-lg" list="subrace-datalist" value="${char.subrace||''}" onchange="updateChar('subrace',this.value)">
          <datalist id="subrace-datalist">${(subraces[char.race] || []).map(sr=>`<option value="${sr}">`).join('')}</datalist>
        </div>
        <div class="form-group id-field"><label>Age</label><input class="w-sm" value="${char.age||''}" onchange="updateChar('age',this.value)"></div>
        <div class="form-group id-field"><label>Max Age</label><input class="w-sm" value="${char.maxAge||''}" onchange="updateChar('maxAge',this.value)"></div>
        <div class="form-group id-field"><label>Height</label><input class="w-sm" value="${char.height||''}" onchange="updateChar('height',this.value)"></div>
        <div class="form-group id-field"><label>Gender</label>
          <select class="w-md" onchange="updateChar('gender',this.value)">
            <option value="">— select —</option>
            ${['Male','Female','Other'].map(g=>`<option ${char.gender===g?'selected':''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="form-group id-field"><label>Weight</label><input class="w-sm" value="${char.bodyWeight||''}" onchange="updateChar('bodyWeight',this.value)"></div>
        <div class="form-group id-field"><label>Darksight</label><input class="w-sm" value="${char.darksight||''}" onchange="updateChar('darksight',this.value)"></div>
        <div class="form-group id-field"><label>Locale</label>
          <select class="w-md" onchange="handleChoiceSelect(this,state.characters[state.activeChar],'locale','locales')">
            <option value="">— select —</option>
            ${(customChoices.locales||[]).map(l=>`<option ${char.locale===l?'selected':''}>${l}</option>`).join('')}
            <option value="__addnew__">Add New...</option>
          </select>
        </div>
        <div class="form-group id-field"><label>Group</label>
          <select class="w-md" onchange="linkCharacterToGroup(this.value)">
            <option value="">— none —</option>
            ${myGroups.map(g=>`<option value="${g.id}" ${char.playGroupId===g.id?'selected':''}>${escapeHtml(g.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group id-field"><label>Starting Social Tier</label><input type="number" class="w-sm" value="${char.socialNumber!==undefined?char.socialNumber:''}" onchange="updateChar('socialNumber',this.value)"></div>
        <div class="form-group id-field"><label>Current Social Tier</label><input type="number" class="w-sm" value="${char.currentSocialNumber!==undefined&&char.currentSocialNumber!==null?char.currentSocialNumber:''}" onchange="updateChar('currentSocialNumber',this.value)"></div>
        <div class="form-group" style="justify-content:flex-end">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding-bottom:6px">
            <input type="checkbox" ${char.isNPC?'checked':''} onchange="updateChar('isNPC',this.checked)">
            NPC
          </label>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:1;min-width:250px"><label>Appearance Notes</label>
          <textarea class="w-full" rows="2" style="resize:vertical" onchange="updateChar('appearanceNotes',this.value)">${char.appearanceNotes||''}</textarea>
        </div>
        <div class="form-group" style="flex:1;min-width:250px"><label>Personal Notes</label>
          <textarea class="w-full" rows="2" style="resize:vertical" onchange="updateChar('personalNotes',this.value)">${char.personalNotes||''}</textarea>
        </div>
      </div>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Attributes</div>
      <div class="attr-grid">
        ${['ST','IN','WI','CD','HE','CH','AP'].map(attr=>`
        <div class="attr-cell">
          <label>${attr}</label>
          <input type="number" min="1" max="25" value="${a[attr]||''}" onchange="updateAttr('${attr}',this.value)">
        </div>`).join('')}
      </div>
      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Guilds</div>
      <div class="form-row">
        <div class="form-group w-lg"><label>Primary Guild</label>
          ${guildPickerButton(char.guild, "v => { updateChar('guild', v); renderGeneralModule(); }")}
        </div>
        <div class="form-group w-lg"><label>Secondary Guild</label>
          ${guildPickerButton(char.guild2, "v => { updateChar('guild2', v); renderGeneralModule(); }")}
        </div>
        <div class="form-group w-lg"><label>Tertiary Guild</label>
          ${guildPickerButton(char.guild3, "v => { updateChar('guild3', v); renderGeneralModule(); }")}
        </div>
      </div>
      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Circumstance Checks
        <button class="btn btn-dim" style="margin-left:12px;font-size:10px;padding:2px 8px" onclick="setAllCCBonus()">Set All (e.g. Luckstone)</button>
      </div>
      <div class="cc-grid">
        ${(() => {
          const cc = computeCC(char);
          return Object.entries(cc).map(([k,v]) => `
            <div class="cc-cell">
              <div class="cc-name">${k}</div>
              <div class="cc-value">${v.value}</div>
              <div class="cc-formula">${v.formula}</div>
              <input type="number" class="w-sm" style="margin-top:4px" value="${v.bonus}" title="Magic Bonus" placeholder="Magic +" onchange="updateCCBonus('${k}',this.value)">
            </div>`).join('');
        })()}
      </div>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Hit Points</div>
      ${(() => {
        const hp = computeHP(char);
        if (hp.system === 'collegium') {
          return `
        <div class="form-row" style="margin-bottom:4px">
          <div class="computed-item"><span class="ci-label">Physical</span><span class="ci-value">${hp.physicalCurrent} / ${hp.physicalMax}</span></div>
          <div class="computed-item"><span class="ci-label">Endurance</span><span class="ci-value">${hp.enduranceCurrent} / ${hp.enduranceMax}</span></div>
        </div>
        <div class="note">Collegium system — edit on the Combat page</div>`;
        }
        return `
        <div class="computed-item" style="margin-bottom:4px"><span class="ci-label">Current / Max HP</span><span class="ci-value skval">${hp.currentHP} / ${hp.totalHP}</span></div>
        <div class="note">Standard system — edit on the Combat page</div>`;
      })()}

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Weight</div>
      ${weightSummaryHtml(char)}

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Movement</div>
      ${(() => {
        const sp = computeSpeed(char);
        return `
        <div class="form-row" style="margin-bottom:4px">
          <div class="computed-item"><span class="ci-label">Base Speed</span><span class="ci-value">${Math.round(sp.baseSpeed)} ft/sec</span></div>
          <div class="computed-item"><span class="ci-label">Adjusted Speed</span><span class="ci-value">${Math.round(sp.adjustedSpeed)} ft/sec</span></div>
          <div class="computed-item"><span class="ci-label">Dash/Rout Speed</span><span class="ci-value skval">${Math.round(sp.dashRoutSpeed)} ft/sec</span></div>
          <div class="computed-item"><span class="ci-label">Dash/Rout Max Distance</span><span class="ci-value">${Math.round(sp.dashRoutMaxDistance)} yds</span></div>
        </div>
        <div class="note">CD/4 + 10 + (Speed Move skval÷10), scaled by (1 − Weight Carried/Weight Possible)</div>
        <div class="note">Dash/Rout Speed = Adjusted Speed × 2 (charging or fleeing full rout). Max Distance = ((WI÷4) + HE) × 4 yards.</div>
        ${sp.armoredMoveTrained ? '<div class="note" style="color:var(--gold-dim)">Armored Move is trained, but its exact speed formula is not documented in the wiki — not factored in yet.</div>' : ''}
        `;
      })()}

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Notes</div>
      <div class="form-group" style="margin-bottom:10px"><label>History</label>
        <textarea class="w-full" rows="4" style="resize:vertical" onchange="updateChar('historyNotes',this.value)">${char.historyNotes||''}</textarea>
      </div>
      <div class="form-group">
        <label>Relationships</label>
        <textarea class="w-full" rows="4" style="resize:vertical" onchange="updateChar('relationshipNotes',this.value)">${char.relationshipNotes||''}</textarea>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-gold" onclick="saveState();showOverview()">Save & Return</button>
        <button class="btn btn-red" onclick="openTransferOwnershipModal()">Transfer Ownership</button>
        <button class="btn btn-red" onclick="deleteChar()">Delete Character</button>
      </div>
    </div>
  </div>`;

  // welcomeShown is only ever explicitly set to false at character creation
  // (see createChar), so older characters that predate this field (where
  // it's simply undefined) never trigger it -- this is strictly a
  // first-time-only popup for brand new characters.
  if (char.welcomeShown === false) {
    char.welcomeShown = true;
    saveState();
    openModal(`
      <h3>Welcome, ${escapeHtml(char.name || 'traveler')}!</h3>
      <div style="font-size:13px;line-height:1.5">
      <p>Great, this character now exists. Before you start: the whole game is skill based. Everything your character can do is a skill. On top of that, the world of Celtricia has hundreds of guilds and factions, and they determine which skills you are good at and how you deal with everyone else socially. Here is how to get going.</p>
      <ol style="margin:6px 0 6px 18px;padding:0">
        <li><b>Pick your main Guild/School first</b>, before anything else. On General Info, set your Primary Guild. Your guild decides what you are better and worse at: it adjusts how fast you learn every skill (the EXP modifier), so what your guild favors comes quickly and what it doesn't comes slowly. It is also where your history comes from and your link to the world of Celtricia.</li>
        <li><b>Spend your starting experience.</b> You already have a few skills; add the rest with <i>Add Skill</i> in the sidebar. A broad skill gives you a little ability in the specialties under it (the dropdown rule).</li>
        <li><b>Put your gear in your inventory.</b> On the Inventory page, add weapons, armor and shields as items. They go live on the Combat page by themselves: weapons show to-hit, damage, speed and crit chances worked out from your skills and attributes, and armor and shields add to your Avoidance and Protection.</li>
        <li><b>Spells.</b> The Spells page keeps your spell points and your spellbook, and it can draw on the entire spell library.</li>
        <li><b>Playing with a group.</b> The Groups button in the top bar is where your GM keeps the shared clock, the party roster and notes, and where combat is run: a Combat tracker with turn order, hit points and effects. You can link your character to a group from General Info.</li>
      </ol>
      </div>
      <div class="modal-actions"><button class="btn btn-gold" onclick="closeModal()">Got it</button></div>`, { wide: true });
  }
}

// The inventory's Type column: the most specific of the item's type, class
// and model, read the same way the item popup reads it. A catalog pick shows
// alone ("Scale Mail"); a custom one shows the level above it plus "Custom"
// ("Armor, Custom", "Basic Axe, Custom").
function itemKindLabel(it) {
  const labels = Object.entries(itemPicksFromItem(it)).map(([key, v]) =>
    v === ITEM_PICK_CUSTOM ? 'Custom' : key === 'type' ? itemTypeLabel(v) : v);
  if (!labels.length) return itemTypeLabel(it.type || 'Item');
  const last = labels[labels.length - 1];
  return last === 'Custom' && labels.length > 1 ? `${labels[labels.length - 2]}, Custom` : last;
}

// Where an item can go: Carried (an empty location) plus every container
// added under Storage Locations or already holding items.
function itemLocations(char) {
  const set = new Set(Object.keys(char.storageCapacities || {}));
  for (const it of char.items || []) if (it.location && it.location.trim()) set.add(it.location.trim());
  return orderedContainers(char, set);
}

// ▲/▼ for a container (not On Person), used in the Items group headers and
// the Storage Locations rows. Each moves it one place in the shared order.
function containerMoveButtons(char, name) {
  const list = itemLocations(char);
  const i = list.indexOf(name);
  const b = (dir, glyph, disabled) => `<button type="button" class="btn btn-dim container-move" title="Move ${dir < 0 ? 'up' : 'down'}" ${disabled ? 'disabled' : ''} onclick="event.stopPropagation();moveContainer(this.closest('[data-container]').dataset.container, ${dir})">${glyph}</button>`;
  return b(-1, '▲', i <= 0) + b(1, '▼', i < 0 || i >= list.length - 1);
}

// Read-only inventory rows, grouped under a header per location (Carried
// first), with that location's totals from computeStorageSummary.
function inventoryGroupsHtml(char) {
  const CARRIED = 'On Person (Carried)';
  const entries = (char.items || []).map((it, idx) => ({ it, idx })).filter(({ it }) => !isBlankItem(it));
  const html = computeStorageSummary(char).map(g => {
    const rows = entries.filter(({ it }) => ((it.location || '').trim() || CARRIED) === g.location);
    if (!rows.length) return '';
    const hidden = collapsedItemGroups.has(g.location);
    const isContainer = g.location !== CARRIED;
    const label = !isContainer ? 'Carried' : escapeHtml(g.location) + (g.onPerson ? ' <span class="item-group-stats">(on person)</span>' : '');
    return `<tr class="item-group" data-group="${escapeHtml(g.location)}" data-container="${escapeHtml(g.location)}" title="${hidden ? 'Show' : 'Hide'} these items" onclick="toggleItemGroup(this.dataset.group)"><td colspan="7"><span class="item-group-toggle">${hidden ? '▸' : '▾'}</span>${label}${isContainer ? `<span class="group-move">${containerMoveButtons(char, g.location)}</span>` : ''}</td></tr>` +
      (hidden ? '' : rows.map(({ it, idx }) => `<tr style="${it.masterwork ? 'font-style:italic' : ''}">
        <td>${escapeHtml(it.name || '')}</td>
        <td class="item-kind">${escapeHtml(itemKindLabel(it))}</td>
        <td class="item-qty">${escapeHtml(it.qty || 1)}</td>
        <td style="text-align:center">${it.masterwork || it.type === 'Magic Item' ? '✓' : ''}</td>
        <td class="item-kind">${escapeHtml(it.notes || '')}</td>
        <td class="item-edit" title="Edit" onclick="openEditItemModal(${idx})">✎</td>
        <td class="item-del" title="Delete" onclick="removeItem(${idx})">✕</td>
      </tr>` + (itemCanHoldSpells(it) ? (it.spells || []).map((sp, j) => {
        const left = itemSpellUsesLeft(sp, char);
        const rule = itemSpellRule(it);
        return `<tr class="item-spell-row"><td colspan="7">✦ <a class="wiki-link" href="${spellWikiUrl(sp.name)}" target="_blank" rel="noopener">${escapeHtml(sp.name)}</a> · Level ${sp.level} · <span style="${left > 0 ? '' : 'color:#c05050'}" title="${rule ? 'Used up as it is cast; does not come back' : sp.period === 'charges' ? 'Charges only come back with ↺' : characterClockSeconds(char) != null ? 'Comes back as the group clock passes into the next ' + escapeHtml(itemSpellPeriodLabel(sp.period).replace(/^per /, '')) + ', or with ↺' : 'Comes back with ↺ (or as the group clock passes, once this character is in a group)'}">${escapeHtml(itemSpellUsageText(sp, char, rule))}</span>
          <button class="btn btn-gold item-spell-btn" ${left > 0 ? '' : 'disabled'} title="Cast ${escapeHtml(sp.name)} from this item" onclick="openItemCastModal(${idx},${j})">Cast</button>
          ${rule ? '' : `<button class="btn btn-dim item-spell-btn" title="Reset its uses" onclick="rechargeItemSpell(${idx},${j})">↺</button>`}</td></tr>`;
      }).join('') : '')).join(''));
  }).join('');
  return html || `<tr><td colspan="7" class="note" style="padding:8px">No items yet. Use <i>Add Item</i> below.</td></tr>`;
}

function renderInventoryModule() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const totalWorth = (char.items||[]).reduce((sum,it)=>sum+((parseFloat(it.worth)||0)*(parseFloat(it.qty)||1)),0);

  document.getElementById('main').innerHTML = `
  <div class="panel plain-font">
    <div class="panel-header"><h2>Inventory — ${escapeHtml(char.name || '')}</h2>
      <div class="computed-item" style="margin-left:auto"><span class="ci-label">Total Worth</span><span class="ci-value" style="font-size:16px">${totalWorth.toLocaleString()}</span></div>
    </div>
    <div class="panel-body">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Weight</div>
      ${weightSummaryHtml(char)}
      <hr class="divider">
      <div class="note" style="margin-bottom:6px">Items are grouped by where they are. Carried items count toward Weight Carried above; items in a container don't, unless you tick its On Person box in Storage Locations below (a backpack you're wearing). Use ✎ to change an item.</div>
      <table class="item-table inventory-table">
        <thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>MW/Magic</th><th>Notes</th><th></th><th></th></tr></thead>
        <tbody>${inventoryGroupsHtml(char)}</tbody>
      </table>
      <button class="btn btn-gold" onclick="openAddItemModal()">Add Item</button>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px">Storage Locations</div>
      <div class="note" style="margin-bottom:6px">Capacity is how much weight a container can hold (blank = no limit); On Person's is your Weight Possible. Tick On Person on a container you wear or carry so its contents count toward Weight Carried.</div>
      <table class="item-table inventory-table">
        <thead><tr><th>Container</th><th>On Person</th><th>Items</th><th>Weight</th><th>Capacity</th><th>Capacity Remaining</th><th>Worth</th><th></th><th></th><th></th></tr></thead>
        <tbody>
          ${computeStorageSummary(char).map(g => {
            const isPerson = g.location === ON_PERSON_LOCATION;
            const over = g.over ? 'color:#c05050' : '';
            return `<tr data-container="${escapeHtml(g.location)}">
            <td>${isPerson ? 'On Person' : escapeHtml(g.location)}</td>
            <td>${isPerson ? 'always' : (g.onPerson ? '✓' : '')}</td>
            <td>${g.count.toLocaleString()}</td>
            <td>${g.weight.toLocaleString()}</td>
            <td>${g.capacity === null ? 'no limit' : g.capacity.toLocaleString()}</td>
            <td style="${over}">${g.remaining === null ? '—' : g.remaining.toLocaleString() + (g.over ? ' OVER' : '')}</td>
            <td>${g.worth.toLocaleString()}</td>
            <td class="container-move-cell">${isPerson ? '' : containerMoveButtons(char, g.location)}</td>
            ${isPerson ? '<td></td><td></td>' : `<td class="item-edit" title="Edit" onclick="openEditContainerModal(this.closest('tr').dataset.container)">✎</td><td class="item-del" title="Delete" onclick="openDeleteContainerModal(this.closest('tr').dataset.container)">✕</td>`}
          </tr>`; }).join('')}
        </tbody>
      </table>
      <button class="btn btn-dim" onclick="openAddContainerModal()">Add Container</button>

      <hr class="divider">
      <div class="form-group"><label>Item Notes</label>
        <textarea class="w-full" rows="3" style="resize:vertical" onchange="updateChar('itemNotes',this.value)">${char.itemNotes||''}</textarea>
      </div>
    </div>
  </div>`;
}

// Marks the One-/Two-Handed row that applies to a wielded weapon (see computeWielding).
function wieldTag(it, which) {
  const c = state.characters[state.activeChar];
  if (!c || !it.wielded || computeWielding(c).mode !== which) return '';
  return ' <span class="type-badge" style="color:var(--gold)">in use</span>';
}

function renderCombatModule() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const armor = computeArmor(char);
  const weaponEntries = combatWeaponEntries(char);

  document.getElementById('main').innerHTML = `
  <div class="panel">
    <div class="panel-header"><h2>Combat — ${char.name}</h2></div>
    <div class="panel-body">

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Hit Points</div>
      ${(() => {
        const hp = computeHP(char);
        return `
        <div class="form-row" style="margin-bottom:8px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" ${hp.system==='collegium'?'checked':''} onchange="updateHPState('system', this.checked ? 'collegium' : 'standard')">
            Collegium System (uncheck for Standard)
          </label>
        </div>
        <div class="computed-item" style="margin-bottom:10px"><span class="ci-label">Total HP (from Hit Points skill)</span><span class="ci-value skval">${hp.totalHP}</span></div>
        ${hp.system === 'standard' ? `
        <div class="form-row">
          <div class="computed-item"><span class="ci-label">Max HP</span><span class="ci-value">${hp.totalHP}</span></div>
          <div class="form-group"><label>Current HP</label><input type="number" class="w-sm" value="${hp.currentHP}" onchange="updateHPState('currentHP', this.value)"></div>
          <button class="btn btn-dim" style="align-self:flex-end" onclick="updateHPState('currentHP', ${hp.totalHP})">Reset to Max</button>
        </div>
        ` : `
        <div class="form-row">
          <div class="computed-item"><span class="ci-label">Physical Max</span><span class="ci-value">${hp.physicalMax}</span></div>
          <div class="form-group"><label>Physical Current</label><input type="number" class="w-sm" value="${hp.physicalCurrent}" onchange="updateHPState('physicalCurrent', this.value)"></div>
          <button class="btn btn-dim" style="align-self:flex-end" onclick="updateHPState('physicalCurrent', ${hp.physicalMax})">Reset</button>
        </div>
        <div class="form-row">
          <div class="computed-item"><span class="ci-label">Endurance Max</span><span class="ci-value">${hp.enduranceMax}</span></div>
          <div class="form-group"><label>Endurance Current</label><input type="number" class="w-sm" value="${hp.enduranceCurrent}" onchange="updateHPState('enduranceCurrent', this.value)"></div>
          <button class="btn btn-dim" style="align-self:flex-end" onclick="updateHPState('enduranceCurrent', ${hp.enduranceMax})">Reset</button>
        </div>
        <div class="note">Damage hits Endurance first; Physical is only touched once Endurance is depleted. Physical = ceil(total÷2), Endurance = floor(total÷2).</div>
        `}
        `;
      })()}

      <hr class="divider">
      <div class="computed-row">
        <div class="computed-item"><span class="ci-label">Total AV (Shield)</span><span class="ci-value skval">${Math.round(armor.withShield.totalAV)}</span></div>
        <div class="computed-item"><span class="ci-label">Total PR (Shield)</span><span class="ci-value skval">${Math.round(armor.withShield.totalPR)}</span></div>
        <div style="width:1px;background:var(--border);margin:0 4px"></div>
        <div class="computed-item"><span class="ci-label">Total AV (No Shield / 2H)</span><span class="ci-value" style="color:#7a7acf">${Math.round(armor.withoutShield.totalAV)}</span></div>
        <div class="computed-item"><span class="ci-label">Total PR (No Shield / 2H)</span><span class="ci-value" style="color:#7a7acf">${Math.round(armor.withoutShield.totalPR)}</span></div>
        ${armor.wield.active ? `
        <div style="width:1px;background:var(--border);margin:0 4px"></div>
        <div class="computed-item" title="From the weapons and shield ticked Wielding below"><span class="ci-label">Total AV (Wielding)</span><span class="ci-value" style="color:var(--gold)">${Math.round(armor.current.totalAV)}</span></div>
        <div class="computed-item" title="From the weapons and shield ticked Wielding below"><span class="ci-label">Total PR (Wielding)</span><span class="ci-value" style="color:var(--gold)">${Math.round(armor.current.totalPR)}</span></div>` : ''}
      </div>
      <div class="note">${armor.wield.active ? `Wielding: ${armor.wield.weapons} weapon${armor.wield.weapons === 1 ? '' : 's'}${armor.wield.shields ? ' and a shield' : ''} — ${armor.wield.mode === 'two' ? 'one weapon alone, so two-handed values' : armor.wield.mode === 'one' ? 'one-handed values' : 'shield only'}. ` : 'Tick Wielding on the weapon(s) and shield in your hands to see your current totals and which hand values apply. '}</div>
      <div class="note">Lower AV is better for the defender — it's added directly to an attacker's hit chance. "No Shield" reflects two-handed weapon use or a dropped shield.</div>
      ${armor.parryPointsTotal > 0 ? `
      <div class="note" style="color:var(--gold-dim);margin-top:4px">⚠ ${armor.parryPointsTotal} of the Total PR above comes from Parry Points Committed. Parry only stops melee attacks — you can't parry a missile or a spell. Against a missile or magical attack, use PR ${Math.round(armor.withShield.totalPRvsRangedOrMagic)} (Shield) / ${Math.round(armor.withoutShield.totalPRvsRangedOrMagic)} (No Shield) instead.</div>
      ` : ''}

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Weapons</div>
      ${weaponEntries.length === 0 ? '<div class="note" style="padding:6px 0">No weapon items yet. Add them on the Inventory page (a spiked shield adds its own).</div>' : `
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button class="btn btn-dim" style="font-size:11px;padding:2px 8px" onclick="setAllWeaponsOpen(true)">Open all</button>
        <button class="btn btn-dim" style="font-size:11px;padding:2px 8px" onclick="setAllWeaponsOpen(false)">Close all</button>
      </div>`}
      ${weaponEntries.map((entry, pos) => entry.kind === 'hand' ? renderHandFootPanel(char, pos, weaponEntries.length) : entry.kind === 'shield' ? renderShieldWeaponPanel(char, entry, pos, weaponEntries.length) : (() => {
        const it = entry.it, idx = entry.idx;
        const w = computeWeapon(char, it);
        return `
        <div class="panel" style="margin-bottom:10px">
          <div class="panel-header" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap" onclick="toggleWeaponOpen(${idx})" title="Click to ${it.collapsed ? 'open' : 'close'}">
            <span style="font-size:10px;width:10px">${it.collapsed ? '▶' : '▼'}</span>
            <h2 style="font-size:13px">${it.name||'(unnamed weapon)'}${it.weaponModel?' — '+it.weaponModel:''}</h2><span class="type-badge">${it.weaponClass||'unbound'}</span>${it.wielded ? '<span class="type-badge" style="color:var(--gold)">wielding</span>' : ''}
            ${it.collapsed ? weaponSummaryHtml(it, w) : ''}
            ${weaponMoveButtonsHtml(pos, weaponEntries.length)}
          </div>
          <div class="panel-body" style="display:${it.collapsed ? 'none' : 'block'}">
            <input class="w-full" value="${it.notes||''}" placeholder="Special history, charges, quirks..." style="margin-bottom:8px;font-style:italic" onchange="updateItem(${idx},'notes',this.value);renderCombatModule()">
            <div class="form-row">
              ${[['stn1h','STN 1H'],['stn2h','STN 2H'],['stmod','STMOD'],['cdn1h','CDN 1H'],['cdn2h','CDN 2H'],['cdmod','CDMOD']].map(([f,l])=>`
              <div class="form-group"><label>${l}</label><input type="number" step="0.01" class="w-sm" value="${it[f]||0}" onchange="updateWeaponField(${idx},'${f}',this.value)"></div>`).join('')}
            </div>
            <div class="form-row">
              <div class="form-group"><label>Damage Dice</label><input class="w-md" value="${it.damageDice||''}" onchange="updateWeaponField(${idx},'damageDice',this.value)"></div>
              <div class="form-group"><label>Dividing Die</label><input type="number" class="w-sm" value="${it.dividingDie||0}" onchange="updateWeaponField(${idx},'dividingDie',this.value)"></div>
              <div class="form-group"><label>Speed Melee</label><input type="number" class="w-sm" value="${it.speedMelee||0}" onchange="updateWeaponField(${idx},'speedMelee',this.value)"></div>
              <div class="form-group"><label>Speed Missile</label><input type="number" class="w-sm" value="${it.speedMissile||0}" onchange="updateWeaponField(${idx},'speedMissile',this.value)"></div>
              <div class="form-group"><label>Speed Readied</label><input type="number" class="w-sm" value="${it.speedReadied||0}" onchange="updateWeaponField(${idx},'speedReadied',this.value)"></div>
              <div class="form-group"><label>Weapon PR</label><input type="number" class="w-sm" value="${it.weaponProtection||0}" onchange="updateWeaponField(${idx},'weaponProtection',this.value)"></div>
              <div class="form-group" title="Tick the weapon(s) in your hands. One weapon alone is held two-handed; two weapons, or a weapon and a shield, are one-handed. Wielded weapons add their Weapon PR to your Protection."><label>Wielding</label><input type="checkbox" ${it.wielded ? 'checked' : ''} onchange="updateWeaponField(${idx},'wielded',this.checked)"></div>
              <div class="form-group"><label>Threat Range</label><input type="number" class="w-sm" value="${it.threatRange||0}" onchange="updateWeaponField(${idx},'threatRange',this.value)"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Magic Bonus to Hit</label><input type="number" class="w-sm" value="${it.magicBonusToHit||0}" onchange="updateWeaponField(${idx},'magicBonusToHit',this.value)"></div>
              <div class="form-group"><label>Magic Dmg After Divider</label><input type="number" class="w-sm" value="${it.magicDamageAfterDivider||0}" onchange="updateWeaponField(${idx},'magicDamageAfterDivider',this.value)"></div>
            </div>
            <div class="note">Skill Ability: ${w.baseWeaponSkval} (${it.weaponClass||'—'}) + ${w.singleWeapSpec} (Single Weap Spec) = ${w.skillAbility}</div>
            <div class="note">Crit % = 7 + floor(to-hit÷10) + (10% × Critical Hit Bonus skval [${w.critHitBonusSkval}]) + weapon threat range, capped at half of to-hit, floored at 3% minimum. Fumble range is 93-00, shifting up only if to-hit itself exceeds 93 (so it never overlaps your own hit range).</div>
            <hr class="divider">
            <table class="skill-table">
              <thead><tr><th></th><th>To-Hit</th><th>Dmg Bonus</th><th>Speed</th><th>Parry</th><th>Parry Used</th><th>Multiple Attack</th><th>Crit %</th><th>Fumble %</th></tr></thead>
              <tbody>
                <tr>${w.oneHand ? `<td>One-Handed${wieldTag(it, 'one')}</td><td class="skval-cell">${Math.round(w.oneHand.hit)}</td><td>${Math.round(w.oneHand.dmgBonus)}</td><td>${Math.round(w.oneHand.speed)}</td><td>${w.parrySkval}</td><td><input type="number" min="0" max="${w.parrySkval}" class="w-sm" value="${w.parryPointsUsed}" onchange="updateWeaponField(${idx},'parryPointsUsed',this.value)"></td><td>${w.multipleAttackSkval}</td><td>${fmtCrit(w.oneHand.critChance)}</td><td>${fmtFumble(w.oneHand.fumbleThreshold)}</td>` : `<td style="color:var(--text-dim)">One-Handed</td><td colspan="8" class="note">Not usable one-handed — no 1H stats for this weapon</td>`}</tr>
                ${w.twoHand ? `<tr><td>Two-Handed${wieldTag(it, 'two')}</td><td class="skval-cell">${Math.round(w.twoHand.hit)}</td><td>${Math.round(w.twoHand.dmgBonus)}</td><td>${Math.round(w.twoHand.speed)}</td><td>${w.parrySkval}</td><td><input type="number" min="0" max="${w.parrySkval}" class="w-sm" value="${w.parryPointsUsed}" onchange="updateWeaponField(${idx},'parryPointsUsed',this.value)"></td><td>${w.multipleAttackSkval}</td><td>${fmtCrit(w.twoHand.critChance)}</td><td>${fmtFumble(w.twoHand.fumbleThreshold)}</td></tr>` : ''}
              </tbody>
            </table>
            <div class="note">Parry Used is capped at this weapon's Parry skill value; every point subtracts from this weapon's To-Hit and adds to your Protection (PR) below — but only against melee attacks. It does nothing against missile or magical attacks.</div>
            ${w.missile ? `
            <hr class="divider">
            <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Missile Fire</div>
            <div class="form-row">
              <div class="form-group"><label>Range</label><input type="number" class="w-sm" value="${it.range||0}" onchange="updateWeaponField(${idx},'range',this.value)"></div>
              <div class="form-group"><label>Target Distance</label><input type="number" class="w-sm" value="${it.targetDistance||0}" onchange="updateWeaponField(${idx},'targetDistance',this.value)"></div>
              <div class="form-group"><label>Ammunition (from Inventory)</label>
                <select class="w-lg" onchange="updateWeaponField(${idx},'ammunitionItemIdx',this.value)">
                  <option value="">— none / self-contained —</option>
                  ${(char.items||[]).map((amIt,amIdx)=> amIt.type==='Ammunition' ? `<option value="${amIdx}" ${String(it.ammunitionItemIdx)===String(amIdx)?'selected':''}>${amIt.name||'(unnamed)'}${amIt.masterwork?' ✦':''} (qty ${amIt.qty||1})</option>` : '').join('')}
                </select>
              </div>
            </div>
            <div class="computed-row">
              ${it.weaponClass === 'Basic Spears' ? `<div class="computed-item"><span class="ci-label">Effective Range (ST + Spear Thrown)</span><span class="ci-value">${Math.round(w.missile.effectiveRange*10)/10}${w.missile.spearThrownRange ? ` <span class="note">(+${w.missile.spearThrownRange} from skill)</span>` : ''}</span></div>` : ''}
              <div class="computed-item"><span class="ci-label">Range Modifier</span><span class="ci-value">${Math.round(w.missile.rangeMod*100)}</span></div>
              <div class="computed-item"><span class="ci-label">Missile To-Hit</span><span class="ci-value skval">${Math.round(w.missile.finalHit)}</span></div>
              <div class="computed-item"><span class="ci-label">Crit %</span><span class="ci-value">${fmtCrit(w.missile.critChance)}</span></div>
              <div class="computed-item"><span class="ci-label">Fumble %</span><span class="ci-value">${fmtFumble(w.missile.fumbleThreshold)}</span></div>
            </div>
            ${(char.items||[]).filter(i=>i.type==='Ammunition').length===0 ? '<div class="note" style="margin-top:6px">No ammunition items in inventory yet — add one on the Inventory page, Type: Weapon, Ammunition.</div>' : ''}
            ${w.missile.ammoItem ? `
            <div class="form-row">
              <div class="form-group"><label>Damage Dice</label><input class="w-md" value="${w.missile.ammoItem.damageDice||''}" onchange="updateItem(${it.ammunitionItemIdx},'damageDice',this.value);renderCombatModule()"></div>
              <div class="form-group"><label>Dividing Die</label><input type="number" class="w-sm" value="${w.missile.ammoItem.dividingDie||0}" onchange="updateItem(${it.ammunitionItemIdx},'dividingDie',this.value);renderCombatModule()"></div>
              <div class="form-group"><label>Magic Bonus to Hit</label><input type="number" class="w-sm" value="${w.missile.ammoItem.magicBonusToHit||0}" onchange="updateItem(${it.ammunitionItemIdx},'magicBonusToHit',this.value);renderCombatModule()"></div>
              <div class="form-group"><label>Magic Dmg After Divider</label><input type="number" class="w-sm" value="${w.missile.ammoItem.magicDamageAfterDivider||0}" onchange="updateItem(${it.ammunitionItemIdx},'magicDamageAfterDivider',this.value);renderCombatModule()"></div>
            </div>
            ` : ''}
            <div class="note">Missile to-hit = (1 − distance/range) × base hit chance, using ${w.missile.usedGrip} stats${w.missile.usedGrip==='2H' ? ' (no 1H mode available for this weapon)' : ''}. Base hit chance includes both the weapon's own Magic Bonus to Hit and the loaded ammunition's Magic Bonus to Hit — they add together. Total damage = weapon's own dice + ammunition's dice (including its own Magic Damage After Divider), if any.</div>
            ` : ''}
          </div>
        </div>`;
      })()).join('')}

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Armor Breakdown</div>
      <table class="skill-table">
        <thead><tr><th>Item</th><th>AV</th><th>PR</th><th>Notes</th></tr></thead>
        <tbody>
          ${armor.armorItems.length === 0 ? '<tr><td colspan="4" class="note" style="padding:10px 0">No armor items yet. Add them on the Inventory page.</td></tr>' : ''}
          ${armor.armorItems.map(it => `<tr><td>${it.name||'(unnamed)'}</td><td>${it.av||0}</td><td>${it.pr||0}</td><td class="note" style="${it.notes?'font-style:italic':''}">${it.notes||''}</td></tr>`).join('')}
          <tr style="border-top:1px solid var(--gold-dim)"><td><strong>Armor Subtotal</strong></td><td><strong>${armor.armorItems.reduce((s,it)=>s+(parseFloat(it.av)||0),0)}</strong></td><td><strong>${armor.armorItems.reduce((s,it)=>s+(parseFloat(it.pr)||0),0)}</strong></td><td></td></tr>
        </tbody>
      </table>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Weapon Protection & Other Bonuses</div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group"><label>Weapon Protection (PR)</label>
          <input type="number" class="w-sm" value="${armor.weaponProtectionManual}" onchange="updateCombatExtra('weaponProtection',this.value)">
          ${armor.weaponProtectionWielded ? `<div class="note" style="margin-top:2px">+ ${armor.weaponProtectionWielded} from weapons ticked "Wielding" above</div>` : `<div class="note" style="margin-top:2px">Tick "Wielding" on a weapon above to count its Weapon PR automatically.</div>`}
        </div>
      </div>
      <table class="item-table">
        <thead><tr><th>Other Bonus (rings, spells, etc.)</th><th>AV</th><th>PR</th></tr></thead>
        <tbody>
          ${[0,1,2].map(i => {
            const b = armor.otherBonuses[i] || {};
            return `<tr>
              <td><input value="${b.label||''}" placeholder="e.g. Ring of Protection" onchange="updateOtherBonus(${i},'label',this.value)"></td>
              <td class="item-qty"><input type="number" value="${b.av||0}" onchange="updateOtherBonus(${i},'av',this.value)"></td>
              <td class="item-qty"><input type="number" value="${b.pr||0}" onchange="updateOtherBonus(${i},'pr',this.value)"></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Shield Breakdown</div>
      <table class="skill-table">
        <thead><tr><th>Wielding</th><th>Shield</th><th>AV</th><th>Base PR</th><th>Shield Use Bonus</th><th>Effective PR</th><th>Notes</th></tr></thead>
        <tbody>
          ${armor.shieldsComputed.length === 0 ? '<tr><td colspan="7" class="note" style="padding:10px 0">No shield equipped.</td></tr>' : ''}
          ${armor.shieldsComputed.map(s => `<tr><td><input type="checkbox" ${s.wielded ? 'checked' : ''} title="Tick the shield you are carrying: its AV and PR are added to your With Shield totals" onchange="updateWeaponField(${s.idx},'wielded',this.checked)"></td><td>${s.name||'(unnamed)'}</td><td>${s.av}</td><td>${s.basePR}</td><td>+${s.bonus}</td><td><strong>${s.effectivePR}</strong></td><td class="note" style="${s.notes?'font-style:italic':''}">${s.notes||''}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="note">Basic Shield Use skval: ${armor.shieldUseSkval} — bonus = min(skval, base PR) + floor(max(0, skval − base PR) / 10)</div>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Totals</div>
      <table class="skill-table">
        <thead><tr><th></th><th colspan="2">With Shield</th><th colspan="2">No Shield / 2H</th></tr>
        <tr><th></th><th>AV</th><th>PR</th><th>AV</th><th>PR</th></tr></thead>
        <tbody>
          <tr><td>Combined Armor${armor.shieldsComputed.length?' + Shield':''}</td><td>${armor.withShield.sumAV}</td><td>${armor.withShield.sumPR.toFixed(1)}</td><td>${armor.withoutShield.sumAV}</td><td>${armor.withoutShield.sumPR.toFixed(1)}</td></tr>
          <tr><td>Avoidance skill (subtracted)</td><td colspan="2">−${armor.avoidanceSkval}</td><td colspan="2">−${armor.avoidanceSkval}</td></tr>
          <tr><td>Protection skill ÷ 5 (added)</td><td colspan="2">+${(armor.protectionSkval/5).toFixed(1)}</td><td colspan="2">+${(armor.protectionSkval/5).toFixed(1)}</td></tr>
          <tr><td>Weapon Protection</td><td colspan="2">+${armor.weaponProtection}</td><td colspan="2">+${armor.weaponProtection}</td></tr>
          <tr><td>Parry Points Committed</td><td colspan="2">+${armor.parryPointsTotal}</td><td colspan="2">+${armor.parryPointsTotal}</td></tr>
          <tr><td>Other Bonuses</td><td colspan="2">+${armor.sumOtherAV} / +${armor.sumOtherPR}</td><td colspan="2">+${armor.sumOtherAV} / +${armor.sumOtherPR}</td></tr>
          <tr style="border-top:1px solid var(--gold)"><td><strong>Total</strong></td><td><strong>${Math.round(armor.withShield.totalAV)}</strong></td><td><strong>${Math.round(armor.withShield.totalPR)}</strong></td><td><strong>${Math.round(armor.withoutShield.totalAV)}</strong></td><td><strong>${Math.round(armor.withoutShield.totalPR)}</strong></td></tr>
          ${armor.parryPointsTotal > 0 ? `
          <tr><td class="note">vs Missile / Magical attack<br>(Parry excluded)</td><td></td><td>${Math.round(armor.withShield.totalPRvsRangedOrMagic)}</td><td></td><td>${Math.round(armor.withoutShield.totalPRvsRangedOrMagic)}</td></tr>
          ` : ''}
        </tbody>
      </table>

    </div>
  </div>`;
}

// A spell's duration as listed, plus what it works out to at the spell's
// level when the formula uses plev: "30 sec+5 sec plev = 50 sec".
function spellDurationText(duration, level) {
  if (!duration) return '—';
  const actual = evalSpellDuration(duration, level);
  return actual ? `${duration} = ${actual}` : duration;
}

// A spell's per-school cost, biggest first: "Spirit 7, Mentalist 4, Life 1".
function spellCostText(costs) {
  return Object.entries(costs || {}).sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0)).map(([sch, v]) => `${sch} ${v}`).join(', ');
}

// The Celtricia wiki page for a spell, by its name.
function spellWikiUrl(name) {
  return 'http://celtricia.pbworks.com/w/page/' + encodeURIComponent(String(name).trim());
}

function renderSpellModule() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const pools = spellPoolsInOrder(char);
  // Spellbook entries with nothing in them (left by the old "Add Spell") are hidden
  const spellbook = char.spellbook || [];
  const shownSpells = spellbook.map((sp, idx) => ({ sp, idx })).filter(({ sp }) => !isBlankSpell(sp))
    .sort((a, b) => String(a.sp.name || '').localeCompare(String(b.sp.name || ''), undefined, { sensitivity: 'base' }));

  const schoolBreakdown = {};
  for (const { sp } of shownSpells) {
    const school = sp.school || '(no school)';
    if (!schoolBreakdown[school]) schoolBreakdown[school] = { count: 0, totalCost: 0 };
    schoolBreakdown[school].count += 1;
    schoolBreakdown[school].totalCost += parseFloat(sp.cost) || 0;
  }

  document.getElementById('main').innerHTML = `
  <div class="panel">
    <div class="panel-header"><h2>Spells — ${char.name}</h2></div>
    <div class="panel-body">

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Spell Points</div>
      <div class="note" style="margin-bottom:10px">Every spell costs Spirit SP plus whichever other schools it draws on. Short on a school's points? Spirit can cover the gap at the shown conversion ratio — better ratio the more trained (Familiar → Specialized → Devoted) you are in that school relative to your Spirit level. Effective Spell Level (used for duration/range formulas with "plev") gets a bonus once Specialized or Devoted.</div>
      ${pools.length === 0 ? '<div class="note" style="padding:6px 0">No spell point pools trained. Add a pool (e.g. Spirit SP, House of Fire SP) as a skill first.</div>' : ''}
      ${pools.length ? `
      <table class="skill-table spell-pool-table">
        <thead><tr><th></th>${pools.map(p => `<th class="spell-pool-head" title="Open ${escapeHtml(p.name)}" data-pool="${escapeHtml(p.name)}" onclick="openSpellPoolModal(this.dataset.pool)">${escapeHtml(p.name)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><th>Max</th>${pools.map(p => `<td>${p.maxSP}</td>`).join('')}</tr>
          <tr><th>Current</th>${pools.map(p => `<td><input type="number" class="w-sm" value="${p.currentSP}" data-pool="${escapeHtml(p.name)}" onchange="updateSpellState(this.dataset.pool,'current',this.value)"></td>`).join('')}</tr>
          <tr><th>Used</th>${pools.map(p => `<td>${p.usedSP}</td>`).join('')}</tr>
          <tr><th>Familiarity</th>${pools.map(p => `<td>${escapeHtml(p.familiarity)}</td>`).join('')}</tr>
        </tbody>
      </table>
      <div class="note" style="margin-top:4px">Click a pool's name for its details, recovery and Magic Enhancers.</div>` : ''}

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Spellbook</div>
      ${Object.keys(schoolBreakdown).length ? `
      <table class="skill-table" style="margin-bottom:12px">
        <thead><tr><th>School</th><th># Spells</th><th>Total SP Cost</th></tr></thead>
        <tbody>
          ${Object.entries(schoolBreakdown).sort().map(([school,d]) => `<tr><td>${school}</td><td>${d.count}</td><td class="skval-cell">${d.totalCost}</td></tr>`).join('')}
          <tr style="border-top:1px solid var(--gold)"><td><strong>Total</strong></td><td><strong>${shownSpells.length}</strong></td><td><strong>${Object.values(schoolBreakdown).reduce((s,d)=>s+d.totalCost,0)}</strong></td></tr>
        </tbody>
      </table>
      ` : ''}
      <table class="item-table spellbook-table">
        <thead><tr><th>Spell Name</th><th>Level</th><th>Cost</th><th>Duration</th><th>Notes</th><th></th><th></th></tr></thead>
        <tbody>
          ${shownSpells.map(({ sp, idx }) => {
            const catalogEntry = SPELLS.find(s => s.name === sp.name && s.school === sp.school);
            const level = spellLevel(char, sp.school, pools);
            const breakdown = catalogEntry && catalogEntry.costs ? spellCostText(catalogEntry.costs) : (catalogEntry ? '—' : 'not in detail catalog');
            return `
          <tr>
            <td>${sp.name ? `<a class="wiki-link" href="${spellWikiUrl(sp.name)}" target="_blank" rel="noopener" title="Open the wiki page for ${escapeHtml(sp.name)}">${escapeHtml(sp.name)}</a>` : '—'}</td>
            <td>${level}</td>
            <td class="note" style="padding:3px 6px">${breakdown}</td>
            <td>${escapeHtml(spellDurationText(catalogEntry && catalogEntry.duration, level))}</td>
            <td><input value="${sp.notes||''}" onchange="updateSpell(${idx},'notes',this.value)"></td>
            <td>${catalogEntry && catalogEntry.costs ? `<button class="btn btn-gold" style="font-size:11px;padding:3px 8px" onclick="openHardcastModal(${idx})">Cast</button>` : ''}</td>
            <td class="item-del" onclick="removeSpell(${idx})">✕</td>
          </tr>`;
          }).join('') || '<tr><td colspan="7" class="note" style="padding:8px">No spells yet. Use <i>Add Spell</i> below.</td></tr>'}
        </tbody>
      </table>
      <button class="btn btn-gold" onclick="openAddSpellModal()">Add Spell</button>
      <div class="note" style="margin-top:8px">${SPELLS.length} spells cataloged (${SPELLS.filter(s=>s.costs).length} with full per-school cost breakdown). Spirit and Shade schools aren't in this catalog yet.</div>

    </div>
  </div>`;
}

// Spell-point pools in display order: Spirit SP first, then A-Z.
function spellPoolsInOrder(char) {
  return computeSpellPools(char).sort((a, b) => (a.name === 'Spirit SP' ? -1 : b.name === 'Spirit SP' ? 1 : a.name.localeCompare(b.name)));
}

// One pool's details in a dialog (opened from its column header on the
// Spells page). Edits save as they're made, like the rest of the page.
let openSpellPool = null;
function openSpellPoolModal(name) {
  openSpellPool = name;
  renderSpellPoolModal();
}
function renderSpellPoolModal() {
  const char = state.characters[state.activeChar];
  const p = char && openSpellPool && spellPoolsInOrder(char).find(x => x.name === openSpellPool);
  if (!p) return;
  openModal(`
    <h3>${escapeHtml(p.name)}</h3>
    <div class="form-row">
      <div class="computed-item"><span class="ci-label">Max SP</span><span class="ci-value skval">${p.maxSP}</span></div>
      <div class="form-group"><label>Current SP</label><input type="number" class="w-sm" value="${p.currentSP}" onchange="updateSpellState('${p.name.replace(/'/g,"\\'")}','current',this.value)"></div>
      <div class="computed-item"><span class="ci-label">Used SP</span><span class="ci-value">${p.usedSP}</span></div>
      <button class="btn btn-dim" style="align-self:flex-end" onclick="updateSpellState('${p.name.replace(/'/g,"\\'")}','current',${p.maxSP})">Reset to Max</button>
    </div>
    ${p.children.length ? `
    <div class="note" style="margin-top:6px">${p.children.map(c => `${c.name}: ${c.trained ? c.skval : 'not trained'}`).join(' | ')}</div>
    ` : '<div class="note" style="margin-top:6px">No Reclamation/Success/Knowledge subskills trained for this pool.</div>'}
    <hr class="divider">
    <div class="form-row">
      <div class="computed-item"><span class="ci-label">Level</span><span class="ci-value">${p.level}</span></div>
      <div class="computed-item"><span class="ci-label">Familiarity</span><span class="ci-value skval">${p.familiarity}</span></div>
      ${p.conversionRatio ? `<div class="computed-item"><span class="ci-label">Spirit Conversion</span><span class="ci-value">${p.conversionRatio}:1</span></div>` : ''}
      <div class="computed-item"><span class="ci-label">Effective Spell Level</span><span class="ci-value skval">${p.effectiveLevel}</span></div>
    </div>
    <div class="form-row">
      <div class="computed-item"><span class="ci-label">Recovery (Awake)</span><span class="ci-value">${p.recoverAwake} SP/hr</span></div>
      <div class="computed-item"><span class="ci-label">Recovery (Sleeping)</span><span class="ci-value skval">${p.recoverSleep} SP/hr</span></div>
    </div>
    ${p.conversionRatio ? `<div class="note">If short on ${p.name.replace(' SP','')} points, Spirit SP can cover the gap at a ${p.conversionRatio}:1 ratio (${p.conversionRatio} Spirit per 1 point needed).</div>` : '<div class="note">Spirit is the base power source — no conversion needed for itself.</div>'}
    <div class="note">Recovery = Reclamation skval [${p.reclamationSkval}] × 10% (awake) or × 20% (sleeping) per hour. Capped at 3 different types/hour awake, 5 while sleeping (per Rules for Magic — not yet enforced across pools here).</div>
    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Magic Enhancers (manual — enter the net result of whichever item you're currently bonded to)</div>
    <div class="form-row">
      <div class="form-group"><label>SP Cost Reduction</label><input type="number" class="w-sm" value="${p.spReduction}" onchange="updateSpellEnhancer('${p.name}','spReduction',this.value)"></div>
      <div class="form-group"><label>Reclamation Rate Bonus</label><input type="number" class="w-sm" value="${p.reclamationBonus}" onchange="updateSpellEnhancer('${p.name}','reclamationBonus',this.value)"></div>
      <div class="form-group"><label>Spell Success Bonus</label><input type="number" class="w-sm" value="${p.successBonus}" onchange="updateSpellEnhancer('${p.name}','successBonus',this.value)"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-gold" onclick="openSpellPool=null;closeModal()">Close</button></div>`, { wide: true });
}

function renderUtilitiesModule() {
  const custom = loadCustomData();
  const typeOrder = SKILL_TYPE_ORDER;

  document.getElementById('main').innerHTML = `
  <div class="panel">
    <div class="panel-header"><h2>Utilities</h2></div>
    <div class="panel-body">
      <div class="note" style="margin-bottom:12px">Quick patches for the master skill/guild data — for when a character needs a skill or guild EXPMOD that doesn't exist yet, without waiting for a full data re-extraction. These are stored separately from character data — see "Export Custom Data" below to back them up.</div>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Add New Skill</div>
      <div class="form-row">
        <div class="form-group"><label>Type</label>
          <select id="ns-type">${typeOrder.map(t=>`<option>${t}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Skill Name</label><input id="ns-name" class="w-lg"></div>
        <div class="form-group"><label>Commonality</label><input id="ns-comm" type="number" class="w-sm" value="1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Attribute Modifier Formula</label><input id="ns-attmod" class="w-lg" placeholder="e.g. ((ST-12)*.02)+((CD-10)*.01)"></div>
        <div class="form-group"><label>Base</label><input id="ns-base" type="number" class="w-sm" value="0"></div>
        <div class="form-group"><label>Per Level Die</label><input id="ns-perlevel" class="w-sm" placeholder="e.g. 1D6+1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Parent Skill (blank if root)</label><input id="ns-parent" class="w-lg"></div>
        <div class="form-group"><label>Dropdown % (blank if root)</label><input id="ns-dropdown" type="number" step="0.01" class="w-sm"></div>
      </div>
      <button class="btn btn-gold" onclick="addCustomSkill()">Add Skill to Master List</button>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Add Guild EXPMOD (bxp)</div>
      <div class="form-row">
        <div class="form-group w-lg"><label>Guild</label>
          <input type="hidden" id="ge-guild" value="">
          <button type="button" id="ge-guild-label" class="btn btn-dim" style="width:100%;text-align:left" onclick="pickGuildIntoField('ge-guild','ge-guild-label')">— existing —</button>
        </div>
        <div class="form-group"><label>Or New Guild Name</label><input id="ge-newguild" class="w-lg" placeholder="e.g. Igbar: New Guild"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Skill Name</label>
          <input id="ge-skill" class="w-lg" list="skill-name-list" placeholder="Start typing a skill name...">
          <datalist id="skill-name-list">${SKILLS.map(s=>`<option value="${s.name}">`).join('')}</datalist>
        </div>
        <div class="form-group"><label>Guild EXPMOD (bxp)</label><input id="ge-bxp" type="number" step="0.001" class="w-sm"></div>
      </div>
      <button class="btn btn-gold" onclick="addCustomGuildBonus()">Set Guild EXPMOD</button>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Custom Additions So Far</div>
      <div class="note" style="margin-bottom:8px">These are stored in this browser only, separately from character data. If you switch browsers or clear site data, they won't transfer with a character JSON export — use "Export Custom Data" below to back them up separately.</div>
      <table class="skill-table">
        <thead><tr><th>Type</th><th>Detail</th><th></th></tr></thead>
        <tbody>
          ${custom.customSkills.map((s,i)=>`<tr><td>Skill</td><td>${s.name} (${s.type})</td><td class="item-del" onclick="removeCustomSkill(${i})">✕</td></tr>`).join('')}
          ${Object.entries(custom.customGuildBonuses).flatMap(([g,skills])=>Object.entries(skills).map(([sk,v])=>
            `<tr><td>Guild EXPMOD</td><td>${g} — ${sk}: ${v}</td><td class="item-del" onclick="removeCustomGuildBonus('${g.replace(/'/g,"\\'")}','${sk.replace(/'/g,"\\'")}')">✕</td></tr>`
          )).join('')}
          ${(custom.customSkills.length===0 && Object.keys(custom.customGuildBonuses).length===0) ? '<tr><td colspan="3" class="note" style="padding:8px 0">Nothing added yet.</td></tr>' : ''}
        </tbody>
      </table>
      <button class="btn btn-dim" style="margin-top:8px" onclick="exportCustomData()">Export Custom Data</button>
      <button class="btn btn-dim" style="margin-top:8px" onclick="importCustomData()">Import Custom Data</button>
    </div>
  </div>`;
}

function renderSkillModule(skillId) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const si = (char.skills || []).find(s => s.id === skillId);
  if (!si) return;
  const def = findSkillDef(si.skillName);
  const vals = computeSkillValues(si, char, char.skills || []);
  // A sub-skill shows its parent as plain text: the skill it's linked to, else
  // its parent in the skill catalog. Top-level and templated skills (linked
  // through Weapon Class instead) show no Parent Skill at all.
  const parentInst = si.parentSkillId && (char.skills || []).find(s => s.id === si.parentSkillId);
  const parentName = def && def.templated ? '' : parentInst ? parentInst.skillName + (parentInst.binding ? ` (${parentInst.binding})` : '') : (def && def.parent ? def.parent : '');
  // A top-level (parent) skill can't be dropdown-only, so it gets no Dropdown Only checkbox.
  const isParentSkill = !parentName && !(def && def.templated);
  const rolls = si.rolls || Array(20).fill('');

  // Build EXPMOD breakdown
  const breakdown = !def ? "not calculated: this skill isn't in the skill catalog" : `Guild: ${vals.guildBase.toFixed(3)} + Attrib: ${vals.attmodResult.toFixed(3)} + Racial: ${vals.racialExpmod.toFixed(3)} = ${vals.expmod.toFixed(3)}`;

  document.getElementById('main').innerHTML = `
  <div class="panel">
    <div class="panel-header">
      <h2>${si.skillName}${si.binding ? ` — ${si.binding}` : ''}</h2>
      ${def ? `<span class="type-badge">${def.type}</span>` : `<span class="type-badge skill-unknown" title="No skill in the catalog matches this name, so its EXPMOD, level and skill value can't be calculated">⚠ Not in skill catalog</span>`}
      <span class="type-badge">Comm ${def ? def.commonality : '?'}</span>
      ${def && def.templated ? '<span class="type-badge" style="color:var(--gold)">TEMPLATED</span>' : ''}
      <span class="${si.dropdownOnly ? 'status-dropdown' : 'status-trained'}">${si.dropdownOnly ? '◈ Dropdown Only' : '◆ Trained'}</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-dim" onclick="showOverview()">← Back</button>
        <button class="btn btn-red" onclick="deleteSkill('${skillId}')">Remove</button>
      </div>
    </div>
    <div class="panel-body">

      <!-- COMPUTED SUMMARY -->
      <div class="computed-row">
        <div class="computed-item"><span class="ci-label">EXPMOD</span><span class="ci-value">${vals.expmod.toFixed(3)}</span></div>
        <div class="computed-item"><span class="ci-label">Raw XP</span><span class="ci-value">${(parseFloat(si.rawXP)||0).toLocaleString()}</span></div>
        <div class="computed-item"><span class="ci-label">Adj XP</span><span class="ci-value">${Math.round(vals.adjXP).toLocaleString()}</span></div>
        <div class="computed-item"><span class="ci-label">Level</span><span class="ci-value">${vals.level}</span></div>
        <div style="width:1px;background:var(--border);margin:0 4px"></div>
        <div class="computed-item"><span class="ci-label">Attrib Bonus</span><span class="ci-value">${vals.attribBonus}</span></div>
        <div class="computed-item"><span class="ci-label">Roll Total</span><span class="ci-value">${vals.rollTotal}</span></div>
        <div class="computed-item"><span class="ci-label">Dropdown</span><span class="ci-value">${vals.dropdownBonus}</span></div>
        <div class="computed-item"><span class="ci-label">Bonuses</span><span class="ci-value">${(parseFloat(si.bonusItem)||0)+(parseFloat(si.bonusRace)||0)+(parseFloat(si.bonusMagic)||0)+(parseFloat(si.bonusOther)||0)}</span></div>
        <div style="width:1px;background:var(--gold-dim);margin:0 4px"></div>
        <div class="computed-item"><span class="ci-label">SKVAL</span><span class="ci-value skval">${vals.skval}</span></div>
      </div>

      <!-- CONFIGURATION -->
      <div class="form-row">
        <div class="form-group w-lg"><label>GuildSchool</label>
          ${skillGuildSelect(char, si)}
        </div>
        ${def && def.templated ? (si.skillName === 'Single weap spec' ? `
        <div class="form-group"><label>Specific Weapon (not a class — this skill trains on one weapon only)</label>
          <select class="w-lg" onchange="updateSkill('${skillId}','binding',this.value)">
            <option value="">— select —</option>
            ${allCombatWeapons(char).map(it=>`<option ${si.binding===it.name?'selected':''}>${it.name||'(unnamed weapon)'}</option>`).join('')}
          </select>
          <div class="note" style="margin-top:4px">Single Weapon Specialization trains on one exact weapon, not a whole weapon type — a character with two curved swords could be specialized in one and not the other.</div>
        </div>` : `
        <div class="form-group"><label>Weapon Class</label>
          <select class="w-lg" onchange="updateSkill('${skillId}','binding',this.value)">
            <option value="">— select —</option>
            ${WEAPON_CLASSES.map(wc=>`<option ${si.binding===wc?'selected':''}>${wc}</option>`).join('')}
          </select>
        </div>`) : ''}
        ${isParentSkill ? '' : `
        <div class="form-group" style="justify-content:flex-end;margin-top:4px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" ${si.dropdownOnly?'checked':''} onchange="updateSkill('${skillId}','dropdownOnly',this.checked)">
            Dropdown Only
          </label>
        </div>`}
      </div>

      ${parentName ? `
      <div class="form-row">
        <div class="form-group"><label>Parent Skill</label>
          <div style="padding-top:6px">${escapeHtml(parentName)}</div>
        </div>
      </div>` : ''}

      <div class="form-row">
        <div class="form-group"><label>Racial EXPMOD Bonus</label>
          <div style="display:flex;gap:4px">
            <input type="number" step="0.001" class="w-sm" value="${si.racialExpmod||0}" onchange="updateSkill('${skillId}','racialExpmod',this.value)">
            <button class="btn btn-dim" style="padding:5px 8px;font-size:11px" onclick="updateSkill('${skillId}','racialExpmod',lookupRacialBonus(state.characters[state.activeChar],'${si.skillName.replace(/'/g,"\\'")}'))" title="Look up from race/subrace table">↻</button>
          </div>
        </div>
      </div>

      <div class="expmod-breakdown">EXPMOD breakdown: ${breakdown}</div>
      <div class="note" style="margin-top:2px">Attmod formula: ${def ? def.attmod : '—'} | Base: ${def ? def.base : '—'} | Per Level: ${def ? def.per_level : '—'}</div>

      <hr class="divider">

      <!-- RAW XP -->
      <div class="form-row" style="align-items:flex-end">
        <div class="form-group"><label>Raw XP</label>
          <input type="number" class="w-sm" value="${si.rawXP||0}" onchange="updateSkill('${skillId}','rawXP',this.value)">
        </div>
        <div class="computed-item" style="margin-bottom:2px"><span class="ci-label">→ Adj XP</span><span class="ci-value" style="font-size:14px">${Math.round(vals.adjXP).toLocaleString()}</span></div>
        <div class="computed-item" style="margin-bottom:2px"><span class="ci-label">→ Level</span><span class="ci-value" style="font-size:14px;color:#4a9460">${vals.level}</span></div>
        ${!si.dropdownOnly ? `<div class="computed-item" style="margin-bottom:2px"><span class="ci-label">Next Level at Adj XP</span><span class="ci-value" style="font-size:12px;color:var(--text-dim)">${nextLevelThreshold(vals.level)}</span></div>` : ''}
        ${!si.dropdownOnly ? `<div class="computed-item" style="margin-bottom:2px"><span class="ci-label">Next Level at Raw XP</span><span class="ci-value" style="font-size:12px;color:var(--text-dim)">${nextLevelThresholdRaw(vals.level, vals.expmod)}</span></div>` : ''}
      </div>

      <!-- LEVEL ROLLS -->
      ${!si.dropdownOnly ? `
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px">Level Rolls (${def ? def.per_level : '?'} per level)</div>
        ${def && def.per_level ? `<button type="button" class="btn btn-dim" style="font-size:11px;padding:2px 8px" onclick="rollAllEmptyLevels('${skillId}')" title="Rolls ${def.per_level} for every empty level up to the skill's current level (${vals.level})">🎲 Roll Skill Levels</button>` : ''}
      </div>
      <div class="rolls-grid">
        ${Array.from({length:20}, (_,i) => {
          const v = rolls[i] || '';
          return `<div style="display:flex;gap:2px">
            <input type="number" min="0" value="${v}" placeholder="${i+1}" class="${v?'has-val':''}" style="flex:1;min-width:0"
              onchange="updateRoll('${skillId}',${i},this.value);this.className=this.value?'has-val':''">
            ${def && def.per_level ? `<button type="button" class="btn btn-dim" style="padding:2px 5px;font-size:10px" title="Roll ${def.per_level} for level ${i+1}" onclick="rollLevelSlot('${skillId}',${i})">🎲</button>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="note">Rolls entered: ${rolls.filter(v=>v!==''&&v!==undefined).length} / 20 | Sum: ${vals.rollTotal} — 🎲 rolls real dice (per-level formula above) instead of a physical die; use whichever you prefer per level.</div>
      ` : '<div class="note">Dropdown Only — no XP or rolls tracked</div>'}

      <hr class="divider">

      <!-- BONUSES -->
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Bonus Amounts (flat additions to skval)</div>
      <div class="form-row">
        ${['Item','Race','Magic','Other'].map(t=>`
        <div class="form-group"><label>${t}</label>
          <input type="number" class="w-sm" value="${si['bonus'+t]||0}" onchange="updateSkill('${skillId}','bonus${t}',this.value)">
        </div>`).join('')}
      </div>

      <hr class="divider">
      <div class="form-group"><label>Notes</label>
        <textarea class="w-full" rows="2" style="resize:vertical" onchange="updateSkill('${skillId}','notes',this.value)">${si.notes||''}</textarea>
      </div>

      ${(!si.dropdownOnly && def && parseFloat(si.rawXP) > 0 && (!def.templated || WEAPON_CLASSES.includes(si.binding))) ? `
      <div style="margin-top:10px">
        <button class="btn btn-dim" onclick="manualPopulateChildren('${skillId}')">Populate Missing Dropdown Skills</button>
        <div class="note" style="margin-top:4px">Adds any dropdown-only sub-skills of ${si.skillName} that aren't already on this character — useful for skills trained before this feature existed.</div>
      </div>
      ` : ''}

    </div>
  </div>`;
}

// A skill can only come from one of the character's own GuildSchools
// (Primary/Secondary/Tertiary on General Info). A skill already tagged with
// some other guild keeps it in the list, marked, so it isn't changed silently.
function skillGuildSelect(char, si) {
  const charGuilds = [...new Set([char.guild, char.guild2, char.guild3].filter(Boolean))];
  const current = si.guildName || '';
  const options = charGuilds.map(g => `<option value="${escapeHtml(g)}" ${g === current ? 'selected' : ''}>${escapeHtml(g)}</option>`);
  if (current && !charGuilds.includes(current)) {
    options.push(`<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (not one of this character's guilds)</option>`);
  }
  return `<select class="w-full"  ${current ? `title="${escapeHtml(guildBlurbOrPlaceholder(current))}"` : ''} onchange="updateSkill('${si.id}','guildName',this.value)">
    <option value="" ${current ? '' : 'selected'}>— none —</option>
    ${options.join('')}
  </select>
  ${charGuilds.length ? '' : '<div class="note" style="margin-top:2px">Set this character\'s GuildSchools on General Info first.</div>'}`;
}

function nextLevelThreshold(level) {
  const next = LEVELS.find(r => r.level === level + 1);
  return next ? next.from.toLocaleString() : '—';
}
// Raw XP is what the player actually enters; Adj XP = Raw XP * expmod is what
// levels are looked up against. Inverts that to show how much raw XP is
// needed to cross the next level's Adj XP threshold at the current expmod.
function nextLevelThresholdRaw(level, expmod) {
  const next = LEVELS.find(r => r.level === level + 1);
  if (!next || expmod <= 0) return '—';
  return Math.ceil(next.from / expmod).toLocaleString();
}
