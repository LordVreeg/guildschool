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
    <div class="computed-item"><span class="ci-label">Weight Possible${infoTip(`ST×90 + HE×10 + (Basic Move skval×10) + (Ignore Encumbrance skval×10)`)}</span><span class="ci-value">${w.possible.toLocaleString()}</span></div>
    <div class="computed-item"><span class="ci-label">Weight Carried</span><span class="ci-value" style="color:${over?'#c05050':'var(--gold)'}">${w.carried.toLocaleString()}</span></div>
  </div>
  <div class="weight-bar-track"><div class="weight-bar-fill ${over?'over':''}" style="width:${pct}%"></div></div>
  `;
}

// The Inventory title bar's centre: Weight Carried, with a small gauge under
// it running green (nothing carried) to red (Weight Possible reached).
function inventoryWeightGaugeHtml(char) {
  const w = computeWeight(char);
  const pct = w.possible > 0 ? Math.min(100, (w.carried / w.possible) * 100) : (w.carried > 0 ? 100 : 0);
  const over = w.carried > w.possible;
  const tip = `Max weight: ${w.possible.toLocaleString()}
Current weight: ${w.carried.toLocaleString()}
ST×90 + HE×10 + (Basic Move skval×10) + (Ignore Encumbrance skval×10)`;
  return `<div class="inventory-weight">
      <div class="computed-item"><span class="ci-label">Weight Carried${infoTip(tip)}</span></div>
      <div class="weight-gauge${over ? ' over' : ''}"><div class="weight-gauge-rest" style="left:${pct}%"></div></div>
    </div>`;
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
`;
        }
        return `
        <div class="computed-item" style="margin-bottom:4px"><span class="ci-label">Current / Max HP</span><span class="ci-value skval">${hp.currentHP} / ${hp.totalHP}</span></div>
`;
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
          <div class="computed-item"><span class="ci-label">Adjusted Speed${infoTip(`CD/4 + 10 + (Speed Move skval÷10), scaled by (1 − Weight Carried/Weight Possible)`)}</span><span class="ci-value">${Math.round(sp.adjustedSpeed)} ft/sec</span></div>
          <div class="computed-item"><span class="ci-label">Dash/Rout Speed${infoTip(`Dash/Rout Speed = Adjusted Speed × 2 (charging or fleeing full rout). Max Distance = ((WI÷4) + HE) × 4 yards.`)}</span><span class="ci-value skval">${Math.round(sp.dashRoutSpeed)} ft/sec</span></div>
          <div class="computed-item"><span class="ci-label">Dash/Rout Max Distance</span><span class="ci-value">${Math.round(sp.dashRoutMaxDistance)} yds</span></div>
        </div>
        ${sp.armoredMoveTrained ? '<div class="warn">Armored Move is trained, but its exact speed formula is not documented in the wiki — not factored in yet.</div>' : ''}
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

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Campaign Settings</div>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" ${computeHP(char).system==='collegium'?'checked':''} onchange="updateHPState('system', this.checked ? 'collegium' : 'standard')">
        Collegium System (uncheck for Standard)${infoTip('How Hit Points work. Standard: one HP pool. Collegium: Physical and Endurance; damage hits Endurance first, and Physical is only touched once Endurance is depleted. Physical = ceil(total ÷ 2), Endurance = floor(total ÷ 2).')}
      </label>
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

// The Inventory's sections, in order, and which one an item goes in.
const INVENTORY_SECTIONS = ['Armor & Weapons', 'Scrolls', 'Potions', 'Magic Items', 'Items', 'Money', 'Spell Books'];
function inventorySectionOf(it) {
  if (['Weapon', 'Shield', 'Armor', 'Ammunition'].includes(it.type)) return 'Armor & Weapons';
  if (it.type === 'Spell Book') return 'Spell Books';
  if (it.type === 'Coin') return 'Money';
  const rule = itemSpellRule(it);
  if (rule === 'scroll') return 'Scrolls';
  if (rule === 'potion') return 'Potions';
  if (it.type === 'Magic Item') return 'Magic Items';
  return 'Items';
}

// The line under a magical item listing its modifiers, and whether they're in
// effect right now (worn / wielded / carried, see itemModsInUse).
function itemModsLineHtml(char, it) {
  if (!itemModKinds(it)) return '';
  const fmt = (v, suffix) => { const n = parseFloat(v) || 0; return n ? (n > 0 ? '+' : '') + n + (suffix || '') : ''; };
  const bits = [];
  if (itemHasModKind(it, 'offense')) {
    const o = [['To hit', fmt(it.magicBonusToHit)], ['Dmg before divider', fmt(it.magicDamageBeforeDivider)], ['Dmg after divider', fmt(it.magicDamageAfterDivider)], ['Crit', fmt(it.magicCritBonus, '%')]].filter(x => x[1]);
    if (o.length) bits.push(o.map(x => `${x[0]} ${x[1]}`).join(', '));
  }
  if (itemHasModKind(it, 'defense')) {
    const dd = [['Avoidance', fmt(it.magicAvoidance)], ['Protection', fmt(it.magicProtection)]].filter(x => x[1]);
    if (dd.length) bits.push(dd.map(x => `${x[0]} ${x[1]}`).join(', '));
  }
  if (itemHasModKind(it, 'void')) {
    const v = (it.magicVoid || []).filter(x => x.pool && parseFloat(x.amount)).map(x => `${x.pool} −${parseFloat(x.amount)}`);
    if (v.length) bits.push('Void: ' + v.join(', ') + (it.magicVoidStacks ? ' (stacks)' : ''));
  }
  if (!bits.length) return '';
  const inUse = itemModsInUse(char, it, shieldsCountedItems(char));
  const why = it.type === 'Ammunition' ? "pick it as a missile weapon's ammunition on the Combat page" : (it.type === 'Weapon' || it.type === 'Shield' || it.type === 'Armor') ? 'carry it and tick In Use' : 'carry it on your person';
  return `<tr class="item-spell-row"><td colspan="9">◈ ${escapeHtml(bits.join(' · '))}${inUse ? '' : ` <span style="color:#c05050" title="Not counting right now: ${why}">(not in use)</span>`}</td></tr>`;
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

// The Inventory's In Use tick, for weapons, shields and armor carried on the
// person (an item in a container that isn't on the person can't be in use).
// Inventory warnings that pair ammunition with weapons (see ammoFitsWeapon):
// ammunition no weapon owned can fire, and a weapon that takes ammunition
// with none of it owned. Wherever the items are kept.
function inventoryAmmoWarning(char, it) {
  const items = char.items || [];
  if (it.type === 'Ammunition') {
    const fired = items.some(w => w.type === 'Weapon' && weaponTakesAmmo(w) && ammoFitsWeapon(it, w));
    return fired ? '' : '<div class="warn">⚠ No compatible weapon</div>';
  }
  if (it.type === 'Weapon' && weaponTakesAmmo(it)) {
    const owned = items.some(a => a.type === 'Ammunition' && ammoFitsWeapon(a, it));
    return owned ? '' : '<div class="warn">⚠ No ammunition owned for this weapon</div>';
  }
  return '';
}

function inUseCellHtml(char, it, idx) {
  if (it.type !== 'Weapon' && it.type !== 'Shield' && it.type !== 'Armor') return '';
  if (!itemOnPerson(char, it)) return '<span class="note" title="Not on the person: in a container">—</span>';
  return `<input type="checkbox" ${itemInUse(char, it) ? 'checked' : ''} title="${it.type === 'Armor' ? 'Worn' : 'In hand. One two-handed weapon, two one-handed weapons, or a one-handed weapon and a shield.'}" onchange="setItemInUse(${idx}, this.checked)">`;
}

// Read-only inventory rows, grouped into folding sections by kind
// (INVENTORY_SECTIONS); the Location column says where each one is kept.
function inventoryGroupsHtml(char) {
  const entries = (char.items || []).map((it, idx) => ({ it, idx })).filter(({ it }) => !isBlankItem(it));
  const containers = itemLocations(char);
  const where = it => (it.location || '').trim();
  const html = INVENTORY_SECTIONS.map(section => {
    const rows = entries.filter(({ it }) => inventorySectionOf(it) === section);
    if (!rows.length) return '';
    // within a section: Carried first, then the containers in their set order, then by name
    const rank = it => where(it) ? 1 + containers.indexOf(where(it)) : 0;
    rows.sort((a, b) => (rank(a.it) - rank(b.it)) || String(a.it.name || '').localeCompare(String(b.it.name || ''), undefined, { sensitivity: 'base' }));
    const hidden = collapsedItemGroups.has(section);
    const count = rows.length;
    return `<tr class="item-group" data-group="${escapeHtml(section)}" title="${hidden ? 'Show' : 'Hide'} these items" onclick="toggleItemGroup(this.dataset.group)"><td colspan="9"><span class="item-group-toggle">${hidden ? '▸' : '▾'}</span>${escapeHtml(section)}<span class="item-group-stats">(${count})</span></td></tr>` +
      (hidden ? '' : rows.map(({ it, idx }) => { const warn = inventoryAmmoWarning(char, it); return `<tr class="item-row" style="${it.masterwork ? 'font-style:italic' : ''}">
        <td>${escapeHtml(it.name || '')}</td>
        <td class="item-kind">${escapeHtml(itemKindLabel(it))}</td>
        <td class="item-kind">${where(it) ? escapeHtml(where(it)) : 'Carried'}</td>
        <td class="item-qty">${escapeHtml(it.qty || 1)}</td>
        <td style="text-align:center">${inUseCellHtml(char, it, idx)}</td>
        <td style="text-align:center">${it.masterwork || it.type === 'Magic Item' ? '✓' : ''}</td>
        <td class="item-kind">${warn || escapeHtml(it.notes || '')}</td>
        <td class="item-edit" title="Edit" onclick="openEditItemModal(${idx})">✎</td>
        <td class="item-del" title="Delete" onclick="removeItem(${idx})">✕</td>
      </tr>` + itemModsLineHtml(char, it) + itemSpellRowsHtml(char, it, idx, 9); }).join(''));
  }).join('');
  return html || `<tr><td colspan="9" class="note">No items yet. Use <i>Add Item</i> below.</td></tr>`;
}

// A row per spell on an item, with Cast (and ↺ where uses come back), under
// the item's row on the Inventory page and the Combat page.
function itemSpellRowsHtml(char, it, idx, colspan) {
  if (!itemCanHoldSpells(it)) return '';
  return (it.spells || []).map((sp, j) => {
        const left = itemSpellUsesLeft(sp, char);
        const rule = itemSpellRule(it);
        return `<tr class="item-spell-row"><td colspan="${colspan}">✦ <a class="wiki-link" href="${spellWikiUrl(sp.name)}" target="_blank" rel="noopener">${escapeHtml(sp.name)}</a> · Level ${sp.level} · <span style="${left > 0 ? '' : 'color:#c05050'}" title="${rule ? 'Used up as it is cast; does not come back' : sp.period === 'charges' ? 'Charges only come back with ↺' : characterClockSeconds(char) != null ? 'Comes back as the group clock passes into the next ' + escapeHtml(itemSpellPeriodLabel(sp.period).replace(/^per /, '')) + ', or with ↺' : 'Comes back with ↺ (or as the group clock passes, once this character is in a group)'}">${escapeHtml(itemSpellUsageText(sp, char, rule))}</span>
          <button class="btn btn-gold item-spell-btn" ${left > 0 ? '' : 'disabled'} title="Cast ${escapeHtml(sp.name)} from this item" onclick="openItemCastModal(${idx},${j})">Cast</button>
          ${rule ? '' : `<button class="btn btn-dim item-spell-btn" title="Reset its uses" onclick="rechargeItemSpell(${idx},${j})">↺</button>`}</td></tr>`;
      }).join('');
}

function renderInventoryModule() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const totalWorth = (char.items||[]).reduce((sum,it)=>sum+((parseFloat(it.worth)||0)*(parseFloat(it.qty)||1)),0);

  document.getElementById('main').innerHTML = `
  <div class="panel plain-font">
    <div class="panel-header inventory-header"><h2>Inventory</h2>
      ${inventoryWeightGaugeHtml(char)}
      <div class="computed-item inventory-worth"><span class="ci-label">Total Worth</span><span class="ci-value">${totalWorth.toLocaleString()}</span></div>
    </div>
    <div class="panel-body">
      <table class="item-table inventory-table">
        <thead><tr><th>Item</th><th>Type</th><th>Location</th><th>Qty</th><th title="Weapons and shields in hand, armor worn: these are what the Combat page counts">In Use</th><th>MW/Magic</th><th>Notes</th><th></th><th></th></tr></thead>
        <tbody>${inventoryGroupsHtml(char)}</tbody>
      </table>
      <button class="btn btn-gold" onclick="openAddItemModal()">Add Item</button>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px">Storage Locations${infoTip(`Capacity is how much weight a container can hold (blank = no limit); On Person's is your Weight Possible. Tick On Person on a container you wear or carry so its contents count toward Weight Carried; one marked Does not encumber adds no weight.`)}</div>
      <table class="item-table inventory-table">
        <thead><tr><th>Container</th><th>On Person</th><th>Items</th><th>Weight</th><th>Capacity</th><th>Available Capacity</th><th>Worth</th><th></th><th></th><th></th></tr></thead>
        <tbody>
          ${computeStorageSummary(char).map(g => {
            const isPerson = g.location === ON_PERSON_LOCATION;
            const over = g.over ? 'color:#c05050' : '';
            return `<tr data-container="${escapeHtml(g.location)}">
            <td>${isPerson ? 'On Person' : escapeHtml(g.location)}${g.noEncumber ? ' <span class="item-group-stats">(does not encumber)</span>' : ''}</td>
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

// Which grip rows to show for a weapon: one weapon in use alone is held in two
// hands (only its Two-Handed stats); with a second weapon or a shield in hand
// it is held in one (only its One-Handed stats). A weapon that isn't in use,
// or has stats for only one grip, shows what it has (see computeWielding).
function weaponGripsShown(char, it, w) {
  const mode = itemInUse(char, it) ? computeWielding(char).mode : null;
  return {
    one: !(mode === 'two' && w.twoHand),
    two: !(mode === 'one' && w.oneHand)
  };
}

// One Combat-page weapon entry (see combatWeaponEntries) as its attack lines:
// One-Handed / Two-Handed as the weapon is held (weaponGripsShown), plus
// Missile (a weapon that fires ammunition) or Throw. Shared by the weapons
// table and /att. Returns { it, w, lines } or null when there is no weapon.
function weaponAttackLines(char, entry) {
  const it = entry.kind === 'hand' ? handFootWeapon(char) : entry.it;
  if (!it) return null;
  const w = computeWeapon(char, it);
  const lines = [];
  const grips = entry.kind === 'item' ? weaponGripsShown(char, it, w) : { one: true, two: true };
  if (w.oneHand && grips.one) lines.push({ grip: 'One-Handed', which: 'one', v: w.oneHand });
  if (w.twoHand && grips.two) lines.push({ grip: 'Two-Handed', which: 'two', v: w.twoHand });
  // a weapon that fires ammunition shoots (Missile); any other missile use is a throw
  if (w.missile) lines.push({ grip: weaponTakesAmmo(it) ? 'Missile' : 'Throw', missile: w.missile });
  return { it, w, lines };
}

// Marks the One-/Two-Handed row that applies to a wielded weapon (see computeWielding).
function wieldTag(it, which) {
  const c = state.characters[state.activeChar];
  if (!c || !itemInUse(c, it) || computeWielding(c).mode !== which) return '';
  return ' <span class="type-badge" style="color:var(--gold)">in use</span>';
}

// Crit and Fumble show one number each (see fmtCrit, fmtFumble).
const CRIT_HELP = 'A roll at or under this crits.';
const THREAT_RANGE_HELP = "Directly affects the weapon's critical chance: it is added to (or, if negative, taken off) the Crit number.";
const FUMBLE_HELP = 'A roll at or over this fumbles: 93, or the to hit itself when that is higher (wiki "Critical Hits").';
// Init Roll (wiki "Initiative"): the die plus the action's speed.
const INIT_ROLL_HELP = 'The initiative die plus the speed (the weapon speed, adjusted for coordination, less 1 per 10 points of Initiative bonus for this weapon class; never below 1). d10 when you are in the melee; d8 for missile fire into a combat. Out of the fight and unaffected by it, use a d6; the first round of a total surprise, a d4. Add any penalties (unsheathing +1, reading a scroll +5, ...) and the current segment.';

// Dmg Roll: (the dice + any magic damage before the divider) ÷ the dividing
// die, then the damage bonus (strength and magic after the divider), as in
// the wiki's "(1d12+17/d6)+1". e.g. "((2d6+9)/d8)+4".
const DMG_ROLL_HELP = 'Roll the dice (plus any magic damage before the divider), divide by the dividing die, then add the damage bonus: strength, +1 per 10 points of Damage Bonus for this weapon class, and any magic damage after the divider.';
function damageRollText(dice, before, divider, after) {
  dice = String(dice || '').trim();
  if (!dice) return '—';
  const signed = n => (n < 0 ? '−' : '+') + Math.abs(n);
  const b = Math.round(parseFloat(before) || 0), d = parseFloat(divider) || 0, a = Math.round(parseFloat(after) || 0);
  // fold the magic into a flat number already on the dice: 2d6+19 and +1 → 2d6+20
  const flat = dice.match(/^(.*\d[dD]\d+)\s*([+-]\s*\d+)$/);
  const top = !b ? dice : flat ? `${flat[1]}${signed(parseInt(flat[2].replace(/\s/g, ''), 10) + b)}` : `${dice}${signed(b)}`;
  // the bonus comes after the division, so the divided part gets its own parens
  const divided = d ? `(${top})/d${d}` : top;
  return a ? `${d ? `(${divided})` : divided}${signed(a)}` : divided;
}
// A missile shot: the weapon's dice plus the loaded ammunition's, over the
// weapon's dividing die (or the ammunition's, if the weapon has none).
function missileDamageRollText(it, m) {
  const ammo = m.ammoItem;
  const dice = [it.damageDice, ammo && ammo.damageDice].map(x => String(x || '').trim()).filter(Boolean).join('+');
  return damageRollText(dice, m.magicDmgBefore, parseFloat(it.dividingDie) || (ammo && parseFloat(ammo.dividingDie)) || 0, m.dmgAfter);
}

function renderCombatModule() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const armor = computeArmor(char);
  const weaponEntries = combatWeaponEntries(char);
  const hp = computeHP(char);
  // weapons in use that fire ammunition but have none loaded, or the wrong kind
  const ammoWarnings = weaponEntries.filter(e => e.kind === 'item' && weaponTakesAmmo(e.it)).map(e => {
    const am = e.it.ammunitionItemIdx !== undefined && e.it.ammunitionItemIdx !== '' ? (char.items || [])[e.it.ammunitionItemIdx] : null;
    if (!am || am.type !== 'Ammunition') return `${e.it.name || 'A weapon'}: no ammunition loaded.`;
    return ammoFitsWeapon(am, e.it) ? '' : `${e.it.name || 'A weapon'}: ${am.name || 'its ammunition'} isn't made for it.`;
  }).filter(Boolean);
  const wieldWarning = wieldingProblem((char.items || []).filter(it => (it.type === 'Weapon' || it.type === 'Shield') && itemInUse(char, it)));

  // Hit Points: a column per pool, rows Max / Current / Reset (like the spell-point table)
  const hpCols = hp.system === 'standard'
    ? [{ label: 'HP', max: hp.totalHP, cur: hp.currentHP, field: 'currentHP' }]
    : [{ label: 'Physical', max: hp.physicalMax, cur: hp.physicalCurrent, field: 'physicalCurrent' }, { label: 'Endurance', max: hp.enduranceMax, cur: hp.enduranceCurrent, field: 'enduranceCurrent' }];
  const hpTable = `<table class="skill-table combat-table">
      <thead><tr><th></th>${hpCols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><th>Max</th>${hpCols.map(c => `<td>${c.max}</td>`).join('')}</tr>
        <tr><th>Current</th>${hpCols.map(c => `<td><input type="number" class="w-sm" value="${c.cur}" onchange="updateHPState('${c.field}', this.value)"></td>`).join('')}</tr>
        <tr><th></th>${hpCols.map(c => `<td><button class="btn btn-dim combat-small-btn" title="Back to max" onclick="updateHPState('${c.field}', ${c.max})">↺</button></td>`).join('')}</tr>
      </tbody>
    </table>`;

  // Defense: the totals, with and without the shield when one is in use; the
  // full breakdown is in the Details popup
  const hasShield = armor.shieldsComputed.length > 0;
  // one column: the totals with the shield in use, if there is one
  const defCols = [['Total', hasShield ? armor.withShield : armor.withoutShield]];
  const rollText = r => `${r.min} – ${r.max}`;
  // Applied Spell Mods: typed in; see combatSpellMods
  const sm = ((char.combatExtras || {}).spellMods) || {};
  const smIn = (f, label, tip) => `<label class="spell-mod">${label}${tip ? infoTip(tip) : ''} <input type="number" class="w-xs" value="${escapeHtml(sm[f] === undefined ? '' : sm[f])}" placeholder="0" onchange="updateSpellMod('${f}', this.value)"></label>`;
  const spellModsTable = `<table class="skill-table combat-table spell-mods-table">
      <tbody>
        <tr><th>Defense</th><td>${smIn('av', 'AV', 'Added to your AV as typed; lower is better for you, so a protective spell is usually negative.')}${smIn('pr', 'PR')}</td></tr>
        <tr><th>Offense</th><td>${smIn('toHit', 'To Hit')}${smIn('dmgBefore', 'Dmg Before')}${smIn('dmgAfter', 'Dmg After')}${smIn('crit', 'Crit')}</td></tr>
        <tr><th>Damage Roll</th><td><div class="spell-mod-roll"><input class="w-md" value="${escapeHtml(sm.damageRoll || '')}" placeholder="e.g. +2d6 fire" onchange="updateSpellMod('damageRoll', this.value)"> <button class="btn btn-dim combat-small-btn" title="Clear all the spell mods" onclick="resetSpellMods()">↺</button></div></td></tr>
      </tbody>
    </table>`;
  const defTable = `<table class="skill-table combat-table">
      <thead><tr><th></th>${defCols.map(([l]) => `<th>${l}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><th>AV${infoTip("Lower is better for the defender: it's added directly to an attacker's hit chance.")}</th>${defCols.map(([, t]) => `<td>${Math.round(t.totalAV)}</td>`).join('')}</tr>
        <tr><th>PR</th>${defCols.map(([, t]) => `<td>${Math.round(t.totalPR)}</td>`).join('')}</tr>
        <tr><th>PR min-max${infoTip('A protection roll is (PR − 1d10) ÷ (2d6 ÷ 2), rounded. The range runs from a 10 and double sixes to a 1 and double ones.')}</th>${defCols.map(([, t]) => `<td>${rollText(t.roll)}</td>`).join('')}</tr>
        ${armor.parryPointsTotal > 0 ? `<tr><th>PR vs missile / magic${infoTip(`${armor.parryPointsTotal} of the PR comes from Parry Used, which only stops melee attacks; these rows leave it out.`)}</th>${defCols.map(([, t]) => `<td>${Math.round(t.totalPRvsRangedOrMagic)}</td>`).join('')}</tr>
        <tr><th>PR min-max vs missile / magic</th>${defCols.map(([, t]) => `<td>${rollText(t.rollVsRangedOrMagic)}</td>`).join('')}</tr>` : ''}
      </tbody>
    </table>`;

  // Weapons: a line per grip (and Missile), the weapon's name opens its popup
  const weaponRows = weaponEntries.map((entry, pos) => {
    const al = weaponAttackLines(char, entry);
    if (!al) return '';
    const { it, w, lines } = al;
    if (!lines.length) lines.push({ grip: '—' });
    const n = lines.length;
    const open = entry.kind === 'hand' ? "openCombatDetail('hand')" : entry.kind === 'shield' ? `openCombatDetail('shield',${entry.idx})` : `openCombatDetail('weapon',${entry.idx})`;
    const parryCell = w.parrySkval > 0
      ? `<input type="number" min="0" max="${w.parrySkval}" class="w-xs" value="${w.parryPointsUsed}" onchange="${entry.kind === 'hand' ? 'updateHandFootParry(this.value)' : entry.kind === 'shield' ? `updateShieldSpikeParry(${entry.idx}, this.value)` : `updateWeaponField(${entry.idx},'parryPointsUsed',this.value)`}"> <span class="note">of ${w.parrySkval}</span>`
      : '<span class="note">—</span>';
    // Initiative: the die plus the action's speed (wiki "Initiative"): d10 in
    // melee, d8 for missile fire into a combat. A readied speed, if the weapon
    // has one, is for its first attack.
    const readied = w.readiedSpeed;
    const initCell = (die, speed, withReadied) => `<td>${die}+${Math.round(speed)}${withReadied && readied ? ` <span class="note">(readied ${die}+${Math.round(readied)})</span>` : ''}</td>`;
    const kindTag = entry.kind === 'hand' ? ' <span class="note">(automatic)</span>' : entry.kind === 'shield' ? ' <span class="note">(from shield)</span>' : '';
    return lines.map((ln, i) => {
      const lead = i === 0 ? `<td rowspan="${n}" class="combat-weapon-name"><a class="wiki-link" href="#" onclick="${open};return false" title="Open this weapon's stats">${escapeHtml(it.name || '(unnamed weapon)')}</a>${kindTag}<div class="note">${escapeHtml(it.weaponClass || 'unbound')}</div></td>` : '';
      const multi = `<td>${w.multipleAttackSkval || '—'}</td>`; // on every line: a rowspan here breaks the row lines
      const tail = i === 0 ? `<td rowspan="${n}">${parryCell}</td><td rowspan="${n}" class="combat-move">${weaponMoveButtonsHtml(pos, weaponEntries.length)}</td>` : '';
      const inUse = ln.which && entry.kind === 'item' ? wieldTag(it, ln.which) : '';
      const stats = ln.missile
        ? `<td>${Math.round(ln.missile.finalHit)}</td><td>${fmtCrit(ln.missile.critChance)}</td><td>${fmtFumble(ln.missile.fumbleThreshold)}</td><td>${escapeHtml(missileDamageRollText(it, ln.missile))}</td>${initCell('d8', ln.missile.speed, false)}`
        : ln.v ? `<td>${Math.round(ln.v.hit)}</td><td>${fmtCrit(ln.v.critChance)}</td><td>${fmtFumble(ln.v.fumbleThreshold)}</td><td>${escapeHtml(damageRollText(it.damageDice, ln.v.dmgBeforeDivider, it.dividingDie, ln.v.dmgBonus))}</td>${initCell('d10', ln.v.speed, true)}`
        : '<td colspan="5" class="note">No stats</td>';
      return `<tr${i === 0 ? ' class="combat-weapon-first"' : ''}>${lead}<td>${ln.grip}${inUse}</td>${multi}${stats}${tail}</tr>`;
    }).join('') + (entry.kind === 'item' ? itemSpellRowsHtml(char, it, entry.idx, 10) : '');
  }).join('');

  // Equipped Armor: the armor worn and shields in hand (In Use on the
  // Inventory page), with any spells on them
  const armorWorn = (char.items || []).map((it, idx) => ({ it, idx })).filter(({ it }) => (it.type === 'Armor' || it.type === 'Shield') && itemInUse(char, it));
  const armorRows = armorWorn.map(({ it, idx }) => `<tr class="combat-weapon-first">
      <td>${escapeHtml(it.name || '(unnamed)')}</td>
      <td class="note">${escapeHtml(itemKindLabel(it))}</td>
      <td>${parseFloat(it.av) || 0}</td>
      <td>${parseFloat(it.pr) || 0}</td>
      <td class="note">${escapeHtml(it.notes || '')}</td>
    </tr>` + itemModsLineHtml(char, it).replace('colspan="9"', 'colspan="5"') + itemSpellRowsHtml(char, it, idx, 5)).join('');

  document.getElementById('main').innerHTML = `
  <div class="panel plain-font">
    <div class="panel-header"><h2>Combat — ${escapeHtml(char.name || '')}</h2></div>
    <div class="panel-body">

      <div class="combat-top">
      <div class="combat-top-col">
      <div class="combat-section-head"><span>Hit Points${infoTip('Standard: one HP pool. Collegium: Physical and Endurance; damage hits Endurance first, and Physical is only touched once Endurance is depleted. Physical = ceil(total ÷ 2), Endurance = floor(total ÷ 2). The same setting is under Campaign Settings on General Info.')}</span></div>
      <label class="check-row"><input type="checkbox" ${hp.system === 'collegium' ? 'checked' : ''} onchange="updateHPState('system', this.checked ? 'collegium' : 'standard')"> Collegium System (uncheck for Standard)</label>
      ${hpTable}
      </div>
      <div class="combat-top-col">
      <div class="combat-section-head"><span>Defense${infoTip('From the armor, shield and weapons ticked In Use on the Inventory page.')}</span><a class="wiki-link" href="#" onclick="openCombatDetail('defense');return false">Details</a></div>
      ${defTable}
      </div>
      <div class="combat-top-col">
      <div class="combat-section-head"><span>Applied Spell Mods${infoTip('Spells cast onto you in combat. Defense adds to your armor (the Defense totals); offense adds to the weapons in hand. Damage Roll is a note for you to use if it applies; it changes nothing.')}</span></div>
      ${spellModsTable}
      </div>
      </div>

      <hr class="divider">
      <div class="combat-section-head">Weapons</div>
      ${wieldWarning ? `<div class="warn">⚠ ${escapeHtml(wieldWarning)} Untick one on the Inventory page.</div>` : ''}
      ${ammoWarnings.map(m => `<div class="warn">⚠ ${escapeHtml(m)} Set it in the weapon's Missile Fire.</div>`).join('')}
      ${weaponEntries.length === 0 ? '<div class="note">No weapons in use. Tick In Use on a carried weapon on the Inventory page.</div>' : `
      <div class="combat-scroll"><table class="skill-table combat-table combat-weapons">
        <thead><tr><th>Weapon</th><th>Grip</th><th>Multi</th><th>To Hit</th><th>Crit${infoTip(CRIT_HELP)}</th><th>Fumble${infoTip(FUMBLE_HELP)}</th><th>Dmg Roll${infoTip(DMG_ROLL_HELP)}</th><th>Init Roll${infoTip(INIT_ROLL_HELP)}</th><th>Parry Used${infoTip("Capped at the weapon's Parry skill. Each point comes off that weapon's To Hit and adds to your PR, against melee attacks only.")}</th><th></th></tr></thead>
        <tbody>${weaponRows}</tbody>
      </table></div>
      <div class="note">Click a weapon's name for its stats, magic, missile, and other settings.</div>`}

      <hr class="divider">
      <div class="combat-section-head">Equipped Armor</div>
      ${armorWorn.length === 0 ? '<div class="note">No armor or shield in use. Tick In Use on carried armor on the Inventory page.</div>' : `
      <div class="combat-scroll"><table class="skill-table combat-table combat-armor">
        <thead><tr><th>Item</th><th>Type</th><th>AV</th><th>PR${infoTip("A shield's listed PR; the Shield Use bonus on top of it is in Defense Details.")}</th><th>Notes</th></tr></thead>
        <tbody>${armorRows}</tbody>
      </table></div>`}
    </div>
  </div>`;

  if (openCombatDetailState && document.getElementById('modal-overlay').classList.contains('open')) renderCombatDetail();
}

// The Combat page's popups: a weapon's stats (opened from its name) and the
// Defense breakdown. They save as you edit, like the spell-pool popup; the
// page and the popup are redrawn together.
let openCombatDetailState = null;
// Whether a weapon popup's Missile Fire (or Throw) section is open: what the player last
// chose for that weapon this session, otherwise open only for bows and crossbows.
const combatMissileOpen = {};
// Whether Defense Details' Weapon Protection & Other Bonuses section is open:
// null = the default (open only when something in it isn't zero).
let combatDefenseOtherOpen = null;
function missileSectionOpen(it, idx) {
  return idx in combatMissileOpen ? combatMissileOpen[idx] : /bow/i.test(it.weaponClass || '');
}
// The skills that bear on a weapon, each with what it applies to the weapon's
// numbers (not its skill value): the weapon class skill, Single weap spec on
// this weapon, Spear Thrown for spears, the skills bound to the class and
// their dropdowns. Listed if trained (XP in it) or if it changes a number.
function appliedSkillMods(char, it) {
  const skills = char.skills || [];
  const skval = s => computeSkillValues(s, char, skills).skval;
  const lc = x => String(x || '').trim().toLowerCase();
  const cls = it.weaponClass || '';
  const bound = skills.filter(s => cls && s.binding === cls);
  // dropdowns under the bound skills (untemplated ones carry no binding)
  const under = [];
  const walk = parent => skills.filter(s => s.parentSkillId === parent.id && !bound.includes(s) && !under.includes(s)).forEach(s => { under.push(s); walk(s); });
  bound.forEach(walk);
  const candidates = [
    ...skills.filter(s => cls && lc(s.skillName) === lc(cls)),
    ...skills.filter(s => lc(s.skillName) === 'single weap spec' && s.binding === it.name),
    ...(cls === 'Basic Spears' ? skills.filter(s => lc(s.skillName) === 'spear thrown') : []),
    ...bound, ...under
  ];
  const rules = {
    [lc(cls)]: v => [`+${Math.round(v)} to hit`, 'Its skill value is added to the to hit.'],
    'single weap spec': v => [`+${Math.round(v)} to hit`, 'Its skill value is added to this weapon\'s to hit.'],
    'spear thrown': v => [`+${Math.floor(v / 4)} range`, '+1 thrown range per 4 skill points.'],
    'damage bonus': v => [`+${Math.floor(v / 10)} damage`, '+1 damage after the divider per 10 skill points.'],
    'initiative bonus': v => [`−${Math.floor(v / 10)} speed`, '−1 speed per 10 skill points, never below 1. Readied speed too.'],
    'critical hit bonus': v => [`+${Math.round(v) / 10} crit`, '+1 crit per 10 skill points.'],
    'parry': v => [`up to ${Math.round(v)} parry`, 'You can move up to this many points from to hit to PR (Parry Used).'],
    'multiple attack': v => [`Multi ${Math.round(v)}`, 'Every 25 points you roll under this gives 1 extra attack.']
  };
  const seen = new Set();
  return candidates.filter(s => !seen.has(s.id) && seen.add(s.id)).map(s => {
    const v = skval(s), trained = !s.dropdownOnly && parseFloat(s.rawXP) > 0;
    const rule = rules[lc(s.skillName)];
    const [value, why] = rule ? rule(v) : ['—', 'Not applied: the app has no rule for this skill yet.'];
    const changes = rule && !/^[+−]0 |^up to 0 |^Multi 0$/.test(value + ' ');
    if (!trained && !changes) return null;
    return { name: s.skillName, value, tip: `${why} Skill value ${Math.round(v)}${s.dropdownOnly ? ' (a dropdown, from its parent skill)' : ''}.` };
  }).filter(Boolean);
}
function openCombatDetail(kind, idx) { openCombatDetailState = { kind, idx }; if (kind === 'defense') combatDefenseOtherOpen = null; renderCombatDetail(); }
function closeCombatDetail() { openCombatDetailState = null; closeModal(); }
function renderCombatDetail() {
  const char = state.characters[state.activeChar];
  const st = openCombatDetailState;
  if (!char || !st) return;
  const close = '<div class="modal-actions"><button class="btn btn-gold" onclick="closeCombatDetail()">Close</button></div>';
  if (st.kind === 'defense') {
    const armor = computeArmor(char);
    const hasShield = armor.shieldsComputed.length > 0;
    const cols = [['Total', hasShield ? armor.withShield : armor.withoutShield]];
    // one AV and one PR cell per column; '' leaves a cell empty
    const avpr = (av, pr) => cols.map(() => `<td>${av}</td><td>${pr}</td>`).join('');
    const signed = n => (n < 0 ? '−' : '+') + Math.abs(Math.round(n * 10) / 10);
    // Other bonuses: the items in use whose defense modifiers aren't zero, plus
    // any bonus typed in by hand on an older version of this popup
    const counted = shieldsCountedItems(char);
    const bonusItems = (char.items || []).filter(it => itemHasModKind(it, 'defense') && itemModsInUse(char, it, counted)
      && ((parseFloat(it.magicAvoidance) || 0) || (parseFloat(it.magicProtection) || 0)));
    const handBonuses = (armor.otherBonuses || []).map((b, i) => ({ b: b || {}, i })).filter(({ b }) => (parseFloat(b.av) || 0) || (parseFloat(b.pr) || 0));
    const otherOpen = combatDefenseOtherOpen !== null ? combatDefenseOtherOpen
      : !!(armor.weaponProtectionManual || armor.weaponProtectionWielded || bonusItems.length || handBonuses.length);
    openModal(`<h3>Defense Details</h3>
    <div class="combat-section-head">Armor Breakdown</div>
    <table class="skill-table">
      <thead><tr><th>Item</th><th>AV</th><th>PR</th><th>Notes</th></tr></thead>
      <tbody>
        ${armor.armorItems.length === 0 ? '<tr><td colspan="4" class="note">No armor in use. Tick In Use on carried armor on the Inventory page.</td></tr>' : ''}
        ${armor.armorItems.map(it => `<tr><td>${escapeHtml(it.name||'(unnamed)')}</td><td>${it.av||0}</td><td>${it.pr||0}</td><td class="note">${escapeHtml(it.notes||'')}</td></tr>`).join('')}
        <tr style="border-top:1px solid var(--gold-dim)"><td><strong>Armor Subtotal</strong></td><td><strong>${armor.armorItems.reduce((s,it)=>s+(parseFloat(it.av)||0),0)}</strong></td><td><strong>${armor.armorItems.reduce((s,it)=>s+(parseFloat(it.pr)||0),0)}</strong></td><td></td></tr>
      </tbody>
    </table>
    
    <hr class="divider">
    <details class="combat-fold" ${otherOpen ? 'open' : ''}>
    <summary class="combat-section-head" onclick="combatDefenseOtherOpen = !this.parentElement.open">Weapon Protection & Other Bonuses</summary>
    <div class="form-row" style="margin-bottom:10px">
      <div class="form-group"><label>Weapon Protection (PR)${infoTip('Weapons in use add their Weapon PR on top of this automatically.')}</label>
        <input type="number" class="w-sm" value="${armor.weaponProtectionManual}" onchange="updateCombatExtra('weaponProtection',this.value)">
        ${armor.weaponProtectionWielded ? `<div class="note">+ ${armor.weaponProtectionWielded} from the weapons in use</div>` : ''}
      </div>
    </div>
    ${bonusItems.length || handBonuses.length ? `<table class="skill-table">
      <thead><tr><th>Other Bonus${infoTip('Items in use (worn, wielded or carried) with Avoidance or Protection modifiers. Add them on the Inventory page: an item\'s Defense modifiers.')}</th><th>AV</th><th>PR</th><th></th></tr></thead>
      <tbody>
        ${bonusItems.map(it => `<tr><td>${escapeHtml(it.name || '(unnamed)')}</td><td>${signed(-(parseFloat(it.magicAvoidance) || 0))}</td><td>${signed(parseFloat(it.magicProtection) || 0)}</td><td></td></tr>`).join('')}
        ${handBonuses.map(({ b, i }) => `<tr><td>${escapeHtml(b.label || 'Bonus')} <span class="note">(entered by hand)</span>${infoTip('Typed in on an older version of this popup. It still counts; to change it, add the item to the Inventory with Defense modifiers and remove this.')}</td><td>${signed(parseFloat(b.av) || 0)}</td><td>${signed(parseFloat(b.pr) || 0)}</td><td class="item-del" title="Remove" onclick="updateOtherBonus(${i},'av',0);updateOtherBonus(${i},'pr',0)">✕</td></tr>`).join('')}
      </tbody>
    </table>` : '<div class="note">No items in use with Avoidance or Protection modifiers.</div>'}
    </details>
    
    ${hasShield ? `<hr class="divider">
    <div class="combat-section-head">Shield</div>
    <table class="skill-table">
      <thead><tr><th>Shield</th><th>AV</th><th>Base PR</th><th>Shield Use Bonus${infoTip(`Basic Shield Use skval ${armor.shieldUseSkval}. Bonus = min(skval, base PR) + floor(max(0, skval − base PR) ÷ 10).`)}</th><th>Effective PR</th><th>Notes</th></tr></thead>
      <tbody>
        ${armor.shieldsComputed.map(s => `<tr><td>${escapeHtml(s.name||'(unnamed)')}</td><td>${s.av}</td><td>${s.basePR}</td><td>+${s.bonus}</td><td><strong>${s.effectivePR}</strong></td><td class="note">${escapeHtml(s.notes||'')}</td></tr>`).join('')}
      </tbody>
    </table>
` : ''}

    <hr class="divider">
    <div class="combat-section-head">Totals</div>
    <table class="skill-table">
      <thead>
      <tr><th></th>${cols.map(() => '<th>AV</th><th>PR</th>').join('')}</tr></thead>
      <tbody>
        <tr><td>Armor</td>${avpr(armor.sumArmorAV, armor.sumArmorPR)}</tr>
        ${hasShield ? `<tr><td>Shield</td>${avpr(armor.sumShieldAV, armor.sumShieldPR)}</tr>` : ''}
        <tr><td>Avoidance skill (subtracted)</td>${avpr(`−${armor.avoidanceSkval}`, '')}</tr>
        <tr><td>Protection skill ÷ 5 (added)</td>${avpr('', `+${(armor.protectionSkval/5).toFixed(1)}`)}</tr>
        <tr><td>Weapon Protection</td>${avpr('', `+${armor.weaponProtection}`)}</tr>
        <tr><td>Parry Points Committed</td>${avpr('', `+${armor.parryPointsTotal}`)}</tr>
        ${armor.spellMods.av || armor.spellMods.pr ? `<tr><td>Spell mods</td>${avpr(signed(armor.spellMods.av), signed(armor.spellMods.pr))}</tr>` : ''}
        <tr><td>Other Bonuses</td>${cols.map(([, t]) => `<td>${signed(armor.sumOtherAV - t.magicAV)}</td><td>${signed(armor.sumOtherPR + t.magicPR)}</td>`).join('')}</tr>
        <tr style="border-top:1px solid var(--gold)"><td><strong>Total</strong></td>${cols.map(([, t]) => `<td><strong>${Math.round(t.totalAV)}</strong></td><td><strong>${Math.round(t.totalPR)}</strong></td>`).join('')}</tr>
        <tr><td>Protection min-max${infoTip('(PR − 1d10) ÷ (2d6 ÷ 2), rounded.')}</td>${cols.map(([, t]) => `<td></td><td>${t.roll.min} – ${t.roll.max}</td>`).join('')}</tr>
        ${armor.parryPointsTotal > 0 ? `
        <tr><td>vs Missile / Magical attack${infoTip('Parry only stops melee attacks, so it is left out here.')}</td>${cols.map(([, t]) => `<td></td><td>${Math.round(t.totalPRvsRangedOrMagic)}<br>min-max ${t.rollVsRangedOrMagic.min} – ${t.rollVsRangedOrMagic.max}</td>`).join('')}</tr>
        ` : ''}
      </tbody>
    </table>
    ${close}`, { wide: true, width: 'min(760px, 94vw)', className: 'plain-font' });
    return;
  }
  if (st.kind === 'hand' || st.kind === 'shield') {
    const it = st.kind === 'hand' ? handFootWeapon(char) : shieldWeaponItem(char, st.idx);
    if (!it) return closeCombatDetail();
    const w = computeWeapon(char, it);
    openModal(`<h3>${escapeHtml(it.name)}${infoTip((st.kind === 'hand' ? 'Comes with Basic Martial artist: always available, no inventory item needed.' : 'This shield is also a weapon, one-handed only.') + ' Its numbers come from the catalog.')}</h3>
      <div class="form-row">
        <div class="computed-item"><span class="ci-label">Damage</span><span class="ci-value">${escapeHtml(it.damageDice || '—')} / ${it.dividingDie || '—'}</span></div>
        <div class="computed-item"><span class="ci-label">Init Roll${infoTip(INIT_ROLL_HELP)}</span><span class="ci-value">d10+${Math.round(w.oneHand ? w.oneHand.speed : (parseFloat(it.speedMelee) || 0))}</span></div>
        <div class="computed-item"><span class="ci-label">Threat Range${infoTip(THREAT_RANGE_HELP)}</span><span class="ci-value">${it.threatRange || 0}</span></div>
        <div class="computed-item"><span class="ci-label">Parry skill</span><span class="ci-value">${w.parrySkval}</span></div>
        <div class="computed-item"><span class="ci-label">Skill Ability${infoTip(`${w.baseWeaponSkval} (${it.weaponClass}) + ${w.singleWeapSpec} (Single Weap Spec)`)}</span><span class="ci-value">${w.skillAbility}</span></div>
      </div>
      ${close}`, { wide: true, className: 'plain-font' });
    return;
  }
  const idx = st.idx, it = (char.items || [])[idx];
  if (!it || it.type !== 'Weapon') return closeCombatDetail();
  const w = computeWeapon(char, it);
  const grips = weaponGripsShown(char, it, w);
  const readied = w.readiedSpeed;
  // Ammunition (data/ammunition.json's compatible_with): only what this weapon
  // takes is offered (custom ammunition fits any weapon that takes some); one
  // loaded before this check still shows, with a warning. A weapon that takes
  // none (a javelin) gets no picker.
  const carriedAmmo = (char.items || []).map((a, i) => ({ a, i })).filter(x => x.a.type === 'Ammunition');
  const fittingAmmo = carriedAmmo.filter(x => ammoFitsWeapon(x.a, it));
  const loadedAmmo = it.ammunitionItemIdx !== undefined && it.ammunitionItemIdx !== '' ? carriedAmmo.find(x => String(x.i) === String(it.ammunitionItemIdx)) : null;
  const takesAmmo = weaponTakesAmmo(it);
  const ammoTakes = ammoNamesForWeapon(it);
  const ammoChoices = fittingAmmo.concat(loadedAmmo && !fittingAmmo.includes(loadedAmmo) ? [loadedAmmo] : []);
  const gripRow = (label, which, v) => `<tr><td>${label}${wieldTag(it, which)}</td><td>${w.multipleAttackSkval || '—'}</td><td class="skval-cell">${Math.round(v.hit)}</td><td>${fmtCrit(v.critChance)}</td><td>${fmtFumble(v.fumbleThreshold)}</td><td>${escapeHtml(damageRollText(it.damageDice, v.dmgBeforeDivider, it.dividingDie, v.dmgBonus))}</td><td>d10+${Math.round(v.speed)}${readied ? ` <span class="note">(readied d10+${Math.round(readied)})</span>` : ''}</td><td>${w.parrySkval}</td><td><input type="number" min="0" max="${w.parrySkval}" class="w-xs" value="${w.parryPointsUsed}" onchange="updateWeaponField(${idx},'parryPointsUsed',this.value)"></td></tr>`;
  openModal(`<h3>${escapeHtml(it.name || '(unnamed weapon)')}${it.weaponModel ? ' — ' + escapeHtml(it.weaponModel) : ''}</h3>
          <div class="combat-section-head">Weapon Requirements</div>
          <div class="form-row">
            ${[['stn1h','STN 1H'],['stn2h','STN 2H'],['stmod','STMOD'],['cdn1h','CDN 1H'],['cdn2h','CDN 2H'],['cdmod','CDMOD']].map(([f,l])=>`
            <div class="form-group"><label>${l}</label><input type="number" step="0.01" class="w-sm" value="${it[f]||0}" onchange="updateWeaponField(${idx},'${f}',this.value)"></div>`).join('')}
          </div>
          <div class="combat-section-head">Weapon Attributes</div>
          <div class="form-row">
            <div class="form-group"><label>Damage Dice</label><input class="w-md" value="${it.damageDice||''}" onchange="updateWeaponField(${idx},'damageDice',this.value)"></div>
            <div class="form-group"><label>Dividing Die</label><input type="number" class="w-sm" value="${it.dividingDie||0}" onchange="updateWeaponField(${idx},'dividingDie',this.value)"></div>
            <div class="form-group"><label>Speed Melee</label><input type="number" class="w-sm" value="${it.speedMelee||0}" onchange="updateWeaponField(${idx},'speedMelee',this.value)"></div>
            <div class="form-group"><label>Speed Missile</label><input type="number" class="w-sm" value="${it.speedMissile||0}" onchange="updateWeaponField(${idx},'speedMissile',this.value)"></div>
            <div class="form-group"><label>Speed Readied</label><input type="number" class="w-sm" value="${it.speedReadied||0}" onchange="updateWeaponField(${idx},'speedReadied',this.value)"></div>
            <div class="form-group"><label>Weapon PR</label><input type="number" class="w-sm" value="${it.weaponProtection||0}" onchange="updateWeaponField(${idx},'weaponProtection',this.value)"></div>
            <div class="form-group"><label>Threat Range${infoTip(THREAT_RANGE_HELP)}</label><input type="number" class="w-sm" value="${it.threatRange||0}" onchange="updateWeaponField(${idx},'threatRange',this.value)"></div>
          </div>
          <div class="combat-section-head">Other Modifiers</div>
          <div class="form-row">
            <div class="form-group"><label>Bonus to Hit</label><input type="number" class="w-sm" value="${it.magicBonusToHit||0}" onchange="updateWeaponField(${idx},'magicBonusToHit',this.value)"></div>
            <div class="form-group"><label>Dmg After Divider</label><input type="number" class="w-sm" value="${it.magicDamageAfterDivider||0}" onchange="updateWeaponField(${idx},'magicDamageAfterDivider',this.value)"></div>
            ${itemHasModKind(it, 'offense') ? `<div class="form-group"><label>Dmg Before Divider</label><input type="number" class="w-sm" value="${it.magicDamageBeforeDivider||0}" onchange="updateWeaponField(${idx},'magicDamageBeforeDivider',this.value)"></div>
            <div class="form-group"><label>Crit %</label><input type="number" class="w-sm" value="${it.magicCritBonus||0}" onchange="updateWeaponField(${idx},'magicCritBonus',this.value)"></div>` : ''}
          </div>
          <div class="combat-section-head">Applied Skill Modifiers</div>
          ${(() => {
            const mods = appliedSkillMods(char, it);
            return mods.length ? `<div class="computed-row">${mods.map(m => `<div class="computed-item"><span class="ci-label">${escapeHtml(m.name)}${infoTip(m.tip)}</span><span class="ci-value">${escapeHtml(m.value)}</span></div>`).join('')}</div>`
              : '<div class="note">No skills for this weapon class have XP yet.</div>';
          })()}
          <hr class="divider">
          <table class="skill-table">
            <thead><tr><th></th><th>Multi</th><th>To Hit</th><th>Crit${infoTip(`A roll at or under this crits. 7 + floor(to hit ÷ 10) + (10% × Critical Hit Bonus skval [${w.critHitBonusSkval}]) + weapon threat range, capped at half of to hit, floored at 3%.`)}</th><th>Fumble${infoTip(FUMBLE_HELP)}</th><th>Dmg Roll${infoTip(DMG_ROLL_HELP)}</th><th>Init Roll${infoTip(INIT_ROLL_HELP)}</th><th>Parry</th><th>Parry Used${infoTip("Capped at this weapon's Parry skill. Each point comes off this weapon's To Hit and adds to your PR, against melee attacks only.")}</th></tr></thead>
            <tbody>
              ${!grips.one ? '' : w.oneHand ? gripRow('One-Handed', 'one', w.oneHand) : `<tr><td class="note">One-Handed</td><td colspan="8" class="note">Not usable one-handed — no 1H stats for this weapon</td></tr>`}
              ${w.twoHand && grips.two ? gripRow('Two-Handed', 'two', w.twoHand) : ''}
            </tbody>
          </table>
          ${w.missile ? `
          <hr class="divider">
          <details class="combat-fold" ${missileSectionOpen(it, idx) ? 'open' : ''}>
          <summary class="combat-section-head" onclick="combatMissileOpen[${idx}] = !this.parentElement.open">${takesAmmo ? 'Missile Fire' : 'Throw'}</summary>
          <div class="form-row">
            <div class="form-group"><label>Range</label><input type="number" class="w-sm" value="${it.range||0}" onchange="updateWeaponField(${idx},'range',this.value)"></div>
            <div class="form-group"><label>Target Distance</label><input type="number" class="w-sm" value="${it.targetDistance||0}" onchange="updateWeaponField(${idx},'targetDistance',this.value)"></div>
            ${takesAmmo || loadedAmmo ? `<div class="form-group"><label>Ammunition (from Inventory)${takesAmmo ? infoTip(`This weapon takes: ${ammoTakes.join(', ')}, or custom ammunition. Only ammunition it takes is listed.`) : ''}</label>
              <select class="w-lg" onchange="updateWeaponField(${idx},'ammunitionItemIdx',this.value)">
                <option value="">${takesAmmo ? '— none loaded —' : '— none / self-contained —'}</option>
                ${ammoChoices.map(({ a, i }) => `<option value="${i}" ${loadedAmmo && loadedAmmo.i === i ? 'selected' : ''}>${escapeHtml(a.name || '(unnamed)')}${a.masterwork ? ' ✦' : ''} (qty ${escapeHtml(a.qty || 1)})${ammoFitsWeapon(a, it) ? '' : ' ⚠'}</option>`).join('')}
              </select>
            </div>` : ''}
          </div>
          <div class="computed-row">
            ${it.weaponClass === 'Basic Spears' ? `<div class="computed-item"><span class="ci-label">Effective Range (ST + Spear Thrown)</span><span class="ci-value">${Math.round(w.missile.effectiveRange*10)/10}${w.missile.spearThrownRange ? ` <span class="note">(+${w.missile.spearThrownRange} from skill)</span>` : ''}</span></div>` : ''}
            <div class="computed-item"><span class="ci-label">Range Modifier</span><span class="ci-value">${Math.round(w.missile.rangeMod*100)}</span></div>
            <div class="computed-item"><span class="ci-label">${takesAmmo ? 'Missile' : 'Throw'} To Hit${infoTip(`(1 − distance ÷ range) × base hit chance, using ${w.missile.usedGrip} stats${w.missile.usedGrip === '2H' ? ' (no 1H mode for this weapon)' : ''}. The weapon's and the ammunition's Magic Bonus to Hit add together. Total damage = the weapon's dice + the ammunition's dice (with its Magic Damage After Divider), if any.`)}</span><span class="ci-value skval">${Math.round(w.missile.finalHit)}</span></div>
            <div class="computed-item"><span class="ci-label">Init Roll${infoTip(INIT_ROLL_HELP)}</span><span class="ci-value">d8+${Math.round(w.missile.speed)}</span></div>
            <div class="computed-item"><span class="ci-label">Crit</span><span class="ci-value">${fmtCrit(w.missile.critChance)}</span></div>
            ${w.missile.magicDmgBefore ? `<div class="computed-item"><span class="ci-label">Magic Dmg Before Divider</span><span class="ci-value">+${w.missile.magicDmgBefore}</span></div>` : ''}
            ${w.missile.magicDmgAfter ? `<div class="computed-item"><span class="ci-label">Magic Dmg After Divider</span><span class="ci-value">+${w.missile.magicDmgAfter}</span></div>` : ''}
            <div class="computed-item"><span class="ci-label">Fumble</span><span class="ci-value">${fmtFumble(w.missile.fumbleThreshold)}</span></div>
          </div>
          ${loadedAmmo && !ammoFitsWeapon(loadedAmmo.a, it) ? `<div class="warn">⚠ ${escapeHtml(loadedAmmo.a.name || 'The loaded ammunition')} isn't made for this weapon. It takes: ${escapeHtml(ammoTakes.join(', ') || 'no catalog ammunition')}.</div>` : ''}
          ${takesAmmo && !loadedAmmo ? (fittingAmmo.length ? '<div class="warn">⚠ No ammunition loaded.</div>'
            : `<div class="warn">⚠ No ammunition for this weapon in the inventory. It takes: ${escapeHtml(ammoTakes.join(', '))}. Add it on the Inventory page, Type: Weapon, Ammunition.</div>`) : ''}
          ${w.missile.ammoItem ? `
          <div class="form-row">
            <div class="form-group"><label>Damage Dice</label><input class="w-md" value="${w.missile.ammoItem.damageDice||''}" onchange="updateItem(${it.ammunitionItemIdx},'damageDice',this.value);renderCombatModule()"></div>
            <div class="form-group"><label>Dividing Die</label><input type="number" class="w-sm" value="${w.missile.ammoItem.dividingDie||0}" onchange="updateItem(${it.ammunitionItemIdx},'dividingDie',this.value);renderCombatModule()"></div>
            <div class="form-group"><label>Magic Bonus to Hit</label><input type="number" class="w-sm" value="${w.missile.ammoItem.magicBonusToHit||0}" onchange="updateItem(${it.ammunitionItemIdx},'magicBonusToHit',this.value);renderCombatModule()"></div>
            <div class="form-group"><label>Magic Dmg After Divider</label><input type="number" class="w-sm" value="${w.missile.ammoItem.magicDamageAfterDivider||0}" onchange="updateItem(${it.ammunitionItemIdx},'magicDamageAfterDivider',this.value);renderCombatModule()"></div>
            ${itemHasModKind(w.missile.ammoItem, 'offense') ? `<div class="form-group"><label>Magic Dmg Before Divider</label><input type="number" class="w-sm" value="${w.missile.ammoItem.magicDamageBeforeDivider||0}" onchange="updateItem(${it.ammunitionItemIdx},'magicDamageBeforeDivider',this.value);renderCombatModule()"></div>
            <div class="form-group"><label>Magic Crit %</label><input type="number" class="w-sm" value="${w.missile.ammoItem.magicCritBonus||0}" onchange="updateItem(${it.ammunitionItemIdx},'magicCritBonus',this.value);renderCombatModule()"></div>` : ''}
          </div>
          ` : ''}
          </details>
          ` : ''}
          <hr class="divider">
          <div class="form-group"><label>Notes</label><input class="w-full" value="${escapeHtml(it.notes||'')}" placeholder="Special history, charges, quirks..." onchange="updateItem(${idx},'notes',this.value);renderCombatModule()"></div>
    ${close}`, { wide: true, width: 'min(760px, 94vw)', className: 'plain-font' });
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
  if (ensureSpellBooks(char)) saveState();
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

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Spell Points${infoTip(`Every spell costs Spirit SP plus whichever other schools it draws on. Short on a school's points? Spirit can cover the gap at the shown conversion ratio — better ratio the more trained (Familiar → Specialized → Devoted) you are in that school relative to your Spirit level. Effective Spell Level (used for duration/range formulas with "plev") gets a bonus once Specialized or Devoted.`)}</div>
      ${pools.length === 0 ? '<div class="note">No spell point pools trained. Add a pool (e.g. Spirit SP, House of Fire SP) as a skill first.</div>' : ''}
      ${pools.length ? `
      <table class="skill-table spell-pool-table">
        <thead><tr><th></th>${pools.map(p => `<th class="spell-pool-head" title="Open ${escapeHtml(p.name)}" data-pool="${escapeHtml(p.name)}" onclick="openSpellPoolModal(this.dataset.pool)">${escapeHtml(p.name)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><th>Max</th>${pools.map(p => `<td>${p.maxSP}</td>`).join('')}</tr>
          <tr><th>Current</th>${pools.map(p => `<td><input type="number" step="1" class="w-sm" value="${p.currentSP}" data-pool="${escapeHtml(p.name)}" onchange="updateSpellState(this.dataset.pool,'current',this.value)"></td>`).join('')}</tr>
          <tr><th>Used</th>${pools.map(p => `<td>${p.usedSP}</td>`).join('')}</tr>
          <tr><th>Familiarity</th>${pools.map(p => `<td>${escapeHtml(p.familiarity)}</td>`).join('')}</tr>
        </tbody>
      </table>
      <div class="note">Click a pool's name for its details, recovery and Magic Enhancers.</div>` : ''}

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
          ${spellBooks(char).map(book => {
            const inBook = shownSpells.filter(({ sp }) => sp.book === book.bookId);
            const used = spellBookUsed(char, book.bookId);
            const hidden = collapsedSpellBooks.has(book.bookId);
            const head = `<tr class="item-group" data-book="${escapeHtml(book.bookId)}" title="${hidden ? 'Show' : 'Hide'} this book's spells" onclick="toggleSpellBook(this.dataset.book)"><td colspan="7"><span class="item-group-toggle">${hidden ? '▸' : '▾'}</span>${escapeHtml(book.name || '(unnamed book)')} <span class="item-group-stats">(${escapeHtml(book.location || 'Carried')} · ${inBook.length} spell${inBook.length === 1 ? '' : 's'} · ${used} / ${SPELL_BOOK_CAPACITY})</span>${used > SPELL_BOOK_CAPACITY ? ' <span class="warn">⚠ over capacity</span>' : ''}</td></tr>`;
            if (hidden) return head;
            return head + (inBook.map(({ sp, idx }) => {
            const catalogEntry = SPELLS.find(s => s.name === sp.name && s.school === sp.school);
            const level = spellLevel(char, sp.school, pools);
            const breakdown = catalogEntry && catalogEntry.costs ? spellCostText(catalogEntry.costs) : (catalogEntry ? '—' : 'not in detail catalog');
            return `
          <tr>
            <td>${sp.name ? `<a class="wiki-link" href="${spellWikiUrl(sp.name)}" target="_blank" rel="noopener" title="Open the wiki page for ${escapeHtml(sp.name)}">${escapeHtml(sp.name)}</a>` : '—'}</td>
            <td>${level}</td>
            <td class="note">${breakdown}</td>
            <td>${escapeHtml(spellDurationText(catalogEntry && catalogEntry.duration, level))}</td>
            <td><input value="${sp.notes||''}" onchange="updateSpell(${idx},'notes',this.value)"></td>
            <td>${catalogEntry && catalogEntry.costs ? `<button class="btn btn-gold" style="font-size:11px;padding:3px 8px" onclick="openHardcastModal(${idx})">Cast</button>` : ''}</td>
            <td class="item-del" onclick="removeSpell(${idx})">✕</td>
          </tr>`;
          }).join('') || '<tr><td colspan="7" class="note">No spells in this book yet.</td></tr>');
          }).join('')}
        </tbody>
      </table>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gold" onclick="openAddSpellModal()">Add Spell</button>
        <button class="btn btn-dim" onclick="openAddSpellBookModal()">Add Spell Book</button>
      </div>

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
      <div class="form-group"><label>Current SP</label><input type="number" step="1" class="w-sm" value="${p.currentSP}" onchange="updateSpellState('${p.name.replace(/'/g,"\\'")}','current',this.value)"></div>
      <div class="computed-item"><span class="ci-label">Used SP</span><span class="ci-value">${p.usedSP}</span></div>
      <button class="btn btn-dim" style="align-self:flex-end" onclick="updateSpellState('${p.name.replace(/'/g,"\\'")}','current',${p.maxSP})">Reset to Max</button>
    </div>
    ${p.children.length ? `
    <div class="note">${p.children.map(c => `${c.name}: ${c.trained ? c.skval : 'not trained'}`).join(' | ')}</div>
    ` : '<div class="note">No Reclamation/Success/Knowledge subskills trained for this pool.</div>'}
    <hr class="divider">
    <div class="form-row">
      <div class="computed-item"><span class="ci-label">Level</span><span class="ci-value">${p.level}</span></div>
      <div class="computed-item"><span class="ci-label">Familiarity</span><span class="ci-value skval">${p.familiarity}</span></div>
      ${p.conversionRatio ? `<div class="computed-item"><span class="ci-label">Spirit Conversion${infoTip(`If short on ${p.name.replace(' SP','')} points, Spirit SP can cover the gap at a ${p.conversionRatio}:1 ratio (${p.conversionRatio} Spirit per 1 point needed).`)}</span><span class="ci-value">${p.conversionRatio}:1</span></div>` : ''}
      <div class="computed-item"><span class="ci-label">Effective Spell Level</span><span class="ci-value skval">${p.effectiveLevel}</span></div>
    </div>
    <div class="form-row">
      <div class="computed-item"><span class="ci-label">Recovery (Awake)${infoTip(`Recovery = Reclamation skval [${p.reclamationSkval}] × 10% (awake) or × 20% (sleeping) per hour. Capped at 3 different types/hour awake, 5 while sleeping (per Rules for Magic — not yet enforced across pools here).`)}</span><span class="ci-value">${p.recoverAwake} SP/hr</span></div>
      <div class="computed-item"><span class="ci-label">Recovery (Sleeping)</span><span class="ci-value skval">${p.recoverSleep} SP/hr</span></div>
    </div>
    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Magic Enhancers (manual — enter the net result of whichever item you're currently bonded to)</div>
    <div class="form-row">
      <div class="form-group"><label>SP Cost Reduction${p.spReductionItems ? ` (+${p.spReductionItems} from items)` : ''}</label><input type="number" class="w-sm" value="${p.spReductionManual}" onchange="updateSpellEnhancer('${p.name}','spReduction',this.value)"></div>
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
    <div class="panel-header"><h2>Utilities${infoTip(`Quick patches for the master skill/guild data — for when a character needs a skill or guild EXPMOD that doesn't exist yet, without waiting for a full data re-extraction. These are stored separately from character data — see "Export Custom Data" below to back them up.`)}</h2></div>
    <div class="panel-body">

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
      <div class="warn">These are stored in this browser only, separately from character data. If you switch browsers or clear site data, they won't transfer with a character JSON export — use "Export Custom Data" below to back them up separately.</div>
      <table class="skill-table">
        <thead><tr><th>Type</th><th>Detail</th><th></th></tr></thead>
        <tbody>
          ${custom.customSkills.map((s,i)=>`<tr><td>Skill</td><td>${s.name} (${s.type})</td><td class="item-del" onclick="removeCustomSkill(${i})">✕</td></tr>`).join('')}
          ${Object.entries(custom.customGuildBonuses).flatMap(([g,skills])=>Object.entries(skills).map(([sk,v])=>
            `<tr><td>Guild EXPMOD</td><td>${g} — ${sk}: ${v}</td><td class="item-del" onclick="removeCustomGuildBonus('${g.replace(/'/g,"\\'")}','${sk.replace(/'/g,"\\'")}')">✕</td></tr>`
          )).join('')}
          ${(custom.customSkills.length===0 && Object.keys(custom.customGuildBonuses).length===0) ? '<tr><td colspan="3" class="note">Nothing added yet.</td></tr>' : ''}
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
        <div class="form-group"><label>Specific Weapon${infoTip(`Single Weapon Specialization trains on one exact weapon, not a whole weapon type — a character with two curved swords could be specialized in one and not the other.`)}</label>
          <select class="w-lg" onchange="updateSkill('${skillId}','binding',this.value)">
            <option value="">— select —</option>
            ${allCombatWeapons(char).map(it=>`<option ${si.binding===it.name?'selected':''}>${it.name||'(unnamed weapon)'}</option>`).join('')}
          </select>
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

      <div class="expmod-breakdown">EXPMOD breakdown: ${breakdown}${infoTip(`Attmod formula: ${def ? def.attmod : '—'} | Base: ${def ? def.base : '—'} | Per Level: ${def ? def.per_level : '—'}`)}</div>

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
      <div class="note">Rolls entered: ${rolls.filter(v=>v!==''&&v!==undefined).length} / 20 | Sum: ${vals.rollTotal}${infoTip('🎲 rolls real dice (per-level formula above) instead of a physical die; use whichever you prefer per level.')}</div>
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
  ${charGuilds.length ? '' : '<div class="note">Set this character\'s GuildSchools on General Info first.</div>'}`;
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
