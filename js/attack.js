// ============================================================
// /att -- an attack from the chat, for the "Post as" character.
//   1. pick the weapon (and grip / throw) when more than one is in hand
//   2. roll Multiple Attack (wiki "Multiple attacks") to get the attack count
//   3. each attack: a d100 against the crit and fumble numbers. Then the GM is
//      asked, privately, for the target's modified AV (they adjudicate cover,
//      advanced combat strategies, magic...). The GM's browser works out hit or
//      miss, and a critical's second roll (wiki "Critical Hits"), and sends back
//      only the outcome, so the players never see the AV.
//   4. on a hit, roll the damage: dice over the dividing die, plus the bonus,
//      with the critical's divider reduction and the divider table applied
// The steps are posted to the chat as whispers to the GM (you and the GM see
// them); the end result of each attack ("hits for 14 damage" / "whiffs") is
// posted for the whole group. If no GM answers, "Decide at the table" falls
// back to asking you Hit? yourself.
// ============================================================

let chatAttackDist = '';    // the last distance typed, offered again next time
// How a line reads in the weapon choice and on the card.
function attGripLabel(line) {
  return { 'One-Handed': 'melee, one-handed', 'Two-Handed': 'melee, two-handed', Throw: 'thrown', Missile: 'fired' }[line.grip] || line.grip;
}
let chatPromptResolve = null;

const ATT_ALWAYS_MISS = 93;  // d100 rolls of 93-100 always miss (wiki "Critical Hits")
const att_signed = n => (n < 0 ? '−' : '+') + Math.abs(n);

// ---------- small questions (shown only to you) ----------
// Buttons: [{ label, value }] -> the clicked value, or null if closed.
function chatPromptButtons(title, detail, buttons) {
  return new Promise(resolve => {
    if (chatPromptResolve) chatPromptResolve(null);
    chatPromptResolve = resolve;
    openModal(`
      <h3>${escapeHtml(title)}</h3>
      ${detail ? `<div style="margin-bottom:10px">${detail}</div>` : ''}
      <div class="modal-actions">${buttons.map((b, i) => `<button class="btn ${b.gold ? 'btn-gold' : 'btn-dim'}" onclick="chatPromptDone(${i})">${escapeHtml(b.label)}</button>`).join('')}</div>`);
    chatPromptButtons.buttons = buttons;
  });
}
function chatPromptDone(i) {
  const resolve = chatPromptResolve;
  chatPromptResolve = null;
  const b = chatPromptButtons.buttons && chatPromptButtons.buttons[i];
  closeModal();
  if (resolve) resolve(b ? b.value : null);
}
const attModalOpen = () => document.getElementById('modal-overlay').classList.contains('open');

// ---------- posting ----------
// One template card: rows are [label, text, rolls?]. Each [[...]] in a row's
// text is drawn from that row's rolls, in order (already rolled, so what is
// shown is what was rolled). Whispered to the GM.
async function chatAttackPost(title, rows) {
  const all = [['name', title, []]].concat(rows.map(r => [r[0], r[1], r[2] || []]));
  const inline = [].concat(...all.map(r => r[2]));
  const spans = DiceRoller.findInline(all.map(r => r[1]).join('\n'));
  if (spans.length !== inline.length) throw new Error('Attack card out of step with its rolls');
  const body = '&{template:default} ' + all.map(r => `{{${r[0]}=${r[1]}}}`).join(' ');
  const payload = { template: { name: 'default', rows: all.map(r => [r[0], r[1]]) }, inline, whisper: { characters: [], gm: true } };
  if (chatTalkToMyself) {
    const c = chatPostAsChar();
    chatLocalLine('message', body, { sender_name: c ? c.name : 'GM', payload: Object.assign({}, payload, { whisper: undefined }) });
    return true;
  }
  return chatInsertMessage({ kind: 'message', body, payload });
}

// The end result of an attack, which everyone in the group sees (an emote:
// "Name hits with the Longsword for 14 damage."); the steps above stay between
// you and the GM.
async function chatAttackPublic(text) {
  if (chatTalkToMyself) { const c = chatPostAsChar(); chatLocalLine('emote', text, { sender_name: c ? c.name : 'GM' }); return true; }
  return chatInsertMessage({ kind: 'emote', body: text, payload: null });
}

// ---------- the attack ----------
function attStats(line) {
  if (line.missile) { const m = line.missile; return { hit: m.finalHit, crit: m.critChance, fumble: m.fumbleThreshold }; }
  return { hit: line.v.hit, crit: line.v.critChance, fumble: line.v.fumbleThreshold };
}

// The damage roll's pieces: the dice (with magic added before the divider),
// the dividing die's sides (0 = none) and the flat bonus after it.
function attDamageParts(it, line) {
  if (line.missile) {
    const m = line.missile, ammo = m.ammoItem;
    const dice = [it.damageDice, ammo && ammo.damageDice].map(x => String(x || '').trim()).filter(Boolean).join('+');
    return { dice, before: Math.round(parseFloat(m.magicDmgBefore) || 0), sides: parseFloat(it.dividingDie) || (ammo && parseFloat(ammo.dividingDie)) || 0, after: Math.round(parseFloat(m.dmgAfter) || 0) };
  }
  return { dice: String(it.damageDice || '').trim(), before: Math.round(parseFloat(line.v.dmgBeforeDivider) || 0), sides: parseFloat(it.dividingDie) || 0, after: Math.round(parseFloat(line.v.dmgBonus) || 0) };
}

// Colour for the result line, from the damage dealt and the dividing die that
// came up (eff = the die less any crit reduction; null with no dividing die).
// A damage word and/or a divider word, each picked at random from its list.
const ATT_FLAVOR = {
  huge:     ['thunderous', 'mammoth', 'volcanic', 'cataclysmic', 'earth-shaking', 'titanic', 'colossal', 'monstrous', 'catastrophic', 'tectonic', 'skull-splitting', 'apocalyptic', 'meteoric', 'legendary'],   // over 30
  strong:   ['exceptional', 'pounding', 'punishing', 'brutal', 'crushing', 'savage', 'devastating', 'hammering', 'bone-jarring', 'ferocious', 'mighty', 'merciless', 'heavy-handed', 'hefty'],           // over 20
  mediocre: ['mediocre', 'average', 'pedestrian', 'middling', 'ordinary', 'unremarkable', 'run-of-the-mill', 'so-so', 'workmanlike', 'passable', 'nothing special', 'humdrum', 'serviceable', 'modest'],  // under 10
  low:      ['sad', 'a nick', 'weak', 'weak sauce', 'pitiful', 'a scratch', 'feeble', 'a graze', 'puny', 'measly', 'paltry', 'a pinprick', 'anemic', 'limp', 'meager', 'trifling', 'underwhelming', 'barely a tickle'], // under 5
  wasted:   ['a wasted hit', 'a bad effort', 'poorly struck', 'a sloppy blow', 'badly placed', 'a glancing blow', 'wasted effort', 'a clumsy swing', 'badly angled', 'half-hearted', 'poor form', 'a lazy strike'],  // divider 5 or more
  skilled:  ['well struck', 'skillfully done', 'masterfully done', 'expertly placed', 'a clean strike', 'precisely landed', 'artfully delivered', 'textbook', 'flawlessly executed', 'beautifully struck', 'surgical', 'deftly delivered', 'with great finesse']  // divider under 2, crits included
};
const ATT_HIGH_DIVIDER = 5;
function attFlavor(total, eff) {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const out = [];
  if (total > 30) out.push(pick(ATT_FLAVOR.huge));
  else if (total > 20) out.push(pick(ATT_FLAVOR.strong));
  else if (total < 5) out.push(pick(ATT_FLAVOR.low));
  else if (total < 10) out.push(pick(ATT_FLAVOR.mediocre));
  if (eff !== null && eff !== undefined) {
    if (eff < 2) out.push(pick(ATT_FLAVOR.skilled));
    else if (eff >= ATT_HIGH_DIVIDER) out.push(pick(ATT_FLAVOR.wasted));
  }
  return out;
}

// Rolls the damage. crit = null, or { reduction, dieSides } (see attCrit).
function attDamage(it, line, crit) {
  const p = attDamageParts(it, line);
  if (!p.dice) throw new Error(`${it.name || 'That weapon'} has no damage dice set.`);
  const rows = [];
  const top = DiceRoller.roll(p.before ? `${p.dice}${att_signed(p.before)}` : p.dice);
  rows.push(['Damage dice', `[[${top.expr}]]`, [top]]);
  let base = top.total;
  let note = '';
  let eff = null;
  if (p.sides) {
    const sides = crit && crit.dieSides ? crit.dieSides : p.sides;
    const die = DiceRoller.roll(`1d${sides}`);
    eff = die.total - (crit ? crit.reduction : 0);
    // the wiki's critical divider table: 2 = half, 1 = full, 0 = x2, -1 = x3 ...
    base = eff >= 1 ? top.total / eff : top.total * (2 - eff);
    const how = crit && crit.reduction
      ? ` − ${crit.reduction} = ${eff}${eff >= 1 ? ` → ÷${eff}` : ` → ×${2 - eff}`}`
      : (eff >= 1 ? ` → ÷${eff}` : '');
    rows.push(['Dividing die', `[[${die.expr}]]${sides !== p.sides ? ` (d${sides} after the crit)` : ''}${how}`, [die]]);
  } else if (crit) note = ' (no dividing die, so the crit adds nothing)';
  if (p.after) rows.push(['Bonus', att_signed(p.after)]);
  const raw = base + p.after;
  const total = Math.max(0, Math.round(raw));
  rows.push(['Damage', `**${total}**${Math.abs(raw - total) > 0.005 ? ` (${Math.round(raw * 100) / 100} before rounding)` : ''}${note}`]);
  return { rows, total, eff };
}

// The GM's side of an attack roll: given the request and the target's AV,
// is it a hit, and for a critical how did the second roll go (wiki "Critical
// Hits": −2 on the dividing die for a hit, one more per full 25 under).
function attGMResolve(rq, av) {
  const needed = Math.round(rq.hit + av);
  const hits = n => n <= needed && n < ATT_ALWAYS_MISS;
  if (!rq.crit) return { needed, hit: hits(rq.roll) };
  const second = DiceRoller.roll('1d100');
  const secondHit = hits(second.total);
  return { needed, hit: true, second, secondHit, reduction: secondHit ? 2 + Math.floor((needed - second.total) / 25) : 0 };
}

// A critical's second roll (from the GM's answer, or rolled here when the GM
// is leaving it to the table) and any rare-crit bonuses (wiki "Critical Hits").
function attCrit(first, stats, sides, gm) {
  const second = gm ? gm.second : DiceRoller.roll('1d100');
  const rows = [];
  let reduction = 0;
  if (gm) {
    reduction = gm.reduction;
    rows.push(['Second roll', `[[${second.expr}]] → ${gm.secondHit ? `hit: dividing die −${reduction}` : 'missed: no dividing die bonus'}`, [second]]);
  } else {
    rows.push(['Second roll', `[[${second.expr}]] — the GM says whether it hit, and by how much`, [second]]);
  }
  let dieSides;
  // Only for a crit chance of 7+: a first roll of 4 or less drops the dividing die
  if (first <= 4 && stats.crit >= 7 && sides) {
    dieSides = sides > 4 ? 4 : Math.max(1, sides - 1);
    rows.push(['Lucky crit', `Roll of ${first}: the dividing die drops to d${dieSides}`]);
  }
  if (first <= 1 && stats.crit >= 7) rows.push(['The chink', "Rolled 1: the target's armor protects only its minimum, (PR−10)÷6"]);
  return { rows, reduction, dieSides, second: second.total };
}

// Fallback when the GM leaves it to the table: the dividing-die reduction for
// a critical whose second roll the GM judges aloud.
async function attAskCritReduction(label, secondRoll) {
  const hit = await chatPromptButtons(`${label}: critical — second roll`,
    `Second to-hit roll: <b>${secondRoll}</b>. Ask the GM: did it hit?`,
    [{ label: 'It hit', value: true, gold: true }, { label: 'It missed', value: false }]);
  if (hit === null) return null;
  if (!hit) return { reduction: 0, text: 'The second roll missed: no dividing die bonus.' };
  const under = await chatAsk(`How many points under the needed roll did it land? (the GM tells you; 0 if not told) — ${label}`, null, '0');
  if (under === null) return null;
  const pts = Math.max(0, Math.floor(parseFloat(under) || 0));
  const reduction = 2 + Math.floor(pts / 25);
  return { reduction, text: `The second roll hit${pts ? `, ${pts} under` : ''}: dividing die −${reduction}.` };
}

// ---------- asking the GM for the AV ----------
// The attacker's browser posts a whispered request (payload.att_req); the GM's
// chat window shows a private prompt and answers with a whisper back to the
// attacker (payload.att_reply) that the chat never displays. The reply holds
// only the outcome, never the AV.
const chatAttPending = {};       // request id -> resolve(reply), on the attacker's side
const chatAttSeen = new Set();   // request ids already shown to this GM
const chatAttGMQueue = [];
let chatAttGMBusy = false;
let chatAttGMLastAV = '';
const chatAttGMPrompt = { resolve: null };   // the open GM prompt's resolver
let chatAttWatch = null;         // interval noticing a modal closed without an answer

// Resolves to the GM's outcome, { manual: true } (decide at the table) or
// null (cancel the attack).
async function attAskGM(rq) {
  if (chatTalkToMyself) return { manual: true };
  // The GM attacking (an NPC, or their own character) is also the one who knows
  // the AV: ask right here, with no request message to send and wait for.
  if (chatIsGM()) {
    const answer = await attGMPrompt(rq, true);
    if (!answer) return null;
    if (answer.manual) return { manual: true };
    return attGMOutcome(rq, answer.av);
  }
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
  const answered = new Promise(res => { chatAttPending[id] = res; });
  const body = `⚔ ${rq.who} rolled ${rq.roll} to hit (${rq.hit}) with the ${rq.weapon}${rq.crit ? ' — a critical' : ''}. Waiting for the GM's AV.`;
  const ok = await chatInsertMessage({ kind: 'message', body, payload: { att_req: Object.assign({ id }, rq), whisper: { characters: [], gm: true } } });
  if (!ok) { delete chatAttPending[id]; return null; }
  const choice = new Promise(res => {
    if (chatPromptResolve) chatPromptResolve(null);
    chatPromptResolve = null;
    openModal(`
      <h3>${escapeHtml(rq.label)}: waiting for the GM</h3>
      <div style="margin-bottom:10px">You rolled <b>${rq.roll}</b>. The GM is working out the target's AV and will be asked in their chat window.</div>
      <div class="modal-actions"><button class="btn btn-dim" onclick="chatAttWaitDone('cancel')">Cancel the attack</button><button class="btn btn-dim" onclick="chatAttWaitDone('manual')">Decide at the table instead</button></div>`);
    chatAttWaitDone.resolve = res;
    clearInterval(chatAttWatch);
    chatAttWatch = setInterval(() => { if (!attModalOpen()) { clearInterval(chatAttWatch); if (chatAttWaitDone.resolve === res) { chatAttWaitDone.resolve = null; res('cancel'); } } }, 400);
  });
  const r = await Promise.race([answered, choice]);
  delete chatAttPending[id];
  clearInterval(chatAttWatch);
  chatAttWaitDone.resolve = null;
  if (r && typeof r === 'object') { if (attModalOpen()) closeModal(); return r.manual ? { manual: true } : r; }
  return r === 'manual' ? { manual: true } : null;
}
function chatAttWaitDone(which) {
  const res = chatAttWaitDone.resolve;
  chatAttWaitDone.resolve = null;
  closeModal();
  if (res) res(which);
}

// Called for every chat row that arrives (and for your own posts).
function chatAttHandleIncoming(msg) {
  const p = msg && msg.payload;
  if (!p) return;
  if (p.att_reply) {
    const res = chatAttPending[p.att_reply.req];
    if (res) res(p.att_reply);
    return;
  }
  // Only the chat window prompts, so a GM with both windows open is asked once.
  if (p.att_req && CHAT_WINDOW && msg.group_id === chatGroupId && chatIsGM() && !chatAttSeen.has(p.att_req.id)) {
    chatAttSeen.add(p.att_req.id);
    chatAttGMQueue.push(msg);
    chatAttGMDrain();
  }
}
// Requests posted while the GM's chat window was closed (last 15 minutes).
function chatAttScanHistory() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const m of chatMessages) {
    const rq = m.payload && m.payload.att_req;
    if (!rq || chatAttSeen.has(rq.id) || new Date(m.created_at).getTime() < cutoff) continue;
    if (chatMessages.some(x => x.payload && x.payload.att_reply && x.payload.att_reply.req === rq.id)) continue;
    chatAttHandleIncoming(m);
  }
}

async function chatAttGMDrain() {
  if (chatAttGMBusy) return;
  chatAttGMBusy = true;
  try {
    while (chatAttGMQueue.length) await chatAttGMAnswer(chatAttGMQueue.shift());
  } finally {
    chatAttGMBusy = false;
  }
}

// The GM's AV popup. selfRun: the GM is the one attacking (an NPC), so the
// skip button reads differently. Resolves to { av }, { manual: true } or null.
async function attGMPrompt(rq, selfRun) {
  while (attModalOpen()) await new Promise(r => setTimeout(r, 500));   // don't cut in on another popup
  const answer = await new Promise(resolve => {
    chatAttGMPrompt.resolve = resolve;
    openModal(`
      <h3>⚔ ${escapeHtml(rq.who)} attacks — the target's AV</h3>
      <div style="margin-bottom:8px">${escapeHtml(rq.weapon)} · ${escapeHtml(rq.label)}<br>
        Rolled <b>${rq.roll}</b> to hit. To hit is <b>${rq.hit}</b> before the target's AV; crit on ${rq.critAt} or less.${rq.crit ? ' <b>A critical:</b> its second roll is made for you.' : ''}</div>
      <div class="form-group"><label>Target's AV with everything that applies${selfRun ? '' : ' (the players never see it)'}</label>
        <input id="att-gm-av" type="number" class="w-sm" value="${escapeHtml(chatAttGMLastAV)}" onkeydown="if(event.key==='Enter')chatAttGMDone('av')"></div>
      <div class="modal-actions"><button class="btn btn-dim" onclick="chatAttGMDone('manual')">${selfRun ? "Skip the AV: I'll say hit or miss" : 'Leave it to the table'}</button><button class="btn btn-gold" onclick="chatAttGMDone('av')">Resolve</button></div>`);
    const el = document.getElementById('att-gm-av');
    if (el) { el.focus(); el.select(); }
    clearInterval(chatAttWatch);
    chatAttWatch = setInterval(() => { if (!attModalOpen()) { clearInterval(chatAttWatch); if (chatAttGMPrompt.resolve === resolve) { chatAttGMPrompt.resolve = null; resolve(null); } } }, 400);
  });
  clearInterval(chatAttWatch);
  return answer;
}

// Hit or miss (and a critical's second roll) against the AV the GM gave; the
// GM also gets a private line saying how it worked out.
function attGMOutcome(rq, av) {
  chatAttGMLastAV = String(av);
  const res = attGMResolve(rq, av);
  chatLocalLine('system', `⚔ ${rq.who}: rolled ${rq.roll} against ${res.needed} (to hit ${rq.hit} + AV ${av}) — ${rq.crit ? `critical, second roll ${res.second.total} ${res.secondHit ? 'hit' : 'missed'}` : res.hit ? 'hit' : 'miss'}. Only you see this.`);
  return res.second ? { hit: true, second: res.second, secondHit: res.secondHit, reduction: res.reduction } : { hit: res.hit };
}

async function chatAttGMAnswer(msg) {
  const rq = msg.payload.att_req;
  const answer = await attGMPrompt(rq, false);
  if (!answer) return;   // closed without answering: the attacker can still decide at the table
  const payload = { att_reply: Object.assign({ req: rq.id }, answer.manual ? { manual: true } : attGMOutcome(rq, answer.av)) };
  payload.whisper = { characters: msg.character_id ? [msg.character_id] : [], gm: false };
  await chatInsertMessage({ kind: 'message', body: '⚔ attack resolved', payload });
}
function chatAttGMDone(which) {
  const resolve = chatAttGMPrompt.resolve;
  chatAttGMPrompt.resolve = null;
  const el = document.getElementById('att-gm-av');
  const av = el ? parseFloat(el.value) : NaN;
  closeModal();
  if (resolve) resolve(which === 'manual' ? { manual: true } : { av: isNaN(av) ? 0 : av });
}

async function chatAttackRun() {
  try {
    await chatAttackFlow();
  } catch (e) {
    closeModal();
    chatShowStatus(e.message || String(e));
  }
}

// The sheet to attack from: the "Post as" character, or for a GM posting as an
// NPC by name, that NPC's sheet. An NPC another account owns is read from the
// database (a GM can read every character in their group); it is a read-only copy.
async function attSheetFor() {
  const mine = chatPostAsChar();
  if (mine) return mine;
  const sel = document.getElementById('chat-post-as');
  const v = sel ? sel.value : '';
  if (!v.startsWith(CHAT_AS_PREFIX)) return null;
  const name = v.slice(CHAT_AS_PREFIX.length).trim();
  if (!chatIsGM()) return null;
  const row = chatRoster.find(r => (r.name || '').trim().toLowerCase() === name.toLowerCase());
  if (!row) throw new Error(`${name} has no character sheet (a temp character or a Bestiary foe), so there is nothing for /att to attack from.`);
  const { data, error } = await sb.from('characters').select('id, data').eq('id', row.id).single();
  if (error || !data || !data.data) throw new Error(`Couldn't read ${name}'s sheet${error ? ': ' + error.message : ''}.`);
  return data.data;
}

async function chatAttackFlow() {
  const char = await attSheetFor();
  if (!char) throw new Error('/att attacks as a character with a sheet: pick one of your characters under "Post as", or (as GM) an NPC.');

  // 1. the weapon: everything in hand, one choice per grip / throw
  const options = [];
  for (const entry of combatWeaponEntries(char)) {
    const al = weaponAttackLines(char, entry);
    if (!al) continue;
    al.lines.filter(l => l.v || l.missile).forEach(line => options.push({ it: al.it, w: al.w, line, label: `${al.it.name || 'Weapon'} — ${attGripLabel(line)}` }));
  }
  if (!options.length) throw new Error(`${char.name || 'That character'} has no weapon in use. Tick In Use on one of their carried weapons on the Inventory page.`);
  let pick = options[0];
  if (options.length > 1) {
    const i = await chatPromptButtons('Attack with which?', 'Weapons and grips in hand right now.', options.map((o, idx) => ({ label: o.label, value: idx })).concat([{ label: 'Cancel', value: null }]));
    if (i === null) return;
    pick = options[i];
  }
  const { it, w } = pick;
  let line = pick.line;
  // A bow, sling or crossbow shoots loaded ammunition, whose damage adds to the
  // weapon's: without it (or with the wrong kind) there is nothing to shoot.
  if (line.missile && weaponTakesAmmo(it)) {
    const am = line.missile.ammoItem;
    if (!am || am.type !== 'Ammunition') throw new Error(`${it.name || 'That weapon'} has no ammunition loaded. Set it in the weapon's Missile Fire on the Combat page.`);
    if (!ammoFitsWeapon(am, it)) throw new Error(`${am.name || 'That ammunition'} isn't made for the ${it.name || 'weapon'}.`);
  }
  // A shot or throw loses to-hit with distance (the weapon's range), so ask how
  // far; the sheet's Target Distance is left alone.
  let rangeRow = null;
  if (line.missile) {
    const dAnswer = await chatAsk(`Distance to the target (blank for 0) — ${pick.label}`, null, chatAttackDist !== '' ? chatAttackDist : String(it.targetDistance || ''));
    if (dAnswer === null) return;
    chatAttackDist = String(dAnswer).trim();
    const dist = Math.max(0, parseFloat(chatAttackDist) || 0);
    const w2 = computeWeapon(char, Object.assign({}, it, { targetDistance: dist }));
    if (!w2.missile) throw new Error(`${it.name || 'That weapon'} can't be shot or thrown.`);
    line = Object.assign({}, line, { missile: w2.missile });
    const m = w2.missile;
    if (m.effectiveRange > 0) rangeRow = ['Range', `${dist} of ${Math.round(m.effectiveRange)}: to hit × ${Math.round(m.rangeMod * 100) / 100}${m.rangeMod === 0 ? ' (out of range)' : ''}`];
  }
  const stats = attStats(line);
  const toHit = Math.round(stats.hit);
  const critAt = Math.max(0, Math.floor(Math.round(stats.crit)));
  const fumbleAt = Math.min(100, Math.round(stats.fumble));
  const who = char.name || 'Attacker';
  const weaponName = (it.name || 'weapon').replace(/\s*\(spike\)$/i, ' spike');
  const weaponLabel = `${it.name || 'Weapon'} (${attGripLabel(line)})`;

  // 2. Multiple Attack: a d100 at or under the skill gives 2 attacks, +1 per full 25 under
  const skill = Math.round(w.multipleAttackSkval || 0);
  const noMulti = line.grip === 'Throw' ? 'a thrown weapon leaves the hand' : /crossbow/i.test(it.weaponClass || '') ? 'crossbows have to be spanned between shots' : '';
  let attacks = 1;
  const head = [['Weapon', `${it.name || 'Weapon'} — ${attGripLabel(line)}`]];
  if (rangeRow) head.push(rangeRow);
  head.push(['To hit', `${toHit} before the target's AV; crit ≤ ${critAt}, fumble ≥ ${fumbleAt}`]);
  if (noMulti) head.push(['Multiple Attack', `none (${noMulti}): 1 attack`]);
  else if (skill <= 0) head.push(['Multiple Attack', 'no skill: 1 attack']);
  else {
    const m = DiceRoller.roll('1d100');
    attacks = m.total <= skill ? 2 + Math.floor((skill - m.total) / 25) : 1;
    head.push(['Multiple Attack', `[[${m.expr}]] vs skill ${skill} → ${attacks} attack${attacks === 1 ? '' : 's'}`, [m]]);
  }
  if (!await chatAttackPost(`⚔ ${who} attacks`, head)) return;

  // 3. each attack, resolved in full
  for (let n = 1; n <= attacks; n++) {
    const label = attacks > 1 ? `Attack ${n} of ${attacks}` : 'Attack';
    const r = DiceRoller.roll(`1d100cs<${critAt}cf>${fumbleAt}`);
    const v = r.total;
    const fumble = v >= fumbleAt;
    const crit = !fumble && v <= critAt;
    const rows = [['Roll', `[[${r.expr}]]`, [r]]];

    if (fumble) {
      rows.push(['Fumble!', 'The attack misses and the attacks left in this sequence are lost. Reflex roll −25: made → next initiative +3; missed → slipped and fell, next initiative +3 and another d8+3.']);
      if (v >= 97) {
        const again = DiceRoller.roll(`1d100cf>${fumbleAt}`);
        rows.push(['Roll of 97+', `Rolls to hit again: [[${again.expr}]] — ${again.total >= fumbleAt ? 'fumbled again: hits themselves for full damage (or 50/50 with a PC fighting close by)' : 'the GM says if it hits (a miss throws the weapon)'}`, [again]]);
      }
      await chatAttackPost(`${label}: FUMBLE`, rows);
      await chatAttackPublic(`fumbles with the ${weaponName}!`);
      return;
    }

    // the GM supplies the target's AV in private and gets back only the outcome
    const res = await attAskGM({ who, weapon: weaponName, label, roll: v, hit: toHit, critAt, crit });
    if (res === null) return;

    let hit, critInfo = null;
    const sides = attDamageParts(it, line).sides;
    if (!res.manual) {
      hit = res.hit;
      if (crit) critInfo = attCrit(v, { crit: Math.round(stats.crit) }, sides, res);
    } else if (crit) {
      // left to the table: the second roll is made here and the GM's verdict asked for
      hit = true;
      critInfo = attCrit(v, { crit: Math.round(stats.crit) }, sides, null);
      const judged = await attAskCritReduction(label, critInfo.second);
      if (judged === null) return;
      critInfo.reduction = judged.reduction;
      critInfo.rows.push(['Second roll result', judged.text]);
    } else {
      const answer = await chatPromptButtons(`${label}: Hit?`,
        chatIsGM() ? `Rolled <b>${v}</b> (to hit ${toHit} before the target's AV). Did it hit?` : `You rolled <b>${v}</b> (to hit ${toHit} before the target's AV). The GM knows the AV: did it hit?`,
        [{ label: 'Hit', value: 'y', gold: true }, { label: 'Miss', value: 'n' }, { label: 'Stop (target down)', value: 'stop' }]);
      if (answer === null) return;
      if (answer === 'stop') { await chatAttackPost(`${label}: stopped`, [['', 'The target is down; the rest of the sequence is lost.']]); return; }
      hit = answer === 'y';
    }
    if (crit) rows.push(['Critical!', 'A critical always hits, and gets a second to-hit roll.'], ...critInfo.rows);

    if (!hit) {
      rows.push(['Result', 'Miss']);
      await chatAttackPost(`${label}: miss`, rows);
      await chatAttackPublic(`whiffs with the ${weaponName}.`);
      continue;
    }

    // 4. damage
    const dmg = attDamage(it, line, critInfo ? { reduction: critInfo.reduction, dieSides: critInfo.dieSides } : null);
    rows.push(...dmg.rows);
    if (!await chatAttackPost(`${label}: ${crit ? 'critical hit' : 'hit'}`, rows)) return;
    const flavor = attFlavor(dmg.total, dmg.eff);
    await chatAttackPublic(`${crit ? 'critically hits' : 'hits'} with the ${weaponName} for ${dmg.total} damage${flavor.length ? ' — ' + flavor.join(', ') : ''}.`);
  }
}
