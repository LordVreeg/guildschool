// ============================================================
// SUPABASE AUTH + CLIENT
// ============================================================
const SUPABASE_URL = 'https://csvulokpauafokdjkvfe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BMCim59Ynsry_tlDUscYWw_gu0Xb0d0';
// A password-reset email link lands back here with "type=recovery" in the URL
// hash (or "error_description" if the link expired or was already used).
// Read both before createClient, which consumes and clears the hash.
const authLinkParams = new URLSearchParams(location.hash.slice(1));
let passwordRecoveryPending = authLinkParams.get('type') === 'recovery';
const authLinkError = authLinkParams.get('error_description');

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let adminCharsCache = {}; // characters.id -> character data, populated by openAdminPanel
let charRowIds = {}; // app-level character id -> Supabase characters.id (uuid)
let bootStarted = false;

function showAuthGate() { document.getElementById('auth-gate').style.display = 'flex'; }
function hideAuthGate() { document.getElementById('auth-gate').style.display = 'none'; }
function showPendingGate() { document.getElementById('pending-gate').style.display = 'flex'; }
function hidePendingGate() { document.getElementById('pending-gate').style.display = 'none'; }
function showResetGate() { document.getElementById('reset-gate').style.display = 'flex'; }
function hideResetGate() { document.getElementById('reset-gate').style.display = 'none'; }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// GuildSchool names are all "Location: Name" (e.g. "Igbar: Bowyers of
// Ceminiar") -- with 40+ guilds per location across several locations, a
// flat list (even grouped) is a long scroll. <optgroup> can't collapse --
// it's always fully expanded -- so this is a picker modal built on <details>
// instead, collapsed by default except whichever location already holds the
// current value. Renders a button that opens it; onSelect gets the chosen
// guild name (or '' for "— none —").
// Short "what is this guild" blurbs shown on hover in the picker. A guild is
// the same guild wherever it sits ("The Eye is the Eye"), so blurbs are keyed
// by the guild's base name with its locale stripped -- Igbar: The Eye,
// Ocodig: The Eye and Miston: The Eye all share one. Guilds with no blurb
// yet get a generic placeholder; add the text to GUILD_BLURBS below.
const GUILD_BLURB_PLACEHOLDER = "A guild or faction of Celtricia. A fuller description hasn't been written for this one yet.";
function guildBlurbKey(name) {
  let s = String(name || '').replace(/^[^:]*:\s*/, '').replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/&/g, ' and ');
  for (const re of [/steel isle town/g, /steel island/g, /steel isle/g]) s = s.replace(re, ' ');
  const stop = new Set(['the', 'of', 'and', 'a', 'an']);
  const locales = new Set(['igbar', 'ocodig', 'hopiton', 'miston']);
  return s.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !stop.has(w) && !locales.has(w)).join(' ');
}
function guildBlurb(name) { return GUILD_BLURBS[guildBlurbKey(name)] || ''; }
function guildBlurbOrPlaceholder(name) { return guildBlurb(name) || GUILD_BLURB_PLACEHOLDER; }
const GUILD_BLURBS = {
  "alt school magic": "To create a cooperative magic school that is not under the heel of the huge Collegiom Arcana.",
  "armor trade": "The protectors and martial arm of the Platform of Trade; this knighthood protects the priesthood and partners of that church. Warriors and sword defenders of those that honestly trade, they particularly hate bandits and those that try to cheat the system.",
  "bertrand s bardic school": "A violent anti-gryphon/anti-argus group, this school is very martial, and well known to drum the beats of rumor, as well as their small conical trelling drums and huge kettle drums.",
  "blackstripes": "Firstly about theft, but also about territory. Blackstripes specialize in bribery and graft.",
  "blue turtles": "The Blue Turtles were founded to combat warrior brotherhoods that place the nobility above the defence of the weak.",
  "blue turtles honorable warriors": "The Blue Turtles were founded to combat warrior brotherhoods that place the nobility above the defence of the weak.",
  "bone knights orcus": "Large-scale, to maintain the sanctity of the resting places of the dead, currently, to beat back the undead in Igbar.",
  "bowyers ceminiar": "To protect the Tenets of the Great Woodsman, Ceminiar. Also, to oppose the servants of Geryon and the Wild Hunt.",
  "breath truth": "To Educate future governmental figures in Igbar.",
  "church direction": "To aid in those that are lost, to seek priority and order. To show the value of working together and to bring to light the hidden facets of a journey.",
  "church fortune": "The Church of Fortune gives succor to those that have been burnt by the vagaries of fate, and those that seek to curry favors with luck. Ishma is also the patron of the spider and of making one's own luck.",
  "church green mother": "To protect the wilderness and the cultivate the urban/wilderness interface.",
  "church grren mother": "To Educate future governmental figures in Igbar.",
  "church hosting": "To promote the teachings of the Lord of the Hosting, and to be part of the organic network they believe each population center to be.",
  "church hunt": "To grow the rights of the individual, the grow the forests, and to ennoble the hunt.",
  "collegium arcana": "The Collegium Arcana wishes to have every non-church aligned caster under their control and umbrella.",
  "corobar s iron way": "To create educated, uniquely skilled warriors to grow with a house of nobility, to bring honor to the Way.",
  "defenders land": "To create a harmony with the people living on the waking dream and the creatures that exist in it.",
  "defenders land madrak": "To create a harmony with the people living on the waking dream and the creatures that exist in it.",
  "dire tones bardic consortium": "To explore the grim mysteries hidden in the tortured mind of the poetic... to wear black, smoke cloves, and play music, while being depressed...and to wear all black and dye the hair black and have sort of romantic ideal of the undead.",
  "eye": "The Eye is one of the three large multinational Thieves' Guilds in the Continent of Celtricia. Control of turf, and extraction.",
  "frigid song": "To create the present in bardic terms that will become history.",
  "green flame": "To Support the Eye of Igbar and provide magical and alchemical backing for them.",
  "gurellium traders": "Like many trading guilds, profit is an overwhelming interest. But The Gurelliums are also ' Nativists ', Islandres who wish to minimize the political influence of the mainland.",
  "heralds night": "Shrouded in mystery. They are as much bards who seek information and who work in taverns and in the nobility as they are killers.",
  "holders straight way": "This is not a church, but a group of holy assassins/warriors attached to the Church of Belial the True and Clear. They are not public knowledge, though they are not a hidden group to other underworld types.",
  "hunters shade": "To track and hunt and husband the giant beasts of Verbren; to martially protect those ways that mankind uses to traverse the forest.",
  "intrepid engineers": "To teach the basics of engineering and the applications of same while warning the students of the possibilities.",
  "manxian lancers": "Guarding the property and caravans of the Rexians.",
  "mysteriarchs lathe": "Insulated, they seek to counteract the dragonriders and to track and keep count on sauroid influence.",
  "order stenron": "The Order began as a means to fight the humanoids and undead that threaten every civilized locale. They spend times on short and long patrols with the town. They are decent trackers and have some member with earth and animist void abilities.",
  "order white paladin": "To wear white and like it? This guild of fighters exists to create a band of warriors trained to protect the weak and especially to defend those that speak the truth at their own peril.",
  "path earth": "To support and defend all churches of earth and animism.",
  "puror s mixers": "To embody the Earth-Trickster, Saint Tedu Redescu, and give the best quality potions and mixtures at reasonable prices, and to find more mixtures that are undiscovered.",
  "restitution arlieng": "To feed all underworld, political, or mercantile information back to Vinivixias.",
  "scarlet deductors": "To determine the root causes of crimes too difficult for the ordinary Pilums, and to bring those causes before the Unicorn Courts. Unofficially, to give the Spear-Lord an instrument for matters he does not wish handled by the ordinary watch, when it becomes delicate, or difficult.",
  "scarlet pilums": "Currently, to fulfill their decade contract with Trabler. Long term, to increase their mercenary brotherhood.",
  "shrine winding skein": "To discover mysteries and to build secure homesteads. This Church is small, and is very often only in shrine levels. They tend towards order and a belief in fate.",
  "tower": "The tower exists to study air and weather magic. They are a known commodity for all seagoing vessels, being able to summon wind elementals and to change weather patterns.",
  "trombic fanfare": "To be the horns of the call, the valhalla harbingers. This group performs regularly, solo or in smaller groups, and seeks out news and deeds of renown.",
  "unicorn ministry": "To Educate future governmental figures in Igbar."
};

function showGuildBlurb(name) {
  const el = document.getElementById('guild-blurb-preview');
  if (!el) return;
  const b = guildBlurb(name);
  el.innerHTML = `<b>${escapeHtml(name)}</b><br><span style="${b ? '' : 'color:var(--text-dim);font-style:italic'}">${escapeHtml(b || GUILD_BLURB_PLACEHOLDER)}</span>`;
}

function guildPickerButton(currentValue, onSelectExpr) {
  return `<button type="button" class="btn btn-dim" style="width:100%;text-align:left" ${currentValue ? `title="${escapeHtml(guildBlurbOrPlaceholder(currentValue))}"` : ''} onclick="openGuildPickerModal('${escapeHtml((currentValue||'').replace(/'/g,"\\'"))}', ${onSelectExpr})">${currentValue ? escapeHtml(currentValue) : '— none —'}</button>`;
}

let guildPickerCallback = null;
function openGuildPickerModal(currentValue, onSelect) {
  guildPickerCallback = onSelect;
  const groups = {};
  for (const g of Object.keys(GUILDS).sort()) {
    const idx = g.indexOf(': ');
    const location = idx >= 0 ? g.slice(0, idx) : '(Other)';
    (groups[location] = groups[location] || []).push(g);
  }
  const locations = Object.keys(groups).sort();
  openModal(`
    <h3>Select GuildSchool</h3>
    <div style="margin-bottom:8px"><button class="btn btn-dim" onclick="selectGuildFromPicker('')">— none —</button></div>
    <div style="max-height:60vh;overflow-y:auto">
      ${locations.map(loc => `<details ${groups[loc].includes(currentValue) ? 'open' : ''} style="margin-bottom:4px">
        <summary style="cursor:pointer;font-weight:bold;color:var(--gold-dim);padding:4px 0">${escapeHtml(loc)} <span class="note">(${groups[loc].length})</span></summary>
        <div style="margin-left:16px">
          ${groups[loc].map(g => `<div style="padding:2px 0;cursor:pointer;${g===currentValue?'color:var(--gold);font-weight:bold':''}" title="${escapeHtml(guildBlurbOrPlaceholder(g))}" data-guild="${escapeHtml(g)}" onmouseover="showGuildBlurb(this.dataset.guild)" onclick="selectGuildFromPicker('${g.replace(/'/g,"\\'")}')">${escapeHtml(g)}</div>`).join('')}
        </div>
      </details>`).join('')}
    </div>
    <div id="guild-blurb-preview" class="note" style="margin-top:8px;min-height:3.2em;border-top:1px solid var(--border);padding-top:6px">Hover a guild to read a short description of it.</div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button></div>`, { wide: true, width: 'min(760px, 92vw)' });
}

function selectGuildFromPicker(guildName) {
  const cb = guildPickerCallback;
  guildPickerCallback = null;
  closeModal();
  if (cb) cb(guildName);
}

// For pickers that feed a plain form field rather than character/skill
// state (e.g. the Utilities "add Guild EXPMOD" form) -- patches just the
// hidden input + button label instead of a full module re-render, so it
// doesn't wipe out whatever's already typed in that form's other fields.
function pickGuildIntoField(hiddenId, buttonId) {
  const hidden = document.getElementById(hiddenId);
  openGuildPickerModal(hidden ? hidden.value : '', v => {
    if (hidden) hidden.value = v;
    const btn = document.getElementById(buttonId);
    if (btn) btn.textContent = v || '— existing —';
  });
}
function setAuthStatus(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

async function handleSignIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  setAuthStatus('');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) setAuthStatus(error.message);
}

async function handleSignUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  setAuthStatus('');
  const { error } = await sb.auth.signUp({ email, password });
  if (error) { setAuthStatus(error.message); return; }
  setAuthStatus('Account created. Check your email to confirm, then sign in.');
}

async function handleSignOut() {
  await sb.auth.signOut();
}

// The reset link comes back to this same page; Supabase must list this URL
// under Authentication > URL Configuration > Redirect URLs, or it falls back
// to the project's Site URL.
async function handleForgotPassword() {
  const email = document.getElementById('auth-email').value.trim();
  const info = document.getElementById('auth-status');
  setAuthStatus('');
  if (!email) { setAuthStatus('Enter your email above, then click "Forgot password?" again.'); return; }
  info.textContent = 'Sending…';
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) { info.textContent = ''; setAuthStatus(error.message); return; }
  info.textContent = 'If that email has an account, a reset link is on its way. Open it to set a new password.';
}

async function handleSetNewPassword() {
  const password = document.getElementById('reset-password').value;
  const confirm = document.getElementById('reset-password-confirm').value;
  const err = document.getElementById('reset-error');
  const fail = msg => { err.textContent = msg; err.style.display = 'block'; };
  err.style.display = 'none';
  if (password.length < 6) { fail('Use at least 6 characters.'); return; }
  if (password !== confirm) { fail("The two passwords don't match."); return; }
  const { error } = await sb.auth.updateUser({ password });
  if (error) { fail(error.message); return; }
  passwordRecoveryPending = false;
  hideResetGate();
  bootOnce();
}

function bootOnce() {
  if (bootStarted) return;
  bootStarted = true;
  handleSignedIn();
}

async function fetchProfile(retries = 4) {
  for (let i = 0; i < retries; i++) {
    const { data, error } = await sb.from('profiles')
      .select('id, email, approved, is_admin')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (error) { console.error('Failed to load profile', error); return null; }
    if (data) return data;
    await new Promise(r => setTimeout(r, 500)); // profile row is created by a DB trigger, may lag a signup by a beat
  }
  return null;
}

async function handleSignedIn() {
  currentProfile = await fetchProfile();
  if (!currentProfile || !(currentProfile.approved || currentProfile.is_admin)) {
    showPendingGate();
    return;
  }
  hidePendingGate();
  const adminBtn = document.getElementById('admin-panel-btn');
  if (adminBtn) adminBtn.style.display = currentProfile.is_admin ? 'inline-block' : 'none';
  await loadState();
  await fetchMyGroups();
  // The old "last exported" date lived in the browser; it's no longer used
  try { localStorage.removeItem('gs_last_export'); } catch (e) {}
  loadData().then(() => {
    if (removeAutoHandFootForAll()) { saveState(); if (typeof renderApp === 'function') renderApp(); }
  }).catch(err => {
    document.getElementById('main').innerHTML = `<div style="padding:40px;color:var(--red-b)">
      <strong>Could not load data.</strong><br><br>${err.message}
    </div>`;
  });
}

// Hand/Foot is NOT an inventory item. Anyone with experience in Basic Martial
// artist always has hands and feet to fight with, so the Combat page and the
// print sheet show an automatic Hand/Foot weapon for them, built from the
// weapon catalog's Hand stats. Returns an item-shaped object (never stored in
// the inventory), or null for anyone without martial arts experience.
function handFootWeapon(char) {
  const martial = ((char && char.skills) || []).find(s => s.skillName === 'Basic Martial artist');
  if (!martial || !(parseFloat(martial.rawXP) > 0)) return null;
  const def = (typeof WEAPONS !== 'undefined' ? WEAPONS : []).find(w => w.name === 'Hand');
  if (!def) return null;
  return {
    name: 'Hand/Foot', type: 'Weapon', qty: 1, weight: 0, automatic: true,
    weaponClass: 'Basic Martial artist', weaponModel: def.name,
    stn1h: def.stn_1h, stn2h: def.stn_2h, stmod: def.stmod, cdn1h: def.cdn_1h, cdn2h: def.cdn_2h, cdmod: def.cdmod,
    damageDice: def.damage_dice, dividingDie: def.dividing_die,
    speedMissile: def.speed_missile, speedMelee: def.speed_melee, speedReadied: def.speed_readied,
    // The catalog's Hand has a -3 threat range; a trained martial artist's hands and feet are +1.
    weaponProtection: def.protection, threatRange: 1, range: def.range,
    magicBonusToHit: '0', magicDamageAfterDivider: '0',
    parryPointsUsed: char.handFootParryUsed || 0
  };
}

// A shield whose catalog entry has weapon stats (a spiked shield) is also a
// weapon, with no second inventory item: the Combat page and the print sheet
// show its spike automatically wherever the shield is. Returns an item-shaped
// weapon built from the shield item at index idx (never stored), or null.
function shieldWeaponItem(char, idx) {
  const it = char && char.items && char.items[idx];
  if (!it || it.type !== 'Shield') return null;
  const def = (typeof SHIELDS !== 'undefined' ? SHIELDS : []).find(s => s.name === (it.shieldType || it.name));
  if (!def || !def.weapon) return null;
  const wp = def.weapon;
  return {
    name: (it.name || def.name) + ' (spike)', type: 'Weapon', qty: 1, weight: 0, automatic: true, shieldWeapon: true, shieldIdx: idx,
    weaponClass: 'Basic Shield Use', weaponModel: def.name,
    stn1h: wp.stn_1h, stn2h: 0, stmod: wp.stmod, cdn1h: wp.cdn_1h, cdn2h: 0, cdmod: wp.cdmod,
    damageDice: wp.damage_dice, dividingDie: wp.dividing_die,
    speedMissile: 0, speedMelee: wp.speed_melee, speedReadied: 0,
    weaponProtection: 0, threatRange: 0, range: 0,
    magicBonusToHit: '0', magicDamageAfterDivider: '0',
    parryPointsUsed: it.spikeParryUsed || 0, collapsed: !!it.spikeCollapsed, wielded: !!it.wielded, notes: ''
  };
}
function shieldWeaponItems(char) {
  return ((char && char.items) || []).map((_, i) => shieldWeaponItem(char, i)).filter(Boolean);
}
// Every weapon the character can fight with: weapon items, the automatic
// Hand/Foot, and the spikes of spiked shields.
function allCombatWeapons(char) {
  return ((char && char.items) || []).filter(it => it.type === 'Weapon')
    .concat(handFootWeapon(char) ? [handFootWeapon(char)] : [])
    .concat(shieldWeaponItems(char));
}

// An earlier version added Hand/Foot to the inventory as a real item. Take
// those back out (only the ones it added itself, recognised by their note).
const AUTO_HANDFOOT_NOTE = 'Unarmed -- hands and feet. Added automatically with Basic Martial artist.';
function removeAutoHandFootItems(char) {
  if (!char) return false;
  let changed = false;
  if (char.items) {
    // Also the unedited "open hand" weapon the old-spreadsheet import gave martial artists:
    // Hand/Foot is automatic now, so that one is redundant.
    const oldImportedOpenHand = it => it.type === 'Weapon' && /^open hand$/i.test(String(it.name || '').trim()) &&
      it.weaponClass === 'Basic Martial artist' && !it.weaponModel && /^Old sheet damage 3-8\/d6/.test(String(it.notes || ''));
    const kept = char.items.filter(it => !(it.type === 'Weapon' && it.name === 'Hand/Foot' && it.notes === AUTO_HANDFOOT_NOTE) && !oldImportedOpenHand(it));
    if (kept.length !== char.items.length) { char.items = kept; changed = true; }
  }
  if (char.handFootGranted !== undefined) { delete char.handFootGranted; changed = true; }
  return changed;
}

// Weapon choices for a weapon class. Two overlaps: martial arts and daggers
// (every weapon marked "(martial)" and the Katar is a choice under both Martial
// artist and Dagger), and the Quarterstaff and War Staff, which can be used as
// a Spear, a Pole Arm or a Martial weapon.
function weaponModelsForClass(weaponClass, catName) {
  const sharesMartialAndDagger = w => /martial|katar/i.test(w.name);
  const isMartialOrDagger = weaponClass === 'Basic Martial artist' || weaponClass === 'Basic Dagger';
  const sharesStaff = w => /^quarterstaff$|^war staff/i.test(w.name);
  const isStaffClass = weaponClass === 'Basic Spears' || weaponClass === 'Basic Pole Weapons' || weaponClass === 'Basic Martial artist';
  const seen = new Set();
  return WEAPONS.filter(w =>
    w.category === catName ||
    (isMartialOrDagger && sharesMartialAndDagger(w) && (w.category === 'Martial' || w.category === 'Daggers')) ||
    (isStaffClass && sharesStaff(w) && (w.category === 'Spears' || w.category === 'Pole Arms'))
  ).filter(w => !seen.has(w.name) && seen.add(w.name));
}
// The automatic Hand/Foot weapon's panel on the Combat page: same numbers as
// any weapon, but read-only (it is not an inventory item) apart from how many
// Parry points are committed to it.
function renderHandFootPanel(char, pos, total) {
  const hf = handFootWeapon(char);
  if (!hf) return '';
  const w = computeWeapon(char, hf);
  const parryCell = `<input type="number" min="0" max="${w.parrySkval}" class="w-sm" value="${w.parryPointsUsed}" onchange="updateHandFootParry(this.value)">`;
  const collapsed = !!char.handFootCollapsed;
  return `
  <div class="panel" style="margin-bottom:10px">
    <div class="panel-header" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap" onclick="toggleHandFootOpen()" title="Click to ${collapsed ? 'open' : 'close'}">
      <span style="font-size:10px;width:10px">${collapsed ? '▶' : '▼'}</span>
      <h2 style="font-size:13px">Hand/Foot</h2><span class="type-badge">Basic Martial artist</span><span class="type-badge" style="color:var(--gold)">automatic</span>
      ${collapsed ? weaponSummaryHtml(hf, w) : ''}
      ${weaponMoveButtonsHtml(pos || 0, total || 1)}
    </div>
    <div class="panel-body" style="display:${collapsed ? 'none' : 'block'}">
      <div class="note" style="margin-bottom:8px;font-style:italic">Comes with Basic Martial artist: always available, no inventory item needed. Damage ${hf.damageDice} / ${hf.dividingDie}, speed ${hf.speedMelee}, threat range ${hf.threatRange}.</div>
      <div class="note">Skill Ability: ${w.baseWeaponSkval} (${hf.weaponClass}) + ${w.singleWeapSpec} (Single Weap Spec) = ${w.skillAbility}</div>
      <hr class="divider">
      <table class="skill-table">
        <thead><tr><th></th><th>To-Hit</th><th>Dmg Bonus</th><th>Speed</th><th>Parry</th><th>Parry Used</th><th>Multiple Attack</th><th>Crit %</th><th>Fumble %</th></tr></thead>
        <tbody>
          <tr>${w.oneHand ? `<td>One-Handed</td><td class="skval-cell">${Math.round(w.oneHand.hit)}</td><td>${Math.round(w.oneHand.dmgBonus)}</td><td>${Math.round(w.oneHand.speed)}</td><td>${w.parrySkval}</td><td>${parryCell}</td><td>${w.multipleAttackSkval}</td><td>${fmtCrit(w.oneHand.critChance)}</td><td>${fmtFumble(w.oneHand.fumbleThreshold)}</td>` : ''}</tr>
        </tbody>
      </table>
      <div class="note">Parry Used is capped at your Parry skill for this weapon; every point subtracts from its To-Hit and adds to your Protection (PR), against melee attacks only.</div>
    </div>
  </div>`;
}

// The spike of a spiked shield, on the Combat page: read-only like Hand/Foot
// (its numbers come from the shield's catalog entry) apart from Parry points.
function renderShieldWeaponPanel(char, entry, pos, total) {
  const sw = entry.it, idx = entry.idx;
  const w = computeWeapon(char, sw);
  const parryCell = `<input type="number" min="0" max="${w.parrySkval}" class="w-sm" value="${w.parryPointsUsed}" onchange="updateShieldSpikeParry(${idx}, this.value)">`;
  return `
  <div class="panel" style="margin-bottom:10px">
    <div class="panel-header" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap" onclick="toggleShieldSpikeOpen(${idx})" title="Click to ${sw.collapsed ? 'open' : 'close'}">
      <span style="font-size:10px;width:10px">${sw.collapsed ? '▶' : '▼'}</span>
      <h2 style="font-size:13px">${escapeHtml(sw.name)}</h2><span class="type-badge">${sw.weaponClass}</span><span class="type-badge" style="color:var(--gold)">from shield</span>${sw.wielded ? '<span class="type-badge" style="color:var(--gold)">wielding</span>' : ''}
      ${sw.collapsed ? weaponSummaryHtml(sw, w) : ''}
      ${weaponMoveButtonsHtml(pos, total)}
    </div>
    <div class="panel-body" style="display:${sw.collapsed ? 'none' : 'block'}">
      <div class="note" style="margin-bottom:8px;font-style:italic">This shield is also a weapon, one-handed only. Damage ${sw.damageDice} / ${sw.dividingDie}, speed ${sw.speedMelee}. Tick Wielding in the Shield Breakdown below to use it.</div>
      <div class="note">Skill Ability: ${w.baseWeaponSkval} (${sw.weaponClass}) + ${w.singleWeapSpec} (Single Weap Spec) = ${w.skillAbility}</div>
      <hr class="divider">
      <table class="skill-table">
        <thead><tr><th></th><th>To-Hit</th><th>Dmg Bonus</th><th>Speed</th><th>Parry</th><th>Parry Used</th><th>Multiple Attack</th><th>Crit %</th><th>Fumble %</th></tr></thead>
        <tbody>
          <tr>${w.oneHand ? `<td>One-Handed${sw.wielded ? ' <span class="type-badge" style="color:var(--gold)">in use</span>' : ''}</td><td class="skval-cell">${Math.round(w.oneHand.hit)}</td><td>${Math.round(w.oneHand.dmgBonus)}</td><td>${Math.round(w.oneHand.speed)}</td><td>${w.parrySkval}</td><td>${parryCell}</td><td>${w.multipleAttackSkval}</td><td>${fmtCrit(w.oneHand.critChance)}</td><td>${fmtFumble(w.oneHand.fumbleThreshold)}</td>` : ''}</tr>
        </tbody>
      </table>
      <div class="note">Parry Used is capped at your Parry skill for this weapon; every point subtracts from its To-Hit and adds to your Protection (PR), against melee attacks only.</div>
    </div>
  </div>`;
}

// The Combat page's weapon list in display order: every weapon item (with its
// index in char.items) plus the automatic Hand/Foot, which sits at
// char.handFootPos among them (first by default).
function combatWeaponEntries(char) {
  const entries = [];
  (char.items || []).forEach((it, idx) => {
    if (it.type === 'Weapon') entries.push({ kind: 'item', idx, it });
    else if (it.type === 'Shield') { const sw = shieldWeaponItem(char, idx); if (sw) entries.push({ kind: 'shield', idx, it: sw }); }
  });
  if (handFootWeapon(char)) {
    const pos = Math.max(0, Math.min(entries.length, parseInt(char.handFootPos) || 0));
    entries.splice(pos, 0, { kind: 'hand' });
  }
  return entries;
}

function weaponMoveButtonsHtml(pos, total) {
  return `<span style="margin-left:auto;display:flex;gap:4px" onclick="event.stopPropagation()">
    <button class="btn btn-dim" style="font-size:10px;padding:1px 6px" ${pos === 0 ? 'disabled' : ''} onclick="moveWeapon(${pos},-1)" title="Move up">▲</button>
    <button class="btn btn-dim" style="font-size:10px;padding:1px 6px" ${pos === total - 1 ? 'disabled' : ''} onclick="moveWeapon(${pos},1)" title="Move down">▼</button>
  </span>`;
}

// What a closed weapon still shows in its header line.
function weaponSummaryHtml(it, w) {
  const bits = [];
  bits.push(w.oneHand ? `to-hit ${Math.round(w.oneHand.hit)}` : (w.twoHand ? `2H to-hit ${Math.round(w.twoHand.hit)}` : 'to-hit —'));
  if (it.damageDice) bits.push(`${it.damageDice} / ${it.dividingDie || '—'}`);
  return `<span class="note" style="font-size:11px">${bits.join(' · ')}</span>`;
}

function toggleWeaponOpen(idx) {
  const char = state.characters[state.activeChar];
  const it = char && char.items && char.items[idx];
  if (!it) return;
  it.collapsed = !it.collapsed;
  saveState();
  renderCombatModule();
}

function toggleHandFootOpen() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  char.handFootCollapsed = !char.handFootCollapsed;
  saveState();
  renderCombatModule();
}

function setAllWeaponsOpen(open) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  for (const it of char.items || []) if (it.type === 'Weapon') it.collapsed = !open; else if (it.type === 'Shield') it.spikeCollapsed = !open;
  char.handFootCollapsed = !open;
  saveState();
  renderCombatModule();
}

// Moves a weapon up or down the list as displayed. Two weapon items trade
// places in the inventory (other items stay put, so ammunition references
// are unaffected); moving past the automatic Hand/Foot just moves its slot.
function moveWeapon(pos, dir) {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const entries = combatWeaponEntries(char);
  const a = entries[pos], b = entries[pos + dir];
  if (!a || !b) return;
  if (a.kind !== 'hand' && b.kind !== 'hand') {
    const items = char.items;
    [items[a.idx], items[b.idx]] = [items[b.idx], items[a.idx]];
  } else if (a.kind === 'hand') {
    char.handFootPos = pos + dir;
  } else {
    char.handFootPos = pos;
  }
  saveState();
  renderCombatModule();
}

function toggleShieldSpikeOpen(idx) {
  const char = state.characters[state.activeChar];
  const it = char && char.items && char.items[idx];
  if (!it) return;
  it.spikeCollapsed = !it.spikeCollapsed;
  saveState();
  renderCombatModule();
}

function updateShieldSpikeParry(idx, value) {
  const char = state.characters[state.activeChar];
  const sw = shieldWeaponItem(char, idx);
  if (!char || !sw) return;
  const cap = computeWeapon(char, { ...sw, parryPointsUsed: 0 }).parrySkval;
  char.items[idx].spikeParryUsed = Math.max(0, Math.min(cap, parseFloat(value) || 0));
  saveState();
  renderCombatModule();
}

function updateHandFootParry(value) {
  const char = state.characters[state.activeChar];
  const hf = handFootWeapon(char);
  if (!char || !hf) return;
  const cap = computeWeapon(char, { ...hf, parryPointsUsed: 0 }).parrySkval;
  char.handFootParryUsed = Math.max(0, Math.min(cap, parseFloat(value) || 0));
  saveState();
  renderCombatModule();
}

function removeAutoHandFootForAll() {
  let changed = false;
  for (const c of Object.values(state.characters || {})) if (removeAutoHandFootItems(c)) changed = true;
  return changed;
}

async function openAdminPanel() {
  if (!currentProfile || !currentProfile.is_admin) return;
  openModal('<h3>Admin</h3><div id="admin-content">Loading…</div>');
  const [{ data: profiles, error: pErr }, { data: chars, error: cErr }] = await Promise.all([
    sb.from('profiles').select('id, email, approved, is_admin, created_at').order('created_at'),
    sb.from('characters').select('id, owner_id, data, updated_at').order('updated_at', { ascending: false })
  ]);
  const content = document.getElementById('admin-content');
  if (!content) return; // modal was closed before the fetch resolved
  if (pErr || cErr) {
    content.innerHTML = `<div style="color:var(--red-b)">Failed to load admin data: ${escapeHtml((pErr||cErr).message)}</div>`;
    return;
  }
  const charsByOwner = {};
  adminCharsCache = {};
  for (const c of chars) {
    (charsByOwner[c.owner_id] = charsByOwner[c.owner_id] || []).push(c);
    adminCharsCache[c.id] = c.data;
  }
  content.innerHTML = profiles.map(p => {
    const myChars = charsByOwner[p.id] || [];
    const charList = myChars.length
      ? '<ul style="margin:4px 0 0 16px;padding:0;font-size:12px;color:var(--text-dim);list-style:none">' +
        myChars.map(c => `<li style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
          <span style="cursor:pointer;color:var(--gold-dim);text-decoration:underline" onclick="viewCharacterReadOnly('${c.id}')">${escapeHtml((c.data && c.data.name) || '(unnamed)')}</span>
          <button class="btn btn-dim" style="font-size:10px;padding:1px 6px" onclick="openAdminTransferModal('${c.id}', '${escapeHtml((c.data && c.data.name) || '(unnamed)').replace(/'/g,"\\'")}')">Transfer</button>
        </li>`).join('') +
        '</ul>'
      : '<div style="font-size:12px;color:var(--text-dim);margin-top:2px">No characters</div>';
    return `
      <div style="border-bottom:1px solid var(--border);padding:8px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div>
            <strong>${escapeHtml(p.email || p.id)}</strong>
            ${p.is_admin ? ' <span style="font-size:10px;color:var(--gold-dim)">(admin)</span>' : ''}
          </div>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap">
            <input type="checkbox" ${p.approved ? 'checked' : ''} onchange="toggleApproval('${p.id}', this.checked)">
            Approved
          </label>
        </div>
        ${charList}
      </div>`;
  }).join('') || '<div>No users yet.</div>';
}

async function toggleApproval(userId, approved) {
  const { error } = await sb.from('profiles').update({ approved }).eq('id', userId);
  if (error) { alert('Failed to update: ' + error.message); }
  openAdminPanel();
}

function openAdminTransferModal(charRowId, charName) {
  openModal(`
    <h3>Transfer "${escapeHtml(charName)}"</h3>
    <div class="form-group" style="margin-bottom:8px"><label>New Owner's Email</label><input class="w-full" id="admin-transfer-email"  type="email"></div>
    <div id="admin-transfer-status" style="font-size:12px;color:var(--red-b);margin-bottom:8px;display:none"></div>
    <div class="modal-actions"><button class="btn btn-dim" onclick="closeModal()">Cancel</button><button class="btn btn-red" onclick="confirmAdminTransfer('${charRowId}')">Transfer</button></div>`);
}

async function confirmAdminTransfer(charRowId) {
  const email = document.getElementById('admin-transfer-email').value.trim();
  const statusEl = document.getElementById('admin-transfer-status');
  statusEl.style.display = 'none';
  if (!email) return;
  const { error } = await sb.rpc('transfer_character_ownership', { p_character_id: charRowId, p_new_owner_email: email });
  if (error) {
    statusEl.textContent = 'Failed to transfer: ' + error.message;
    statusEl.style.display = 'block';
    return;
  }
  closeModal();
  openAdminPanel();
}

function viewCharacterReadOnly(rowId) {
  const char = adminCharsCache[rowId];
  if (!char) return;
  closeModal();
  document.getElementById('main').innerHTML = `
    <div class="panel" style="background:var(--gold);color:#000;padding:8px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <strong>Admin view (read-only) — ${escapeHtml(char.name || 'Unnamed')}</strong>
      <button class="btn btn-dim" onclick="renderApp()">← Back to my characters</button>
    </div>
    <div class="panel admin-readonly-view"><div class="panel-body">${buildCharacterSheetHtml(char)}</div></div>`;
  document.getElementById('sidebar').innerHTML = '<div class="note" style="padding:12px;text-align:center">Viewing another player\'s character (read-only)</div>';
}
