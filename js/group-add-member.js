// Populated when the modal opens: every approved player + every character
// in the system (minimal fields only, via profile_lookup/character_lookup),
// so the GM can pick a player then cascade to one of their characters
// without an email round-trip. Approval is the trust boundary here, per
// the same pattern profile_lookup already uses.
let addToGroupCache = { profiles: [], characters: [] };

async function openAddToGroupModal(groupId) {
  const [{ data: profiles, error: pErr }, { data: characters, error: cErr }] = await Promise.all([
    sb.from('profile_lookup').select('id, email').order('email'),
    sb.from('character_lookup').select('id, owner_id, group_id, name, is_npc').order('name')
  ]);
  if (pErr || cErr) { alert('Failed to load players/characters: ' + (pErr || cErr).message); return; }
  addToGroupCache = { profiles: profiles || [], characters: characters || [] };

  openModal(`
    <h3>Add to Group</h3>
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Add a Character</div>
    <div class="form-group" style="margin-bottom:8px"><label>Player</label>
      <select id="atg-player" onchange="renderAtgCharacterOptions()">
        <option value="">— select a player —</option>
        ${addToGroupCache.profiles.map(p => `<option value="${p.id}">${escapeHtml(p.email || p.id)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="margin-bottom:8px"><label>Character</label>
      <select id="atg-character"><option value="">— pick a player first —</option></select>
    </div>
    <div id="atg-status" style="font-size:12px;color:var(--red-b);margin-bottom:8px;display:none"></div>
    <div class="modal-actions" style="margin-bottom:16px"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="submitAddCharacter('${groupId}')">Add to Group</button></div>
    <hr class="divider">
    <div style="font-size:11px;color:var(--gold-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Add a Co-GM</div>
    <div class="note" style="margin-bottom:8px">For someone running the game alongside you, who doesn't need a character added.</div>
    <div class="form-group" style="margin-bottom:8px"><label>Email</label><input id="atg-gm-email" style="width:100%" type="email"></div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-gold" onclick="submitAddGm('${groupId}')">Add as GM</button></div>`);
}

function renderAtgCharacterOptions() {
  const playerId = document.getElementById('atg-player').value;
  const sel = document.getElementById('atg-character');
  if (!playerId) { sel.innerHTML = '<option value="">— pick a player first —</option>'; return; }
  const chars = addToGroupCache.characters.filter(c => c.owner_id === playerId);
  sel.innerHTML = chars.length
    ? chars.map(c => `<option value="${c.id}">${escapeHtml(c.name || '(unnamed)')}${c.is_npc ? ' (NPC)' : ''}${c.group_id ? ' — already in a group' : ''}</option>`).join('')
    : '<option value="">This player has no characters yet</option>';
}

async function submitAddCharacter(groupId) {
  const characterId = document.getElementById('atg-character').value;
  const statusEl = document.getElementById('atg-status');
  statusEl.style.display = 'none';
  if (!characterId) return;
  const { error } = await sb.rpc('gm_add_character_to_group', { p_character_id: characterId, p_group_id: groupId });
  if (error) {
    statusEl.textContent = 'Failed to add character: ' + error.message;
    statusEl.style.display = 'block';
    return;
  }
  closeModal();
  renderGroupModule();
}

async function submitAddGm(groupId) {
  const email = document.getElementById('atg-gm-email').value.trim();
  const statusEl = document.getElementById('atg-status');
  statusEl.style.display = 'none';
  if (!email) return;
  const { data: lookup, error: lookupErr } = await sb.from('profile_lookup').select('id').ilike('email', email).maybeSingle();
  if (lookupErr || !lookup) {
    statusEl.textContent = 'No approved user found with that email.';
    statusEl.style.display = 'block';
    return;
  }
  const { error } = await sb.from('group_members').insert({ group_id: groupId, user_id: lookup.id, role: 'gm' });
  if (error) {
    statusEl.textContent = 'Failed to add: ' + error.message;
    statusEl.style.display = 'block';
    return;
  }
  closeModal();
  renderGroupModule();
}

async function linkCharacterToGroup(groupId) {
  const appId = state.activeChar;
  const char = state.characters[appId];
  if (!char) return;
  const rowId = charRowIds[appId];
  if (!rowId) { alert('This character needs to save at least once (any edit will do) before it can be linked to a group.'); renderGeneralModule(); return; }
  const { error } = await sb.from('characters').update({ group_id: groupId || null }).eq('id', rowId);
  if (error) { alert('Failed to link character to group: ' + error.message); return; }
  char.playGroupId = groupId || null;
  saveState();
  renderGeneralModule();
}
