// ============================================================
// GROUP MODULE (Reckoning of Nebler calendar, roster, notes)
// ============================================================

const RON_MONTHS = [
  { key: 'Dumotux',  season: 'Winterwane', desc: 'the month of Ice' },
  { key: 'Tokush',   season: 'Spring',     desc: 'the month of Renewal' },
  { key: 'Tanos',    season: 'Summerwax',  desc: 'the month of Promise' },
  { key: 'Gosun',    season: 'Summerwane', desc: 'the month of Flowers' },
  { key: 'Hisui',    season: 'Fall',       desc: 'the month of Leaf-fall' },
  { key: 'Dumoktis', season: 'Winterwax',  desc: 'the month of Hardening' },
];
const RON_WEEKDAYS = ['Dunsak','Bowyak','Vindak','Scaliak','Harvak','Monsak','Lawsak','Fastak'];
const RON_DAYS_PER_MONTH = 60;
const RON_HOURS_PER_DAY = 22;
// Everything below is built on a single "seconds since RON year 0" counter.
// Advancing by minutes, hours, days, or (later) 2-second combat segments is
// just adding to that one number — no separate rollover logic per unit.
const RON_SEC_PER_MIN = 60;
const RON_SEC_PER_HOUR = 3600;
const RON_SEC_PER_DAY = RON_SEC_PER_HOUR * RON_HOURS_PER_DAY;                 // 79,200
const RON_SEC_PER_MONTH_BLOCK = RON_SEC_PER_DAY * (RON_DAYS_PER_MONTH + 1);   // 4,831,200 (60 days + 1 Lithe day)
const RON_SEC_PER_YEAR = RON_SEC_PER_MONTH_BLOCK * 6;                         // 28,987,200

function ronFromSeconds(totalSeconds) {
  let s = totalSeconds;
  const year = Math.floor(s / RON_SEC_PER_YEAR); s -= year * RON_SEC_PER_YEAR;
  const month = Math.floor(s / RON_SEC_PER_MONTH_BLOCK); s -= month * RON_SEC_PER_MONTH_BLOCK;
  const dayIndex = Math.floor(s / RON_SEC_PER_DAY); s -= dayIndex * RON_SEC_PER_DAY; // 0-60; 60 = Lithe day
  const isLithe = dayIndex >= RON_DAYS_PER_MONTH;
  const day = isLithe ? RON_DAYS_PER_MONTH : dayIndex + 1;
  const hour = Math.floor(s / RON_SEC_PER_HOUR); s -= hour * RON_SEC_PER_HOUR;
  const minute = Math.floor(s / RON_SEC_PER_MIN); s -= minute * RON_SEC_PER_MIN;
  return { year, month, day, isLithe, hour, minute, second: s };
}
function ronToSeconds({ year, month, day, isLithe, hour, minute, second }) {
  const dayIndex = isLithe ? RON_DAYS_PER_MONTH : (day - 1);
  return year*RON_SEC_PER_YEAR + month*RON_SEC_PER_MONTH_BLOCK + dayIndex*RON_SEC_PER_DAY
       + (hour||0)*RON_SEC_PER_HOUR + (minute||0)*RON_SEC_PER_MIN + (second||0);
}
function ronWeekday({ month, day, isLithe }) {
  const dayIndex = isLithe ? RON_DAYS_PER_MONTH : (day - 1);
  const doy = month * (RON_DAYS_PER_MONTH + 1) + dayIndex;
  return RON_WEEKDAYS[((doy % 8) + 8) % 8];
}
function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}
function ronDateLabel(clock) {
  const m = RON_MONTHS[clock.month];
  const wd = ronWeekday(clock);
  const dayLabel = clock.isLithe ? `Lithe Day (after ${m.key})` : `${m.key} ${clock.day}`;
  // The 22-hour day is two 11-hour segments anchored to dawn and dusk, not a
  // real-world clock: hour 0 is the 1st hour of the Sou (daybreak), running
  // 11 hours; hour 11 is the 1st hour of the Na Sou (dusk), running 11 more.
  // Hour-of-day resets to 1 at each transition rather than counting through
  // to 22 — there's no Noon/Midnight reference point either way.
  const isNaSou = clock.hour >= 11;
  const hourInSegment = (isNaSou ? clock.hour - 11 : clock.hour) + 1;
  const timeLabel = clock.minute
    ? `${ordinal(hourInSegment)} Hour ${isNaSou ? 'Na Sou' : 'Sou'} and ${clock.minute}`
    : `${ordinal(hourInSegment)} Hour ${isNaSou ? 'Na Sou' : 'Sou'}`;
  return `${wd}, ${dayLabel}, ${clock.year} RON — ${timeLabel}`;
}

// Renders an hour-in-phase (1-11) input plus a Sou/Na Sou selector, instead
// of a raw 0-21 hour field -- typing "11" now always means the 11th hour of
// whichever phase is selected, matching how the hour is actually spoken
// about, rather than requiring the raw 0-indexed value (11 = 1st Na Sou).
function ronHourPhaseInputHtml(idPrefix, currentRawHour) {
  const isNaSou = currentRawHour >= 11;
  const hourInPhase = (isNaSou ? currentRawHour - 11 : currentRawHour) + 1;
  return `
      <div class="form-group"><label>Hour (1-11)</label><input id="${idPrefix}-hournum" type="number" class="w60" value="${hourInPhase}" min="1" max="11"></div>
      <div class="form-group"><label>Phase</label><select id="${idPrefix}-phase">
        <option value="sou" ${!isNaSou?'selected':''}>Sou (day)</option>
        <option value="nasou" ${isNaSou?'selected':''}>Na Sou (night)</option>
      </select></div>`;
}
function ronHourFromPhaseInput(idPrefix) {
  const hourNum = Math.min(11, Math.max(1, parseInt(document.getElementById(idPrefix + '-hournum').value) || 1));
  const isNaSou = document.getElementById(idPrefix + '-phase').value === 'nasou';
  return (isNaSou ? 11 : 0) + (hourNum - 1);
}

// Twin suns (Gerin, weak/red; Tribin, bright/yellow) and twin moons (Feral,
// Waban) as a small sky glyph for the current raw hour:
//   hour 0 (1st Hour Sou, red dawn) -- little red sun alone, Tribin hasn't risen
//   hours 1-10 (2nd-11th Hour Sou, daylight) -- big yellow sun + little red sun
//   hour 11 (1st Hour Na Sou, red dusk) -- little red sun (setting) + a moon
//   hours 12-21 (2nd-11th Hour Na Sou, night) -- big moon + little moon
function celestialIconsHtml(rawHour) {
  const dot = (r, fill) => `<circle cx="9" cy="9" r="${r}" fill="${fill}"/>`;
  const svg = (inner) => `<svg width="18" height="18" viewBox="0 0 18 18">${inner}</svg>`;
  const bigSun = svg(dot(8, '#e8c34a'));
  const smallSun = svg(dot(5, '#c0524a'));
  const bigMoon = svg(dot(8, '#c9c9dc'));
  const smallMoon = svg(dot(5, '#c9c9dc'));
  const blank = svg('');
  let left, right, title;
  if (rawHour === 0) { left = smallSun; right = blank; title = 'Sou — the red dawn'; }
  else if (rawHour <= 10) { left = bigSun; right = smallSun; title = 'Sou — daylight'; }
  else if (rawHour === 11) { left = smallSun; right = smallMoon; title = 'Na Sou — the red dusk'; }
  else { left = bigMoon; right = smallMoon; title = 'Na Sou — night'; }
  return `<span style="display:inline-flex;align-items:center" title="${title}">${left}${right}</span>`;
}

// Date only, no weekday/time -- used to index log volumes by the Celtricia
// range they cover, where the full ronDateLabel would be too long to read
// in a picker.
function ronShortDateLabel(clock) {
  const m = RON_MONTHS[clock.month];
  const dayLabel = clock.isLithe ? `Lithe Day (after ${m.key})` : `${m.key} ${clock.day}`;
  return `${dayLabel}, ${clock.year} RON`;
}

let myGroups = [];
let activeGroupId = null;
let groupRosterCache = [];
let groupNotesCache = [];
let groupVolumesCache = [];
let viewingVolumeId = null;
let groupEncountersCache = [];

function showGroupModule() {
  state.activeSkillId = null;
  state.activeView = 'group';
  renderGroupModule();
}

async function fetchMyGroups() {
  if (!currentUser) return [];
  const { data: memberships, error } = await sb.from('group_members')
    .select('role, groups(id,name,created_by,clock_seconds,roster_order_notes)')
    .eq('user_id', currentUser.id);
  if (error) { console.error('Failed to load groups', error); return myGroups; }
  myGroups = (memberships || []).filter(m => m.groups).map(m => ({ ...m.groups, myRole: m.role }));
  return myGroups;
}

async function renderGroupModule() {
  document.getElementById('main').innerHTML = `<div class="panel"><div class="panel-body">Loading groups…</div></div>`;
  await fetchMyGroups();
  if (activeGroupId && !myGroups.find(g => g.id === activeGroupId)) activeGroupId = null;
  if (!activeGroupId && myGroups.length) activeGroupId = myGroups[0].id;

  const picker = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${myGroups.map(g => `<button class="btn ${g.id===activeGroupId?'btn-gold':'btn-dim'}" onclick="selectGroup('${g.id}')">${escapeHtml(g.name)}${g.myRole==='gm'?' ★':''}</button>`).join('')}
      <button class="btn btn-dim" onclick="openCreateGroupModal()">+ New Group</button>
    </div>`;

  if (!activeGroupId) {
    document.getElementById('main').innerHTML = `<div class="panel"><div class="panel-body">${picker}<div class="note">You're not in any groups yet. Create one, or ask your GM to invite you by email.</div></div></div>`;
    return;
  }
  document.getElementById('main').innerHTML = `<div class="panel"><div class="panel-body">${picker}<div id="group-detail">Loading…</div></div></div>`;
  renderGroupDetail(myGroups.find(g => g.id === activeGroupId));
}

function selectGroup(groupId) {
  activeGroupId = groupId;
  renderGroupModule();
}

// Three independent roster orderings, toggled between in the UI: who's up
// front on the road, who checks the trap, who opens the door. Each maps to
// its own column on the character row (see schema_v8) via gm_set_roster_order.
const ROSTER_ORDER_MODES = {
  travel: { label: 'Travel / Marching', field: 'travel_order' },
  trap:   { label: 'Trap Check',        field: 'trap_order' },
  door:   { label: 'Door Opening',      field: 'door_order' }
};
let rosterOrderMode = 'travel';

function setRosterOrderMode(mode) {
  rosterOrderMode = mode;
  renderGroupModule();
}

// One small freeform note per marching-order mode (e.g. "front: shield
// wall, rear: healer" for Travel) -- stored on the group row itself, not
// per-character, since it describes the formation as a whole.
async function updateRosterOrderNote(groupId, mode, value) {
  const group = myGroups.find(g => g.id === groupId);
  const notes = { ...((group && group.roster_order_notes) || {}), [mode]: value };
  const { error } = await sb.from('groups').update({ roster_order_notes: notes }).eq('id', groupId);
  if (error) { alert('Failed to save note: ' + error.message); return; }
  renderGroupModule();
}

async function renderGroupDetail(group) {
  const isGM = group.myRole === 'gm';
  const [{ data: roster, error: rErr }, { data: volumes, error: volErr }, { data: tempChars, error: tcErr }, { data: encounters, error: encListErr }] = await Promise.all([
    sb.from('group_roster').select('id, owner_id, name, is_npc, travel_order, trap_order, door_order, hp_damaged, hp_critical').eq('group_id', group.id),
    sb.from('group_note_volumes').select('id, title, start_seconds, end_seconds').eq('group_id', group.id).order('start_seconds', { ascending: true }),
    // bestiary_entries RLS is scoped to created_by = auth.uid(), so this only
    // ever returns rows for the GM who created them -- skip it for players
    // rather than show a section that will always read empty for them.
    group.myRole === 'gm'
      ? sb.from('bestiary_entries').select('id, name, max_hp, current_hp, avg_hp').eq('group_id', group.id).eq('is_temp_pc', true).order('name', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    sb.from('combat_encounters').select('id, name, status, current_segment, updated_at').eq('group_id', group.id).order('updated_at', { ascending: false })
  ]);
  const el = document.getElementById('group-detail');
  if (!el) return;
  if (rErr || volErr || tcErr || encListErr) {
    el.innerHTML = `<div style="color:var(--red-b)">Failed to load group: ${escapeHtml((rErr||volErr||tcErr||encListErr).message)}</div>`;
    return;
  }
  groupEncountersCache = encounters || [];
  groupVolumesCache = volumes || [];
  const activeVolume = groupVolumesCache.find(v => v.end_seconds == null) || groupVolumesCache[groupVolumesCache.length - 1] || null;
  if (!viewingVolumeId || !groupVolumesCache.some(v => v.id === viewingVolumeId)) {
    viewingVolumeId = activeVolume ? activeVolume.id : null;
  }
  const { data: notes, error: nErr } = viewingVolumeId
    ? await sb.from('group_notes').select('id, author_id, note, game_seconds, created_at, visible_to_all').eq('group_id', group.id).eq('volume_id', viewingVolumeId).order('created_at', { ascending: false })
    : { data: [], error: null };
  if (nErr) {
    el.innerHTML = `<div style="color:var(--red-b)">Failed to load group: ${escapeHtml(nErr.message)}</div>`;
    return;
  }
  const orderField = ROSTER_ORDER_MODES[rosterOrderMode].field;
  groupRosterCache = (roster || []).slice().sort((a, b) => {
    const oa = a[orderField] != null ? a[orderField] : Infinity;
    const ob = b[orderField] != null ? b[orderField] : Infinity;
    if (oa !== ob) return oa - ob;
    return (a.name || '').localeCompare(b.name || '');
  });
  groupNotesCache = notes || [];

  // HP on the roster: a GM already has RLS read access to every character's
  // full data in their group, so fetch it and compute real HP for everyone.
  // A regular player only sees their own -- group_roster deliberately
  // exposes name/order only, not full sheets, so we don't fetch anyone
  // else's data for them; their own is already loaded locally anyway.
  const hpByCharId = {};
  const spSigilByCharId = {};
  const deadByCharId = {};
  const xpByCharId = {};
  const totalRawXP = (c) => (c.skills || []).reduce((sum, si) => sum + (parseFloat(si.rawXP) || 0), 0);
  if (isGM && groupRosterCache.length) {
    const { data: fullChars } = await sb.from('characters').select('id, data').in('id', groupRosterCache.map(c => c.id));
    for (const row of fullChars || []) {
      if (row.data) {
        const hp = computeHP(row.data);
        hpByCharId[row.id] = hp;
        spSigilByCharId[row.id] = spellHealthSigilHtml(row.data);
        deadByCharId[row.id] = isCharacterDead(row.data, hp);
        xpByCharId[row.id] = totalRawXP(row.data);
      }
    }
  } else {
    const mine = groupRosterCache.find(c => c.owner_id === currentUser.id);
    if (mine) {
      const appId = Object.keys(charRowIds).find(k => charRowIds[k] === mine.id);
      if (appId && state.characters[appId]) {
        const hp = computeHP(state.characters[appId]);
        hpByCharId[mine.id] = hp;
        spSigilByCharId[mine.id] = spellHealthSigilHtml(state.characters[appId]);
        deadByCharId[mine.id] = isCharacterDead(state.characters[appId], hp);
        xpByCharId[mine.id] = totalRawXP(state.characters[appId]);
      }
    }
  }

  const orderToggleHtml = Object.entries(ROSTER_ORDER_MODES).map(([key, m]) =>
    `<button class="btn ${rosterOrderMode===key?'btn-gold':'btn-dim'}" style="font-size:11px;padding:3px 8px" onclick="setRosterOrderMode('${key}')">${m.label}</button>`
  ).join('');

  const rosterHtml = groupRosterCache.length
    ? groupRosterCache.map((c, i) => {
        const hp = hpByCharId[c.id];
        let hpTag = '';
        if (hp) {
          if (hp.system === 'collegium') {
            // Shown split, not merged into one total -- 0 Physical/full Endurance
            // and full Physical/0 Endurance would look identical merged, but
            // the first is in real danger and the second isn't.
            const damaged = hp.physicalCurrent < hp.physicalMax || hp.enduranceCurrent < hp.enduranceMax;
            hpTag = ` <span style="${damaged ? 'color:#c05050;font-weight:bold' : ''}">(Phys ${hp.physicalCurrent}/${hp.physicalMax}, End ${hp.enduranceCurrent}/${hp.enduranceMax})</span>`;
          } else {
            const damaged = hp.currentHP < hp.totalHP;
            hpTag = ` <span style="${damaged ? 'color:#c05050;font-weight:bold' : ''}">(${hp.currentHP}/${hp.totalHP} HP)</span>`;
          }
        }
        // Damaged/critical is a plain boolean on the roster row itself (see
        // schema_v9), visible to every group member regardless of whether
        // they can see this character's actual sheet -- just a color cue,
        // no numbers leak through it.
        let nameStyle = c.hp_critical ? 'color:#c05050;font-weight:bold' : (c.hp_damaged ? 'color:#c05050' : '');
        const isDead = !!deadByCharId[c.id];
        if (isDead) nameStyle += ';text-decoration:line-through';
        const spSigil = spSigilByCharId[c.id] || '';
        const xpTag = xpByCharId[c.id] != null ? ` <span style="color:var(--text-dim)">(${xpByCharId[c.id].toLocaleString()} XP)</span>` : '';
        return `<li style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <span style="color:var(--text-dim);width:1.5em;display:inline-block;text-align:right">${i+1}.</span>
        <span style="${nameStyle}" ${isDead?'title="Past the point of stabilizing -- can no longer make the Fortitude roll"':''}>${escapeHtml(c.name || '(unnamed)')}</span>${c.is_npc ? ' <span style="font-size:10px;color:var(--gold-dim)">(NPC)</span>' : ''}${hpTag}${xpTag}${spSigil}
        ${isGM ? `
        <button class="btn btn-dim" style="font-size:10px;padding:1px 6px" ${i===0?'disabled':''} onclick="moveRosterMember('${group.id}','${c.id}',-1)">▲</button>
        <button class="btn btn-dim" style="font-size:10px;padding:1px 6px" ${i===groupRosterCache.length-1?'disabled':''} onclick="moveRosterMember('${group.id}','${c.id}',1)">▼</button>
        <button class="btn btn-dim" style="font-size:10px;padding:1px 6px;color:var(--red-b)" title="Remove from group" onclick="removeRosterMember('${c.id}')">✕</button>` : ''}
      </li>`;
      }).join('')
    : '<li class="note">No characters linked to this group yet.</li>';

  const notesHtml = groupNotesCache.length
    ? groupNotesCache.map(n => {
        const canToggle = isGM || n.author_id === currentUser.id;
        const badge = n.visible_to_all
          ? '<span style="font-size:10px;color:var(--text-dim)">Visible to all</span>'
          : '<span style="font-size:10px;color:var(--gold-dim)">Private (author + GM)</span>';
        const toggle = canToggle
          ? `<button class="btn btn-dim" style="font-size:10px;padding:2px 6px" onclick="toggleNoteVisibility('${n.id}','${group.id}')">${n.visible_to_all ? 'Make Private' : 'Make Visible to All'}</button>`
          : '';
        const editBtn = canToggle
          ? `<button class="btn btn-dim" style="font-size:10px;padding:2px 6px" onclick="openEditNoteModal('${n.id}','${group.id}')">Edit</button>`
          : '';
        return `<tr><td style="white-space:nowrap;font-size:11px;color:var(--text-dim)">${ronDateLabel(ronFromSeconds(n.game_seconds))}</td><td>${escapeHtml(n.note)}<div style="margin-top:4px;display:flex;align-items:center;gap:8px">${badge}${toggle}${editBtn}</div></td></tr>`;
      }).join('')
    : '<tr><td colspan="2" class="note">No notes yet.</td></tr>';

  const tempCharsHtml = (tempChars || []).length
    ? tempChars.map(t => {
        const hp = t.current_hp != null ? t.current_hp : Math.round(t.avg_hp || 0);
        const maxHp = t.max_hp != null ? t.max_hp : Math.round(t.avg_hp || 0);
        return `<li style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <span>${escapeHtml(t.name)}</span> <span style="color:var(--text-dim)">(${hp}/${maxHp} HP)</span>
        ${isGM ? `
        <button class="btn btn-dim" style="font-size:10px;padding:1px 6px" onclick="openEditTempCharacter('${t.id}')">Edit</button>
        <button class="btn btn-dim" style="font-size:10px;padding:1px 6px" onclick="deleteTempCharacter('${t.id}','${group.id}')">Delete</button>` : ''}
      </li>`;
      }).join('')
    : '<li class="note">No temp characters yet.</li>';

  const encStatusColor = { active: '#4a9460', paused: '#c9a227', ended: 'var(--text-dim)' };
  const encountersHtml = groupEncountersCache.length
    ? groupEncountersCache.map(e => `<li style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <span style="cursor:pointer;color:var(--gold)" onclick="openEncounter('${e.id}')">${escapeHtml(e.name)}</span>
        <span style="font-size:10px;color:${encStatusColor[e.status]||'var(--text-dim)'}">(${e.status}, segment ${e.current_segment})</span>
      </li>`).join('')
    : '<li class="note">No combats yet.</li>';

  // A player who never thinks to scroll down to the Combat section otherwise
  // has no way to know a fight is on -- this flag surfaces it right at the
  // top of the page, for GM and players alike, and jumps straight in.
  const activeEncounter = groupEncountersCache.find(e => e.status === 'active');
  const pausedEncounter = !activeEncounter ? groupEncountersCache.find(e => e.status === 'paused') : null;
  const combatFlagHtml = activeEncounter
    ? `<span style="cursor:pointer;background:rgba(179,58,30,.15);color:var(--red-b);border:1px solid var(--red-b);padding:2px 10px;font-size:12px;font-weight:bold;letter-spacing:.5px" onclick="openEncounter('${activeEncounter.id}')" title="${escapeHtml(activeEncounter.name)}">⚔ Combat in Progress</span>`
    : pausedEncounter
      ? `<span style="cursor:pointer;background:rgba(138,106,47,.15);color:var(--gold-dim);border:1px solid var(--gold-dim);padding:2px 10px;font-size:12px" onclick="openEncounter('${pausedEncounter.id}')" title="${escapeHtml(pausedEncounter.name)}">⏸ Combat Paused</span>`
      : '';

  const groupClock = ronFromSeconds(group.clock_seconds);
  el.innerHTML = `
    <hr class="divider">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:10px">
        <h2 style="margin:0">${escapeHtml(group.name)}</h2>
        ${celestialIconsHtml(groupClock.hour)}
        ${combatFlagHtml}
      </div>
      ${isGM ? `<button class="btn btn-dim" onclick="openAddToGroupModal('${group.id}')">+ Add to Group</button>` : ''}
    </div>
    <div class="form-group" style="margin-top:8px"><label>Roster (PCs &amp; NPCs)</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0">${orderToggleHtml}</div>
      <ul style="margin:4px 0 0 16px;padding:0;font-size:13px">${rosterHtml}</ul>
      <div style="margin-top:6px">
        ${isGM
          ? `<textarea rows="2" style="width:100%;font-size:12px" placeholder="Note for ${ROSTER_ORDER_MODES[rosterOrderMode].label} (e.g. who's where, and why)" onchange="updateRosterOrderNote('${group.id}','${rosterOrderMode}',this.value)">${escapeHtml((group.roster_order_notes||{})[rosterOrderMode]||'')}</textarea>`
          : ((group.roster_order_notes||{})[rosterOrderMode] ? `<div class="note" style="white-space:pre-wrap">${escapeHtml(group.roster_order_notes[rosterOrderMode])}</div>` : '')}
      </div>
    </div>
    ${isGM ? `
    <div class="form-group" style="margin-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <label style="margin:0">Temp Characters</label>
        <button class="btn btn-dim" style="font-size:11px;padding:3px 8px" onclick="openNewTempCharacter('${group.id}')">+ Add Temp Character</button>
      </div>
      <div class="note" style="margin:2px 0">Quick stat blocks for players without a full character sheet yet -- used by the combat module.</div>
      <ul style="margin:4px 0 0 16px;padding:0;font-size:13px">${tempCharsHtml}</ul>
    </div>` : ''}
    <div class="form-group" style="margin-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <label style="margin:0">Combat</label>
        ${isGM ? `<button class="btn btn-gold" style="font-size:11px;padding:3px 8px" onclick="enterOrStartCombat('${group.id}')">⚔ Enter/Re-enter Combat</button>` : ''}
      </div>
      <ul style="margin:4px 0 0 16px;padding:0;font-size:13px">${encountersHtml}</ul>
    </div>
    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Time — Reckoning of Nebler</div>
    <div class="computed-item" style="margin-bottom:8px"><span class="ci-value" style="font-size:16px;cursor:pointer;text-decoration:underline dotted" onclick="openGoesiModal('${group.id}')" title="Open the Goesi (month) calendar">${ronDateLabel(groupClock)}</span></div>
    ${isGM ? `
    <div class="form-row" style="margin-bottom:6px">
      <button class="btn btn-dim" onclick="quickAdvance('${group.id}', 60)">+1 min</button>
      <button class="btn btn-dim" onclick="quickAdvance('${group.id}', 600)">+10 min</button>
      <button class="btn btn-dim" onclick="quickAdvance('${group.id}', 1800)">+30 min</button>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Advance by</label><input id="clock-advance-amt" type="number" class="w80" value="1"></div>
      <div class="form-group"><label>Unit</label>
        <select id="clock-advance-unit">
          <option value="60">Minutes</option>
          <option value="3600" selected>Hours</option>
          <option value="79200">Days</option>
        </select>
      </div>
      <div class="form-group" style="justify-content:flex-end"><button class="btn btn-gold" onclick="advanceGroupClock('${group.id}')">Advance Time</button></div>
      <div class="form-group" style="justify-content:flex-end"><button class="btn btn-dim" onclick="openEditTimeModal('${group.id}')">Edit Time</button></div>
      <div class="form-group" style="justify-content:flex-end"><button class="btn btn-dim" onclick="syncGroupRecovery('${group.id}')" title="Catch up HP/SP recovery for the roster without moving the clock">Sync Recovery</button></div>
    </div>` : '<div class="note">Only the GM can advance time.</div>'}
    <hr class="divider">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px">Log</div>
      ${isGM ? `<button class="btn btn-dim" onclick="startNewLogVolume('${group.id}')" title="Closes the current log at this moment and starts a fresh one -- old entries stay archived and browsable">Start New Log</button>` : ''}
    </div>
    <div class="form-row" style="margin-bottom:6px">
      <div class="form-group" style="flex:1">
        <label>Viewing</label>
        <select onchange="selectViewingVolume(this.value)" style="width:100%">
          ${groupVolumesCache.map((v, i) => `<option value="${v.id}" ${v.id===viewingVolumeId?'selected':''}>${escapeHtml(volumeLabel(v, i))}</option>`).join('')}
        </select>
      </div>
      ${isGM && viewingVolumeId ? `<div class="form-group" style="justify-content:flex-end"><button class="btn btn-dim" onclick="renameVolume('${viewingVolumeId}')">Rename</button></div>` : ''}
    </div>
    ${viewingVolumeId === (activeVolume && activeVolume.id) ? `
    <div class="form-row">
      <div class="form-group" style="flex:1"><textarea id="new-group-note" rows="2" style="width:100%" placeholder="Add a note at the current time..."></textarea></div>
      <div class="form-group"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap"><input type="checkbox" id="new-group-note-visible"> Visible to everyone</label></div>
      <div class="form-group" style="justify-content:flex-end"><button class="btn btn-gold" onclick="addGroupNote('${group.id}')">Add Note</button></div>
    </div>
    <div class="note" style="margin-top:4px">Notes default to private (you + the GM). Check the box, or use the toggle after posting, to share with the whole group.</div>
    ` : `<div class="note" style="margin-bottom:4px">Viewing an archived log -- new notes go to the current one. Editing/visibility still works here for corrections.</div>`}
    <table class="skill-table" style="margin-top:8px">
      <thead><tr><th>When (in-game)</th><th>Note</th></tr></thead>
      <tbody>${notesHtml}</tbody>
    </table>`;
}

async function moveRosterMember(groupId, characterId, direction) {
  const idx = groupRosterCache.findIndex(c => c.id === characterId);
  if (idx < 0) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= groupRosterCache.length) return;
  const reordered = groupRosterCache.slice();
  [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
  // Write out explicit sequential positions for the whole roster so this
  // stays correct even the first time (untouched characters start with no
  // order set for this mode yet). Only touches whichever of the three
  // orderings is currently toggled to.
  const results = await Promise.all(reordered.map((c, i) => sb.rpc('gm_set_roster_order', { p_character_id: c.id, p_order_type: rosterOrderMode, p_order: i })));
  const failed = results.find(r => r.error);
  if (failed) { alert('Failed to update order: ' + failed.error.message); return; }
  renderGroupModule();
}

async function removeRosterMember(characterId) {
  const c = groupRosterCache.find(x => x.id === characterId);
  if (!confirm(`Remove ${c && c.name ? c.name : 'this character'} from the group? The character itself is not deleted.`)) return;
  const { error } = await sb.rpc('gm_remove_character_from_group', { p_character_id: characterId });
  if (error) { alert('Failed to remove from group: ' + error.message); return; }
  renderGroupModule();
}

async function deleteTempCharacter(id, groupId) {
  if (!confirm('Delete this temp character? This cannot be undone.')) return;
  const { error } = await sb.from('bestiary_entries').delete().eq('id', id);
  if (error) { alert('Failed to delete: ' + error.message); return; }
  renderGroupModule();
}
