// ============================================================
// /att -- an attack from the chat, for the "Post as" character.
//   1. pick the weapon (and grip / throw) when more than one is in hand
//   2. roll Multiple Attack (wiki "Multiple attacks") to get the attack count
//   3. each attack: a d100 against the crit and fumble numbers, with the
//      needed to-hit (the sheet's To Hit + the target's AV); a critical gets
//      its second to-hit roll (wiki "Critical Hits"); anything else asks Hit?
//   4. on a hit, roll the damage: dice over the dividing die, plus the bonus,
//      with the critical's divider reduction and the divider table applied
// The questions are shown only to you. Every step is posted to the chat as a
// whisper to the GM (you and the GM see it); the end result of each attack
// ("hits for 14 damage" / "whiffs") is posted for the whole group.
// ============================================================

let chatAttackAV = '';      // the last target AV typed, offered again next time
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

// Rolls the damage. crit = null, or { reduction, dieSides } (see attCrit).
function attDamage(it, line, crit) {
  const p = attDamageParts(it, line);
  if (!p.dice) throw new Error(`${it.name || 'That weapon'} has no damage dice set.`);
  const rows = [];
  const top = DiceRoller.roll(p.before ? `${p.dice}${att_signed(p.before)}` : p.dice);
  rows.push(['Damage dice', `[[${top.expr}]]`, [top]]);
  let base = top.total;
  let note = '';
  if (p.sides) {
    const sides = crit && crit.dieSides ? crit.dieSides : p.sides;
    const die = DiceRoller.roll(`1d${sides}`);
    const eff = die.total - (crit ? crit.reduction : 0);
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
  return { rows, total };
}

// A critical's second roll and any rare-crit bonuses (wiki "Critical Hits").
function attCrit(first, needed, stats, sides) {
  const second = DiceRoller.roll('1d100');
  const ok = second.total <= needed && second.total < ATT_ALWAYS_MISS;
  const reduction = ok ? 2 + Math.floor((needed - second.total) / 25) : 0;
  const rows = [['Second roll', `[[${second.expr}]] vs needed ${needed} → ${ok ? `hit: dividing die −${reduction}` : 'missed: no dividing die bonus'}`, [second]]];
  let dieSides;
  // Only for a crit chance of 7+: a first roll of 4 or less drops the dividing die
  if (first <= 4 && stats.crit >= 7 && sides) {
    dieSides = sides > 4 ? 4 : Math.max(1, sides - 1);
    rows.push(['Lucky crit', `Roll of ${first}: the dividing die drops to d${dieSides}`]);
  }
  if (first <= 1 && stats.crit >= 7) rows.push(['The chink', "Rolled 1: the target's armor protects only its minimum, (PR−10)÷6"]);
  return { rows, reduction, dieSides };
}

async function chatAttackRun() {
  try {
    await chatAttackFlow();
  } catch (e) {
    closeModal();
    chatShowStatus(e.message || String(e));
  }
}

async function chatAttackFlow() {
  const char = chatPostAsChar();
  if (!char) throw new Error('/att attacks as one of your characters. Pick one under "Post as" (not GM or an NPC).');

  // 1. the weapon: everything in hand, one choice per grip / throw
  const options = [];
  for (const entry of combatWeaponEntries(char)) {
    const al = weaponAttackLines(char, entry);
    if (!al) continue;
    al.lines.filter(l => l.v || l.missile).forEach(line => options.push({ it: al.it, w: al.w, line, label: `${al.it.name || 'Weapon'} — ${line.grip}` }));
  }
  if (!options.length) throw new Error('No weapon in use. Tick In Use on a carried weapon on the Inventory page.');
  let pick = options[0];
  if (options.length > 1) {
    const i = await chatPromptButtons('Attack with which?', 'Weapons and grips in hand right now.', options.map((o, idx) => ({ label: o.label, value: idx })).concat([{ label: 'Cancel', value: null }]));
    if (i === null) return;
    pick = options[i];
  }
  const { it, w, line } = pick;
  // A bow, sling or crossbow shoots loaded ammunition, whose damage adds to the
  // weapon's: without it (or with the wrong kind) there is nothing to shoot.
  if (line.missile && weaponTakesAmmo(it)) {
    const am = line.missile.ammoItem;
    if (!am || am.type !== 'Ammunition') throw new Error(`${it.name || 'That weapon'} has no ammunition loaded. Set it in the weapon's Missile Fire on the Combat page.`);
    if (!ammoFitsWeapon(am, it)) throw new Error(`${am.name || 'That ammunition'} isn't made for the ${it.name || 'weapon'}.`);
  }
  const stats = attStats(line);

  // the target's AV is added to the to-hit needed
  const avAnswer = await chatAsk(`Target's AV (blank for 0) — attacking with ${pick.label}`, null, chatAttackAV);
  if (avAnswer === null) return;
  chatAttackAV = String(avAnswer).trim();
  const av = parseFloat(chatAttackAV) || 0;
  const needed = Math.round(stats.hit + av);
  const critAt = Math.max(0, Math.floor(Math.round(stats.crit)));
  const fumbleAt = Math.min(100, Math.round(stats.fumble));
  const who = char.name || 'Attacker';
  const weaponName = (it.name || 'weapon').replace(/\s*\(spike\)$/i, ' spike');

  // 2. Multiple Attack: a d100 at or under the skill gives 2 attacks, +1 per full 25 under
  const skill = Math.round(w.multipleAttackSkval || 0);
  const isThrow = line.grip === 'Throw';
  const noMulti = isThrow ? 'a thrown weapon leaves the hand' : /crossbow/i.test(it.weaponClass || '') ? 'crossbows have to be spanned between shots' : '';
  let attacks = 1;
  const head = [['Weapon', `${it.name || 'Weapon'} — ${line.grip}`], ['To hit', `${Math.round(stats.hit)}${av ? ` + AV ${av}` : ''} = ${needed}; crit ≤ ${critAt}, fumble ≥ ${fumbleAt}`]];
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
    const roughHit = v <= needed && v < ATT_ALWAYS_MISS;
    const rows = [['Roll', `[[${r.expr}]] vs needed ${needed}`, [r]]];

    if (fumble) {
      rows.push(['Fumble!', 'The attack misses and the attacks left in this sequence are lost. Reflex roll −25: made → next initiative +3; missed → slipped and fell, next initiative +3 and another d8+3.']);
      if (v >= 97) {
        const again = DiceRoller.roll(`1d100cf>${fumbleAt}`);
        const out = again.total >= fumbleAt ? 'fumbled again: hits themselves for full damage (or 50/50 with a PC fighting close by)'
          : again.total <= needed && again.total < ATT_ALWAYS_MISS ? 'hits: the weapon is kept' : 'misses: the weapon is thrown';
        rows.push(['Roll of 97+', `Rolls to hit again: [[${again.expr}]] — ${out}`, [again]]);
      }
      await chatAttackPost(`${label}: FUMBLE`, rows);
      await chatAttackPublic(`fumbles with the ${weaponName}!`);
      return;
    }

    let critInfo = null;
    if (crit) {
      critInfo = attCrit(v, needed, { crit: Math.round(stats.crit) }, attDamageParts(it, line).sides);
      rows.push(['Critical!', 'A critical always hits, and gets a second to-hit roll.'], ...critInfo.rows);
      if (!await chatAttackPost(`${label}: CRITICAL`, rows)) return;
    } else {
      rows.push(['Looks like', roughHit ? 'a hit' : v >= ATT_ALWAYS_MISS ? 'a miss (93+ always misses)' : 'a miss']);
      if (!await chatAttackPost(label, rows)) return;
      const answer = await chatPromptButtons(`${label}: Hit?`,
        `You rolled <b>${v}</b> against <b>${needed}</b> — ${roughHit ? 'that looks like a hit' : 'that looks like a miss'}. Did it hit?`,
        [{ label: 'Hit', value: 'y', gold: roughHit }, { label: 'Miss', value: 'n', gold: !roughHit }, { label: 'Stop (target down)', value: 'stop' }]);
      if (answer === null || answer === 'stop') { if (answer === 'stop') await chatAttackPost(`${label}: stopped`, [['', 'The target is down; the rest of the sequence is lost.']]); return; }
      if (answer === 'n') {
        await chatAttackPost(`${label}: miss`, []);
        await chatAttackPublic(`whiffs with the ${weaponName}.`);
        continue;
      }
    }

    // 4. damage
    const dmg = attDamage(it, line, critInfo ? { reduction: critInfo.reduction, dieSides: critInfo.dieSides } : null);
    if (!await chatAttackPost(`${label}: ${crit ? 'critical damage' : 'hit, damage'}`, dmg.rows)) return;
    await chatAttackPublic(`${crit ? 'critically hits' : 'hits'} with the ${weaponName} for ${dmg.total} damage.`);
  }
}
