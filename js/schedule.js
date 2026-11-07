// ============================================================
// GAME SCHEDULE -- a real-life calendar of each group's play sessions.
// A GM schedules a game; the session-mail Edge Function (see
// GS Tool/edge_functions/session-mail) emails the whole group right
// away and again the morning before. Players just see the calendar.
// ============================================================
const SCHED_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SCHED_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SCHED_COMMON_TZ = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Australia/Sydney', 'UTC'];

let scheduleMonth = null;          // { y, m } -- the month on screen (viewer's local calendar)
let scheduleCache = {};            // session id -> row, for the popups
let scheduleNotice = '';           // one-line result of the last save / email, shown above the calendar

function showScheduleModule(groupId) {
  if (groupId) activeGroupId = groupId;
  state.activeSkillId = null;
  state.activeView = 'schedule';
  renderSidebar();
  renderScheduleModule();
}

// ---- time zone helpers ---------------------------------------------------------------
function schedBrowserTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
}
function schedTzList() {
  let all = [];
  try { all = Intl.supportedValuesOf('timeZone'); } catch (e) { /* older browser: common list only */ }
  const mine = schedBrowserTz();
  const head = [mine, ...SCHED_COMMON_TZ.filter(z => z !== mine)];
  return [...head, ...all.filter(z => !head.includes(z))];
}
// Milliseconds the zone is ahead of UTC at the given instant.
function schedTzOffsetMs(ms, tz) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
// "2026-11-14" + "19:00" typed in zone tz -> the real instant (ms since epoch).
function schedZonedToUtcMs(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  let guess = asUtc - schedTzOffsetMs(asUtc, tz);
  guess = asUtc - schedTzOffsetMs(guess, tz);   // second pass settles daylight-saving edges
  return guess;
}
// The date and time a real instant shows on the wall in zone tz, as input values.
function schedPartsInTz(ms, tz) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function schedFmt(ms, tz, opts) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(new Date(ms));
}
const schedTime = (ms, tz) => schedFmt(ms, tz, { hour: 'numeric', minute: '2-digit' });
function schedDayKeyLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- page ------------------------------------------------------------------------------
async function renderScheduleModule() {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="panel"><div class="panel-body">Loading schedule…</div></div>`;
  await fetchMyGroups();
  if (activeGroupId && !myGroups.find(g => g.id === activeGroupId)) activeGroupId = null;
  if (!activeGroupId && myGroups.length) activeGroupId = myGroups[0].id;
  if (state.activeView !== 'schedule') return;

  const picker = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
    ${myGroups.map(g => `<button class="btn ${g.id === activeGroupId ? 'btn-gold' : 'btn-dim'}" onclick="selectScheduleGroup('${g.id}')">${escapeHtml(g.name)}${g.myRole === 'gm' ? ' ★' : ''}</button>`).join('')}
  </div>`;
  if (!activeGroupId) {
    main.innerHTML = `<div class="panel"><div class="panel-header"><h2>Game Schedule</h2></div><div class="panel-body"><div class="note">You're not in any groups yet. Once you join a group, its game schedule shows up here.</div></div></div>`;
    return;
  }
  const group = myGroups.find(g => g.id === activeGroupId);
  const isGM = group.myRole === 'gm';

  const now = new Date();
  if (!scheduleMonth) scheduleMonth = { y: now.getFullYear(), m: now.getMonth() };
  const first = new Date(scheduleMonth.y, scheduleMonth.m, 1);
  const gridStart = new Date(scheduleMonth.y, scheduleMonth.m, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(scheduleMonth.y, scheduleMonth.m + 1, 0).getDate()) / 7);
  const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + weeks * 7);

  const [monthRes, upcomingRes] = await Promise.all([
    sb.from('game_sessions').select('*').eq('group_id', group.id)
      .gte('starts_at', gridStart.toISOString()).lt('starts_at', gridEnd.toISOString()).order('starts_at', { ascending: true }),
    sb.from('game_sessions').select('*').eq('group_id', group.id).is('cancelled_at', null)
      .gte('starts_at', new Date(Date.now() - 3600000).toISOString()).order('starts_at', { ascending: true }).limit(12)
  ]);
  if (state.activeView !== 'schedule' || activeGroupId !== group.id) return;
  if (monthRes.error || upcomingRes.error) {
    const msg = (monthRes.error || upcomingRes.error).message;
    main.innerHTML = `<div class="panel"><div class="panel-header"><h2>Game Schedule</h2></div><div class="panel-body">${picker}<div style="color:var(--red-b)">Failed to load the schedule: ${escapeHtml(msg)}</div>
      <div class="note" style="margin-top:6px">If this says the table does not exist, schema_v28_game_schedule.sql has not been run in Supabase yet.</div></div></div>`;
    return;
  }
  scheduleCache = {};
  for (const s of [...(monthRes.data || []), ...(upcomingRes.data || [])]) scheduleCache[s.id] = s;

  const byDay = {};
  for (const s of monthRes.data || []) (byDay[schedDayKeyLocal(new Date(s.starts_at))] ||= []).push(s);
  const todayKey = schedDayKeyLocal(now);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = schedDayKeyLocal(d);
    const inMonth = d.getMonth() === scheduleMonth.m;
    const chips = (byDay[key] || []).map(s => {
      const t = schedTime(new Date(s.starts_at).getTime(), schedBrowserTz());
      return `<span class="sched-chip ${s.cancelled_at ? 'cancelled' : ''}" title="${escapeHtml(s.title)}${s.cancelled_at ? ' (cancelled)' : ''}" onclick="event.stopPropagation();openSessionModal('${s.id}')">${t} ${escapeHtml(s.title)}</span>`;
    }).join('');
    cells += `<div class="sched-cell ${inMonth ? '' : 'other'} ${key === todayKey ? 'today' : ''} ${isGM ? 'can-add' : ''}" ${isGM ? `onclick="openSessionForm(null,'${key}')" title="Schedule a game on this day"` : ''}>
      <div class="sched-daynum">${d.getDate()}</div>${chips}</div>`;
  }

  const upcoming = (upcomingRes.data || []);
  const upcomingHtml = upcoming.length
    ? upcoming.map(s => {
        const ms = new Date(s.starts_at).getTime();
        const mine = schedBrowserTz();
        const sameTz = s.tz === mine;
        return `<li style="margin-bottom:4px"><span style="cursor:pointer;color:var(--gold)" onclick="openSessionModal('${s.id}')">${escapeHtml(s.title)}</span>
          <span style="color:var(--text-dim)"> — ${schedFmt(ms, mine, { weekday: 'short', month: 'short', day: 'numeric' })}, ${schedTime(ms, mine)}${sameTz ? '' : ` (${schedTime(ms, s.tz)} ${escapeHtml(s.tz)})`}</span></li>`;
      }).join('')
    : '<li class="note">Nothing scheduled yet.</li>';

  main.innerHTML = `<div class="panel">
    <div class="panel-header"><h2>Game Schedule</h2></div>
    <div class="panel-body">
      ${picker}
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px">
          <button class="btn btn-dim" onclick="scheduleStep(-1)">◀</button>
          <div style="font-size:16px;font-weight:bold;min-width:9em;text-align:center">${SCHED_MONTHS[scheduleMonth.m]} ${scheduleMonth.y}</div>
          <button class="btn btn-dim" onclick="scheduleStep(1)">▶</button>
          <button class="btn btn-dim" onclick="scheduleToday()">Today</button>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-dim" onclick="showGroupModule()">← ${escapeHtml(group.name)} group page</button>
          ${isGM ? `<button class="btn btn-gold" onclick="openSessionForm(null)">+ Schedule a Game</button>` : ''}
        </div>
      </div>
      ${scheduleNotice ? `<div class="note" style="margin-bottom:8px;color:var(--gold)">${escapeHtml(scheduleNotice)}</div>` : ''}
      <div class="sched-dow">${SCHED_DOW.map(d => `<div>${d}</div>`).join('')}</div>
      <div class="sched-grid">${cells}</div>
      <div class="note" style="margin-top:6px">Times on the calendar are shown in your own time zone (${escapeHtml(schedBrowserTz())}).
        ${isGM ? 'Click a day to schedule a game.' : 'Only a GM can schedule games.'}
        Everyone in the group is emailed when a game is scheduled, changed or cancelled, and again at 9 AM the day before.</div>
      <hr class="divider">
      <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Coming up</div>
      <ul style="margin:0 0 0 16px;padding:0;font-size:13px">${upcomingHtml}</ul>
    </div>
  </div>`;
  scheduleNotice = '';
}

function selectScheduleGroup(id) { activeGroupId = id; scheduleNotice = ''; renderScheduleModule(); }
function scheduleStep(delta) {
  const d = new Date(scheduleMonth.y, scheduleMonth.m + delta, 1);
  scheduleMonth = { y: d.getFullYear(), m: d.getMonth() };
  renderScheduleModule();
}
function scheduleToday() { scheduleMonth = null; renderScheduleModule(); }

// ---- details popup ---------------------------------------------------------------------
function openSessionModal(id) {
  const s = scheduleCache[id];
  if (!s) return;
  const group = myGroups.find(g => g.id === s.group_id);
  const isGM = group && group.myRole === 'gm';
  const ms = new Date(s.starts_at).getTime();
  const endMs = ms + s.duration_minutes * 60000;
  const mine = schedBrowserTz();
  const dayOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  const line = (tz) => `${schedTime(ms, tz)} – ${schedFmt(endMs, tz, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
  openModal(`
    <h3 style="margin:0 0 8px">${escapeHtml(s.title)}${s.cancelled_at ? ' <span style="color:var(--red-b);font-size:13px">(cancelled)</span>' : ''}</h3>
    <div style="font-size:14px;margin-bottom:6px"><b>${schedFmt(ms, mine, dayOpts)}</b><br>${line(mine)}</div>
    ${s.tz !== mine ? `<div class="note" style="margin-bottom:6px">Scheduled as ${escapeHtml(line(s.tz))} (${escapeHtml(s.tz)})</div>` : ''}
    ${s.location ? `<div style="margin-bottom:6px"><b>Where:</b> ${escapeHtml(s.location)}</div>` : ''}
    ${s.notes ? `<div style="margin-bottom:6px;white-space:pre-wrap"><b>Notes:</b> ${escapeHtml(s.notes)}</div>` : ''}
    <div class="form-row" style="margin-top:12px;justify-content:flex-end">
      ${isGM ? `
        <button class="btn btn-dim" style="color:var(--red-b)" onclick="deleteSession('${s.id}')">Delete</button>
        ${s.cancelled_at ? '' : `<button class="btn btn-dim" onclick="cancelSession('${s.id}')">Cancel game &amp; email</button>`}
        <button class="btn btn-gold" onclick="openSessionForm('${s.id}')">Edit</button>` : ''}
      <button class="btn btn-dim" onclick="closeModal()">Close</button>
    </div>`);
}

// ---- schedule / edit form --------------------------------------------------------------
function openSessionForm(id, dayKey) {
  const existing = id ? scheduleCache[id] : null;
  const tz = existing ? existing.tz : (localStorage.getItem('gs_sched_tz') || schedBrowserTz());
  let date, time, hours, title, location, notes;
  if (existing) {
    ({ date, time } = schedPartsInTz(new Date(existing.starts_at).getTime(), tz));
    hours = existing.duration_minutes / 60; title = existing.title; location = existing.location || ''; notes = existing.notes || '';
  } else {
    date = dayKey || schedDayKeyLocal(new Date()); time = localStorage.getItem('gs_sched_time') || '19:00';
    hours = parseFloat(localStorage.getItem('gs_sched_hours')) || 4; title = 'Game session'; location = ''; notes = '';
  }
  const group = myGroups.find(g => g.id === (existing ? existing.group_id : activeGroupId));
  openModal(`
    <h3 style="margin:0 0 4px">${existing ? 'Edit game' : 'Schedule a game'} <span style="font-size:12px;color:var(--text-dim)">— ${escapeHtml(group ? group.name : '')}</span></h3>
    <div class="form-row">
      <div class="form-group" style="flex:1"><label>Title</label><input id="sch-title" class="w-full" value="${escapeHtml(title)}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Date</label><input id="sch-date" type="date" value="${date}"></div>
      <div class="form-group"><label>Start time</label><input id="sch-time" type="time" value="${time}"></div>
      <div class="form-group"><label>Length (hours)</label><input id="sch-hours" type="number" class="w-sm" min="0.5" max="24" step="0.5" value="${hours}"></div>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1"><label>Time zone the time above is in</label>
        <select id="sch-tz" class="w-full">${schedTzList().map(z => `<option value="${escapeHtml(z)}" ${z === tz ? 'selected' : ''}>${escapeHtml(z)}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1"><label>Where (address, Discord, Roll20 link…)</label><input id="sch-location" class="w-full" value="${escapeHtml(location)}"></div>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1"><label>Notes for the players</label><textarea id="sch-notes" class="w-full" rows="3">${escapeHtml(notes)}</textarea></div>
    </div>
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:4px 0 10px"><input type="checkbox" id="sch-email" checked> Email everyone in ${escapeHtml(group ? group.name : 'the group')} ${existing ? 'about this change' : 'now'}</label>
    <div class="form-row" style="justify-content:flex-end">
      <button class="btn btn-dim" onclick="closeModal()">Cancel</button>
      <button class="btn btn-gold" id="sch-save" onclick="saveSession(${existing ? `'${existing.id}'` : 'null'})">${existing ? 'Save' : 'Schedule'}</button>
    </div>`, { width: '520px' });
}

async function saveSession(id) {
  const existing = id ? scheduleCache[id] : null;
  const groupId = existing ? existing.group_id : activeGroupId;
  const date = document.getElementById('sch-date').value;
  const time = document.getElementById('sch-time').value;
  const tz = document.getElementById('sch-tz').value;
  const hours = parseFloat(document.getElementById('sch-hours').value);
  if (!date || !time) { alert('Pick a date and a start time.'); return; }
  if (!(hours >= 0.5 && hours <= 24)) { alert('Length must be between 0.5 and 24 hours.'); return; }
  const row = {
    title: document.getElementById('sch-title').value.trim() || 'Game session',
    starts_at: new Date(schedZonedToUtcMs(date, time, tz)).toISOString(),
    duration_minutes: Math.round(hours * 60),
    tz,
    location: document.getElementById('sch-location').value.trim() || null,
    notes: document.getElementById('sch-notes').value.trim() || null
  };
  const wantEmail = document.getElementById('sch-email').checked;
  const btn = document.getElementById('sch-save');
  btn.disabled = true;

  let saved, error;
  if (existing) {
    ({ data: saved, error } = await sb.from('game_sessions').update(row).eq('id', id).select().single());
  } else {
    ({ data: saved, error } = await sb.from('game_sessions').insert({ ...row, group_id: groupId, created_by: currentUser.id }).select().single());
  }
  if (error) { btn.disabled = false; alert('Could not save the game: ' + error.message); return; }
  try { localStorage.setItem('gs_sched_tz', tz); localStorage.setItem('gs_sched_time', time); localStorage.setItem('gs_sched_hours', String(hours)); } catch (e) { /* private mode */ }

  scheduleNotice = existing ? 'Game updated.' : 'Game scheduled.';
  if (wantEmail) scheduleNotice += ' ' + await mailSession(saved.id, existing ? 'updated' : 'scheduled');
  else scheduleNotice += ' No email sent.';
  const d = new Date(saved.starts_at);
  scheduleMonth = { y: d.getFullYear(), m: d.getMonth() };
  closeModal();
  renderScheduleModule();
}

async function cancelSession(id) {
  const s = scheduleCache[id];
  if (!s || !await appConfirm(`Cancel "${s.title}" and email everyone in the group?`)) return;
  const { error } = await sb.from('game_sessions').update({ cancelled_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert('Could not cancel the game: ' + error.message); return; }
  scheduleNotice = 'Game cancelled. ' + await mailSession(id, 'cancelled');
  closeModal();
  renderScheduleModule();
}

async function deleteSession(id) {
  const s = scheduleCache[id];
  if (!s || !await appConfirm(`Delete "${s.title}" from the calendar? No email is sent. (Use "Cancel game & email" to tell the players.)`)) return;
  const { error } = await sb.from('game_sessions').delete().eq('id', id);
  if (error) { alert('Could not delete the game: ' + error.message); return; }
  scheduleNotice = 'Game deleted.';
  closeModal();
  renderScheduleModule();
}

// Asks the session-mail Edge Function to email the group; returns a sentence for the status line.
async function mailSession(sessionId, kind) {
  try {
    const { data, error } = await sb.functions.invoke('session-mail', { body: { session_id: sessionId, kind } });
    if (error) {
      let detail = error.message;
      try { const j = await error.context.json(); if (j && j.error) detail = j.error; if (j && j.failures && j.failures.length) detail += ' — ' + j.failures[0]; } catch (e) { /* not JSON */ }
      return `The change is saved, but the email did not go out (${detail}).`;
    }
    if (data.recipients === 0) return 'No one else in the group has an email on file.';
    if (data.failures && data.failures.length) return `Emailed ${data.sent} of ${data.recipients}; failed: ${data.failures.map(f => f.split(':')[0]).join(', ')}.`;
    return `Emailed ${data.sent} ${data.sent === 1 ? 'person' : 'people'}.`;
  } catch (e) {
    return `The change is saved, but the email did not go out (${e.message}).`;
  }
}
