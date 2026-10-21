function showSkillModule(skillId) {
  state.activeSkillId = skillId;
  state.activeView = 'skill';
  renderSidebar();
  renderSkillModule(skillId);
}

function renderOverview() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const skills = char.skills || [];
  const byType = {};
  for (const si of skills) {
    const def = SKILLS.find(s => s.name === si.skillName);
    const type = def ? def.type : 'Other';
    if (!byType[type]) byType[type] = [];
    byType[type].push(si);
  }
  const typeOrder = ['Combat','Spell','Acting','Alchemic','Art','Artisan','Curative','Dance','Detect','Engineer','Language','Mind','Movement','Music','Priest','Scholar','Social','Thieves','Torturer','Outdoor','Other'];
  const sortedTypes = typeOrder.filter(t => byType[t]).concat(Object.keys(byType).filter(t => !typeOrder.includes(t)));

  let totalXP = 0;
  for (const si of skills) totalXP += parseFloat(si.rawXP) || 0;

  let html = `
  <div class="panel">
    <div class="panel-header"><h2 style="font-family:'Cormorant Garamond','Georgia',serif;font-style:italic;font-weight:bold">${char.name}</h2>${char.nickname ? `<span class="type-badge" style="font-style:italic">"${char.nickname}"</span>` : ''}${char.isNPC ? '<span class="type-badge" style="color:var(--gold)">NPC</span>' : ''}<span class="type-badge">${char.race || ''} ${char.subrace || ''}</span><span class="type-badge">${char.guild || ''}</span></div>
    <div class="panel-body">
      ${mainGuildBannerHtml(char, false)}
      <div class="form-row" style="margin-bottom:4px">
        ${['ST','IN','WI','CD','HE','CH','AP'].map(a=>`<div class="computed-item"><span class="ci-label">${a}</span><span class="ci-value">${(char.attrs||{})[a]||'—'}</span></div>`).join('')}
        <div class="computed-item" style="margin-left:auto"><span class="ci-label">Total Raw XP</span><span class="ci-value">${totalXP.toLocaleString()}</span></div>
        ${char.unspentInitialExp > 0 ? `<div class="computed-item"><span class="ci-label">Unspent Initial Raw XP</span><span class="ci-value" style="color:var(--gold)">${char.unspentInitialExp.toLocaleString()}</span></div>` : ''}
      </div>
    </div>
  </div>`;

  for (const type of sortedTypes) {
    html += `<div class="panel"><div class="panel-header"><h2>${type}</h2></div><div class="panel-body" style="padding:0">
    <table class="skill-table"><thead><tr><th>Skill</th><th>Sub of</th><th>Guild</th><th>EXPMOD</th><th>Raw XP</th><th>Adj XP</th><th>Level</th><th>Attrib</th><th>Rolls</th><th>Dropdown</th><th>Skval</th></tr></thead><tbody>`;
    for (const si of byType[type]) {
      const vals = computeSkillValues(si, char, char.skills || []);
      const rowCls = si.dropdownOnly ? 'dropdown-row' : '';
      const def = SKILLS.find(s => s.name === si.skillName);
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
    html += `</tbody></table></div></div>`;
  }

  document.getElementById('main').innerHTML = html;
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
        <div class="form-group id-field"><label>Name</label><input class="w200" value="${char.name||''}" onchange="updateChar('name',this.value)"></div>
        <div class="form-group id-field"><label>Nickname / Title</label><input class="w200" value="${char.nickname||''}" onchange="updateChar('nickname',this.value)"></div>
        <div class="form-group id-field"><label>Race</label>
          <input class="w140" list="race-datalist" value="${char.race||''}" placeholder="e.g. Kobold" onchange="updateChar('race',this.value);renderGeneralModule()">
          <datalist id="race-datalist">${races.map(r=>`<option value="${r}">`).join('')}</datalist>
        </div>
        <div class="form-group id-field"><label>Subrace</label>
          <input class="w200" list="subrace-datalist" value="${char.subrace||''}" onchange="updateChar('subrace',this.value)">
          <datalist id="subrace-datalist">${(subraces[char.race] || []).map(sr=>`<option value="${sr}">`).join('')}</datalist>
        </div>
        <div class="form-group id-field"><label>Age</label><input class="w60" value="${char.age||''}" onchange="updateChar('age',this.value)"></div>
        <div class="form-group id-field"><label>Max Age</label><input class="w60" value="${char.maxAge||''}" onchange="updateChar('maxAge',this.value)"></div>
        <div class="form-group id-field"><label>Height</label><input class="w80" value="${char.height||''}" onchange="updateChar('height',this.value)"></div>
        <div class="form-group id-field"><label>Gender</label>
          <select class="w100" onchange="updateChar('gender',this.value)">
            <option value="">— select —</option>
            ${['Male','Female','Other'].map(g=>`<option ${char.gender===g?'selected':''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="form-group id-field"><label>Weight</label><input class="w80" value="${char.bodyWeight||''}" onchange="updateChar('bodyWeight',this.value)"></div>
        <div class="form-group id-field"><label>Darksight</label><input class="w80" value="${char.darksight||''}" onchange="updateChar('darksight',this.value)"></div>
        <div class="form-group id-field"><label>Locale</label>
          <select class="w150" onchange="handleChoiceSelect(this,state.characters[state.activeChar],'locale','locales')">
            <option value="">— select —</option>
            ${(customChoices.locales||[]).map(l=>`<option ${char.locale===l?'selected':''}>${l}</option>`).join('')}
            <option value="__addnew__">+ Add New...</option>
          </select>
        </div>
        <div class="form-group id-field"><label>Group</label>
          <select class="w150" onchange="linkCharacterToGroup(this.value)">
            <option value="">— none —</option>
            ${myGroups.map(g=>`<option value="${g.id}" ${char.playGroupId===g.id?'selected':''}>${escapeHtml(g.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group id-field"><label>Starting Social Tier</label><input type="number" class="w80" value="${char.socialNumber!==undefined?char.socialNumber:''}" onchange="updateChar('socialNumber',this.value)"></div>
        <div class="form-group id-field"><label>Current Social Tier</label><input type="number" class="w80" value="${char.currentSocialNumber!==undefined&&char.currentSocialNumber!==null?char.currentSocialNumber:''}" onchange="updateChar('currentSocialNumber',this.value)"></div>
        <div class="form-group" style="justify-content:flex-end">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding-bottom:6px">
            <input type="checkbox" ${char.isNPC?'checked':''} onchange="updateChar('isNPC',this.checked)">
            NPC
          </label>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:1;min-width:250px"><label>Appearance Notes</label>
          <textarea rows="2" style="width:100%;resize:vertical" onchange="updateChar('appearanceNotes',this.value)">${char.appearanceNotes||''}</textarea>
        </div>
        <div class="form-group" style="flex:1;min-width:250px"><label>Personal Notes</label>
          <textarea rows="2" style="width:100%;resize:vertical" onchange="updateChar('personalNotes',this.value)">${char.personalNotes||''}</textarea>
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
        <div class="form-group" style="width:250px"><label>Primary Guild</label>
          ${guildPickerButton(char.guild, "v => { updateChar('guild', v); renderGeneralModule(); }")}
        </div>
        <div class="form-group" style="width:250px"><label>Secondary Guild</label>
          ${guildPickerButton(char.guild2, "v => { updateChar('guild2', v); renderGeneralModule(); }")}
        </div>
        <div class="form-group" style="width:250px"><label>Tertiary Guild</label>
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
              <input type="number" class="w60" style="margin-top:4px" value="${v.bonus}" title="Magic Bonus" placeholder="Magic +" onchange="updateCCBonus('${k}',this.value)">
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
      ${(() => {
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
      })()}

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
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Weapons, Armor & Items
        <span style="color:var(--gold);text-transform:none;letter-spacing:normal;font-size:13px;margin-left:12px">Total Worth: ${((char.items||[]).reduce((sum,it)=>sum+((parseFloat(it.worth)||0)*(parseFloat(it.qty)||1)),0)).toLocaleString()}</span>
      </div>
      <div class="note" style="margin-bottom:6px">Leave Location blank for items carried on your person (counts toward Weight Carried above). Anything else — a bank, a bag of holding, a specific stash — is tracked but doesn't weigh you down, unless you tick its On Person box in Storage Locations below (a backpack you're wearing).</div>
      <datalist id="item-location-list">${[...new Set((char.items||[]).map(it=>it.location).filter(Boolean))].map(loc=>`<option value="${escapeHtml(loc)}">`).join('')}</datalist>
      <table class="item-table">
        <thead><tr><th>Item</th><th>Type</th><th>Class</th><th>Model</th><th>AV</th><th>PR</th><th>Qty</th><th>Unit Wt</th><th>Total Wt</th><th>Unit Worth</th><th>Total Worth</th><th>MW/Magic</th><th>Location</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          ${(char.items || []).map((it, idx) => `
          <tr style="${it.masterwork ? 'font-style:italic' : ''}">
            <td><input value="${it.name||''}" onchange="updateItem(${idx},'name',this.value)"></td>
            <td><select onchange="updateItem(${idx},'type',this.value);renderGeneralModule()">
              ${['Weapon','Armor','Shield','Coin','Ammunition','Item'].map(t=>`<option ${it.type===t?'selected':''}>${t}</option>`).join('')}
            </select></td>
            <td>${it.type==='Weapon' ? `<select onchange="updateItem(${idx},'weaponClass',this.value);renderGeneralModule()">
              <option value="">— select —</option>
              ${WEAPON_CLASSES.map(wc=>`<option ${it.weaponClass===wc?'selected':''}>${wc}</option>`).join('')}
            </select>` : (it.type==='Armor' ? `<select onchange="selectArmorType(${idx},this.value)">
              <option value="">— custom/magic —</option>
              ${ARMOR.map(a=>`<option ${it.armorType===a.name?'selected':''}>${a.name}</option>`).join('')}
            </select>` : (it.type==='Shield' ? `<select onchange="selectShieldType(${idx},this.value)">
              <option value="">— custom/magic —</option>
              ${SHIELDS.map(sh=>`<option ${it.shieldType===sh.name?'selected':''}>${sh.name}</option>`).join('')}
            </select>` : (it.type==='Coin' ? `<select onchange="selectCoinType(${idx},this.value)">
              <option value="">— select —</option>
              ${COINAGE.map(c=>`<option ${it.name===c.name?'selected':''}>${c.name} (${c.metal})</option>`).join('')}
            </select>` : (it.type==='Ammunition' ? `<select onchange="selectAmmoType(${idx},this.value)">
              <option value="">— custom/magic —</option>
              ${AMMUNITION.map(am=>`<option ${it.ammoBase===am.name?'selected':''}>${am.name}</option>`).join('')}
            </select>` : (it.type==='Item' ? `<select onchange="updateItem(${idx},'itemClass',this.value);renderGeneralModule()">
              <option value="">— select —</option>
              ${[...new Set(BASIC_ITEMS.map(b=>b.class))].sort().map(c=>`<option ${it.itemClass===c?'selected':''}>${c}</option>`).join('')}
            </select>` : '' ))))) }</td>
            <td>${(it.type==='Weapon' && it.weaponClass) ? (() => {
              const cat = Object.entries(WEAPON_CATEGORY_TO_SKILL).find(([c,sk])=>sk===it.weaponClass);
              const catName = cat ? cat[0] : null;
              const models = catName ? weaponModelsForClass(it.weaponClass, catName) : [];
              return `<select onchange="selectWeaponModel(${idx},this.value)">
                <option value="">— custom/magic —</option>
                ${models.map(m=>`<option ${it.weaponModel===m.name?'selected':''}>${m.name}</option>`).join('')}
              </select>`;
            })() : (it.type==='Item' && it.itemClass) ? (() => {
              const models = BASIC_ITEMS.filter(b=>b.class===it.itemClass);
              return `<select onchange="selectBasicItem(${idx},this.value)">
                <option value="">— custom/magic —</option>
                ${models.map(m=>`<option ${it.basicItemName===m.name?'selected':''}>${m.name}</option>`).join('')}
              </select>`;
            })() : ''}</td>
            <td class="item-qty">${(it.type==='Armor'||it.type==='Shield') ? `<input type="number" value="${it.av||0}" onchange="updateItem(${idx},'av',this.value)">` : ''}</td>
            <td class="item-qty">${(it.type==='Armor'||it.type==='Shield') ? `<input type="number" value="${it.pr||0}" onchange="updateItem(${idx},'pr',this.value)">` : ''}</td>
            <td class="item-qty"><input type="number" min="1" value="${it.qty||1}" onchange="updateItem(${idx},'qty',this.value)"></td>
            <td class="item-weight"><input type="number" value="${it.weight||0}" onchange="updateItem(${idx},'weight',this.value)"></td>
            <td class="item-total-wt">${(((parseFloat(it.weight)||0)*(parseFloat(it.qty)||1))).toLocaleString()}</td>
            <td class="item-worth"><input type="number" value="${it.worth||0}" onchange="updateItem(${idx},'worth',this.value)"></td>
            <td class="item-total-wt">${(((parseFloat(it.worth)||0)*(parseFloat(it.qty)||1))).toLocaleString()}</td>
            <td style="text-align:center"><input type="checkbox" ${it.masterwork?'checked':''} onchange="updateItem(${idx},'masterwork',this.checked);renderGeneralModule()"></td>
            <td><input value="${it.location||''}" list="item-location-list" placeholder="Carried" style="width:110px" onchange="updateItem(${idx},'location',this.value);renderGeneralModule()"></td>
            <td><input value="${it.notes||''}" onchange="updateItem(${idx},'notes',this.value)"></td>

            <td class="item-del" onclick="removeItem(${idx})">✕</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <button class="btn btn-gold" onclick="addItem()">+ Add Item</button>

      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px">Storage Locations</div>
      <div class="note" style="margin-bottom:6px">Set a Capacity on a bag/satchel/etc. to flag it when overloaded. Leave blank for no limit. To add an empty container before putting anything in it, give it a name and capacity here.</div>
      <table class="skill-table">
        <thead><tr><th>Location</th><th>On Person</th><th>Items</th><th>Weight</th><th>Capacity</th><th>Worth</th></tr></thead>
        <tbody>
          ${computeStorageSummary(char).map(g => `<tr>
            <td>${escapeHtml(g.location)}</td>
            <td>${g.location==='On Person (Carried)' ? '<span class="note">always</span>' : `<input type="checkbox" ${g.onPerson?'checked':''} title="Checked: this container's weight counts toward Weight Carried" onchange="updateStorageOnPerson('${g.location.replace(/'/g,"\\'")}',this.checked)">`}</td>
            <td>${g.count}</td>
            <td style="${g.over?'color:#c05050;font-weight:bold':''}">${g.weight.toLocaleString()}${g.over?' OVER':''}</td>
            <td>${g.location==='On Person (Carried)' ? '<span class="note">see Weight above</span>' : `<input type="number" class="w100" value="${g.capacity!==null?g.capacity:''}" placeholder="none" onchange="updateStorageCapacity('${g.location.replace(/'/g,"\\'")}',this.value)">`}</td>
            <td>${g.worth.toLocaleString()}</td>
          </tr>`).join('') || '<tr><td colspan="6" class="note">No items yet.</td></tr>'}
        </tbody>
      </table>
      <div class="form-row" style="margin-top:6px">
        <div class="form-group"><label>New Container Name</label><input id="new-storage-name" class="w150"></div>
        <div class="form-group"><label>Capacity</label><input id="new-storage-capacity" type="number" class="w100"></div>
        <div class="form-group" style="justify-content:flex-end"><button class="btn btn-dim" onclick="addStorageContainer()">+ Add Container</button></div>
      </div>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Notes</div>
      <div class="form-group" style="margin-bottom:10px"><label>Item Notes</label>
        <textarea rows="3" style="width:100%;resize:vertical" onchange="updateChar('itemNotes',this.value)">${char.itemNotes||''}</textarea>
      </div>
      <div class="form-group" style="margin-bottom:10px"><label>History</label>
        <textarea rows="4" style="width:100%;resize:vertical" onchange="updateChar('historyNotes',this.value)">${char.historyNotes||''}</textarea>
      </div>
      <div class="form-group">
        <label>Relationships</label>
        <textarea rows="4" style="width:100%;resize:vertical" onchange="updateChar('relationshipNotes',this.value)">${char.relationshipNotes||''}</textarea>
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
        <li><b>Spend your starting experience.</b> You already have a few skills; add the rest with <i>+ Add Skill</i> in the sidebar. A broad skill gives you a little ability in the specialties under it (the dropdown rule).</li>
        <li><b>Put your gear in your inventory.</b> On General Info, add weapons, armor and shields as items. They go live on the Combat page by themselves: weapons show to-hit, damage, speed and crit chances worked out from your skills and attributes, and armor and shields add to your Avoidance and Protection.</li>
        <li><b>Spells.</b> The Spells page keeps your spell points and your spellbook, and it can draw on the entire spell library.</li>
        <li><b>Playing with a group.</b> The Groups button in the top bar is where your GM keeps the shared clock, the party roster and notes, and where combat is run: a Combat tracker with turn order, hit points and effects. You can link your character to a group from General Info.</li>
      </ol>
      </div>
      <div class="modal-actions"><button class="btn btn-gold" onclick="closeModal()">Got it</button></div>`, { wide: true });
  }
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
          <div class="form-group"><label>Current HP</label><input type="number" class="w80" value="${hp.currentHP}" onchange="updateHPState('currentHP', this.value)"></div>
          <button class="btn btn-dim" style="align-self:flex-end" onclick="updateHPState('currentHP', ${hp.totalHP})">Reset to Max</button>
        </div>
        ` : `
        <div class="form-row">
          <div class="computed-item"><span class="ci-label">Physical Max</span><span class="ci-value">${hp.physicalMax}</span></div>
          <div class="form-group"><label>Physical Current</label><input type="number" class="w80" value="${hp.physicalCurrent}" onchange="updateHPState('physicalCurrent', this.value)"></div>
          <button class="btn btn-dim" style="align-self:flex-end" onclick="updateHPState('physicalCurrent', ${hp.physicalMax})">Reset</button>
        </div>
        <div class="form-row">
          <div class="computed-item"><span class="ci-label">Endurance Max</span><span class="ci-value">${hp.enduranceMax}</span></div>
          <div class="form-group"><label>Endurance Current</label><input type="number" class="w80" value="${hp.enduranceCurrent}" onchange="updateHPState('enduranceCurrent', this.value)"></div>
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
      </div>
      <div class="note">Lower AV is better for the defender — it's added directly to an attacker's hit chance. "No Shield" reflects two-handed weapon use or a dropped shield.</div>
      ${armor.parryPointsTotal > 0 ? `
      <div class="note" style="color:var(--gold-dim);margin-top:4px">⚠ ${armor.parryPointsTotal} of the Total PR above comes from Parry Points Committed. Parry only stops melee attacks — you can't parry a missile or a spell. Against a missile or magical attack, use PR ${Math.round(armor.withShield.totalPRvsRangedOrMagic)} (Shield) / ${Math.round(armor.withoutShield.totalPRvsRangedOrMagic)} (No Shield) instead.</div>
      ` : ''}

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Weapons</div>
      ${weaponEntries.length === 0 ? '<div class="note" style="padding:6px 0">No weapon items on General page.</div>' : `
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button class="btn btn-dim" style="font-size:11px;padding:2px 8px" onclick="setAllWeaponsOpen(true)">Open all</button>
        <button class="btn btn-dim" style="font-size:11px;padding:2px 8px" onclick="setAllWeaponsOpen(false)">Close all</button>
      </div>`}
      ${weaponEntries.map((entry, pos) => entry.kind === 'hand' ? renderHandFootPanel(char, pos, weaponEntries.length) : (() => {
        const it = entry.it, idx = entry.idx;
        const w = computeWeapon(char, it);
        return `
        <div class="panel" style="margin-bottom:10px">
          <div class="panel-header" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap" onclick="toggleWeaponOpen(${idx})" title="Click to ${it.collapsed ? 'open' : 'close'}">
            <span style="font-size:10px;width:10px">${it.collapsed ? '▶' : '▼'}</span>
            <h2 style="font-size:13px">${it.name||'(unnamed weapon)'}${it.weaponModel?' — '+it.weaponModel:''}</h2><span class="type-badge">${it.weaponClass||'unbound'}</span>
            ${it.collapsed ? weaponSummaryHtml(it, w) : ''}
            ${weaponMoveButtonsHtml(pos, weaponEntries.length)}
          </div>
          <div class="panel-body" style="display:${it.collapsed ? 'none' : 'block'}">
            <input value="${it.notes||''}" placeholder="Special history, charges, quirks..." style="width:100%;margin-bottom:8px;font-style:italic" onchange="updateItem(${idx},'notes',this.value);renderCombatModule()">
            <div class="form-row">
              ${[['stn1h','STN 1H'],['stn2h','STN 2H'],['stmod','STMOD'],['cdn1h','CDN 1H'],['cdn2h','CDN 2H'],['cdmod','CDMOD']].map(([f,l])=>`
              <div class="form-group"><label>${l}</label><input type="number" step="0.01" class="w60" value="${it[f]||0}" onchange="updateWeaponField(${idx},'${f}',this.value)"></div>`).join('')}
            </div>
            <div class="form-row">
              <div class="form-group"><label>Damage Dice</label><input class="w100" value="${it.damageDice||''}" onchange="updateWeaponField(${idx},'damageDice',this.value)"></div>
              <div class="form-group"><label>Dividing Die</label><input type="number" class="w60" value="${it.dividingDie||0}" onchange="updateWeaponField(${idx},'dividingDie',this.value)"></div>
              <div class="form-group"><label>Speed Melee</label><input type="number" class="w60" value="${it.speedMelee||0}" onchange="updateWeaponField(${idx},'speedMelee',this.value)"></div>
              <div class="form-group"><label>Speed Missile</label><input type="number" class="w60" value="${it.speedMissile||0}" onchange="updateWeaponField(${idx},'speedMissile',this.value)"></div>
              <div class="form-group"><label>Speed Readied</label><input type="number" class="w60" value="${it.speedReadied||0}" onchange="updateWeaponField(${idx},'speedReadied',this.value)"></div>
              <div class="form-group"><label>Weapon PR</label><input type="number" class="w60" value="${it.weaponProtection||0}" onchange="updateWeaponField(${idx},'weaponProtection',this.value)"></div>
              <div class="form-group"><label>Threat Range</label><input type="number" class="w60" value="${it.threatRange||0}" onchange="updateWeaponField(${idx},'threatRange',this.value)"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Magic Bonus to Hit</label><input type="number" class="w80" value="${it.magicBonusToHit||0}" onchange="updateWeaponField(${idx},'magicBonusToHit',this.value)"></div>
              <div class="form-group"><label>Magic Dmg After Divider</label><input type="number" class="w80" value="${it.magicDamageAfterDivider||0}" onchange="updateWeaponField(${idx},'magicDamageAfterDivider',this.value)"></div>
            </div>
            <div class="note">Skill Ability: ${w.baseWeaponSkval} (${it.weaponClass||'—'}) + ${w.singleWeapSpec} (Single Weap Spec) = ${w.skillAbility}</div>
            <div class="note">Crit % = 7 + floor(to-hit÷10) + (10% × Critical Hit Bonus skval [${w.critHitBonusSkval}]) + weapon threat range, capped at half of to-hit, floored at 3% minimum. Fumble range is 93-00, shifting up only if to-hit itself exceeds 93 (so it never overlaps your own hit range).</div>
            <hr class="divider">
            <table class="skill-table">
              <thead><tr><th></th><th>To-Hit</th><th>Dmg Bonus</th><th>Speed</th><th>Parry</th><th>Parry Used</th><th>Multiple Attack</th><th>Crit %</th><th>Fumble %</th></tr></thead>
              <tbody>
                <tr>${w.oneHand ? `<td>One-Handed</td><td class="skval-cell">${Math.round(w.oneHand.hit)}</td><td>${Math.round(w.oneHand.dmgBonus)}</td><td>${Math.round(w.oneHand.speed)}</td><td>${w.parrySkval}</td><td><input type="number" min="0" max="${w.parrySkval}" class="w60" value="${w.parryPointsUsed}" onchange="updateWeaponField(${idx},'parryPointsUsed',this.value)"></td><td>${w.multipleAttackSkval}</td><td>${fmtCrit(w.oneHand.critChance)}</td><td>${fmtFumble(w.oneHand.fumbleThreshold)}</td>` : `<td style="color:var(--text-dim)">One-Handed</td><td colspan="8" class="note">Not usable one-handed — no 1H stats for this weapon</td>`}</tr>
                <tr><td>Two-Handed</td><td class="skval-cell">${Math.round(w.twoHand.hit)}</td><td>${Math.round(w.twoHand.dmgBonus)}</td><td>${Math.round(w.twoHand.speed)}</td><td>${w.parrySkval}</td><td><input type="number" min="0" max="${w.parrySkval}" class="w60" value="${w.parryPointsUsed}" onchange="updateWeaponField(${idx},'parryPointsUsed',this.value)"></td><td>${w.multipleAttackSkval}</td><td>${fmtCrit(w.twoHand.critChance)}</td><td>${fmtFumble(w.twoHand.fumbleThreshold)}</td></tr>
              </tbody>
            </table>
            <div class="note">Parry Used is capped at this weapon's Parry skill value; every point subtracts from this weapon's To-Hit and adds to your Protection (PR) below — but only against melee attacks. It does nothing against missile or magical attacks.</div>
            ${w.missile ? `
            <hr class="divider">
            <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Missile Fire</div>
            <div class="form-row">
              <div class="form-group"><label>Range</label><input type="number" class="w80" value="${it.range||0}" onchange="updateWeaponField(${idx},'range',this.value)"></div>
              <div class="form-group"><label>Target Distance</label><input type="number" class="w80" value="${it.targetDistance||0}" onchange="updateWeaponField(${idx},'targetDistance',this.value)"></div>
              <div class="form-group"><label>Ammunition (from Inventory)</label>
                <select class="w250" onchange="updateWeaponField(${idx},'ammunitionItemIdx',this.value)">
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
            ${(char.items||[]).filter(i=>i.type==='Ammunition').length===0 ? '<div class="note" style="margin-top:6px">No ammunition items in inventory yet — add one on General, Type: Ammunition.</div>' : ''}
            ${w.missile.ammoItem ? `
            <div class="form-row">
              <div class="form-group"><label>Damage Dice</label><input class="w100" value="${w.missile.ammoItem.damageDice||''}" onchange="updateItem(${it.ammunitionItemIdx},'damageDice',this.value);renderCombatModule()"></div>
              <div class="form-group"><label>Dividing Die</label><input type="number" class="w60" value="${w.missile.ammoItem.dividingDie||0}" onchange="updateItem(${it.ammunitionItemIdx},'dividingDie',this.value);renderCombatModule()"></div>
              <div class="form-group"><label>Magic Bonus to Hit</label><input type="number" class="w80" value="${w.missile.ammoItem.magicBonusToHit||0}" onchange="updateItem(${it.ammunitionItemIdx},'magicBonusToHit',this.value);renderCombatModule()"></div>
              <div class="form-group"><label>Magic Dmg After Divider</label><input type="number" class="w80" value="${w.missile.ammoItem.magicDamageAfterDivider||0}" onchange="updateItem(${it.ammunitionItemIdx},'magicDamageAfterDivider',this.value);renderCombatModule()"></div>
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
          ${armor.armorItems.length === 0 ? '<tr><td colspan="4" class="note" style="padding:10px 0">No armor items on General page.</td></tr>' : ''}
          ${armor.armorItems.map(it => `<tr><td>${it.name||'(unnamed)'}</td><td>${it.av||0}</td><td>${it.pr||0}</td><td class="note" style="${it.notes?'font-style:italic':''}">${it.notes||''}</td></tr>`).join('')}
          <tr style="border-top:1px solid var(--gold-dim)"><td><strong>Armor Subtotal</strong></td><td><strong>${armor.armorItems.reduce((s,it)=>s+(parseFloat(it.av)||0),0)}</strong></td><td><strong>${armor.armorItems.reduce((s,it)=>s+(parseFloat(it.pr)||0),0)}</strong></td><td></td></tr>
        </tbody>
      </table>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Weapon Protection & Other Bonuses</div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group"><label>Weapon Protection (PR)</label>
          <input type="number" class="w100" value="${armor.weaponProtection}" onchange="updateCombatExtra('weaponProtection',this.value)">
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
        <thead><tr><th>Shield</th><th>AV</th><th>Base PR</th><th>Shield Use Bonus</th><th>Effective PR</th><th>Notes</th></tr></thead>
        <tbody>
          ${armor.shieldsComputed.length === 0 ? '<tr><td colspan="6" class="note" style="padding:10px 0">No shield equipped.</td></tr>' : ''}
          ${armor.shieldsComputed.map(s => `<tr><td>${s.name||'(unnamed)'}</td><td>${s.av}</td><td>${s.basePR}</td><td>+${s.bonus}</td><td><strong>${s.effectivePR}</strong></td><td class="note" style="${s.notes?'font-style:italic':''}">${s.notes||''}</td></tr>`).join('')}
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

function renderSpellModule() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const pools = computeSpellPools(char);
  const spellbook = char.spellbook || [];

  const schoolBreakdown = {};
  for (const sp of spellbook) {
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
      ${pools.map(p => {
        const key = 'spell:' + p.name;
        const isCollapsed = collapsedSections[key] === undefined ? true : collapsedSections[key];
        const arrow = isCollapsed ? '▶' : '▼';
        return `
      <div class="panel" style="margin-bottom:10px">
        <div class="panel-header" style="cursor:pointer" onclick="toggleSection('${key.replace(/'/g,"\\'")}')">
          <span style="font-size:9px;margin-right:4px">${arrow}</span>
          <h2 style="font-size:13px">${p.name}</h2>
          <span class="type-badge">Max ${p.maxSP} / Cur ${p.currentSP} / Used ${p.usedSP} — ${p.familiarity}</span>
        </div>
        ${isCollapsed ? '' : `
        <div class="panel-body">
          <div class="form-row">
            <div class="computed-item"><span class="ci-label">Max SP</span><span class="ci-value skval">${p.maxSP}</span></div>
            <div class="form-group"><label>Current SP</label><input type="number" class="w80" value="${p.currentSP}" onchange="updateSpellState('${p.name.replace(/'/g,"\\'")}','current',this.value)"></div>
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
            <div class="form-group"><label>SP Cost Reduction</label><input type="number" class="w80" value="${p.spReduction}" onchange="updateSpellEnhancer('${p.name}','spReduction',this.value)"></div>
            <div class="form-group"><label>Reclamation Rate Bonus</label><input type="number" class="w80" value="${p.reclamationBonus}" onchange="updateSpellEnhancer('${p.name}','reclamationBonus',this.value)"></div>
            <div class="form-group"><label>Spell Success Bonus</label><input type="number" class="w80" value="${p.successBonus}" onchange="updateSpellEnhancer('${p.name}','successBonus',this.value)"></div>
          </div>
        </div>
        `}
      </div>`;
      }).join('')}

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Spellbook</div>
      ${Object.keys(schoolBreakdown).length ? `
      <table class="skill-table" style="margin-bottom:12px">
        <thead><tr><th>School</th><th># Spells</th><th>Total SP Cost</th></tr></thead>
        <tbody>
          ${Object.entries(schoolBreakdown).sort().map(([school,d]) => `<tr><td>${school}</td><td>${d.count}</td><td class="skval-cell">${d.totalCost}</td></tr>`).join('')}
          <tr style="border-top:1px solid var(--gold)"><td><strong>Total</strong></td><td><strong>${spellbook.length}</strong></td><td><strong>${Object.values(schoolBreakdown).reduce((s,d)=>s+d.totalCost,0)}</strong></td></tr>
        </tbody>
      </table>
      ` : ''}
      <table class="item-table">
        <thead><tr><th>School</th><th>Spell Name</th><th>SP Cost</th><th>Cost Breakdown</th><th>Notes</th><th></th><th></th></tr></thead>
        <tbody>
          ${spellbook.map((sp, idx) => {
            const catalogEntry = SPELLS.find(s => s.name === sp.name && s.school === sp.school);
            const breakdown = catalogEntry && catalogEntry.costs ? Object.entries(catalogEntry.costs).map(([sch,v])=>`${sch} ${v}`).join(', ') : (catalogEntry ? '—' : 'not in detail catalog');
            return `
          <tr>
            <td><select onchange="updateSpell(${idx},'school',this.value);renderSpellModule()">
              <option value="">— select —</option>
              ${Object.keys(SPELL_SCHOOL_TO_POOL).sort().map(sc=>`<option ${sp.school===sc?'selected':''}>${sc}</option>`).join('')}
            </select></td>
            <td>${sp.school ? (SPELLS.filter(s=>s.school===sp.school).length > 0 ? `<select onchange="selectSpellName(${idx},this.value)">
              <option value="">— select —</option>
              ${SPELLS.filter(s=>s.school===sp.school).map(s=>`<option ${sp.name===s.name?'selected':''}>${s.name}</option>`).join('')}
            </select>` : `<input value="${sp.name||''}" placeholder="no catalog for this school — type name" onchange="updateSpell(${idx},'name',this.value)">`) : '<input value="" placeholder="pick a school first" disabled>'}</td>
            <td class="item-qty"><input type="number" value="${sp.cost||0}" onchange="updateSpell(${idx},'cost',this.value)"></td>
            <td class="note" style="padding:3px 6px">${breakdown}</td>
            <td><input value="${sp.notes||''}" onchange="updateSpell(${idx},'notes',this.value)"></td>
            <td>${catalogEntry && catalogEntry.costs ? `<button class="btn btn-gold" style="font-size:11px;padding:3px 8px" onclick="openHardcastModal(${idx})">Cast</button>` : ''}</td>
            <td class="item-del" onclick="removeSpell(${idx})">✕</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
      <button class="btn btn-gold" onclick="addSpell()">+ Add Spell</button>
      <div class="note" style="margin-top:8px">${SPELLS.length} spells cataloged (${SPELLS.filter(s=>s.costs).length} with full per-school cost breakdown). Spirit and Shade schools aren't in this catalog yet.</div>

    </div>
  </div>`;
}

function renderUtilitiesModule() {
  const custom = loadCustomData();
  const typeOrder = ['Combat','Spell','Acting','Alchemic','Art','Artisan','Curative','Dance','Detect','Engineer','Language','Mind','Movement','Music','Priest','Scholar','Social','Thieves','Torturer','Outdoor'];

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
        <div class="form-group"><label>Skill Name</label><input id="ns-name" class="w200"></div>
        <div class="form-group"><label>Commonality</label><input id="ns-comm" type="number" class="w60" value="1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Attribute Modifier Formula</label><input id="ns-attmod" class="w250" placeholder="e.g. ((ST-12)*.02)+((CD-10)*.01)"></div>
        <div class="form-group"><label>Base</label><input id="ns-base" type="number" class="w80" value="0"></div>
        <div class="form-group"><label>Per Level Die</label><input id="ns-perlevel" class="w80" placeholder="e.g. 1D6+1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Parent Skill (blank if root)</label><input id="ns-parent" class="w250"></div>
        <div class="form-group"><label>Dropdown % (blank if root)</label><input id="ns-dropdown" type="number" step="0.01" class="w80"></div>
      </div>
      <button class="btn btn-gold" onclick="addCustomSkill()">+ Add Skill to Master List</button>

      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Add Guild EXPMOD (bxp)</div>
      <div class="form-row">
        <div class="form-group" style="width:250px"><label>Guild</label>
          <input type="hidden" id="ge-guild" value="">
          <button type="button" id="ge-guild-label" class="btn btn-dim" style="width:100%;text-align:left" onclick="pickGuildIntoField('ge-guild','ge-guild-label')">— existing —</button>
        </div>
        <div class="form-group"><label>Or New Guild Name</label><input id="ge-newguild" class="w200" placeholder="e.g. Igbar: New Guild"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Skill Name</label>
          <input id="ge-skill" class="w250" list="skill-name-list" placeholder="Start typing a skill name...">
          <datalist id="skill-name-list">${SKILLS.map(s=>`<option value="${s.name}">`).join('')}</datalist>
        </div>
        <div class="form-group"><label>Guild EXPMOD (bxp)</label><input id="ge-bxp" type="number" step="0.001" class="w100"></div>
      </div>
      <button class="btn btn-gold" onclick="addCustomGuildBonus()">+ Set Guild EXPMOD</button>

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
  const def = SKILLS.find(s => s.name === si.skillName);
  const vals = computeSkillValues(si, char, char.skills || []);
  const trainedSkills = getTrainedSkills(state.activeChar).filter(s => s.id !== skillId);
  const rolls = si.rolls || Array(20).fill('');

  // Build EXPMOD breakdown
  const breakdown = `Guild: ${vals.guildBase.toFixed(3)} + Attrib: ${vals.attmodResult.toFixed(3)} + Racial: ${vals.racialExpmod.toFixed(3)} = ${vals.expmod.toFixed(3)}`;

  document.getElementById('main').innerHTML = `
  <div class="panel">
    <div class="panel-header">
      <h2>${si.skillName}${si.binding ? ` — ${si.binding}` : ''}</h2>
      <span class="type-badge">${def ? def.type : '?'}</span>
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
        <div class="form-group" style="width:250px"><label>GuildSchool</label>
          ${guildPickerButton(si.guildName, `v => updateSkill('${skillId}','guildName',v)`)}
        </div>
        ${def && def.templated ? (si.skillName === 'Single weap spec' ? `
        <div class="form-group"><label>Specific Weapon (not a class — this skill trains on one weapon only)</label>
          <select class="w250" onchange="updateSkill('${skillId}','binding',this.value)">
            <option value="">— select —</option>
            ${((char.items||[]).filter(it=>it.type==='Weapon').concat(handFootWeapon(char) ? [handFootWeapon(char)] : [])).map(it=>`<option ${si.binding===it.name?'selected':''}>${it.name||'(unnamed weapon)'}</option>`).join('')}
          </select>
          <div class="note" style="margin-top:4px">Single Weapon Specialization trains on one exact weapon, not a whole weapon type — a character with two curved swords could be specialized in one and not the other.</div>
        </div>` : `
        <div class="form-group"><label>Weapon Class</label>
          <select class="w200" onchange="updateSkill('${skillId}','binding',this.value)">
            <option value="">— select —</option>
            ${WEAPON_CLASSES.map(wc=>`<option ${si.binding===wc?'selected':''}>${wc}</option>`).join('')}
          </select>
        </div>`) : ''}
        <div class="form-group" style="justify-content:flex-end;margin-top:4px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" ${si.dropdownOnly?'checked':''} onchange="updateSkill('${skillId}','dropdownOnly',this.checked)">
            Dropdown Only
          </label>
        </div>
      </div>

      <div class="form-row">
        ${def && def.templated ? `
        <div class="form-group"><label>Parent Skill</label>
          <div class="note" style="padding-top:6px">Not used for this skill — set <strong>Weapon Class</strong> (or Specific Weapon) above instead. That's what actually links this to a weapon.</div>
        </div>` : `
        <div class="form-group"><label>Parent Skill (trained only)</label>
          <select class="w250" onchange="updateSkill('${skillId}','parentSkillId',this.value)">
            <option value="">— none —</option>
            ${trainedSkills.map(ts=>`<option value="${ts.id}" ${si.parentSkillId===ts.id?'selected':''}>${ts.skillName}</option>`).join('')}
          </select>
        </div>`}
        <div class="form-group"><label>Racial EXPMOD Bonus</label>
          <div style="display:flex;gap:4px">
            <input type="number" step="0.001" class="w80" value="${si.racialExpmod||0}" onchange="updateSkill('${skillId}','racialExpmod',this.value)">
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
          <input type="number" class="w100" value="${si.rawXP||0}" onchange="updateSkill('${skillId}','rawXP',this.value)">
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
        ${def && def.per_level ? `<button type="button" class="btn btn-dim" style="font-size:11px;padding:2px 8px" onclick="rollAllEmptyLevels('${skillId}')" title="Rolls ${def.per_level} for every empty level below">🎲 Roll All Empty</button>` : ''}
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
          <input type="number" class="w60" value="${si['bonus'+t]||0}" onchange="updateSkill('${skillId}','bonus${t}',this.value)">
        </div>`).join('')}
      </div>

      <hr class="divider">
      <div class="form-group"><label>Notes</label>
        <textarea rows="2" style="width:100%;resize:vertical" onchange="updateSkill('${skillId}','notes',this.value)">${si.notes||''}</textarea>
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
