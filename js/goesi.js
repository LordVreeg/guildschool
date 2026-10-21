// ============================================================
// GOESI CALENDAR
// ============================================================
// A month-grid popup (Goesi = the Westic word for a 60-day month), reached
// by clicking the group's date/time display. Shows recurring holidays,
// notes anchored to specific days, and spell effects ending that day, and
// lets a player add a note or a GM add a holiday right from a day's detail
// view. Editing/toggling an existing note's visibility still happens from
// the regular Log, not duplicated here.
let goesiViewYear = null;
let goesiViewMonth = null;
let goesiDayDetail = null; // { month, day, isLithe } or null (month-grid view)
let goesiCache = { holidays: [], effects: [], notes: [] };

// Lays out 60 days + 1 Lithe day into 8-wide weekday rows, offset so day 1
// lands in its real Hawaak column -- the weekday cycle runs continuously
// across month boundaries (per the wiki's own month-grid pages), it doesn't
// reset to column 1 every month.
function buildGoesiGrid(month) {
  const doy0 = month * (RON_DAYS_PER_MONTH + 1);
  const startCol = ((doy0 % 8) + 8) % 8;
  const cells = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= RON_DAYS_PER_MONTH; d++) cells.push({ day: d, isLithe: false });
  cells.push({ day: null, isLithe: true });
  while (cells.length % 8 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 8) rows.push(cells.slice(i, i + 8));
  return rows;
}

async function openGoesiModal(groupId) {
  const group = myGroups.find(g => g.id === groupId);
  if (!group) return;
  if (goesiViewYear == null) {
    const c = ronFromSeconds(group.clock_seconds);
    goesiViewYear = c.year;
    goesiViewMonth = c.month;
  }
  goesiDayDetail = null;
  await renderGoesiModal(groupId);
}

async function renderGoesiModal(groupId) {
  const group = myGroups.find(g => g.id === groupId);
  if (!group) return;
  const isGM = group.myRole === 'gm';
  const monthStart = ronToSeconds({ year: goesiViewYear, month: goesiViewMonth, day: 1, isLithe: false, hour: 0, minute: 0, second: 0 });
  const monthEnd = monthStart + RON_SEC_PER_MONTH_BLOCK;

  const [{ data: holidays, error: hErr }, { data: effects, error: eErr }, { data: notes, error: nErr }] = await Promise.all([
    sb.from('group_holidays').select('id, month, day, is_lithe, name, notes').eq('group_id', groupId).eq('month', goesiViewMonth),
    sb.from('character_spell_effects').select('id, character_id, spell_name, cast_at_seconds, expires_at_seconds').eq('group_id', groupId).gte('expires_at_seconds', monthStart).lt('expires_at_seconds', monthEnd),
    sb.from('group_notes').select('id, author_id, note, game_seconds, visible_to_all').eq('group_id', groupId).gte('game_seconds', monthStart).lt('game_seconds', monthEnd)
  ]);
  if (hErr || eErr || nErr) { alert('Failed to load calendar: ' + (hErr||eErr||nErr).message); return; }
  goesiCache = { holidays: holidays || [], effects: effects || [], notes: notes || [] };

  if (goesiDayDetail) renderGoesiDayDetail(groupId, isGM);
  else renderGoesiMonthView(groupId, isGM);
}

function goesiNavMonth(groupId, delta) {
  goesiViewMonth += delta;
  if (goesiViewMonth < 0) { goesiViewMonth = 5; goesiViewYear--; }
  else if (goesiViewMonth > 5) { goesiViewMonth = 0; goesiViewYear++; }
  renderGoesiModal(groupId);
}

function goesiSetYear(groupId, year) {
  goesiViewYear = parseInt(year) || goesiViewYear;
  renderGoesiModal(groupId);
}

function openGoesiDay(groupId, month, day, isLithe) {
  goesiDayDetail = { month, day, isLithe };
  renderGoesiModal(groupId);
}

function backToGoesiMonth(groupId) {
  goesiDayDetail = null;
  renderGoesiModal(groupId);
}

function renderGoesiMonthView(groupId, isGM) {
  const rows = buildGoesiGrid(goesiViewMonth);
  const monthDef = RON_MONTHS[goesiViewMonth];
  const yearOptions = [];
  for (let y = goesiViewYear - 5; y <= goesiViewYear + 10; y++) yearOptions.push(y);

  const cellHtml = (cell) => {
    if (!cell) return '<td></td>';
    const dayStart = ronToSeconds({ year: goesiViewYear, month: goesiViewMonth, day: cell.day || 1, isLithe: cell.isLithe, hour: 0, minute: 0, second: 0 });
    const dayEnd = dayStart + RON_SEC_PER_DAY;
    const dayHolidays = goesiCache.holidays.filter(h => h.is_lithe === cell.isLithe && (cell.isLithe || h.day === cell.day));
    const dayNotes = goesiCache.notes.filter(n => n.game_seconds >= dayStart && n.game_seconds < dayEnd);
    const dayEffects = goesiCache.effects.filter(e => e.expires_at_seconds >= dayStart && e.expires_at_seconds < dayEnd);
    const badges = [
      dayHolidays.length ? `<span title="${dayHolidays.length} holiday(s)">🎉${dayHolidays.length>1?dayHolidays.length:''}</span>` : '',
      dayNotes.length ? `<span title="${dayNotes.length} note(s)">📝${dayNotes.length>1?dayNotes.length:''}</span>` : '',
      dayEffects.length ? `<span title="${dayEffects.length} spell(s) ending">⏳${dayEffects.length>1?dayEffects.length:''}</span>` : ''
    ].filter(Boolean).join(' ');
    const label = cell.isLithe ? 'Lithe' : cell.day;
    const dayArg = cell.day != null ? cell.day : 'null';
    return `<td style="cursor:pointer;vertical-align:top;padding:4px" onclick="openGoesiDay('${groupId}',${goesiViewMonth},${dayArg},${cell.isLithe})">
      <div style="font-size:11px;color:var(--text-dim)">${label}</div>
      <div style="font-size:12px">${badges}</div>
    </td>`;
  };

  openModal(`
    <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:4px">
      <button class="btn btn-dim" onclick="goesiNavMonth('${groupId}',-1)" title="Previous Goesi">◀</button>
      <h3 style="margin:0;font-family:'Cormorant Garamond','Georgia',serif;font-style:italic;font-weight:bold;font-size:22px;color:var(--gold);text-align:center">${monthDef.key}<br><span style="font-size:14px;color:var(--gold-dim);font-family:inherit">${monthDef.season} — ${goesiViewYear} RON</span></h3>
      <button class="btn btn-dim" onclick="goesiNavMonth('${groupId}',1)" title="Next Goesi">▶</button>
    </div>
    <div class="form-row" style="margin-bottom:10px;align-items:center;justify-content:center">
      <div class="form-group"><label>Jump to Year</label>
        <select onchange="goesiSetYear('${groupId}', this.value)">
          ${yearOptions.map(y => `<option value="${y}" ${y===goesiViewYear?'selected':''}>${y} RON</option>`).join('')}
        </select>
      </div>
    </div>
    <table class="skill-table" style="table-layout:fixed">
      <thead><tr>${RON_WEEKDAYS.map(w=>`<th style="font-size:10px">${w}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(row => `<tr>${row.map(cellHtml).join('')}</tr>`).join('')}
      </tbody>
    </table>
    <div class="note" style="margin-top:8px">🎉 holiday · 📝 note · ⏳ spell effect ending. Click a day for details.</div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Close</button></div>`, { wide: true });
}

function renderGoesiDayDetail(groupId, isGM) {
  const { month, day, isLithe } = goesiDayDetail;
  const dayStart = ronToSeconds({ year: goesiViewYear, month, day: day || 1, isLithe, hour: 0, minute: 0, second: 0 });
  const dayEnd = dayStart + RON_SEC_PER_DAY;
  const dayHolidays = goesiCache.holidays.filter(h => h.is_lithe === isLithe && (isLithe || h.day === day));
  const dayNotes = goesiCache.notes.filter(n => n.game_seconds >= dayStart && n.game_seconds < dayEnd);
  const dayEffects = goesiCache.effects.filter(e => e.expires_at_seconds >= dayStart && e.expires_at_seconds < dayEnd);
  const myCharIds = new Set(Object.values(charRowIds));
  const dayLabel = isLithe ? `Lithe Day (after ${RON_MONTHS[month].key})` : `${RON_MONTHS[month].key} ${day}, ${goesiViewYear} RON`;

  const holidaysHtml = dayHolidays.length ? dayHolidays.map(h => `
    <div style="margin-bottom:6px">
      <b>🎉 ${escapeHtml(h.name)}</b>${h.notes ? `<div class="note">${escapeHtml(h.notes)}</div>` : ''}
      ${isGM ? `<button class="btn btn-dim" style="font-size:10px;padding:1px 6px" onclick="deleteHoliday('${groupId}','${h.id}')">Remove</button>` : ''}
    </div>`).join('') : '<div class="note">No holidays.</div>';

  const effectsHtml = dayEffects.length ? `<table class="skill-table"><thead><tr><th>Character</th><th>Spell</th><th>Ends</th><th></th></tr></thead><tbody>
    ${dayEffects.map(e => {
      const canRemove = isGM || myCharIds.has(e.character_id);
      const charName = (groupRosterCache.find(c => c.id === e.character_id) || {}).name || '(unknown)';
      return `<tr><td>${escapeHtml(charName)}</td><td>${escapeHtml(e.spell_name)}</td><td>${ronDateLabel(ronFromSeconds(e.expires_at_seconds))}</td><td>${canRemove ? `<button class="btn btn-dim" style="font-size:10px;padding:1px 6px" onclick="deleteSpellEffect('${groupId}','${e.id}')">Remove</button>` : ''}</td></tr>`;
    }).join('')}
  </tbody></table>` : '<div class="note">No spell effects ending this day.</div>';

  const notesListHtml = dayNotes.length ? dayNotes.map(n => `
    <div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border)">
      <div>${escapeHtml(n.note)}</div>
      <span style="font-size:10px;color:${n.visible_to_all?'var(--text-dim)':'var(--gold-dim)'}">${n.visible_to_all ? 'Visible to all' : 'Private (author + GM)'}</span>
    </div>`).join('') : '<div class="note">No notes.</div>';

  const addHolidayForm = isGM ? `
    <div class="form-row" style="margin-top:4px">
      <div class="form-group" style="flex:1"><input id="goesi-holiday-name" placeholder="Holiday name"></div>
      <div class="form-group" style="justify-content:flex-end"><button class="btn btn-dim" onclick="addHoliday('${groupId}')">+ Add Holiday Here</button></div>
    </div>` : '';

  openModal(`
    <h3 style="margin-bottom:4px;font-family:'Cormorant Garamond','Georgia',serif;font-style:italic;font-weight:bold;font-size:20px;color:var(--gold)">${escapeHtml(dayLabel)}</h3>
    <button class="btn btn-dim" style="margin-bottom:10px" onclick="backToGoesiMonth('${groupId}')">◀ Back to ${RON_MONTHS[month].key}</button>

    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Holidays</div>
    ${holidaysHtml}
    ${addHolidayForm}

    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Spell Effects Ending</div>
    ${effectsHtml}

    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Notes</div>
    ${notesListHtml}
    <div class="form-group" style="margin-bottom:6px"><textarea id="goesi-note-text" rows="2" style="width:100%" placeholder="Add a note for this day..."></textarea></div>
    <div class="form-row">
      ${ronHourPhaseInputHtml('goesi-note', 0)}
      <div class="form-group"><label>Minute</label><input id="goesi-note-minute" type="number" class="w80" value="0" min="0" max="59"></div>
      <div class="form-group"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap">&nbsp;<input type="checkbox" id="goesi-note-visible"> Visible to everyone</label></div>
      <div class="form-group" style="justify-content:flex-end"><button class="btn btn-gold" onclick="addGoesiNote('${groupId}')">Add Note</button></div>
    </div>

    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Close</button></div>`, { wide: true });
}

async function addHoliday(groupId) {
  const input = document.getElementById('goesi-holiday-name');
  const name = input ? input.value.trim() : '';
  if (!name || !goesiDayDetail) return;
  const { month, day, isLithe } = goesiDayDetail;
  const { error } = await sb.from('group_holidays').insert({ group_id: groupId, month, day: isLithe ? null : day, is_lithe: isLithe, name });
  if (error) { alert('Failed to add holiday: ' + error.message); return; }
  await renderGoesiModal(groupId);
}

async function deleteHoliday(groupId, holidayId) {
  const { error } = await sb.from('group_holidays').delete().eq('id', holidayId);
  if (error) { alert('Failed to remove holiday: ' + error.message); return; }
  await renderGoesiModal(groupId);
}

async function deleteSpellEffect(groupId, effectId) {
  const { error } = await sb.from('character_spell_effects').delete().eq('id', effectId);
  if (error) { alert('Failed to remove spell effect: ' + error.message); return; }
  await renderGoesiModal(groupId);
}

async function addGoesiNote(groupId) {
  if (!goesiDayDetail) return;
  const textEl = document.getElementById('goesi-note-text');
  const text = textEl.value.trim();
  if (!text) return;
  const visibleToAll = document.getElementById('goesi-note-visible').checked;
  const hour = ronHourFromPhaseInput('goesi-note');
  const minute = Math.min(59, Math.max(0, parseInt(document.getElementById('goesi-note-minute').value) || 0));
  const { month, day, isLithe } = goesiDayDetail;
  const gameSeconds = ronToSeconds({ year: goesiViewYear, month, day: day || 1, isLithe, hour, minute, second: 0 });
  const volumeId = await getActiveVolumeId(groupId);
  const { error } = await sb.from('group_notes').insert({
    group_id: groupId, author_id: currentUser.id, note: text, game_seconds: gameSeconds, visible_to_all: visibleToAll, volume_id: volumeId
  });
  if (error) { alert('Failed to add note: ' + error.message); return; }
  await renderGoesiModal(groupId);
}

async function toggleNoteVisibility(noteId, groupId) {
  const note = groupNotesCache.find(n => n.id === noteId);
  if (!note) return;
  const { error } = await sb.from('group_notes').update({ visible_to_all: !note.visible_to_all }).eq('id', noteId);
  if (error) { alert('Failed to change visibility: ' + error.message); return; }
  renderGroupModule();
}

function openEditNoteModal(noteId, groupId) {
  const note = groupNotesCache.find(n => n.id === noteId);
  if (!note) return;
  const c = ronFromSeconds(note.game_seconds);
  openModal(`
    <h3>Edit Note</h3>
    <div class="form-group" style="margin-bottom:8px"><textarea id="edit-note-text" rows="4" style="width:100%">${escapeHtml(note.note)}</textarea></div>
    <div class="note" style="margin-bottom:6px">This only corrects the displayed in-game time -- the log's own order is by when each note was actually entered, not by this.</div>
    <div class="form-row">
      <div class="form-group"><label>Year (RON)</label><input id="en-year" type="number" class="w100" value="${c.year}"></div>
      <div class="form-group"><label>Month</label>
        <select id="en-month">${RON_MONTHS.map((m,i)=>`<option value="${i}" ${i===c.month?'selected':''}>${m.key} (${m.season})</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="en-lithe" ${c.isLithe?'checked':''} onchange="document.getElementById('en-day-wrap').style.display=this.checked?'none':'block'">
          Lithe Day
        </label>
      </div>
      <div class="form-group" id="en-day-wrap" style="display:${c.isLithe?'none':'block'}"><label>Day (1-60)</label><input id="en-day" type="number" class="w80" value="${c.day}" min="1" max="60"></div>
    </div>
    <div class="form-row">
      ${ronHourPhaseInputHtml('en', c.hour)}
      <div class="form-group"><label>Minute (0-59)</label><input id="en-minute" type="number" class="w80" value="${c.minute}" min="0" max="59"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="saveEditedNote('${noteId}','${groupId}')">Save</button></div>`);
}

async function saveEditedNote(noteId, groupId) {
  const text = document.getElementById('edit-note-text').value.trim();
  if (!text) return;
  const year = parseInt(document.getElementById('en-year').value) || 0;
  const month = parseInt(document.getElementById('en-month').value) || 0;
  const isLithe = document.getElementById('en-lithe').checked;
  const day = Math.min(60, Math.max(1, parseInt(document.getElementById('en-day').value) || 1));
  const hour = ronHourFromPhaseInput('en');
  const minute = Math.min(59, Math.max(0, parseInt(document.getElementById('en-minute').value) || 0));
  const gameSeconds = ronToSeconds({ year, month, day, isLithe, hour, minute, second: 0 });
  const { error } = await sb.from('group_notes').update({ note: text, game_seconds: gameSeconds }).eq('id', noteId);
  if (error) { alert('Failed to save note: ' + error.message); return; }
  closeModal();
  renderGroupModule();
}
