// ============================================================
// COMBAT MODULE (segment-based initiative tracker) -- see
// project_combat_initiative_tracker_spec memory for the full design.
// Category order is the coarse tiebreak (spell > non-combat > missile >
// melee); manual_order is the GM's final ▲▼ tiebreak for anything the
// schema doesn't otherwise resolve (e.g. Coordination isn't modeled here --
// next_segment being numeric lets a GM encode finer ordering directly by
// typing e.g. 12.5 instead of 13 when they want to).
// ============================================================
const COMBAT_CATEGORY_RANK = { spell: 0, 'non-combat': 1, missile: 2, melee: 3 };
const COMBAT_CATEGORY_LABELS = { spell: 'Spell', 'non-combat': 'Non-Combat', missile: 'Missile', melee: 'Melee' };

let activeEncounterId = null;
let encounterCache = null;
let combatantsCache = [];
let actionTracksCache = [];
let combatLogCache = [];
let combatOwnerByCharId = {}; // character_id -> owner_id, for this encounter's home group
// Bumped at the start of every renderEncounterModule() call; a call only
// commits its fetched data / repaints if it's still the most recent one by
// the time its fetches finish. Without this, two edits fired in quick
// succession (a nudge, then Resolve, then typing a new value) can have
// their multi-step fetch chains finish out of order -- an earlier, slower
// call reading stale data can land last and stomp a newer, correct render.
let encounterRenderSeq = 0;
let encounterIsGM = false; // set on every render so modals outside renderEncounterHtml can apply the same edit-rights rule
let combatFoeXp = {};      // combatant id -> XP value of that foe (GM only; computeFoeXP on its Beastiary entry)

// The Group page's one Combat button: a campaign can rack up 20-30
// encounters over time, so this can't just guess which one to jump back
// into -- it opens a picker instead, resumable (active/paused) encounters
// on top, a fresh-start form below. The full history (incl. ended ones)
// is still browsable in the plain list on the Group page itself.
function enterOrStartCombat(groupId) {
  const resumable = groupEncountersCache.filter(e => e.status === 'active' || e.status === 'paused');
  const encStatusColor = { active: '#4a9460', paused: '#c9a227' };
  const resumableHtml = resumable.length
    ? resumable.map(e => `<li style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <span style="cursor:pointer;color:var(--gold)" onclick="closeModal();openEncounter('${e.id}')">${escapeHtml(e.name)}</span>
        <span style="font-size:10px;color:${encStatusColor[e.status]}">(${e.status}, segment ${e.current_segment})</span>
      </li>`).join('')
    : '<li class="note">No combats currently in progress.</li>';
  openModal(`
    <h3>Enter Combat</h3>
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Resume</div>
    <ul style="margin:0 0 12px 16px;padding:0;font-size:13px">${resumableHtml}</ul>
    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin:8px 0 6px">Start New</div>
    <div class="form-group" style="margin-bottom:8px"><label>Name</label><input id="sc-name" style="width:100%" placeholder="e.g. Ambush on the Old Road"></div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="createEncounter('${groupId}')">Start</button></div>`);
}

async function createEncounter(groupId) {
  const name = document.getElementById('sc-name').value.trim();
  if (!name) { alert('Name is required.'); return; }
  const { data, error } = await sb.from('combat_encounters').insert({ group_id: groupId, created_by: currentUser.id, name }).select('id').single();
  if (error) { alert('Failed to start combat: ' + error.message); return; }
  closeModal();
  openEncounter(data.id);
}

function openEncounter(id) {
  activeEncounterId = id;
  state.activeView = 'encounter';
  renderEncounterModule();
}

function closeEncounter() {
  const groupId = encounterCache ? encounterCache.group_id : activeGroupId;
  activeEncounterId = null;
  encounterCache = null;
  state.activeView = 'group';
  activeGroupId = groupId;
  renderGroupModule();
}

async function renderEncounterModule() {
  const mySeq = ++encounterRenderSeq;
  const stillCurrent = () => mySeq === encounterRenderSeq;
  // Only the very first call in a burst shows the loading state -- if a
  // newer call has already started, its own paint (or this one's, whichever
  // finishes last while still current) is all that should reach the screen.
  if (stillCurrent()) document.getElementById('main').innerHTML = `<div class="panel"><div class="panel-body">Loading combat…</div></div>`;
  await fetchMyGroups();
  const { data: enc, error: encErr } = await sb.from('combat_encounters').select('*').eq('id', activeEncounterId).single();
  if (!stillCurrent()) return;
  if (encErr || !enc) {
    document.getElementById('main').innerHTML = `<div class="panel"><div class="panel-body" style="color:var(--red-b)">Failed to load combat: ${escapeHtml(encErr ? encErr.message : 'not found')}</div></div>`;
    return;
  }
  const group = myGroups.find(g => g.id === enc.group_id);
  const isGM = !!(group && group.myRole === 'gm');

  const [{ data: combatants, error: ccErr }, { data: roster, error: rErr2 }] = await Promise.all([
    sb.from('combat_combatants').select('*').eq('encounter_id', enc.id).order('manual_order', { ascending: true }),
    sb.from('group_roster').select('id, owner_id').eq('group_id', enc.group_id)
  ]);
  if (!stillCurrent()) return;
  if (ccErr || rErr2) {
    document.getElementById('main').innerHTML = `<div class="panel"><div class="panel-body" style="color:var(--red-b)">Failed to load combat: ${escapeHtml((ccErr||rErr2).message)}</div></div>`;
    return;
  }
  const combatantRows = combatants || [];
  const ownerByCharId = {};
  for (const r of roster || []) ownerByCharId[r.id] = r.owner_id;

  const combatantIds = combatantRows.map(c => c.id);
  const [{ data: tracks, error: tErr }, { data: log, error: lErr }] = await Promise.all([
    combatantIds.length ? sb.from('combat_action_tracks').select('*').in('combatant_id', combatantIds) : Promise.resolve({ data: [], error: null }),
    sb.from('combat_log_entries').select('*').eq('encounter_id', enc.id).order('created_at', { ascending: false }).limit(40)
  ]);
  if (!stillCurrent()) return;
  if (tErr || lErr) {
    document.getElementById('main').innerHTML = `<div class="panel"><div class="panel-body" style="color:var(--red-b)">Failed to load combat: ${escapeHtml((tErr||lErr).message)}</div></div>`;
    return;
  }

  // Foe XP values, for the GM: each foe combatant's Beastiary entry run
  // through the same computeFoeXP the Beastiary uses, with this fight's own
  // max HP (a foe rolled tougher or weaker than its template is worth that).
  // Temp PCs share the Beastiary table but aren't foes, so they're skipped.
  const foeXp = {};
  if (isGM) {
    const entryIds = [...new Set(combatantRows.filter(c => c.bestiary_entry_id).map(c => c.bestiary_entry_id))];
    if (entryIds.length) {
      const { data: entries } = await sb.from('bestiary_entries').select('*').in('id', entryIds);
      const entryById = {};
      for (const e of entries || []) entryById[e.id] = e;
      for (const c of combatantRows) {
        const e = c.bestiary_entry_id ? entryById[c.bestiary_entry_id] : null;
        if (e && !e.is_temp_pc) foeXp[c.id] = Math.round(computeFoeXP({ ...e, max_hp: c.max_hp != null ? c.max_hp : e.max_hp }));
      }
    }
    if (!stillCurrent()) return;
  }

  // Commit everything together, only once this call is confirmed to still
  // be the latest -- never partially overwrite the shared caches with a
  // response that a newer call has already superseded.
  encounterCache = enc;
  combatantsCache = combatantRows;
  combatOwnerByCharId = ownerByCharId;
  actionTracksCache = tracks || [];
  combatLogCache = log || [];
  encounterIsGM = isGM;
  combatFoeXp = foeXp;
  document.getElementById('main').innerHTML = renderEncounterHtml(enc, isGM);
}

function combatantStatusColor(cur, max) {
  if (cur == null || max == null || max <= 0) return 'var(--text-dim)';
  if (cur <= 0) return '#c0524a';
  const pct = cur / max;
  if (pct <= 0.34) return '#c0524a';
  if (pct <= 0.7) return '#c9a227';
  return '#4a9460';
}

function combatantHpBadge(c, isGM) {
  const mine = !!(c.character_id && combatOwnerByCharId[c.character_id] === currentUser.id);
  // Collegium's whole point is that Physical and Endurance mean different
  // things -- 0 Physical with Endurance left is a real emergency, the
  // reverse isn't -- so a merged total can't drive status color/dead the
  // way it does for a standard-HP combatant. Same convention the
  // character sheet itself already uses (Physical = real injury).
  const isCollegium = c.hp_system === 'collegium';
  const statusCur = isCollegium ? c.physical_current : c.current_hp;
  const statusMax = isCollegium ? c.physical_max : c.max_hp;
  const dead = statusCur != null && statusCur <= 0;
  if (isGM || mine) {
    const color = combatantStatusColor(statusCur, statusMax);
    const text = isCollegium
      ? `Phys ${c.physical_current!=null?c.physical_current:'?'}/${c.physical_max!=null?c.physical_max:'?'}, End ${c.endurance_current!=null?c.endurance_current:'?'}/${c.endurance_max!=null?c.endurance_max:'?'}`
      : `${c.current_hp != null ? c.current_hp : '?'}/${c.max_hp != null ? c.max_hp : '?'} HP`;
    return `<span style="color:${color};font-weight:${dead?'bold':'normal'}">${text}</span>`;
  }
  return `<span style="color:${combatantStatusColor(statusCur, statusMax)}">●</span>`;
}

function renderEncounterHtml(enc, isGM) {
  const dueSegment = enc.current_segment;
  const byId = {};
  for (const c of combatantsCache) byId[c.id] = c;
  const tracksByCombatant = {};
  for (const t of actionTracksCache) {
    (tracksByCombatant[t.combatant_id] = tracksByCombatant[t.combatant_id] || []).push(t);
  }
  // The one visibility rule for the whole page: a player sees full detail
  // (HP numbers, team, target, action tracks, effects) only for the GM, or
  // for their own linked character -- everyone else collapses to a bare
  // name and the existing color-coded HP status. No separate per-field
  // toggles; "can edit it" and "can see its detail" are the same question.
  const canEditCombatant = (c) => isGM || !!(c && c.character_id && combatOwnerByCharId[c.character_id] === currentUser.id);
  // A combatant's overall state -- active/waiting/incapacitated/killed --
  // set by hand (GM or the owning player), never inferred from HP. Legacy
  // rows with no status yet default to 'active'.
  const combatantStatus = (c) => (c && c.status) || 'active';

  const targetOptionsHtml = (currentId, selectedId) => `<option value="">(no target)</option>` +
    combatantsCache.filter(c => c.id !== currentId).map(c => `<option value="${c.id}" ${c.id===selectedId?'selected':''}>${escapeHtml(c.display_name)}</option>`).join('');

  const combatantsHtml = combatantsCache.length ? combatantsCache.map((c, i) => {
    const canEdit = canEditCombatant(c);
    const status = combatantStatus(c);
    const nameStyle = (status === 'incapacitated' || status === 'killed')
      ? `text-decoration:line-through${status==='killed' ? ';color:#a03030' : ''}` : '';
    // A player only gets the full card -- team, exact HP, target, action
    // tracks, effects -- for their own combatant (or the GM's, for
    // everyone). Anyone else's card collapses to just a name and the
    // existing color-coded HP status: no other creature info leaks.
    if (!canEdit) {
      return `<div id="cc-card-${c.id}" style="border:1px solid var(--border);border-radius:4px;padding:6px 8px;margin-bottom:6px;display:flex;align-items:center;gap:8px;transition:box-shadow .3s">
        <span style="${nameStyle}">${escapeHtml(c.display_name)}</span>
        ${combatantHpBadge(c, isGM)}
      </div>`;
    }
    const tracks = tracksByCombatant[c.id] || [];
    const tracksHtml = tracks.map(t => {
      const due = t.next_segment != null && t.next_segment <= dueSegment;
      // Initiative is the one thing that has to be fast for both sides of the
      // table: a big, bold segment number up front with one-tap nudge
      // buttons. The intended-action text turned out to be a real freeform
      // description ("biting Bastardo", "casting Source charge"), not a
      // short tag, so it gets its own full-width row and room to type.
      return `<div style="margin:3px 0">
        ${canEdit ? `
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          <button class="btn btn-dim" style="font-size:14px;padding:1px 9px;font-weight:bold" onclick="nudgeActionTrack('${t.id}',-1)" title="-1 segment">−</button>
          <input type="number" step="any" style="width:64px;font-size:16px;font-weight:bold;text-align:center;color:var(--gold)" value="${t.next_segment != null ? t.next_segment : ''}" placeholder="—" onchange="updateActionTrack('${t.id}','next_segment',this.value===''?null:parseFloat(this.value))">
          <button class="btn btn-dim" style="font-size:14px;padding:1px 9px;font-weight:bold" onclick="nudgeActionTrack('${t.id}',1)" title="+1 segment">+</button>
          ${t.next_segment == null ? `<button class="btn btn-gold" style="font-size:10px;padding:2px 6px" onclick="updateActionTrack('${t.id}','next_segment',${dueSegment})">Join Now (seg ${dueSegment})</button>` : ''}
          ${due && t.next_segment != null ? `<button class="btn btn-gold" style="font-size:10px;padding:2px 6px" onclick="resolveActionTrack('${t.id}')">Resolve</button>` : ''}
          <select style="font-size:11px" onchange="updateActionTrack('${t.id}','action_category',this.value||null)">
            <option value="">(category)</option>
            ${Object.keys(COMBAT_CATEGORY_RANK).map(k => `<option value="${k}" ${t.action_category===k?'selected':''}>${COMBAT_CATEGORY_LABELS[k]}</option>`).join('')}
          </select>
          <button class="btn btn-dim" style="font-size:10px;padding:1px 6px" onclick="deleteActionTrack('${t.id}')">✕</button>
        </div>
        <input value="${escapeHtml(t.label||'')}" placeholder="Intended action (e.g. biting Bastardo, casting Source charge)" style="width:100%;font-size:13px;margin-top:3px" onchange="updateActionTrack('${t.id}','label',this.value)">` :
        `<div>
          <span style="font-size:15px;font-weight:bold;color:var(--gold)">${t.next_segment!=null?'@ '+t.next_segment:'(standing by)'}</span>
          ${t.action_category ? `<span style="font-size:11px;color:var(--text-dim)"> ${COMBAT_CATEGORY_LABELS[t.action_category]}</span>` : ''}
          ${t.label ? `<div style="font-size:13px">${escapeHtml(t.label)}</div>` : ''}
        </div>`}
      </div>`;
    }).join('');
    const effects = c.effects || [];
    const effectsHtml = effects.map((eff, ei) => {
      const expired = eff.expires_at_segment != null && eff.expires_at_segment <= dueSegment;
      const endsTag = eff.expires_at_segment != null ? ` (${expired ? 'ended' : 'ends'} @ ${eff.expires_at_segment})` : '';
      return `<span style="font-size:11px;color:var(--gold-dim);margin-right:8px;${expired?'text-decoration:line-through':''}" title="Expires at segment ${eff.expires_at_segment}">${escapeHtml(eff.label)}${endsTag}${canEdit?` <a href="#" onclick="removeEffect('${c.id}',${ei});return false" style="color:var(--red-b)">✕</a>`:''}</span>`;
    }).join('');
    return `<div id="cc-card-${c.id}" style="border:1px solid var(--border);border-radius:4px;padding:6px 8px;margin-bottom:6px;transition:box-shadow .3s">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="${nameStyle}">${escapeHtml(c.display_name)}</span>
        ${combatFoeXp[c.id] != null ? `<span style="font-size:11px;color:var(--gold-dim)" title="Experience value of this foe (Beastiary formula)">XP ${combatFoeXp[c.id].toLocaleString()}</span>` : ''}
        ${canEdit ? `<input value="${escapeHtml(c.team||'')}" placeholder="Team" style="width:80px;font-size:11px" onchange="updateCombatantField('${c.id}','team',this.value)">`
          : `<span style="font-size:10px;color:var(--text-dim)">${escapeHtml(c.team||'')}</span>`}
        ${combatantHpBadge(c, isGM)}
        ${canEdit ? (c.hp_system === 'collegium' ? `
        <span style="font-size:10px;color:var(--text-dim)">Phys</span>
        <input type="number" class="w60" style="font-size:11px" value="${c.physical_current!=null?c.physical_current:''}" title="Physical Current" onchange="updateCollegiumHp('${c.id}','physical_current',this.value)">
        / <input type="number" class="w60" style="font-size:11px" value="${c.physical_max!=null?c.physical_max:''}" title="Physical Max" onchange="updateCollegiumHp('${c.id}','physical_max',this.value)">
        <span style="font-size:10px;color:var(--text-dim)">End</span>
        <input type="number" class="w60" style="font-size:11px" value="${c.endurance_current!=null?c.endurance_current:''}" title="Endurance Current" onchange="updateCollegiumHp('${c.id}','endurance_current',this.value)">
        / <input type="number" class="w60" style="font-size:11px" value="${c.endurance_max!=null?c.endurance_max:''}" title="Endurance Max" onchange="updateCollegiumHp('${c.id}','endurance_max',this.value)">` : `
        <input type="number" class="w60" style="font-size:11px" value="${c.current_hp!=null?c.current_hp:''}" title="Current HP" onchange="updateCombatantField('${c.id}','current_hp',this.value===''?null:parseFloat(this.value))">
        / <input type="number" class="w60" style="font-size:11px" value="${c.max_hp!=null?c.max_hp:''}" title="Max HP" onchange="updateCombatantField('${c.id}','max_hp',this.value===''?null:parseFloat(this.value))">`) : ''}
        <select style="font-size:11px" onchange="updateCombatantField('${c.id}','target_combatant_id',this.value||null)">${targetOptionsHtml(c.id, c.target_combatant_id)}</select>
        <select style="font-size:11px" onchange="updateCombatantField('${c.id}','status',this.value)" title="Status -- drives Turn Order placement and name styling">
          ${['active','waiting','incapacitated','killed'].map(s => `<option value="${s}" ${status===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}
        </select>
        ${isGM ? `<button class="btn btn-dim" style="font-size:10px;padding:1px 6px" onclick="removeCombatant('${c.id}')">Remove</button>` : ''}
      </div>
      <div style="margin-top:4px">${tracksHtml}</div>
      ${canEdit ? `<button class="btn btn-dim" style="font-size:10px;padding:1px 6px;margin-top:2px" onclick="addActionTrack('${c.id}')">+ Track</button>
      <button class="btn btn-dim" style="font-size:10px;padding:1px 6px;margin-top:2px" onclick="openAddEffectModal('${c.id}')">+ Effect</button>` : ''}
      <div style="margin-top:2px">${effectsHtml}</div>
    </div>`;
  }).join('') : '<div class="note">No combatants yet.</div>';

  const logHtml = combatLogCache.length ? `<table class="skill-table"><thead><tr><th>Seg</th><th>Combatant</th><th>Target</th><th>Action</th><th>Dmg</th></tr></thead><tbody>
    ${combatLogCache.map(l => {
      const actor = byId[l.combatant_id];
      const target = byId[l.target_combatant_id];
      const dmgParts = [];
      if (l.damage_dealt != null) dmgParts.push(`${l.damage_dealt} dealt`);
      if (l.damage_taken != null) dmgParts.push(`${l.damage_taken} taken`);
      if (l.damage_prevented != null) dmgParts.push(`${l.damage_prevented} prevented`);
      return `<tr><td>${l.segment}</td><td>${escapeHtml(actor?actor.display_name:'—')}</td><td>${escapeHtml(target?target.display_name:'—')}</td><td>${escapeHtml(l.action_summary)}</td><td style="font-size:11px">${dmgParts.join(', ')}</td></tr>`;
    }).join('')}
  </tbody></table>` : '<div class="note">No log entries yet.</div>';

  // Left rail: a Roll20-style Turn Order list -- every action track, not
  // grouped by combatant, since that's the question a table actually needs
  // answered fast during play. Queued tracks sort by the same 3-level
  // tiebreak as "Advance to Next Queued Action" (segment, then category,
  // then the GM's manual ▲▼ order); standing-by tracks (no segment set
  // yet) sort to the bottom rather than being hidden, so "who hasn't
  // declared yet" is still visible at a glance.
  //
  // Waiting/Killed combatants are pulled out of the segment-sorted order
  // entirely -- one row per combatant (not per track), parked at the very
  // bottom, Waiting first then Killed, alphabetical within each so they
  // don't reshuffle on their own. Incapacitated stays mixed in normally
  // (it still has a real init); only its name renders struck through.
  const sidelinedCombatants = combatantsCache.filter(c => {
    const s = combatantStatus(c);
    return s === 'waiting' || s === 'killed';
  });
  const sidelinedIds = new Set(sidelinedCombatants.map(c => c.id));

  const queuedTracks = actionTracksCache
    .filter(t => t.next_segment != null && byId[t.combatant_id] && !sidelinedIds.has(t.combatant_id))
    .slice()
    .sort((a, b) => compareQueuedTracks(a, b, byId));
  const standbyTracks = actionTracksCache.filter(t => t.next_segment == null && byId[t.combatant_id] && !sidelinedIds.has(t.combatant_id));
  const orderedTracks = queuedTracks.concat(standbyTracks);

  // "Log an Action" should default to whoever's actually up -- the same
  // due entry highlighted green at the top of Turn Order -- so the common
  // case (log the thing the current combatant just did) needs no dropdown
  // fumbling. Falls back to whoever's soonest if nothing's due yet.
  const dueTrack = queuedTracks.find(t => t.next_segment <= dueSegment);
  const currentTurnCombatantId = (dueTrack || queuedTracks[0] || {}).combatant_id;
  // Turn Order itself is creature info -- a player only sees rows for
  // combatants they can already see the full card for (their own, or the
  // GM's view of everyone); other creatures' place in the order, and
  // whatever they're about to do, isn't shown at all.
  const visibleOrderedTracks = orderedTracks.filter(t => canEditCombatant(byId[t.combatant_id]));
  const visibleSidelined = sidelinedCombatants
    .filter(c => canEditCombatant(c))
    .sort((a, b) => {
      const rank = s => s === 'waiting' ? 0 : 1;
      const ra = rank(combatantStatus(a)), rb = rank(combatantStatus(b));
      if (ra !== rb) return ra - rb;
      return a.display_name.localeCompare(b.display_name);
    });
  // Ties can only be adjudicated at the segment that's actually tied, so
  // group queued tracks by segment once and give the GM ▲▼ right on the
  // row, scoped to that group -- not a general "move it anywhere" control.
  const tieGroupsBySegment = {};
  for (const t of queuedTracks) {
    (tieGroupsBySegment[t.next_segment] = tieGroupsBySegment[t.next_segment] || []).push(t);
  }
  const renderTrackRow = (t) => {
    const c = byId[t.combatant_id];
    const status = combatantStatus(c);
    const nameStyle = status === 'incapacitated' ? 'text-decoration:line-through' : '';
    const due = t.next_segment != null && t.next_segment <= dueSegment;
    const tieGroup = t.next_segment != null ? tieGroupsBySegment[t.next_segment] : null;
    const tieIdx = tieGroup ? tieGroup.findIndex(x => x.id === t.id) : -1;
    const tieControlsHtml = (isGM && tieGroup && tieGroup.length > 1) ? `
      <span style="display:flex;flex-direction:column;flex-shrink:0">
        <button class="btn btn-dim" style="font-size:9px;line-height:1;padding:1px 5px" ${tieIdx===0?'disabled':''} onclick="moveTrackWithinTie('${t.id}',-1)" title="Move up within this tied segment">▲</button>
        <button class="btn btn-dim" style="font-size:9px;line-height:1;padding:1px 5px" ${tieIdx===tieGroup.length-1?'disabled':''} onclick="moveTrackWithinTie('${t.id}',1)" title="Move down within this tied segment">▼</button>
      </span>` : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border)${due?';background:rgba(74,148,96,.22)':''}">
      ${tieControlsHtml}
      <span style="flex:1;min-width:0">
        <span style="font-size:17px;font-weight:bold;cursor:pointer;${nameStyle}" title="Show on the right" onclick="focusCombatantCard('${c.id}')">${escapeHtml(c.display_name)}</span>
        ${combatFoeXp[c.id] != null ? `<span style="font-size:11px;color:var(--gold-dim)"> XP ${combatFoeXp[c.id].toLocaleString()}</span>` : ''}
        ${t.label ? `<span style="font-size:12px;color:var(--text-dim)"> ${escapeHtml(t.label)}</span>` : ''}
        ${t.action_category ? `<span style="display:block;font-size:11px;color:var(--text-dim)">${COMBAT_CATEGORY_LABELS[t.action_category]}</span>` : ''}
      </span>
      <span style="font-size:32px;font-weight:bold;line-height:1;color:${t.next_segment!=null?'var(--gold)':'var(--text-dim)'};flex-shrink:0">${t.next_segment!=null?t.next_segment:'—'}</span>
    </div>`;
  };
  // A timed effect (Blessings, a buff, a debuff) gets its own row in the
  // order at the segment it ends, so the table sees it coming and sees it
  // lapse -- same visibility rule as everything else here, so a player only
  // gets rows for combatants they can already see. Sorted in after any
  // actions at the same segment.
  // One row per shared effect (copies carry the same effect_id), listing
  // every affected combatant the viewer can see; legacy/single effects with
  // no effect_id stay one row each.
  const effectGroups = {};
  for (const c of combatantsCache) {
    const s = combatantStatus(c);
    if (s === 'waiting' || s === 'killed' || !canEditCombatant(c)) continue;
    (c.effects || []).forEach((eff, ei) => {
      if (eff.expires_at_segment == null) return;
      const key = eff.effect_id || `${c.id}:${ei}`;
      if (!effectGroups[key]) effectGroups[key] = { key, eff, ei, combatants: [], shared: !!eff.effect_id };
      effectGroups[key].combatants.push(c);
    });
  }
  const effectItems = Object.values(effectGroups);
  const renderEffectRow = ({ combatants, ei, eff, shared }) => {
    const ended = eff.expires_at_segment <= dueSegment;
    const left = Math.round((eff.expires_at_segment - dueSegment) * 100) / 100;
    const names = combatants.map(c => `<span style="cursor:pointer;text-decoration:underline dotted" title="Show on the right" onclick="focusCombatantCard('${c.id}')">${escapeHtml(c.display_name)}</span>`).join(', ');
    const clearCall = shared ? `removeEffectEverywhere('${eff.effect_id}')` : `removeEffect('${combatants[0].id}',${ei})`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);font-style:italic;background:${ended?'rgba(201,162,39,.25)':'rgba(120,100,60,.08)'}">
      <span style="flex:1;min-width:0">
        <span style="font-size:15px;font-weight:bold">✦ ${escapeHtml(eff.label)}</span>
        <span style="display:block;font-size:11px;color:var(--text-dim)">on ${names} -- ${ended ? 'ended' : left + ' seg left'} <a href="#" onclick="${clearCall};return false" style="color:var(--red-b)">✕ clear${shared && combatants.length > 1 ? ' all' : ''}</a></span>
      </span>
      <span style="font-size:26px;font-weight:bold;line-height:1;color:var(--text-dim);flex-shrink:0">${eff.expires_at_segment}</span>
    </div>`;
  };
  const timeline = visibleOrderedTracks.filter(t => t.next_segment != null).map(t => ({ seg: t.next_segment, html: renderTrackRow(t) }))
    .concat(effectItems.map(e => ({ seg: e.eff.expires_at_segment, html: renderEffectRow(e) })))
    .sort((a, b) => a.seg - b.seg);
  const trackRowHtml = timeline.map(x => x.html).join('')
    + visibleOrderedTracks.filter(t => t.next_segment == null).map(renderTrackRow).join('');
  const sidelinedRowHtml = visibleSidelined.map(c => {
    const status = combatantStatus(c);
    const killed = status === 'killed';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);opacity:.75">
      <span style="flex:1;min-width:0">
        <span style="font-size:17px;font-weight:bold;cursor:pointer;text-decoration:${killed?'line-through':'none'};color:${killed?'#a03030':'inherit'}" title="Show on the right" onclick="focusCombatantCard('${c.id}')">${escapeHtml(c.display_name)}</span>
        ${combatFoeXp[c.id] != null ? `<span style="font-size:11px;color:var(--gold-dim)"> XP ${combatFoeXp[c.id].toLocaleString()}</span>` : ''}
        <span style="display:block;font-size:11px;color:var(--text-dim)">${killed?'Killed':'Waiting'}</span>
      </span>
      <span style="font-size:24px;font-weight:bold;line-height:1;color:${killed?'#a03030':'var(--text-dim)'};flex-shrink:0">${killed?'KIA':'W'}</span>
    </div>`;
  }).join('');
  // GM-only: what the foes in this fight are worth, and how much of that is
  // already down (Killed) -- the number the end-of-fight XP award starts from.
  let foeXpHeaderHtml = '';
  const foeIds = Object.keys(combatFoeXp);
  if (isGM && foeIds.length) {
    const sum = ids => ids.reduce((a, id) => a + (combatFoeXp[id] || 0), 0);
    const downIds = foeIds.filter(id => byId[id] && combatantStatus(byId[id]) === 'killed');
    foeXpHeaderHtml = `<div class="form-group"><label>Foe XP</label><div><b>${sum(foeIds).toLocaleString()}</b> total<span style="color:var(--text-dim)"> -- ${sum(downIds).toLocaleString()} defeated (${downIds.length}/${foeIds.length})</span></div></div>`;
  }
  const upcomingHtml = (trackRowHtml || sidelinedRowHtml) ? (trackRowHtml + sidelinedRowHtml)
    : `<div class="note">${(orderedTracks.length || sidelinedCombatants.length) ? 'Nothing of yours in the order yet.' : 'No combatants yet.'}</div>`;

  return `<div class="panel"><div class="panel-body">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-dim" onclick="closeEncounter()">← Back to Group</button>
        <h2 style="margin:0">${escapeHtml(enc.name)}</h2>
        <span style="font-size:11px;color:var(--text-dim)">(${enc.status})</span>
      </div>
      ${isGM ? `
      <div style="display:flex;gap:6px;align-items:center">
        <select onchange="updateEncounterField('status',this.value)">
          ${['active','paused','ended'].map(s => `<option value="${s}" ${enc.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <button class="btn btn-dim" onclick="openAddCombatantModal()">+ Add Combatant</button>
      </div>` : ''}
    </div>
    <div class="form-row" style="margin:8px 0;align-items:center">
      <div class="form-group"><label>Current Segment</label>
        ${isGM ? `<input type="number" step="any" class="w100" value="${enc.current_segment}" onchange="updateEncounterField('current_segment',parseFloat(this.value)||0)">` : `<div>${enc.current_segment}</div>`}
      </div>
      ${isGM ? `<div class="form-group" style="justify-content:flex-end"><button class="btn btn-gold" onclick="advanceToNextSegment('${enc.id}')">Advance to Next Queued Action</button></div>` : ''}
      ${foeXpHeaderHtml}
    </div>
    <div class="note" style="margin-bottom:6px">Default order within a tied segment: Spell → Non-Combat → Missile → Melee. Use the ▲▼ on a tied row in the Turn Order to put whoever you like first. Click a name there to jump to their card. Everything here is an editable suggestion -- adjust freely.</div>
    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div style="width:300px;flex-shrink:0;border:2px solid var(--gold-dim);border-radius:4px;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:baseline;background:var(--header-bg);padding:8px 12px">
          <span style="font-size:14px;font-weight:bold;color:var(--header-text);text-transform:uppercase;letter-spacing:1px">Turn Order</span>
          <span style="font-size:11px;color:var(--header-text);opacity:.7">Count: ${visibleOrderedTracks.length + visibleSidelined.length}</span>
        </div>
        ${upcomingHtml}
      </div>
      <img src="assets/img/spear-divider.png" alt="" style="width:38px;align-self:center;flex-shrink:0;mix-blend-mode:multiply;filter:sepia(.3)">
      <div style="flex:1;min-width:280px">
        ${combatantsHtml}
        <hr class="divider">
        <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Log an Action</div>
        <div class="form-row">
          <div class="form-group"><label>Combatant</label><select id="log-combatant">${combatantsCache.map(c=>`<option value="${c.id}" ${c.id===currentTurnCombatantId?'selected':''}>${escapeHtml(c.display_name)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Target</label><select id="log-target"><option value="">(none)</option>${combatantsCache.map(c=>`<option value="${c.id}">${escapeHtml(c.display_name)}</option>`).join('')}</select></div>
        </div>
        <div class="form-group" style="margin:6px 0"><label>Action Summary</label><input id="log-summary" style="width:100%" placeholder="e.g. Swings longsword, hits for 8"></div>
        <div class="form-row">
          <div class="form-group"><label>Damage Dealt</label><input id="log-dealt" type="number" class="w80"></div>
          <div class="form-group"><label>Damage Taken</label><input id="log-taken" type="number" class="w80"></div>
          <div class="form-group"><label>Damage Prevented</label><input id="log-prevented" type="number" class="w80"></div>
          <div class="form-group" style="justify-content:flex-end"><button class="btn btn-gold" onclick="addLogEntry('${enc.id}')">Add to Log</button></div>
        </div>
        <hr class="divider">
        <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Recent Log</div>
        ${logHtml}
      </div>
    </div>
  </div></div>`;
}

async function updateEncounterField(field, value) {
  const { error } = await sb.from('combat_encounters').update({ [field]: value }).eq('id', activeEncounterId);
  if (error) { alert('Failed to update: ' + error.message); return; }
  renderEncounterModule();
}

async function advanceToNextSegment(encId) {
  const byIdLocal = {};
  for (const c of combatantsCache) byIdLocal[c.id] = c;
  const current = encounterCache ? encounterCache.current_segment : 0;
  // Only tracks strictly in the future count -- an overdue-but-unresolved
  // track (or a leftover value stuck at an old, lower segment) used to make
  // this jump BACKWARD to it instead of forward, since the old version had
  // no lower bound at all. Also skip Waiting/Killed combatants' tracks,
  // same as the Turn Order display: their segment value is stale/inert
  // once sidelined, not something to advance toward.
  const upcoming = actionTracksCache
    .filter(t => t.next_segment != null && t.next_segment > current)
    .filter(t => {
      const c = byIdLocal[t.combatant_id];
      const status = c ? (c.status || 'active') : 'active';
      return c && status !== 'waiting' && status !== 'killed';
    })
    .map(t => t.next_segment);
  // A timed effect ending is also a stop on the clock, so it can't slide by
  // unnoticed between two actions.
  for (const c of combatantsCache) {
    const status = c.status || 'active';
    if (status === 'waiting' || status === 'killed') continue;
    for (const eff of (c.effects || [])) {
      if (eff.expires_at_segment != null && eff.expires_at_segment > current) upcoming.push(eff.expires_at_segment);
    }
  }
  if (!upcoming.length) { alert('No queued actions to advance to.'); return; }
  const next = Math.min(...upcoming);
  const { error } = await sb.from('combat_encounters').update({ current_segment: next }).eq('id', encId);
  if (error) { alert('Failed to advance: ' + error.message); return; }
  renderEncounterModule();
}

async function updateCombatantField(id, field, value) {
  const { error } = await sb.from('combat_combatants').update({ [field]: value }).eq('id', id);
  if (error) { alert('Failed to update: ' + error.message); return; }
  if (field === 'current_hp') {
    const c = combatantsCache.find(x => x.id === id);
    if (c && c.character_id) await syncCombatHpToCharacter(c.character_id, { currentHP: value });
  }
  renderEncounterModule();
}

// Writes one Physical/Endurance field and recomputes the merged
// current_hp/max_hp total alongside it, so that total (still used for
// sorting and any non-Collegium-aware display) never drifts out of sync
// with the split the player/GM is actually editing.
async function updateCollegiumHp(id, field, value) {
  const c = combatantsCache.find(x => x.id === id);
  if (!c) return;
  const v = value === '' ? null : parseFloat(value);
  const merged = { ...c, [field]: v };
  const fields = { [field]: v };
  if (merged.physical_current != null && merged.endurance_current != null) fields.current_hp = merged.physical_current + merged.endurance_current;
  if (merged.physical_max != null && merged.endurance_max != null) fields.max_hp = merged.physical_max + merged.endurance_max;
  const { error } = await sb.from('combat_combatants').update(fields).eq('id', id);
  if (error) { alert('Failed to update: ' + error.message); return; }
  if ((field === 'physical_current' || field === 'endurance_current') && c.character_id) {
    await syncCombatHpToCharacter(c.character_id, { physicalCurrent: merged.physical_current, enduranceCurrent: merged.endurance_current });
  }
  renderEncounterModule();
}

// A combatant with a real character_id (not a bestiary foe/temp-PC) feeds
// its HP changes back to the actual character sheet, so damage taken in an
// active encounter persists -- and the Group roster's damaged/critical cue
// (characters.hp_damaged/hp_critical, the only HP info a non-owner group
// member can see) stays accurate too. Fetches the character's current data
// fresh rather than trusting any locally-cached copy, since the GM editing
// a player's HP in combat has no other synced view of that player's sheet.
async function syncCombatHpToCharacter(characterId, hpPatch) {
  const { data: row, error } = await sb.from('characters').select('data').eq('id', characterId).single();
  if (error || !row) { console.error('Combat HP sync: failed to load character', characterId, error); return; }
  const charData = row.data || {};
  charData.hpState = { ...(charData.hpState || {}), ...hpPatch };
  const hpStatus = computeHpStatus(charData);
  const { error: rpcErr } = await sb.rpc('gm_apply_combat_hp', {
    p_character_id: characterId,
    p_hp_state: charData.hpState,
    p_hp_damaged: hpStatus.damaged,
    p_hp_critical: hpStatus.critical
  });
  if (rpcErr) console.error('Combat HP sync failed for', characterId, rpcErr);
}

// The one ordering used by the Turn Order and by its ▲▼ arrows, so what the
// arrows move is exactly what's on screen: segment, then an explicit
// tie_order the GM set (none sorts after those), then category (Spell >
// Non-Combat > Missile > Melee), then the combatant's manual_order.
function compareQueuedTracks(a, b, byId) {
  if (a.next_segment !== b.next_segment) return a.next_segment - b.next_segment;
  const ta = a.tie_order != null ? Number(a.tie_order) : Infinity;
  const tb = b.tie_order != null ? Number(b.tie_order) : Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  const rankA = COMBAT_CATEGORY_RANK[a.action_category] != null ? COMBAT_CATEGORY_RANK[a.action_category] : 99;
  const rankB = COMBAT_CATEGORY_RANK[b.action_category] != null ? COMBAT_CATEGORY_RANK[b.action_category] : 99;
  if (rankA !== rankB) return rankA - rankB;
  const ca = byId[a.combatant_id], cb = byId[b.combatant_id];
  return ((ca && ca.manual_order) || 0) - ((cb && cb.manual_order) || 0);
}

// Moves one action up or down within its tied segment. Takes the tie group
// in the order it is currently DISPLAYED, swaps the two neighbors, and
// writes an explicit tie_order (0..n-1) onto every track in the group --
// per track, so two actions by the same combatant can be ordered too, and
// the swap holds even across categories.
async function moveTrackWithinTie(trackId, direction) {
  const track = actionTracksCache.find(t => t.id === trackId);
  if (!track || track.next_segment == null) return;
  if (!actionTracksCache.some(t => 'tie_order' in t)) { alert('Run schema_v26_track_tie_order.sql in Supabase first -- the up/down arrows need its tie_order column.'); return; }
  const byIdLocal = {};
  for (const c of combatantsCache) byIdLocal[c.id] = c;
  const sidelined = c => { const s = (c && c.status) || 'active'; return s === 'waiting' || s === 'killed'; };
  const tieGroup = actionTracksCache
    .filter(t => t.next_segment === track.next_segment && byIdLocal[t.combatant_id] && !sidelined(byIdLocal[t.combatant_id]))
    .sort((a, b) => compareQueuedTracks(a, b, byIdLocal));
  if (tieGroup.length < 2) return;
  const idx = tieGroup.findIndex(t => t.id === trackId);
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= tieGroup.length) return;
  const reordered = tieGroup.slice();
  [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
  const results = await Promise.all(reordered.map((t, i) => sb.from('combat_action_tracks').update({ tie_order: i }).eq('id', t.id)));
  const failed = results.find(r => r.error);
  if (failed) { alert('Failed to reorder: ' + failed.error.message); return; }
  renderEncounterModule();
}

// Click-through from a Turn Order name to that combatant's card on the right.
function focusCombatantCard(combatantId) {
  const el = document.getElementById('cc-card-' + combatantId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const prev = el.style.boxShadow;
  el.style.boxShadow = '0 0 0 3px var(--gold)';
  setTimeout(() => { el.style.boxShadow = prev; }, 1600);
}

async function removeCombatant(id) {
  if (!confirm('Remove this combatant from the fight?')) return;
  const { error } = await sb.from('combat_combatants').delete().eq('id', id);
  if (error) { alert('Failed to remove: ' + error.message); return; }
  renderEncounterModule();
}

async function addActionTrack(combatantId) {
  const label = prompt('Track label (e.g. "Main Hand", "Off Hand", or leave blank):', '') || '';
  const { error } = await sb.from('combat_action_tracks').insert({ combatant_id: combatantId, label, next_segment: null, action_category: null });
  if (error) { alert('Failed to add track: ' + error.message); return; }
  renderEncounterModule();
}

// True once schema_v26 has been run -- select('*') only returns a column
// that exists, so its presence on any loaded track is the check.
function tracksHaveTieOrder() { return actionTracksCache.some(t => 'tie_order' in t); }

async function updateActionTrack(id, field, value) {
  const patch = { [field]: value };
  // A tie position only means something at the segment it was set for.
  if (field === 'next_segment' && tracksHaveTieOrder()) patch.tie_order = null;
  const { error } = await sb.from('combat_action_tracks').update(patch).eq('id', id);
  if (error) { alert('Failed to update: ' + error.message); return; }
  renderEncounterModule();
}

// One-tap initiative nudge -- the fast path both GM and player use most,
// vs. typing an exact number into the field. Standing-by (null) nudges
// relative to the encounter's current segment rather than 0, so the first
// tap lands somewhere useful instead of at -1 or 1.
async function nudgeActionTrack(id, delta) {
  const t = actionTracksCache.find(x => x.id === id);
  const base = (t && t.next_segment != null) ? t.next_segment : (encounterCache ? encounterCache.current_segment : 0);
  const next = Math.round((base + delta) * 100) / 100;
  await updateActionTrack(id, 'next_segment', next);
}

async function deleteActionTrack(id) {
  const { error } = await sb.from('combat_action_tracks').delete().eq('id', id);
  if (error) { alert('Failed to delete: ' + error.message); return; }
  renderEncounterModule();
}

async function resolveActionTrack(id) {
  const patch = { next_segment: null };
  if (tracksHaveTieOrder()) patch.tie_order = null;
  const { error } = await sb.from('combat_action_tracks').update(patch).eq('id', id);
  if (error) { alert('Failed to resolve: ' + error.message); return; }
  renderEncounterModule();
}

function openAddEffectModal(combatantId) {
  const now = encounterCache ? encounterCache.current_segment : 0;
  // Same rule as the cards: the GM can touch everyone, a player only their
  // own character (that's all the database lets them write to).
  const editable = combatantsCache.filter(c => encounterIsGM || !!(c.character_id && combatOwnerByCharId[c.character_id] === currentUser.id));
  const teams = [...new Set(editable.map(c => (c.team || '').trim()).filter(Boolean))];
  const targetsHtml = editable.map(c => `<label style="display:flex;align-items:baseline;gap:6px;cursor:pointer;font-size:13px">
      <input type="checkbox" class="eff-target-cb" data-id="${c.id}" data-team="${escapeHtml((c.team || '').trim())}" ${c.id === combatantId ? 'checked' : ''}>
      <span>${escapeHtml(c.display_name)}${c.team ? ` <span style="color:var(--text-dim)">(${escapeHtml(c.team)})</span>` : ''}</span></label>`).join('');
  const quickBtn = (label, key) => `<button type="button" class="btn btn-dim" style="font-size:10px;padding:1px 7px" data-team="${escapeHtml(key)}" onclick="setEffectTargets(this.dataset.team)">${escapeHtml(label)}</button>`;
  openModal(`
    <h3>Add Effect</h3>
    <div class="form-group" style="margin-bottom:8px"><label>Label</label><input id="eff-label" style="width:100%" placeholder="e.g. Blessings, Shaken (-10 to hit)"></div>
    <div class="form-row" style="margin-bottom:8px">
      <div class="form-group"><label>Lasts (segments from now)</label><input id="eff-duration" type="number" step="any" class="w100" placeholder="e.g. 30"></div>
      <div class="form-group"><label>or Ends at Segment</label><input id="eff-expiry" type="number" step="any" class="w100"></div>
    </div>
    <div class="note" style="margin-bottom:8px">Now is segment ${now}. Fill in one (Lasts wins if both); leave both blank for no time limit. Timed effects show in the Turn Order at the segment they end.</div>
    <div class="form-group" style="margin-bottom:8px"><label>Who is affected</label>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin:2px 0 6px">${quickBtn('All', '__all')}${teams.map(t => quickBtn(t, t)).join('')}${quickBtn('None', '__none')}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:3px 12px;max-height:220px;overflow-y:auto">${targetsHtml}</div>
    </div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="addEffect()">Add</button></div>`, { wide: true });
}

// 'All' / 'None' / a team name: a team button selects exactly that team.
function setEffectTargets(key) {
  document.querySelectorAll('.eff-target-cb').forEach(cb => {
    cb.checked = key === '__all' ? true : key === '__none' ? false : cb.dataset.team === key;
  });
}

async function addEffect() {
  const label = document.getElementById('eff-label').value.trim();
  if (!label) { alert('Label is required.'); return; }
  const targetIds = Array.from(document.querySelectorAll('.eff-target-cb:checked')).map(cb => cb.dataset.id);
  if (!targetIds.length) { alert('Pick at least one combatant who is affected.'); return; }
  const durationRaw = document.getElementById('eff-duration').value;
  const expiryRaw = document.getElementById('eff-expiry').value;
  const now = encounterCache ? encounterCache.current_segment : 0;
  let expires = null;
  if (durationRaw !== '') expires = Math.round((now + parseFloat(durationRaw)) * 100) / 100;
  else if (expiryRaw !== '') expires = parseFloat(expiryRaw);
  // One shared id ties the copies together, so the Turn Order can show a
  // single row ("Blessings on A, B, C") and clear them all at once, while
  // each combatant's card still carries its own copy.
  const effectId = 'eff_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const results = await Promise.all(targetIds.map(id => {
    const c = combatantsCache.find(x => x.id === id);
    const effects = (c && c.effects) ? c.effects.slice() : [];
    effects.push({ label, expires_at_segment: expires, started_at_segment: now, effect_id: effectId });
    return sb.from('combat_combatants').update({ effects }).eq('id', id);
  }));
  const failed = results.find(r => r.error);
  if (failed) { alert('Failed to add effect: ' + failed.error.message); }
  closeModal();
  renderEncounterModule();
}

async function removeEffect(combatantId, idx) {
  const c = combatantsCache.find(x => x.id === combatantId);
  if (!c) return;
  const effects = (c.effects || []).slice();
  effects.splice(idx, 1);
  const { error } = await sb.from('combat_combatants').update({ effects }).eq('id', combatantId);
  if (error) { alert('Failed to remove effect: ' + error.message); return; }
  renderEncounterModule();
}

// Clears one shared effect from everyone it's on that this user is allowed
// to edit (the GM: all of them).
async function removeEffectEverywhere(effectId) {
  const results = await Promise.all(combatantsCache
    .filter(c => (c.effects || []).some(e => e.effect_id === effectId))
    .filter(c => encounterIsGM || !!(c.character_id && combatOwnerByCharId[c.character_id] === currentUser.id))
    .map(c => sb.from('combat_combatants').update({ effects: c.effects.filter(e => e.effect_id !== effectId) }).eq('id', c.id)));
  const failed = results.find(r => r.error);
  if (failed) { alert('Failed to remove effect: ' + failed.error.message); return; }
  renderEncounterModule();
}

async function addLogEntry(encId) {
  const combatantId = document.getElementById('log-combatant').value || null;
  const targetId = document.getElementById('log-target').value || null;
  const summary = document.getElementById('log-summary').value.trim();
  if (!summary) { alert('Action summary is required.'); return; }
  const dealt = document.getElementById('log-dealt').value;
  const taken = document.getElementById('log-taken').value;
  const prevented = document.getElementById('log-prevented').value;
  const { error } = await sb.from('combat_log_entries').insert({
    encounter_id: encId,
    segment: encounterCache.current_segment,
    combatant_id: combatantId,
    target_combatant_id: targetId,
    action_summary: summary,
    damage_dealt: dealt === '' ? null : parseFloat(dealt),
    damage_taken: taken === '' ? null : parseFloat(taken),
    damage_prevented: prevented === '' ? null : parseFloat(prevented),
    created_by: currentUser.id
  });
  if (error) { alert('Failed to log action: ' + error.message); return; }
  renderEncounterModule();
}

async function openAddCombatantModal() {
  const enc = encounterCache;
  const existingCharIds = new Set(combatantsCache.filter(c => c.character_id).map(c => c.character_id));
  const existingBestIds = new Set(combatantsCache.filter(c => c.bestiary_entry_id).map(c => c.bestiary_entry_id));
  // characters has no bare "name" column (it lives in the data jsonb blob) --
  // character_lookup is the existing view that already extracts it.
  const [{ data: roster, error: rErr }, { data: tempChars, error: tcErr }, { data: foes, error: fErr }] = await Promise.all([
    sb.from('character_lookup').select('id,name').eq('group_id', enc.group_id),
    sb.from('bestiary_entries').select('id,name,race').eq('group_id', enc.group_id).eq('is_temp_pc', true),
    sb.from('bestiary_entries').select('*').eq('is_temp_pc', false).order('name', { ascending: true })
  ]);
  if (rErr || tcErr || fErr) { alert('Failed to load combatant sources: ' + (rErr||tcErr||fErr).message); return; }
  // Custom names ("Barty", "Groll the Gnoll", "Fire LizardBiffin"...) don't
  // always make the underlying creature type obvious, so show it in
  // parentheses when it differs from the name -- that's the thing a GM
  // is actually scanning this list for.
  const withType = x => x.race && x.race.trim() && x.race.trim().toLowerCase() !== x.name.trim().toLowerCase()
    ? `${escapeHtml(x.name)} <span style="color:var(--text-dim)">(${escapeHtml(x.race)})</span>` : escapeHtml(x.name);
  const pickRow = (kind, x, labelHtml) =>
    `<li style="list-style:none;margin-left:-16px"><label style="cursor:pointer;color:var(--gold);display:flex;align-items:baseline;gap:6px"><input type="checkbox" class="add-combatant-cb" data-kind="${kind}" data-id="${x.id}" onchange="updateAddCombatantCount()"><span>${labelHtml}</span></label></li>`;
  const availableRoster = (roster||[]).filter(r => !existingCharIds.has(r.id));
  const rosterHtml = (availableRoster.map(r => pickRow('character', r, escapeHtml(r.name))).join('') || '<li class="note">None available.</li>')
    + (availableRoster.length > 1 ? `<li style="list-style:none;margin-left:-16px;margin-top:4px"><label style="cursor:pointer;color:var(--text-dim);display:flex;align-items:baseline;gap:6px"><input type="checkbox" id="add-all-pcs-cb" onchange="toggleAllPcs(this.checked)"><span>Add all</span></label></li>` : '');
  const tempHtml = (tempChars||[]).filter(t => !existingBestIds.has(t.id)).map(t => pickRow('bestiary', t, withType(t))).join('') || '<li class="note">None available.</li>';
  const foesHtml = (foes||[]).filter(f => !existingBestIds.has(f.id) && !bestiaryIsArchived(f)).map(f => pickRow('bestiary', f, withType(f))).join('') || '<li class="note">None available.</li>';
  openModal(`
    <h3>Add Combatants</h3>
    <div class="note" style="margin-bottom:6px">Tick as many as you like, then Add Selected.</div>
    <div class="form-row" style="align-items:flex-start">
      <div class="form-group" style="flex:1"><label>Player Characters</label><ul style="margin:4px 0 0 16px;padding:0;font-size:13px">${rosterHtml}</ul></div>
      <div class="form-group" style="flex:1"><label>Temp Characters</label><ul style="margin:4px 0 0 16px;padding:0;font-size:13px">${tempHtml}</ul></div>
      <div class="form-group" style="flex:1"><label>Foes (Beastiary)</label><ul style="margin:4px 0 0 16px;padding:0;font-size:13px">${foesHtml}</ul></div>
    </div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" id="add-combatants-btn" disabled onclick="addSelectedCombatants()">Add Selected (0)</button></div>`, { wide: true });
}

function toggleAllPcs(checked) {
  document.querySelectorAll('.add-combatant-cb[data-kind="character"]').forEach(cb => { cb.checked = checked; });
  updateAddCombatantCount();
}

function updateAddCombatantCount() {
  const pcBoxes = document.querySelectorAll('.add-combatant-cb[data-kind="character"]');
  const allBox = document.getElementById('add-all-pcs-cb');
  if (allBox) allBox.checked = pcBoxes.length > 0 && Array.from(pcBoxes).every(cb => cb.checked);
  const n = document.querySelectorAll('.add-combatant-cb:checked').length;
  const btn = document.getElementById('add-combatants-btn');
  if (!btn) return;
  btn.textContent = `Add Selected (${n})`;
  btn.disabled = n === 0;
}

async function addSelectedCombatants() {
  const picks = Array.from(document.querySelectorAll('.add-combatant-cb:checked')).map(cb => ({ kind: cb.dataset.kind, id: cb.dataset.id }));
  if (!picks.length) return;
  const btn = document.getElementById('add-combatants-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }
  const baseOrder = combatantsCache.length;
  for (let i = 0; i < picks.length; i++) {
    await addCombatantFromSource(picks[i].kind, picks[i].id, { manualOrder: baseOrder + i, batch: true });
  }
  closeModal();
  renderEncounterModule();
}

async function addCombatantFromSource(kind, sourceId, opts = {}) {
  let row = { encounter_id: activeEncounterId, team: '', manual_order: opts.manualOrder != null ? opts.manualOrder : combatantsCache.length };
  if (kind === 'character') {
    const { data: c, error } = await sb.from('characters').select('id,data').eq('id', sourceId).single();
    if (error || !c) { alert('Failed to load character: ' + (error?error.message:'not found')); return; }
    const hp = computeHP(c.data || {});
    const isCollegium = hp.system === 'collegium';
    const cur = isCollegium ? (hp.physicalCurrent + hp.enduranceCurrent) : hp.currentHP;
    const max = isCollegium ? (hp.physicalMax + hp.enduranceMax) : hp.totalHP;
    row = { ...row, character_id: c.id, display_name: (c.data && c.data.name) || '(unnamed)', current_hp: cur, max_hp: max, team: 'Party',
      hp_system: isCollegium ? 'collegium' : 'standard',
      physical_current: isCollegium ? hp.physicalCurrent : null, physical_max: isCollegium ? hp.physicalMax : null,
      endurance_current: isCollegium ? hp.enduranceCurrent : null, endurance_max: isCollegium ? hp.enduranceMax : null };
  } else {
    const { data: b, error } = await sb.from('bestiary_entries').select('id,name,max_hp,current_hp,avg_hp,is_temp_pc').eq('id', sourceId).single();
    if (error || !b) { alert('Failed to load: ' + (error?error.message:'not found')); return; }
    const max = b.max_hp != null ? b.max_hp : Math.round(b.avg_hp || 0);
    const cur = b.current_hp != null ? b.current_hp : max;
    row = { ...row, bestiary_entry_id: b.id, display_name: b.name, current_hp: cur, max_hp: max, team: b.is_temp_pc ? 'Party' : 'Foes' };
  }
  const { data: inserted, error: insErr } = await sb.from('combat_combatants').insert(row).select('id').single();
  if (insErr) { alert('Failed to add combatant: ' + insErr.message); return; }
  const { error: trackErr } = await sb.from('combat_action_tracks').insert({ combatant_id: inserted.id, label: '', next_segment: null, action_category: null });
  if (trackErr) { alert('Combatant added, but failed to create its action track: ' + trackErr.message); }
  if (opts.batch) return;
  closeModal();
  renderEncounterModule();
}

function openCreateGroupModal() {
  openModal(`
    <h3>New Group</h3>
    <div class="form-group" style="margin-bottom:8px"><label>Group Name</label><input id="ng-name" style="width:100%"></div>
    <div class="note" style="margin-bottom:8px">Starting date (Reckoning of Nebler)</div>
    <div class="form-row">
      <div class="form-group"><label>Year (RON)</label><input id="ng-year" type="number" class="w100" value="895"></div>
      <div class="form-group"><label>Month</label>
        <select id="ng-month">${RON_MONTHS.map((m,i)=>`<option value="${i}">${m.key} (${m.season})</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Day (1-60)</label><input id="ng-day" type="number" class="w80" value="1" min="1" max="60"></div>
      ${ronHourPhaseInputHtml('ng', 0)}
      <div class="form-group"><label>Minute (0-59)</label><input id="ng-minute" type="number" class="w80" value="0" min="0" max="59"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="createGroup()">Create</button></div>`);
}

async function createGroup() {
  const name = document.getElementById('ng-name').value.trim();
  if (!name) { alert('Group name is required.'); return; }
  const year = parseInt(document.getElementById('ng-year').value) || 895;
  const month = parseInt(document.getElementById('ng-month').value) || 0;
  const day = Math.min(60, Math.max(1, parseInt(document.getElementById('ng-day').value) || 1));
  const hour = ronHourFromPhaseInput('ng');
  const minute = Math.min(59, Math.max(0, parseInt(document.getElementById('ng-minute').value) || 0));
  const clockSeconds = ronToSeconds({ year, month, day, isLithe: false, hour, minute, second: 0 });
  const { data, error } = await sb.from('groups').insert({
    name, created_by: currentUser.id, clock_seconds: clockSeconds
  }).select('id').single();
  if (error) { alert('Failed to create group: ' + error.message); return; }
  const { error: memErr } = await sb.from('group_members').insert({ group_id: data.id, user_id: currentUser.id, role: 'gm' });
  if (memErr) { alert('Group created, but failed to add you as its GM: ' + memErr.message); }
  const { error: volErr } = await sb.from('group_note_volumes').insert({ group_id: data.id, start_seconds: clockSeconds });
  if (volErr) { alert('Group created, but failed to open its first log volume: ' + volErr.message); }
  activeGroupId = data.id;
  viewingVolumeId = null;
  closeModal();
  renderGroupModule();
}

async function advanceGroupClock(groupId) {
  const group = myGroups.find(g => g.id === groupId);
  if (!group) return;
  const amount = parseInt(document.getElementById('clock-advance-amt').value) || 0;
  const unitSeconds = parseInt(document.getElementById('clock-advance-unit').value) || 3600;
  const elapsedSeconds = amount * unitSeconds;
  const nextSeconds = group.clock_seconds + elapsedSeconds;
  await maybePromptResting(groupId, nextSeconds, elapsedSeconds);
}

async function quickAdvance(groupId, seconds) {
  const group = myGroups.find(g => g.id === groupId);
  if (!group) return;
  await maybePromptResting(groupId, group.clock_seconds + seconds, seconds);
}

async function syncGroupRecovery(groupId) {
  const group = myGroups.find(g => g.id === groupId);
  if (!group) return;
  await runGroupRecovery(groupId, group.clock_seconds, {});
  renderGroupModule();
}

// Applies SP/HP recovery for every roster character up to uptoSeconds.
// Auto-generated recovery notes always file against whatever log volume is
// currently open, regardless of which one the GM happens to be viewing.
async function getActiveVolumeId(groupId) {
  const { data } = await sb.from('group_note_volumes').select('id').eq('group_id', groupId).is('end_seconds', null).maybeSingle();
  return data ? data.id : null;
}

// restingMap is { [characterRowId]: { isResting, focusPools } } for any
// characters a GM has flagged as resting for this span; everyone else
// defaults to the awake rate with no HP accrual. Writes results straight to
// Supabase (roster characters generally aren't the GM's own state.characters),
// logs a group note, and opens the HP-roll modal for anyone whose rest crossed
// the 6-hour nightly threshold.
async function runGroupRecovery(groupId, uptoSeconds, restingMap) {
  const { data: rosterChars, error } = await sb.from('characters').select('id, data').eq('group_id', groupId);
  if (error) { alert('Failed to load roster for recovery: ' + error.message); return; }
  const summaryLines = [];
  const hpRollsQueue = [];
  for (const row of rosterChars || []) {
    const charData = row.data;
    if (!charData) continue;
    const opts = (restingMap && restingMap[row.id]) || {};
    const result = settleCharacterRecovery(charData, uptoSeconds, opts);
    if (result.spGains.length) summaryLines.push(`${charData.name || '(unnamed)'}: ${result.spGains.join(', ')}`);
    for (let i = 0; i < result.hpRollsDue; i++) hpRollsQueue.push({ charRowId: row.id, charData, name: charData.name || '(unnamed)' });
    const hpStatus = computeHpStatus(charData);
    const { error: uErr } = await sb.rpc('gm_apply_recovery', {
      p_character_id: row.id,
      p_hp_state: charData.hpState || {},
      p_spell_state: charData.spellState || {},
      p_recovery_state: charData.recoveryState || {},
      p_hp_damaged: hpStatus.damaged,
      p_hp_critical: hpStatus.critical
    });
    if (uErr) console.error('Failed to save recovery for', row.id, uErr);
  }
  if (summaryLines.length) {
    const volumeId = await getActiveVolumeId(groupId);
    await sb.from('group_notes').insert({ group_id: groupId, author_id: currentUser.id, note: `Recovery: ${summaryLines.join(' | ')}`, game_seconds: uptoSeconds, volume_id: volumeId });
  }
  if (hpRollsQueue.length) openHpRollModal(groupId, hpRollsQueue, uptoSeconds);
}

// Advances <=2 hours settle silently (default non-resting). Longer advances
// ask the GM who was resting (asleep or trying to sleep) and which spell
// pools they were working on reclaiming, since that determines the faster
// sleep recovery rate and counts toward each character's 6-hour HP threshold.
let restingPromptRoster = [];
async function maybePromptResting(groupId, nextSeconds, elapsedSeconds) {
  if (elapsedSeconds <= 7200) {
    const { error } = await sb.from('groups').update({ clock_seconds: nextSeconds }).eq('id', groupId);
    if (error) { alert('Failed to advance time: ' + error.message); return; }
    await runGroupRecovery(groupId, nextSeconds, {});
    renderGroupModule();
    return;
  }
  const { data: rosterChars, error } = await sb.from('characters').select('id, data').eq('group_id', groupId);
  if (error) { alert('Failed to load roster: ' + error.message); return; }
  restingPromptRoster = (rosterChars || []).filter(r => r.data);
  const hours = (elapsedSeconds / 3600).toFixed(1);
  openModal(`
    <h3>Advancing ${hours} hours — who was resting?</h3>
    <div class="note" style="margin-bottom:8px">Resting means asleep or trying to sleep. Anyone left unchecked is assumed active and still recovers spell points automatically at the normal awake rate.</div>
    <div style="margin-bottom:10px"><button class="btn btn-gold" onclick="restAllFurthestDown()" title="Marks everyone resting and sends their sleep recovery to whichever pools are furthest below max">Recover all furthest down</button></div>
    ${restingPromptRoster.map(r => {
      const pools = computeSpellPools(r.data);
      const poolBoxes = pools.map(p => `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px"><input type="checkbox" class="rest-pool" data-char="${r.id}" value="${escapeHtml(p.name)}"> ${escapeHtml(p.name)}</label>`).join('');
      const down = pools.filter(p => p.currentSP < p.maxSP).sort((a, b) => (b.maxSP - b.currentSP) - (a.maxSP - a.currentSP)).slice(0, 3)
        .map(p => `${escapeHtml(p.name)} -${Math.round((p.maxSP - p.currentSP) * 10) / 10}`).join(', ');
      return `<div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" class="rest-toggle" id="rest-${r.id}" onchange="syncRestSection('${r.id}')">
          <b>${escapeHtml(r.data.name || '(unnamed)')}</b> was resting
        </label>
        <div id="rest-pools-${r.id}" style="display:none;margin:6px 0 0 22px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:6px">
            <input type="checkbox" class="rest-furthest" id="rest-furthest-${r.id}" onchange="syncRestSection('${r.id}')">
            <span><b>Recover furthest down</b> <span class="note">(sleep rate goes to the pools with the most points missing, up to ${SLEEP_POOL_CAP}, re-picked every hour)</span></span>
          </label>
          <div class="note" style="margin-bottom:4px">${down ? `Furthest down now: ${down}.` : 'No pool is below max right now.'}</div>
          <div id="rest-manual-${r.id}">
            <div class="note" style="margin-bottom:4px">Or pick which spell points they were working on reclaiming (unchecked pools still recover at the normal awake rate)</div>
            ${poolBoxes || '<span class="note">No trained spell pools.</span>'}
          </div>
        </div>
      </div>`;
    }).join('')}
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="confirmRestingPrompt('${groupId}', ${nextSeconds})">Apply</button></div>`);
}

// Shows/hides one character's recovery options to match their "was resting"
// and "recover furthest down" boxes (furthest down replaces the manual list).
function syncRestSection(charId) {
  const resting = document.getElementById(`rest-${charId}`);
  const furthest = document.getElementById(`rest-furthest-${charId}`);
  const section = document.getElementById(`rest-pools-${charId}`);
  const manual = document.getElementById(`rest-manual-${charId}`);
  if (section) section.style.display = resting && resting.checked ? 'block' : 'none';
  if (manual) manual.style.display = furthest && furthest.checked ? 'none' : 'block';
}

function restAllFurthestDown() {
  for (const r of restingPromptRoster) {
    const resting = document.getElementById(`rest-${r.id}`);
    const furthest = document.getElementById(`rest-furthest-${r.id}`);
    if (resting) resting.checked = true;
    if (furthest) furthest.checked = true;
    syncRestSection(r.id);
  }
}

async function confirmRestingPrompt(groupId, nextSeconds) {
  const restingMap = {};
  for (const r of restingPromptRoster) {
    const toggle = document.getElementById(`rest-${r.id}`);
    if (toggle && toggle.checked) {
      const furthestDown = !!(document.getElementById(`rest-furthest-${r.id}`) || {}).checked;
      const focusPools = furthestDown ? [] : Array.from(document.querySelectorAll(`.rest-pool[data-char="${r.id}"]:checked`)).map(el => el.value);
      restingMap[r.id] = { isResting: true, focusPools, furthestDown };
    }
  }
  const { error } = await sb.from('groups').update({ clock_seconds: nextSeconds }).eq('id', groupId);
  if (error) { alert('Failed to advance time: ' + error.message); return; }
  closeModal();
  await runGroupRecovery(groupId, nextSeconds, restingMap);
  renderGroupModule();
}

// Batches nightly Fortitude CC rolls for anyone whose accrued rest crossed a
// 6-hour threshold this settlement. The GM either types in a roll a player
// made at the table, or rolls online (d100, roll <= Fortitude CC succeeds).
let pendingHpRolls = [];
function openHpRollModal(groupId, queue, uptoSeconds) {
  pendingHpRolls = queue.map((q, i) => ({ ...q, idx: i }));
  renderHpRollModal(groupId, uptoSeconds);
}
function renderHpRollModal(groupId, uptoSeconds) {
  const rows = pendingHpRolls.map(q => {
    const cc = computeCC(q.charData).fortitude.value;
    return `<tr>
      <td>${escapeHtml(q.name)}</td>
      <td>${cc}</td>
      <td><input type="number" class="w80" id="hproll-${q.idx}" min="1" max="100"></td>
      <td><button class="btn btn-dim" onclick="rollHpOnline(${q.idx})">Roll Online</button></td>
    </tr>`;
  }).join('');
  openModal(`
    <h3>Nightly HP Recovery Due</h3>
    <div class="note" style="margin-bottom:8px">A full night's rest completed for these characters. Enter each player's Fortitude CC roll (d100, roll ≤ target succeeds), or roll online.</div>
    <div style="margin-bottom:8px"><button class="btn btn-gold" onclick="rollAllHpOnline()" title="Rolls a d100 for every row that doesn't have a roll yet; rolls you've typed in are kept">Roll all</button></div>
    <table class="skill-table"><thead><tr><th>Character</th><th>Fort CC Target</th><th>Roll</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Skip For Now</button><button class="btn btn-gold" onclick="applyHpRolls('${groupId}', ${uptoSeconds})">Apply</button></div>`);
}
function rollHpOnline(idx) {
  const roll = rollDie(100);
  const input = document.getElementById(`hproll-${idx}`);
  if (input) input.value = roll;
}
// Rolls every row that has no valid roll yet, so a roll a player already
// made at the table (typed in) is never overwritten.
function rollAllHpOnline() {
  for (const q of pendingHpRolls) {
    const input = document.getElementById(`hproll-${q.idx}`);
    const existing = input ? parseInt(input.value) : NaN;
    if (input && !(existing >= 1 && existing <= 100)) input.value = rollDie(100);
  }
}
async function applyHpRolls(groupId, uptoSeconds) {
  const summary = [];
  for (const q of pendingHpRolls) {
    const input = document.getElementById(`hproll-${q.idx}`);
    const roll = input ? parseInt(input.value) : NaN;
    if (!roll || roll < 1 || roll > 100) continue;
    const res = applyHPRecoveryRoll(q.charData, roll);
    const hpStatus = computeHpStatus(q.charData);
    const { error } = await sb.rpc('gm_apply_recovery', {
      p_character_id: q.charRowId,
      p_hp_state: q.charData.hpState || {},
      p_spell_state: q.charData.spellState || {},
      p_recovery_state: q.charData.recoveryState || {},
      p_hp_damaged: hpStatus.damaged,
      p_hp_critical: hpStatus.critical
    });
    if (error) { console.error('Failed to save HP recovery', error); continue; }
    if (res.system === 'collegium') {
      summary.push(`${q.name}: rolled ${roll} vs Fort CC ${res.target} (${res.success ? 'success' : 'fail'}) — Physical ${res.physicalDelta >= 0 ? '+' : ''}${res.physicalDelta}, Endurance now ${res.enduranceCurrent}`);
    } else {
      summary.push(`${q.name}: rolled ${roll} vs Fort CC ${res.target} (${res.success ? 'success' : 'fail'}) — +${res.delta} HP (now ${res.currentHP})`);
    }
  }
  if (summary.length) {
    const volumeId = await getActiveVolumeId(groupId);
    await sb.from('group_notes').insert({ group_id: groupId, author_id: currentUser.id, note: `Nightly HP recovery: ${summary.join(' | ')}`, game_seconds: uptoSeconds, volume_id: volumeId });
  }
  pendingHpRolls = [];
  closeModal();
  renderGroupModule();
}

function openEditTimeModal(groupId) {
  const group = myGroups.find(g => g.id === groupId);
  if (!group) return;
  const c = ronFromSeconds(group.clock_seconds);
  openModal(`
    <h3>Set Time</h3>
    <div class="form-row">
      <div class="form-group"><label>Year (RON)</label><input id="et-year" type="number" class="w100" value="${c.year}"></div>
      <div class="form-group"><label>Month</label>
        <select id="et-month">${RON_MONTHS.map((m,i)=>`<option value="${i}" ${i===c.month?'selected':''}>${m.key} (${m.season})</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="et-lithe" ${c.isLithe?'checked':''} onchange="document.getElementById('et-day-wrap').style.display=this.checked?'none':'block'">
          Lithe Day
        </label>
      </div>
      <div class="form-group" id="et-day-wrap" style="display:${c.isLithe?'none':'block'}"><label>Day (1-60)</label><input id="et-day" type="number" class="w80" value="${c.day}" min="1" max="60"></div>
    </div>
    <div class="form-row">
      ${ronHourPhaseInputHtml('et', c.hour)}
      <div class="form-group"><label>Minute (0-59)</label><input id="et-minute" type="number" class="w80" value="${c.minute}" min="0" max="59"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="setGroupTime('${groupId}')">Save</button></div>`);
}

async function setGroupTime(groupId) {
  const year = parseInt(document.getElementById('et-year').value) || 0;
  const month = parseInt(document.getElementById('et-month').value) || 0;
  const isLithe = document.getElementById('et-lithe').checked;
  const day = Math.min(60, Math.max(1, parseInt(document.getElementById('et-day').value) || 1));
  const hour = ronHourFromPhaseInput('et');
  const minute = Math.min(59, Math.max(0, parseInt(document.getElementById('et-minute').value) || 0));
  const seconds = ronToSeconds({ year, month, day, isLithe, hour, minute, second: 0 });
  const { error } = await sb.from('groups').update({ clock_seconds: seconds }).eq('id', groupId);
  if (error) { alert('Failed to set time: ' + error.message); return; }
  closeModal();
  renderGroupModule();
}

async function addGroupNote(groupId) {
  const group = myGroups.find(g => g.id === groupId);
  if (!group) return;
  const textEl = document.getElementById('new-group-note');
  const text = textEl.value.trim();
  if (!text) return;
  const visibleToAll = document.getElementById('new-group-note-visible').checked;
  const { error } = await sb.from('group_notes').insert({
    group_id: groupId, author_id: currentUser.id, note: text, game_seconds: group.clock_seconds, visible_to_all: visibleToAll, volume_id: viewingVolumeId
  });
  if (error) { alert('Failed to add note: ' + error.message); return; }
  renderGroupModule();
}

// A volume is indexed by the Celtricia (RON) date range it covers, since
// that's what actually locates it in a campaign running real-world years --
// "Volume 3" alone tells you nothing, "Volume 3, Dumotux 1 - Hisui 12, 897
// RON" does. An optional GM-set title rides alongside it.
function volumeLabel(v, index) {
  const startLabel = ronShortDateLabel(ronFromSeconds(v.start_seconds));
  const endLabel = v.end_seconds != null ? ronShortDateLabel(ronFromSeconds(v.end_seconds)) : 'present';
  const title = v.title ? `${v.title} — ` : '';
  return `Volume ${index + 1}: ${title}${startLabel} to ${endLabel}`;
}

function selectViewingVolume(volumeId) {
  viewingVolumeId = volumeId;
  renderGroupModule();
}

async function renameVolume(volumeId) {
  const v = groupVolumesCache.find(x => x.id === volumeId);
  if (!v) return;
  const title = prompt('Title for this log volume (blank to clear):', v.title || '');
  if (title === null) return;
  const { error } = await sb.from('group_note_volumes').update({ title: title.trim() || null }).eq('id', volumeId);
  if (error) { alert('Failed to rename: ' + error.message); return; }
  renderGroupModule();
}

async function startNewLogVolume(groupId) {
  const group = myGroups.find(g => g.id === groupId);
  if (!group) return;
  if (!confirm('Close the current log at this moment and start a new one? Old entries stay archived and viewable, just not shown by default.')) return;
  const active = groupVolumesCache.find(v => v.end_seconds == null);
  if (active) {
    const { error: closeErr } = await sb.from('group_note_volumes').update({ end_seconds: group.clock_seconds }).eq('id', active.id);
    if (closeErr) { alert('Failed to close the current log: ' + closeErr.message); return; }
  }
  const { data: created, error: createErr } = await sb.from('group_note_volumes')
    .insert({ group_id: groupId, start_seconds: group.clock_seconds })
    .select('id').single();
  if (createErr) { alert('Failed to start a new log: ' + createErr.message); return; }
  viewingVolumeId = created.id;
  renderGroupModule();
}
