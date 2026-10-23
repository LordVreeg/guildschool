// ============================================================
// MUTATIONS
// ============================================================
function selectChar(id) {
  state.activeChar = id || null;
  state.activeSkillId = null;
  state.activeView = 'overview';
  renderApp();
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

function addItem() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.items) char.items = [];
  char.items.push({ name: '', type: 'Item', qty: 1, weight: 0, worth: '', notes: '', location: '' });
  saveState();
  renderGeneralModule();
}

function updateStorageOnPerson(location, checked) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.storageOnPerson) char.storageOnPerson = {};
  if (checked) char.storageOnPerson[location] = true; else delete char.storageOnPerson[location];
  saveState();
  renderGeneralModule();
}
function updateStorageCapacity(location, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.storageCapacities) char.storageCapacities = {};
  char.storageCapacities[location] = (value === '' || value === null) ? null : (parseFloat(value) || 0);
  saveState();
  renderGeneralModule();
}

function addStorageContainer() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const name = document.getElementById('new-storage-name').value.trim();
  const capacity = document.getElementById('new-storage-capacity').value;
  if (!name) return;
  if (!char.storageCapacities) char.storageCapacities = {};
  char.storageCapacities[name] = capacity === '' ? null : (parseFloat(capacity) || 0);
  saveState();
  renderGeneralModule();
}

function updateItem(idx, field, value) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  char.items[idx][field] = value;
  saveState();
  if (field === 'weight' || field === 'qty' || field === 'worth' || field === 'av' || field === 'pr') renderGeneralModule();
}

function selectArmorType(idx, armorName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  const item = char.items[idx];
  item.armorType = armorName;
  const def = ARMOR.find(a => a.name === armorName);
  if (def) {
    item.av = def.av;
    item.pr = def.pr;
    item.weight = def.weight;
    if (!item.worth) item.worth = def.cost;
  }
  saveState();
  renderGeneralModule();
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
}

function updateSpellEnhancer(poolName, field, value) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.spellEnhancers) char.spellEnhancers = {};
  if (!char.spellEnhancers[poolName]) char.spellEnhancers[poolName] = {};
  char.spellEnhancers[poolName][field] = parseFloat(value) || 0;
  saveState();
  renderSpellModule();
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
      <div class="form-group"><label>Extra Spirit</label><input type="number" class="w80" value="${hs.overcastSpirit}" onchange="updateHardcastOvercast('overcastSpirit',this.value)"></div>
      ${hs.majorPool && hs.majorPool !== 'Spirit SP' ? `<div class="form-group"><label>Extra ${hs.school}</label><input type="number" class="w80" value="${hs.overcastMajor}" onchange="updateHardcastOvercast('overcastMajor',this.value)"></div>` : ''}
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
      <div class="form-group"><label>d50</label><input type="number" id="spell-gm-roll" class="w80" min="1" max="50" oninput="updateSpellResolve()"></div>
      <div class="form-group"><button class="btn btn-dim" onclick="rollSpellDie('spell-gm-roll',50)">Roll d50</button></div>
    </div>
    <div class="computed-item" style="margin-bottom:12px"><span class="ci-label">Target</span><span class="ci-value skval" id="spell-target" style="font-size:20px">—</span></div>

    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">2. Caster roll (d100)</div>
    <div class="form-row" style="align-items:flex-end;margin-bottom:6px">
      <div class="form-group"><label>d100</label><input type="number" id="spell-cast-roll" class="w80" min="1" max="100" oninput="updateSpellResolve()"></div>
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
      <div class="form-group"><label>Amount</label><input type="number" id="mark-duration-amt" class="w80" value="1" min="0"></div>
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

function addSpell() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  if (!char.spellbook) char.spellbook = [];
  char.spellbook.push({ name: '', school: '', cost: 0, notes: '' });
  saveState();
  renderSpellModule();
}

function selectSpellName(idx, spellName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.spellbook || !char.spellbook[idx]) return;
  const entry = char.spellbook[idx];
  entry.name = spellName;
  const def = SPELLS.find(s => s.name === spellName && s.school === entry.school);
  if (def) entry.cost = def.cost;
  saveState();
  renderSpellModule();
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
  if (!char || !char.spellbook) return;
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
  const item = char.items[idx];
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
  }
  saveState();
  renderGeneralModule();
}

function selectCoinType(idx, coinName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  const item = char.items[idx];
  const def = COINAGE.find(c => `${c.name} (${c.metal})` === coinName);
  if (def) {
    item.name = def.name;
    item.weight = def.weight;
    item.worth = def.worthInHorn;
  }
  saveState();
  renderGeneralModule();
}

function selectAmmoType(idx, ammoName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  const item = char.items[idx];
  const def = AMMUNITION.find(a => a.name === ammoName);
  if (def) {
    item.ammoBase = def.name;
    item.name = def.name;
    item.damageDice = def.damage_dice;
    item.dividingDie = def.dividing_die;
    item.weight = def.weight;
    if (!item.worth) item.worth = def.cost;
  }
  saveState();
  renderGeneralModule();
}

function selectShieldType(idx, shieldName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  const item = char.items[idx];
  item.shieldType = shieldName;
  const def = SHIELDS.find(s => s.name === shieldName);
  if (def) {
    item.av = def.av;
    item.pr = def.pr;
    item.weight = def.weight;
    if (!item.worth) item.worth = def.cost;
  }
  saveState();
  renderGeneralModule();
}

function selectBasicItem(idx, itemName) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items || !char.items[idx]) return;
  const item = char.items[idx];
  const def = BASIC_ITEMS.find(b => b.class === item.itemClass && b.name === itemName);
  item.basicItemName = itemName;
  if (def) {
    item.name = def.name;
    item.weight = def.weight;
    item.worth = def.worth;
    item.notes = def.notes;
  }
  saveState();
  renderGeneralModule();
}

function removeItem(idx) {
  const char = state.characters[state.activeChar];
  if (!char || !char.items) return;
  char.items.splice(idx, 1);
  saveState();
  renderGeneralModule();
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

function deleteSkill(skillId) {
  if (!confirm('Remove this skill?')) return;
  const char = state.characters[state.activeChar];
  char.skills = (char.skills || []).filter(s => s.id !== skillId);
  state.activeSkillId = null;
  state.activeView = 'overview';
  saveState();
  renderSidebar();
  renderOverview();
}

function deleteChar() {
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
    <div class="form-group" style="margin-bottom:8px"><label>New Owner's Email</label><input id="transfer-email" style="width:100%" type="email"></div>
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
