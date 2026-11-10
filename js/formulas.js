// ============================================================
// FORMULA ENGINE
// ============================================================
function evalAttmod(formula, attrs) {
  if (!formula || !formula.trim()) return 0;
  let f = formula
    .replace(/W!/gi, 'WI')
    .replace(/\bST\b/gi, attrs.ST || 10)
    .replace(/\bIN\b/gi, attrs.IN || 10)
    .replace(/\bWI\b/gi, attrs.WI || 10)
    .replace(/\bCD\b/gi, attrs.CD || 10)
    .replace(/\bHE\b/gi, attrs.HE || 10)
    .replace(/\bHL\b/gi, attrs.HE || 10)
    .replace(/\bCH\b/gi, attrs.CH || 10)
    .replace(/\bAP\b/gi, attrs.AP || 10);
  if (!/^[\d\s\.\+\-\*\/\(\)]+$/.test(f)) return 0;
  try { return Function('"use strict";return(' + f + ')')(); }
  catch(e) { return 0; }
}

function lookupLevel(adjXP) {
  let lv = 0;
  for (const row of LEVELS) {
    if (adjXP >= row.from) lv = row.level;
    else break;
  }
  return lv;
}

function computeSkillValues(skillInst, character, allSkillInsts) {
  const skillDef = findSkillDef(skillInst.skillName);
  // Not in the skill catalog: nothing can be calculated (flagged where it's shown)
  if (!skillDef) return { expmod: 0, adjXP: 0, level: 0, attribBonus: 0, dropdownBonus: 0, rollTotal: 0, skval: 0,
                          guildBase: 0, attmodResult: 0, racialExpmod: 0, notInCatalog: true };

  const attrs = character.attrs || {};
  const attmodResult = evalAttmod(skillDef.attmod, attrs);
  const guildBase = getGuildBase(skillInst.guildName, skillInst.skillName, skillInst.binding);
  const racialExpmod = parseFloat(skillInst.racialExpmod) || 0;
  const expmod = Math.max(0, guildBase + attmodResult + racialExpmod);
  const rawXP = parseFloat(skillInst.rawXP) || 0;
  const adjXP = rawXP * expmod;
  const level = lookupLevel(adjXP);

  // Attrib bonus: max(0, attmodResult) * base, only if positive
  const attribBonus = attmodResult > 0 ? Math.round(attmodResult * (skillDef.base || 0)) : 0;

  // Dropdown bonus: parent skval * dropdown%
  let dropdownBonus = 0;
  if (skillDef.dropdown && skillInst.parentSkillId) {
    const parentInst = allSkillInsts.find(s => s.id === skillInst.parentSkillId);
    if (parentInst) {
      const parentVals = computeSkillValues(parentInst, character, allSkillInsts);
      dropdownBonus = Math.round(parentVals.skval * skillDef.dropdown);
    }
  }

  // Roll total
  const rolls = skillInst.rolls || [];
  const rollTotal = rolls.reduce((sum, v) => sum + (parseInt(v) || 0), 0);

  // Bonuses
  const bonuses = (parseFloat(skillInst.bonusItem)||0) + (parseFloat(skillInst.bonusRace)||0) +
                  (parseFloat(skillInst.bonusMagic)||0) + (parseFloat(skillInst.bonusOther)||0);

  // Special HP minimum
  const isHP = skillDef.name === 'Hit Points';
  let skval = attribBonus + (skillInst.dropdownOnly ? 0 : rollTotal) + dropdownBonus + bonuses;
  if (isHP) skval = Math.max(2, skval);

  return { expmod, adjXP, level, attribBonus, dropdownBonus, rollTotal, skval,
           attmodResult, guildBase, racialExpmod };
}

// Most guilds grant one flat bonus per skill, but a few grant a different
// rate depending on which weapon (or Basic Martial artist) the skill is
// bound to -- e.g. Mysteriarchs of Lathe's Damage Bonus is much better when
// trained unarmed than with any actual weapon. Those are stored as a second,
// binding-specific key ("SkillName|BindingName") alongside the flat one; the
// binding-specific key is checked first and only used for that exact
// binding, so every other binding just falls through to the normal rate.
// A guild's EXPMOD for a skill (GUILDS[guild][skill], or ["skill|binding"] for a
// weapon-bound skill). Guild and skill names are matched ignoring case and
// extra spaces, and the skill also by its catalog name (findSkillDef, which
// follows SKILL_NAME_ALIASES), since guild sheets and characters don't always
// spell things the way the catalog does. Unknown guild or skill: 0.
let guildIndexCache = { source: null, guilds: null };
function guildRateIndex(guildName) {
  if (guildIndexCache.source !== GUILDS || guildIndexCache.guildCount !== Object.keys(GUILDS).length) {
    const guilds = new Map();
    for (const g in GUILDS) { const k = normalizeSkillName(g); if (!guilds.has(k)) guilds.set(k, g); }
    guildIndexCache = { source: GUILDS, guildCount: Object.keys(GUILDS).length, guilds, rates: new Map() };
  }
  const real = GUILDS[guildName] ? guildName : guildIndexCache.guilds.get(normalizeSkillName(guildName));
  if (!real) return null;
  const table = GUILDS[real];
  let entry = guildIndexCache.rates.get(real);
  if (!entry || entry.table !== table || entry.size !== Object.keys(table).length) {
    const map = new Map();
    for (const key in table) { const k = normalizeSkillName(key); if (!map.has(k)) map.set(k, key); }
    entry = { table, size: Object.keys(table).length, map };
    guildIndexCache.rates.set(real, entry);
  }
  return entry;
}
function getGuildBase(guildName, skillName, binding) {
  if (!guildName || !skillName) return 0;
  const idx = guildRateIndex(guildName);
  if (!idx) return 0;
  const def = findSkillDef(skillName);
  const names = [skillName].concat(def && def.name !== skillName ? [def.name] : []);
  const tryKey = key => { const real = idx.map.get(normalizeSkillName(key)); return real === undefined ? undefined : idx.table[real]; }; // read live: values can be edited in place
  if (binding) {
    for (const n of names) { const v = tryKey(n + '|' + binding); if (v !== undefined) return v; }
  }
  for (const n of names) { const v = tryKey(n); if (v !== undefined) return v; }
  return 0;
}

function getSkillSkval(character, skillName) {
  const skills = character.skills || [];
  let si = skills.find(s => s.skillName === skillName);
  if (!si) {
    const target = skillName.toLowerCase();
    si = skills.find(s => s.skillName.toLowerCase() === target);
  }
  if (!si) return 0;
  return computeSkillValues(si, character, skills).skval;
}

function computeCC(character) {
  const a = character.attrs || {};
  const dodge = getSkillSkval(character, 'Dodge');
  const hp = getSkillSkval(character, 'Hit Points');
  const resist = getSkillSkval(character, 'Resist');
  const surpriseSkill = getSkillSkval(character, 'Surprise');
  const basicSocial = getSkillSkval(character, 'Basic social') || getSkillSkval(character, 'Basic Social');
  const b = character.ccBonuses || {};
  return {
    reflex:    { value: Math.round((a.IN||0) + (a.CD||0)*3 + dodge + (parseFloat(b.reflex)||0)), formula: 'IN + (CD×3) + Dodge + Magic Bonus', bonus: parseFloat(b.reflex)||0 },
    fortitude: { value: Math.round((a.ST||0) + (a.HE||0)*2 + hp + (parseFloat(b.fortitude)||0)), formula: 'ST + (HE×2) + HP + Magic Bonus', bonus: parseFloat(b.fortitude)||0 },
    will:      { value: Math.round(((a.IN||0)+(a.WI||0))*2.5 + resist + (parseFloat(b.will)||0)), formula: '(IN+WI)×2.5 + Resist + Magic Bonus', bonus: parseFloat(b.will)||0 },
    surprise:  { value: Math.round((((a.CD||0)*3)+(a.IN||0))/3 + surpriseSkill + (parseFloat(b.surprise)||0)), formula: '((CD×3)+IN)/3 + Surprise + Magic Bonus', bonus: parseFloat(b.surprise)||0 },
    social:    { value: Math.round(((a.CH||0)+(a.AP||0))*2 + (a.WI||0)/4 + basicSocial + (parseFloat(b.social)||0)), formula: '(CH+AP)×2 + WI/4 + Basic Social + Magic Bonus', bonus: parseFloat(b.social)||0 },
  };
}

function computeWeight(character) {
  const a = character.attrs || {};
  const basicMove = getSkillSkval(character, 'Basic Move');
  const ignoreEnc = getSkillSkval(character, 'Ignore encumbrance');
  const possible = Math.round((a.ST||0)*90 + (a.HE||0)*10 + basicMove*10 + ignoreEnc*10);
  const items = character.items || [];
  // Blank location = on the person. A named container also counts if the
  // player marked it "on person" (a backpack they're wearing) -- so they can
  // track its contents without losing the weight.
  // A container ticked "Does not encumber" (a bag of holding) adds none of
  // its contents' weight, on the person or not.
  const onPerson = character.storageOnPerson || {};
  const noEncumber = character.storageNoEncumber || {};
  const carried = items.filter(it => {
    const loc = it.location ? it.location.trim() : '';
    return !loc || (onPerson[loc] && !noEncumber[loc]);
  }).reduce((sum, it) => sum + ((parseFloat(it.weight) || 0) * (parseFloat(it.qty) || 1)), 0);
  return { possible, carried };
}

// Groups items by their storage location (blank = carried on person) so a
// player can see how much is banked or sitting in a given void-space bag,
// separately from what's actually weighing them down. Locations can have a
// capacity limit (character.storageCapacities[location]) -- a real bag of
// holding or satchel only holds so much, even though its contents are
// weightless on the character themselves.
// An inventory entry with nothing filled in at all. The old "Add Item"
// button added one of these as a blank row; they're hidden, not deleted.
function isBlankItem(it) {
  const blank = v => !String(v === undefined || v === null ? '' : v).trim();
  return blank(it.name) && blank(it.notes) && blank(it.location) && !it.masterwork &&
    !it.weaponClass && !it.weaponModel && !it.armorType && !it.shieldType && !it.ammoBase && !it.itemClass && !it.basicItemName && !it.magicItemClass &&
    !(parseFloat(it.weight) > 0) && !(parseFloat(it.worth) > 0);
}

// The location name for items carried on the person (an item with a blank
// location). It is always listed first and can't be renamed or deleted.
const ON_PERSON_LOCATION = 'On Person (Carried)';

// Containers (everything but On Person) in the order the player set with
// the ▲/▼ buttons (character.storageOrder); any not placed yet go after,
// alphabetically.
function orderedContainers(character, names) {
  const order = character.storageOrder || [];
  const rank = n => { const i = order.indexOf(n); return i < 0 ? Infinity : i; };
  return [...names].sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b));
}

function computeStorageSummary(character) {
  const items = (character.items || []).filter(it => !isBlankItem(it));
  const capacities = character.storageCapacities || {};
  const groups = {};
  for (const it of items) {
    const loc = it.location ? it.location.trim() : '';
    const key = loc || 'On Person (Carried)';
    if (!groups[key]) groups[key] = { location: key, count: 0, weight: 0, worth: 0 };
    const qty = parseFloat(it.qty) || 1;
    groups[key].count += qty;
    groups[key].weight += (parseFloat(it.weight) || 0) * qty;
    groups[key].worth += (parseFloat(it.worth) || 0) * qty;
  }
  // On Person is always listed, and so is any container set up with no items in it yet
  if (!groups[ON_PERSON_LOCATION]) groups[ON_PERSON_LOCATION] = { location: ON_PERSON_LOCATION, count: 0, weight: 0, worth: 0 };
  for (const loc of Object.keys(capacities)) {
    if (!groups[loc]) groups[loc] = { location: loc, count: 0, weight: 0, worth: 0 };
  }
  // On Person's capacity is Weight Possible, and what counts against it is
  // Weight Carried (which includes containers marked On Person, e.g. a worn
  // backpack). Other containers: their own capacity, if set, minus their contents.
  const w = computeWeight(character);
  for (const g of Object.values(groups)) {
    const cap = capacities[g.location];
    if (g.location === ON_PERSON_LOCATION) {
      g.capacity = w.possible;
      g.remaining = w.possible - w.carried;
    } else {
      g.capacity = (cap === undefined || cap === null) ? null : parseFloat(cap);
      g.remaining = g.capacity === null ? null : g.capacity - g.weight;
    }
    g.over = g.remaining !== null && g.remaining < 0;
    g.onPerson = g.location === ON_PERSON_LOCATION || !!(character.storageOnPerson || {})[g.location];
    g.noEncumber = g.location !== ON_PERSON_LOCATION && !!(character.storageNoEncumber || {})[g.location];
  }
  const order = orderedContainers(character, Object.keys(groups).filter(l => l !== ON_PERSON_LOCATION));
  return [groups[ON_PERSON_LOCATION], ...order.map(l => groups[l])];
}

function computeSpeed(character) {
  const a = character.attrs || {};
  const speedMove = getSkillSkval(character, 'Speed Move');
  const baseSpeed = (a.CD||0)/4 + 10 + (speedMove/10);
  const w = computeWeight(character);
  const ratio = w.possible > 0 ? Math.max(0, 1 - (w.carried / w.possible)) : 0;
  const adjustedSpeed = baseSpeed * ratio;
  const dashRoutSpeed = adjustedSpeed * 2;
  const dashRoutMaxDistance = ((a.WI||0)/4 + (a.HE||0)) * 4;
  // Other movement (wiki): walking around, for hours, is Adjusted Speed x .5;
  // exploring, watching for traps and dangers, is Adjusted Speed x .33.
  const normalMove = adjustedSpeed * 0.5;
  const exploringMove = adjustedSpeed * 0.33;
  const armoredMoveTrained = (character.skills||[]).some(s => s.skillName === 'Armored Move');
  return { baseSpeed, adjustedSpeed, normalMove, exploringMove, dashRoutSpeed, dashRoutMaxDistance, armoredMoveTrained };
}

function shieldUseBonus(skval, shieldBasePR) {
  const doublingPart = Math.min(skval, shieldBasePR);
  const remainder = Math.max(0, skval - shieldBasePR);
  const ratioPart = Math.floor(remainder / 10);
  return doublingPart + ratioPart;
}

// Crit and fumble show just the number: a roll at or under the crit number
// crits; a roll at or over the fumble number fumbles.
function fmtCrit(critChance) {
  return String(Math.round(critChance));
}
function fmtFumble(fumbleThreshold) {
  return String(Math.min(100, Math.round(fumbleThreshold))); // a d100 tops out at 100 (00)
}

// Same formula as a character weapon's critFumble() inside computeWeapon
// (7 + toHit/10 + .10*crit bonus, capped at toHit/2, floored at 3; fumble
// at 93-up unless toHit itself pushes higher) -- just without the
// character-only pieces (threat range, a Critical Hit Bonus skill value)
// that a Beastiary foe has no equivalent of. Crit Bonus here is a flat
// stat field on the foe instead of a skill value.
function bestiaryCritFumble(toHit, critBonus) {
  const hit = parseFloat(toHit) || 0;
  const rawCrit = 7 + Math.floor(hit/10) + (0.10 * (parseFloat(critBonus) || 0));
  const critChance = Math.max(Math.min(rawCrit, hit/2), 3);
  const fumbleThreshold = Math.max(93, hit);
  const fumbleChance = Math.max(0, 101 - fumbleThreshold);
  return { critChance, fumbleThreshold, fumbleChance };
}

function computeWeapon(character, item) {
  const a = character.attrs || {};
  const stn1h = parseFloat(item.stn1h) || 0;
  const stn2h = parseFloat(item.stn2h) || 0;
  const stmod = parseFloat(item.stmod) || 0;
  const cdn1h = parseFloat(item.cdn1h) || 0;
  const cdn2h = parseFloat(item.cdn2h) || 0;
  const cdmod = parseFloat(item.cdmod) || 0;
  const speedMelee = parseFloat(item.speedMelee) || 0;
  const magicBonusToHit = parseFloat(item.magicBonusToHit) || 0;
  // Magic offense: this weapon's own, plus any non-weapon item in use with offense
  const otherOffense = magicOffenseFromOthers(character);
  // Spells cast onto the character in combat add to the weapons in hand only
  const inHand = item.shieldWeapon ? itemInUse(character, (character.items || [])[item.shieldIdx]) : itemInUse(character, item);
  const spellMods = inHand ? combatSpellMods(character) : { toHit: 0, dmgBefore: 0, dmgAfter: 0, crit: 0 };
  const magicBonusToHitAll = magicBonusToHit + otherOffense.toHit + spellMods.toHit;
  const magicDamageAfterDivider = (parseFloat(item.magicDamageAfterDivider) || 0) + otherOffense.after + spellMods.dmgAfter;
  const magicDamageBeforeDivider = (parseFloat(item.magicDamageBeforeDivider) || 0) + otherOffense.before + spellMods.dmgBefore;
  const magicCritBonus = (parseFloat(item.magicCritBonus) || 0) + otherOffense.crit + spellMods.crit;

  const baseWeaponSkval = item.weaponClass ? getSkillSkval(character, item.weaponClass) : 0;
  const singleWeapSpec = (character.skills||[]).filter(s => s.skillName === 'Single weap spec' && s.binding === item.name)
    .reduce((sum,s) => sum + computeSkillValues(s, character, character.skills||[]).skval, 0);
  const skillAbility = baseWeaponSkval + singleWeapSpec;

  const critHitBonusSkval = (character.skills||[]).filter(s => s.skillName === 'Critical Hit Bonus' && s.binding === item.weaponClass)
    .reduce((sum,s) => sum + computeSkillValues(s, character, character.skills||[]).skval, 0);
  const parrySkval = (character.skills||[]).filter(s => s.skillName === 'Parry' && s.binding === item.weaponClass)
    .reduce((sum,s) => sum + computeSkillValues(s, character, character.skills||[]).skval, 0);
  const multipleAttackSkval = (character.skills||[]).filter(s => s.skillName === 'Multiple attack' && s.binding === item.weaponClass)
    .reduce((sum,s) => sum + computeSkillValues(s, character, character.skills||[]).skval, 0);
  const parryPointsUsed = Math.min(Math.max(0, parseFloat(item.parryPointsUsed) || 0), parrySkval);
  // Wiki "Combat Skills": Damage Bonus gives +1 damage after the dividing die
  // per 10 skill points (no max); Initiative bonus takes 1 off the action speed
  // per 10 skill points (never below 1). Both are bound to the weapon class.
  const boundSkval = name => (character.skills||[]).filter(s => String(s.skillName || '').toLowerCase() === name.toLowerCase() && s.binding === item.weaponClass)
    .reduce((sum,s) => sum + computeSkillValues(s, character, character.skills||[]).skval, 0);
  const damageBonusSkval = boundSkval('Damage Bonus');
  const initiativeBonusSkval = boundSkval('Initiative bonus');
  const skillDamageBonus = Math.floor(damageBonusSkval / 10);
  const skillSpeedBonus = Math.floor(initiativeBonusSkval / 10);

  function critFumble(totalToHit) {
    const threatRange = parseFloat(item.threatRange) || 0;
    const rawCrit = 7 + Math.floor(totalToHit/10) + (0.10 * critHitBonusSkval) + threatRange;
    const cappedCrit = Math.min(rawCrit, totalToHit/2);
    const critChance = Math.max(cappedCrit, 3) + magicCritBonus;
    const fumbleThreshold = Math.max(93, totalToHit);
    const fumbleChance = Math.max(0, 101 - fumbleThreshold);
    return { critChance, fumbleThreshold, fumbleChance };
  }

  function calc(stn, cdn) {
    const hit = ((a.ST||0)-stn)*stmod + ((a.CD||0)-cdn)*cdmod + skillAbility + magicBonusToHitAll - parryPointsUsed;
    const dmgBonus = (((a.ST||0)-stn)*stmod)/4 + magicDamageAfterDivider + skillDamageBonus;
    const speed = Math.max(1, speedMelee - ((((a.CD||0)-cdn)*cdmod)/4) - skillSpeedBonus);
    const cf = critFumble(hit);
    return { hit, dmgBonus, dmgBeforeDivider: magicDamageBeforeDivider, speed, critChance: cf.critChance, fumbleThreshold: cf.fumbleThreshold, fumbleChance: cf.fumbleChance };
  }

  const oneHandUsable = !(stn1h === 0 && cdn1h === 0);
  const oneHand = oneHandUsable ? calc(stn1h, cdn1h) : null;
  // A weapon with no two-handed requirements (a spiked shield) is one-handed only.
  const twoHand = (stn2h === 0 && cdn2h === 0) ? null : calc(stn2h, cdn2h);

  const speedMissile = parseFloat(item.speedMissile) || 0;
  // Readied speed (for a first attack) takes the Initiative bonus too; 0 = none set
  const speedReadied = parseFloat(item.speedReadied) || 0;
  const readiedSpeed = speedReadied > 0 ? Math.max(1, speedReadied - skillSpeedBonus) : 0;
  const range = parseFloat(item.range) || 0;
  const targetDistance = parseFloat(item.targetDistance) || 0;
  let missile = null;
  if (speedMissile > 0) {
    const missileStn = oneHandUsable ? stn1h : stn2h;
    const missileCdn = oneHandUsable ? cdn1h : cdn2h;
    const ammoItem = (item.ammunitionItemIdx !== undefined && item.ammunitionItemIdx !== '') ?
      (character.items || [])[item.ammunitionItemIdx] : null;
    const ammoMagicToHit = ammoItem ? (parseFloat(ammoItem.magicBonusToHit) || 0) : 0;
    const ammoOffense = ammoItem && itemHasModKind(ammoItem, 'offense');
    const ammoMagicCrit = ammoOffense ? (parseFloat(ammoItem.magicCritBonus) || 0) : 0;
    const missileDmgBefore = magicDamageBeforeDivider + (ammoOffense ? (parseFloat(ammoItem.magicDamageBeforeDivider) || 0) : 0);
    const missileDmgAfter = magicDamageAfterDivider + (ammoItem ? (parseFloat(ammoItem.magicDamageAfterDivider) || 0) : 0);
    const rawHit = ((a.ST||0)-missileStn)*stmod + ((a.CD||0)-missileCdn)*cdmod + skillAbility + magicBonusToHitAll + ammoMagicToHit;
    // Spears only: thrown range moves by the strength to-hit bonus/malus (a
    // second dip on top of the to-hit itself), but a malus can never cut the
    // listed range below half. Spear Thrown then adds 1 range per 4 points of
    // the skill on top of that, so a weak thrower can make up ground.
    let effectiveRange = range;
    let spearThrownRange = 0;
    if (item.weaponClass === 'Basic Spears' && range > 0) {
      const strMod = ((a.ST||0)-missileStn)*stmod;
      spearThrownRange = Math.floor(getSkillSkval(character, 'Spear Thrown') / 4);
      effectiveRange = Math.max(range / 2, range + strMod) + spearThrownRange;
    }
    const rangeMod = effectiveRange > 0 ? Math.max(0, 1 - (targetDistance / effectiveRange)) : 1;
    const finalHit = rawHit * rangeMod;
    const cf = critFumble(finalHit);
    // the same skill bonuses apply to a shot: damage after the divider, and speed
    const speed = Math.max(1, speedMissile - skillSpeedBonus);
    const dmgAfter = missileDmgAfter + skillDamageBonus;
    missile = { rawHit, rangeMod, effectiveRange, spearThrownRange, finalHit, ammoItem, speedMissile, speed, dmgAfter, usedGrip: oneHandUsable ? '1H' : '2H', magicDmgBefore: missileDmgBefore, magicDmgAfter: missileDmgAfter, critChance: cf.critChance + ammoMagicCrit, fumbleThreshold: cf.fumbleThreshold, fumbleChance: cf.fumbleChance };
  }

  return { skillAbility, baseWeaponSkval, singleWeapSpec, critHitBonusSkval, damageBonusSkval, initiativeBonusSkval, skillDamageBonus, skillSpeedBonus, readiedSpeed, parrySkval, parryPointsUsed, multipleAttackSkval, oneHand, twoHand, missile, magicDamageBeforeDivider, magicCritBonus };
}

// How familiar a character is with a school, from the school pool's level
// against the Spirit SP level. Each tier needs the pool at minLevel or more,
// and also at spiritFrac × Spirit level or more, unless the pool has reached
// cap. ratio = Spirit points per missing school point; the Effective Spell
// Level is Spirit level + pool level × eslFactor.
const SPELL_FAMILIARITY_TIERS = [
  { name: 'Familiar',    ratio: 3,   eslFactor: 0,    minLevel: 0, spiritFrac: 0,    cap: 0 },
  { name: 'Specialized', ratio: 2,   eslFactor: 0.5,  minLevel: 3, spiritFrac: 0.5,  cap: 8 },
  { name: 'Devoted',     ratio: 1.5, eslFactor: 0.75, minLevel: 6, spiritFrac: 0.75, cap: 12 },
];
// The pool level a tier needs at the given Spirit level.
function familiarityLevelNeeded(tier, spiritLevel) {
  return Math.max(tier.minLevel, Math.min(Math.ceil(spiritLevel * tier.spiritFrac - 1e-9), tier.cap));
}
function familiarityTier(level, spiritLevel) {
  let best = SPELL_FAMILIARITY_TIERS[0];
  for (const t of SPELL_FAMILIARITY_TIERS) if (level >= familiarityLevelNeeded(t, spiritLevel)) best = t;
  return best;
}
// Raw XP a skill needs to reach a level at its current expmod (null if it can't).
function rawXPForLevel(level, expmod) {
  const row = LEVELS.find(r => r.level === level);
  if (!row || !(expmod > 0)) return null;
  return Math.ceil(row.from / expmod);
}

function computeSpellPools(character) {
  const skills = character.skills || [];
  const trainedNames = new Set(skills.map(s => s.skillName));
  const poolDefs = SKILLS.filter(s => s.type === 'Spell' && !s.parent);
  const spellState = character.spellState || {};
  const voidSourceList = voidSources(character);

  const spiritInst = skills.find(s => s.skillName === 'Spirit SP');
  const spiritLevel = spiritInst ? computeSkillValues(spiritInst, character, skills).level : 0;

  const pools = [];
  for (const poolDef of poolDefs) {
    if (!trainedNames.has(poolDef.name)) continue;
    const poolInst = skills.find(s => s.skillName === poolDef.name);
    const vals = computeSkillValues(poolInst, character, skills);
    const maxSP = vals.skval;
    const level = vals.level;
    const children = SKILLS.filter(s => s.parent.trim().toLowerCase() === poolDef.name.trim().toLowerCase());
    const childStatus = children.map(c => {
      const inst = skills.find(s => s.skillName === c.name);
      return { name: c.name, trained: !!inst, skval: inst ? computeSkillValues(inst, character, skills).skval : 0 };
    });
    // Spell points are whole numbers. Recovery accrues slower than a point an
    // hour, so the partial progress toward the next point is kept apart in
    // spellState[pool].frac; trueSP is whole points + that fraction (older
    // saves may hold a decimal straight in `current`, which this also covers).
    const stored = spellState[poolDef.name];
    const trueSP = stored && stored.current !== undefined
      ? Math.min(maxSP, (parseFloat(stored.current) || 0) + (parseFloat(stored.frac) || 0))
      : maxSP;
    const currentSP = Math.floor(trueSP + 1e-9);
    const usedSP = Math.max(0, maxSP - currentSP);

    let familiarity = 'Familiar', conversionRatio = 3, effectiveLevel = spiritLevel;
    if (poolDef.name === 'Spirit SP') {
      familiarity = '—'; conversionRatio = null; effectiveLevel = spiritLevel;
    } else {
      const tier = familiarityTier(level, spiritLevel);
      familiarity = tier.name; conversionRatio = tier.ratio; effectiveLevel = spiritLevel + level * tier.eslFactor;
    }
    const reclamationChild = childStatus.find(c => c.name.toLowerCase().includes('reclamation'));
    const reclamationSkval = reclamationChild ? reclamationChild.skval : 0;
    const enhancers = (character.spellEnhancers && character.spellEnhancers[poolDef.name]) || {};
    const spReductionManual = parseFloat(enhancers.spReduction) || 0;
    const spReductionItems = magicVoidReduction(character, poolDef.name, voidSourceList);
    const spReduction = spReductionManual + spReductionItems;
    const reclamationBonus = parseFloat(enhancers.reclamationBonus) || 0;
    const successBonus = parseFloat(enhancers.successBonus) || 0;
    const recoverAwake = Math.round(((reclamationSkval * 0.10) + reclamationBonus) * 10) / 10;
    const recoverSleep = Math.round(((reclamationSkval * 0.20) + reclamationBonus) * 10) / 10;
    pools.push({ name: poolDef.name, maxSP, currentSP, trueSP, usedSP, level, spiritLevel,
                 rawXP: parseFloat(poolInst.rawXP) || 0, expmod: vals.expmod, children: childStatus,
                 familiarity, conversionRatio, effectiveLevel: Math.ceil(effectiveLevel - 1e-9), // spell levels are whole numbers, rounded up
                 reclamationSkval, recoverAwake, recoverSleep,
                 spReduction, spReductionManual, spReductionItems, reclamationBonus, successBonus });
  }
  return pools;
}

// A spell's level ("plev") is the Effective Spell Level of its school's
// pool. A school the character hasn't trained counts as Familiar, i.e. the
// plain Spirit level.
function spellLevel(character, school, pools) {
  pools = pools || computeSpellPools(character);
  const pool = pools.find(p => p.name === SPELL_SCHOOL_TO_POOL[school]);
  if (pool) return pool.effectiveLevel;
  const spirit = pools.find(p => p.name === 'Spirit SP');
  return spirit ? spirit.effectiveLevel : 0;
}

// Works out a catalog duration such as "30 sec+5 sec plev" or "5 min/plev"
// at a given spell level, as text like "50 sec" or "1 hr 20 min". Returns
// '' when the duration has no per-level part or a shape/unit it can't be sure
// of (segments, Celtricia weeks/months, dice, "perm/..."...), so it is then
// shown as written. Days are only added to days (a Celtricia day may not be
// 24 hours).
const DURATION_UNITS = [
  [/^(s|sec|secs|second|seconds)$/, 'sec', 1],
  [/^(m|min|mins|minute|minutes)$/, 'sec', 60],
  [/^(h|hr|hrs|hour|hours)$/, 'sec', 3600],
  [/^(d|day|days)$/, 'day', 1],
];
function evalSpellDuration(text, level) {
  const raw = String(text || '').trim();
  const t = raw.toLowerCase()
    .replace(/([a-z])plev\b/g, '$1 plev') // "5 minplev"
    .replace(/\s*(\/|-)?\s*\b(plev|p\.?\s*lev(el)?|per\s+lev(el)?(\s+of\s+the\s+caster)?|\/lev(el)?)\b\.?/g, '@')
    .replace(/\s*\/\s*@/g, '@');
  if (!t.includes('@')) return '';
  const terms = t.split('+').map(x => x.trim());
  const parsed = [];
  for (const term of terms) {
    const m = term.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)\s*(@)?$/);
    if (!m) return '';
    parsed.push({ n: parseFloat(m[1]), unit: m[2], perLevel: !!m[3] });
  }
  // A bare number takes the unit of the next term ("10 +5 min plev")
  for (let i = parsed.length - 2; i >= 0; i--) if (!parsed[i].unit) parsed[i].unit = parsed[i + 1].unit;
  let kind = null, total = 0;
  for (const p of parsed) {
    const u = DURATION_UNITS.find(([re]) => re.test(p.unit));
    if (!u) return '';
    if (kind && kind !== u[1]) return '';
    kind = u[1];
    total += p.n * u[2] * (p.perLevel ? level : 1);
  }
  if (kind === 'day') { const d = Math.round(total * 10) / 10; return `${d} day${d === 1 ? '' : 's'}`; }
  let secs = Math.round(total);
  const h = Math.floor(secs / 3600); secs -= h * 3600;
  const m = Math.floor(secs / 60); secs -= m * 60;
  return [h && `${h} hr`, m && `${m} min`, secs && `${secs} sec`].filter(Boolean).join(' ') || '0 sec';
}

// Small colored lightning bolt summarizing a character's total spell point
// health across every trained pool (sum of current / sum of max), for the
// group roster. Green >75%, yellow 25-75%, red <25%. Returns '' for a
// character with no trained spell pools at all -- nothing to show.
function spellHealthSigilHtml(character) {
  const pools = computeSpellPools(character);
  if (!pools.length) return '';
  const totalMax = pools.reduce((sum, p) => sum + p.maxSP, 0);
  const totalCurrent = pools.reduce((sum, p) => sum + p.currentSP, 0);
  if (totalMax <= 0) return '';
  const pct = totalCurrent / totalMax;
  const color = pct > 0.75 ? '#4a9460' : pct > 0.25 ? '#c9a227' : '#c0524a';
  const label = Math.round(pct * 100) + '% spell points (' + Math.round(totalCurrent) + '/' + Math.round(totalMax) + ')';
  return ` <svg title="${label}" width="11" height="14" viewBox="0 0 11 14" style="vertical-align:middle" xmlns="http://www.w3.org/2000/svg"><polygon points="6.5,0 0,8 4.5,8 3,14 11,5 6,5" fill="${color}"/></svg>`;
}

// HP Add on each companion (Companions page) adds to the character's HP.
function companionHpAdd(character) {
  return (character.companions || []).reduce((s, c) => s + (parseFloat(c.hpAdd) || 0), 0);
}
function computeHP(character) {
  const totalHP = getSkillSkval(character, 'Hit Points') + companionHpAdd(character);
  const hpState = character.hpState || {};
  const system = hpState.system || 'standard';

  const physicalMax = Math.ceil(totalHP / 2);
  const enduranceMax = Math.floor(totalHP / 2);

  const currentHP = hpState.currentHP !== undefined ? hpState.currentHP : totalHP;
  const physicalCurrent = hpState.physicalCurrent !== undefined ? hpState.physicalCurrent : physicalMax;
  const enduranceCurrent = hpState.enduranceCurrent !== undefined ? hpState.enduranceCurrent : enduranceMax;

  return { totalHP, system, currentHP, physicalMax, physicalCurrent, enduranceMax, enduranceCurrent };
}

// A character is officially dead once their negative HP has gone deep
// enough that they can no longer make the Fortitude CC roll to stabilize
// (see the wiki's Taking Damage page): the roll is penalized 10% for every
// point below 0, and once that penalty meets or exceeds their Fortitude CC
// the roll becomes impossible. Beyond the Pale raises the Fortitude CC used
// for this specific check (not Fortitude in general) by 1 per 5 skval.
// Collegium characters use Physical (real injury), not Endurance.
function isCharacterDead(character, hp) {
  const currentHP = hp.system === 'collegium' ? hp.physicalCurrent : hp.currentHP;
  if (currentHP >= 0) return false;
  const baseFort = computeCC(character).fortitude.value;
  const beyondThePale = getSkillSkval(character, 'Beyond the Pale');
  const effectiveFort = baseFort + Math.floor(beyondThePale / 5);
  return (10 * Math.abs(currentHP)) >= effectiveFort;
}

// Derived damaged/critical flags, cached to plain columns (hp_damaged/
// hp_critical) so the group roster can show a color cue to every group
// member -- not just the GM or the character's own owner, who are the only
// ones with RLS read access to the actual HP numbers.
function computeHpStatus(character) {
  const hp = computeHP(character);
  const cur = hp.system === 'collegium' ? (hp.physicalCurrent + hp.enduranceCurrent) : hp.currentHP;
  return { damaged: cur < hp.totalHP, critical: cur < hp.totalHP / 2 };
}

// Rolls forward SP recovery for elapsed game time since this character's last
// check, and (if opts.isResting) accrues toward the 6-hour nightly HP-recovery
// threshold. Default assumption is "not resting" -- callers only pass
// isResting/focusPools when a GM has explicitly reported a rest span (see the
// Group module's resting prompt on clock advances > 2 hours). Mutates
// character.spellState / character.recoveryState in place.
// Rules for Magic: a sleeping caster can reclaim up to 5 different spell
// point types per hour (3 awake). "Recover furthest down" spends that on the
// pools with the most points missing.
const SLEEP_POOL_CAP = 5;

// Stores a pool's true value (whole points plus the fraction toward the next
// point) as an integer `current` and a separate `frac`; see computeSpellPools.
function setPoolTrueSP(character, poolName, value, maxSP) {
  if (!character.spellState) character.spellState = {};
  const st = character.spellState[poolName] || (character.spellState[poolName] = {});
  const whole = Math.floor(value + 1e-9);
  st.current = whole;
  const frac = value >= maxSP ? 0 : Math.round((value - whole) * 1e6) / 1e6;
  if (frac > 0) st.frac = frac; else delete st.frac;
}

function settleCharacterRecovery(character, uptoSeconds, opts) {
  opts = opts || {};
  const focusPools = opts.focusPools || null;
  const isResting = !!opts.isResting;
  const furthestDown = isResting && !!opts.furthestDown;
  if (!character.recoveryState) character.recoveryState = {};
  const rs = character.recoveryState;
  const last = (rs.lastCheckSeconds != null) ? rs.lastCheckSeconds : uptoSeconds;
  const elapsedSec = uptoSeconds - last;
  const spGains = [];
  if (elapsedSec > 0) {
    const elapsedHours = elapsedSec / 3600;
    if (!character.spellState) character.spellState = {};
    const before = {};
    for (const p of computeSpellPools(character)) before[p.name] = p.currentSP;
    // One slice of time: pools in sleepNames reclaim at the sleep rate, the
    // rest at the awake rate. The fractional gain keeps accumulating silently
    // (in each pool's `frac`) across settlements, so only whole points show.
    const applySlice = (dtHours, sleepNames) => {
      for (const pool of computeSpellPools(character)) {
        if (pool.trueSP >= pool.maxSP) continue;
        const rate = sleepNames.has(pool.name) ? pool.recoverSleep : pool.recoverAwake;
        if (rate <= 0) continue;
        const next = Math.min(pool.maxSP, pool.trueSP + rate * dtHours);
        if (next > pool.trueSP) setPoolTrueSP(character, pool.name, next, pool.maxSP);
      }
    };
    if (furthestDown) {
      // Re-pick every hour: whichever pools are furthest below max right now
      // (most points missing, up to the sleeping cap) get the sleep rate, so
      // the biggest holes close first and focus moves on as they fill.
      let remaining = elapsedHours;
      while (remaining > 1e-9) {
        const dt = Math.min(1, remaining);
        remaining -= dt;
        const focus = computeSpellPools(character)
          .filter(p => p.currentSP < p.maxSP && p.recoverSleep > 0)
          .sort((a, b) => (b.maxSP - b.currentSP) - (a.maxSP - a.currentSP))
          .slice(0, SLEEP_POOL_CAP)
          .map(p => p.name);
        applySlice(dt, new Set(focus));
      }
    } else {
      applySlice(elapsedHours, new Set(isResting && focusPools ? focusPools : []));
    }
    for (const p of computeSpellPools(character)) {
      const gained = p.currentSP - (before[p.name] || 0);
      // Only mention a pool once it adds up to a full point.
      if (gained >= 1) spGains.push(`+${gained} ${p.name}`);
    }
    if (isResting) rs.restHoursAccrued = (rs.restHoursAccrued || 0) + elapsedHours;
  }
  rs.lastCheckSeconds = uptoSeconds;
  let hpRollsDue = 0;
  while ((rs.restHoursAccrued || 0) >= 6) { rs.restHoursAccrued -= 6; hpRollsDue++; }
  return { spGains, hpRollsDue };
}

// Resolves one nightly HP-recovery Fortitude CC roll (d100, roll <= target succeeds).
// Standard: 1 HP baseline for the rest, +1 more on success, +1 more per 25% rolled
// under target. Collegium: Endurance fully refills (capped at current Physical);
// Physical needs the CC roll -- success +1, success by 25+ or a crit (<=5) +2,
// fail +0, crit fail (>=96) -1. Mutates character.hpState in place.
function applyHPRecoveryRoll(character, rollResult) {
  const hp = computeHP(character);
  const target = computeCC(character).fortitude.value;
  const success = rollResult <= target;
  const margin = success ? (target - rollResult) : 0;
  if (!character.hpState) character.hpState = {};
  if (hp.system === 'collegium') {
    const critSuccess = rollResult <= 5;
    const critFail = rollResult >= 96;
    let physicalDelta;
    if (critFail) physicalDelta = -1;
    else if (!success) physicalDelta = 0;
    else if (critSuccess || margin >= 25) physicalDelta = 2;
    else physicalDelta = 1;
    const physicalCurrent = Math.max(0, Math.min(hp.physicalMax, hp.physicalCurrent + physicalDelta));
    const enduranceCurrent = Math.min(hp.enduranceMax, physicalCurrent);
    character.hpState.physicalCurrent = physicalCurrent;
    character.hpState.enduranceCurrent = enduranceCurrent;
    return { system: 'collegium', roll: rollResult, target, success, physicalDelta, physicalCurrent, enduranceCurrent };
  } else {
    const delta = success ? (2 + Math.floor(margin / 25)) : 1;
    const currentHP = Math.max(0, Math.min(hp.totalHP, hp.currentHP + delta));
    character.hpState.currentHP = currentHP;
    return { system: 'standard', roll: rollResult, target, success, delta, currentHP };
  }
}

// Spells cast onto the character in combat, typed in on the Combat page
// (char.combatExtras.spellMods). Defense (av, pr) adds to the Defense totals;
// offense (toHit, dmgBefore, dmgAfter, crit) adds to the weapons in hand
// only. damageRoll is a note for the player and isn't applied.
const SPELL_MOD_FIELDS = ['av', 'pr', 'toHit', 'dmgBefore', 'dmgAfter', 'crit'];
// What's worn and what's in hand, as text: when it changes, the spell mods
// typed in for the old gear no longer apply (see syncSpellModsToGear).
function spellModGearKeys(character) {
  const inUse = (character.items || []).filter(it => itemInUse(character, it));
  const key = it => [it.type, it.name, it.weaponModel, it.armorType, it.shieldType, it.av, it.pr, it.location].join('|');
  return {
    def: inUse.filter(it => it.type === 'Armor' || it.type === 'Shield').map(key).join('\n'),
    off: inUse.filter(it => it.type === 'Weapon' || it.type === 'Shield').map(key).join('\n')
  };
}
// Run on every save: a change to the armor or shield in use clears the
// Defense spell mods, a change to the weapons (or shield) in hand clears the
// Offense ones. The Damage Roll note stays (the ↺ clears all three rows).
function syncSpellModsToGear(character) {
  const m = character && character.combatExtras && character.combatExtras.spellMods;
  if (!m) return;
  const now = spellModGearKeys(character);
  if (m.defGear !== undefined && m.defGear !== now.def) { delete m.av; delete m.pr; }
  if (m.offGear !== undefined && m.offGear !== now.off) { for (const f of ['toHit', 'dmgBefore', 'dmgAfter', 'crit']) delete m[f]; }
  m.defGear = now.def;
  m.offGear = now.off;
}
function combatSpellMods(character) {
  const m = ((character && character.combatExtras) || {}).spellMods || {};
  const out = { damageRoll: m.damageRoll || '' };
  for (const f of SPELL_MOD_FIELDS) out[f] = parseFloat(m[f]) || 0;
  return out;
}

// Whether a weapon, shield or armor is in use: carried on the person and
// ticked "In Use" on the Inventory page (weapons and shields: it.wielded;
// armor: it.worn, which counts as worn until it's unticked). Only these
// count on the Combat page.
function itemInUse(character, it) {
  if (!it || !itemOnPerson(character, it)) return false;
  if (it.type === 'Armor') return it.worn !== false;
  if (it.type === 'Weapon' || it.type === 'Shield') return !!it.wielded;
  // a magic item (not a potion, scroll or plaque) is in use unless its In Use is unticked
  if (magicItemHasInUse(it)) return it.inUse !== false;
  return false;
}
function magicItemHasInUse(it) {
  return !!it && it.type === 'Magic Item' && !itemSpellRule(it);
}
function weaponOneHanded(it) {
  return (parseFloat(it.stn1h) || 0) !== 0 || (parseFloat(it.cdn1h) || 0) !== 0;
}
// What can be in hand at once: one weapon held two-handed, two one-handed
// weapons, or a one-handed weapon and a shield. Returns why the given
// weapons and shields break that, or '' when they don't.
function wieldingProblem(items) {
  const weapons = items.filter(it => it.type === 'Weapon');
  const shields = items.filter(it => it.type === 'Shield');
  if (shields.length > 1) return 'Only one shield can be in use at a time.';
  if (weapons.length + shields.length > 2) return 'At most two things can be in hand: two one-handed weapons, or a one-handed weapon and a shield.';
  if (weapons.length + shields.length === 2) {
    const twoH = weapons.find(it => !weaponOneHanded(it));
    if (twoH) return `${twoH.name || 'That weapon'} is two-handed only, so it has to be wielded alone.`;
  }
  return '';
}

// What the character has in hand, from the weapons and shield in use. One
// weapon alone is held in two hands (2H values); two weapons are each held in
// one hand (1H values); a weapon with a shield is 1H too. Wielded weapons add
// their Weapon PR; a wielded shield adds its AV and PR. With nothing in hand,
// nothing is assumed (mode null) and both 1H and 2H show.
function computeWielding(character) {
  const items = character.items || [];
  const weapons = items.filter(it => it.type === 'Weapon' && itemInUse(character, it)).length;
  const shields = items.filter(it => it.type === 'Shield' && itemInUse(character, it)).length;
  // A lone weapon is held two-handed only if it has two-handed values at all.
  const lone = weapons === 1 && shields === 0 ? items.find(it => it.type === 'Weapon' && itemInUse(character, it)) : null;
  const canTwoHand = lone && ((parseFloat(lone.stn2h) || 0) !== 0 || (parseFloat(lone.cdn2h) || 0) !== 0);
  const mode = weapons === 0 ? null : (canTwoHand ? 'two' : 'one');
  return { weapons, shields, mode, active: weapons + shields > 0 };
}

// Which items' magic modifiers count right now: armor, shields and weapons in
// use (see itemInUse), ammunition loaded in a weapon, and Magic Items carried
// on the person (Carried, or an On Person container).
function itemOnPerson(character, it) {
  const loc = (it.location || '').trim();
  return !loc || !!(character.storageOnPerson || {})[loc];
}
function itemModsInUse(character, it, countedShields) {
  if (it.type === 'Companion') return true; // a companion's magic always counts
  if (it.type === 'Armor' || it.type === 'Weapon') return itemInUse(character, it);
  if (it.type === 'Ammunition') {
    const idx = (character.items || []).indexOf(it);
    return (character.items || []).some(w => w.type === 'Weapon' && w.ammunitionItemIdx !== undefined && w.ammunitionItemIdx !== '' && String(w.ammunitionItemIdx) === String(idx));
  }
  if (it.type === 'Shield') return itemInUse(character, it);
  if (magicItemHasInUse(it)) return itemInUse(character, it);
  return itemOnPerson(character, it);
}
// Everything whose magic modifiers can count: the items, then the companions.
function magicModSources(character) {
  return [...(character.items || []), ...(character.companions || [])];
}
function shieldsCountedItems(character) {
  return (character.items || []).filter(it => it.type === 'Shield' && itemInUse(character, it));
}
// Defense modifiers stack across every item in use. Shields' are kept apart
// because they only count in the With Shield totals.
function magicDefenseTotals(character) {
  const counted = shieldsCountedItems(character);
  const t = { av: 0, pr: 0, shieldAv: 0, shieldPr: 0 };
  for (const it of magicModSources(character)) {
    if (!itemHasModKind(it, 'defense') || !itemModsInUse(character, it, counted)) continue;
    const av = parseFloat(it.magicAvoidance) || 0, pr = parseFloat(it.magicProtection) || 0;
    if (it.type === 'Shield') { t.shieldAv += av; t.shieldPr += pr; } else { t.av += av; t.pr += pr; }
  }
  return t;
}
// Offense from non-weapon items in use; a weapon adds its own on top.
function magicOffenseFromOthers(character) {
  const t = { toHit: 0, before: 0, after: 0, crit: 0 };
  for (const it of magicModSources(character)) {
    if (it.type === 'Weapon' || it.type === 'Ammunition' || !itemHasModKind(it, 'offense') || !itemModsInUse(character, it)) continue;
    t.toHit += parseFloat(it.magicBonusToHit) || 0; t.before += parseFloat(it.magicDamageBeforeDivider) || 0;
    t.after += parseFloat(it.magicDamageAfterDivider) || 0; t.crit += parseFloat(it.magicCritBonus) || 0;
  }
  return t;
}
// Every item and companion with a void (spell cost) reduction:
// { it, key ('i3' / 'c0'), stacks, amounts {pool: n}, eligible (in use) }.
function voidSources(character) {
  const counted = shieldsCountedItems(character);
  const out = [];
  const add = (it, key) => {
    if (!itemHasModKind(it, 'void')) return;
    const amounts = {};
    for (const v of it.magicVoid || []) {
      const amt = parseFloat(v && v.amount) || 0;
      if (v && v.pool && amt) amounts[v.pool] = (amounts[v.pool] || 0) + amt;
    }
    if (!Object.keys(amounts).length) return;
    out.push({ it, key, stacks: !!it.magicVoidStacks, amounts, eligible: itemModsInUse(character, it, counted) });
  };
  (character.items || []).forEach((it, i) => add(it, 'i' + i));
  (character.companions || []).forEach((c, i) => add(c, 'c' + i));
  return out;
}
// Which sources are taking part. Once the player has ticked boxes on the
// Spells page (character.voidChoiceMade), it's the ticked ones (voidActive)
// that are in use, with at most one non-stacking source. Before that, every
// stacking source and the strongest non-stacking one.
function voidActiveKeys(character, sources) {
  const eligible = (sources || voidSources(character)).filter(s => s.eligible);
  const active = new Set();
  if (character.voidChoiceMade) {
    let haveSingle = false;
    for (const s of eligible) {
      if (!s.it.voidActive) continue;
      if (!s.stacks) { if (haveSingle) continue; haveSingle = true; }
      active.add(s.key);
    }
  } else {
    let best = null, bestTotal = 0;
    for (const s of eligible) {
      if (s.stacks) { active.add(s.key); continue; }
      const total = Object.values(s.amounts).reduce((a, b) => a + b, 0);
      if (total > bestTotal) { best = s; bestTotal = total; }
    }
    if (best) active.add(best.key);
  }
  return active;
}
// Void for one pool: the active non-stacking source's reduction, plus the
// greatest of the active stacking sources' reductions for that pool.
function magicVoidReduction(character, poolName, sources) {
  sources = sources || voidSources(character);
  const active = voidActiveKeys(character, sources);
  let single = 0, stacked = 0;
  for (const s of sources) {
    if (!active.has(s.key)) continue;
    const amt = s.amounts[poolName] || 0;
    if (s.stacks) stacked = Math.max(stacked, amt); else single = amt;
  }
  return single + stacked;
}

// A protection roll is (Protection − 1d10) ÷ (2d6 ÷ 2), rounded, never below
// 0: at least (PR − 10) ÷ 6, at most PR − 1.
function protectionRollRange(pr) {
  return { min: Math.max(0, Math.round((pr - 10) / 6)), max: Math.max(0, Math.round(pr - 1)) };
}

// Defense from the armor, shield and weapons in use (see itemInUse).
function computeArmor(character) {
  const items = character.items || [];
  const armorItems = items.filter(it => it.type === 'Armor' && itemInUse(character, it));
  const shieldUseSkval = getSkillSkval(character, 'Basic Shield Use');

  const shieldsComputed = items.map((it, idx) => ({ it, idx })).filter(x => x.it.type === 'Shield' && itemInUse(character, x.it)).map(({ it, idx }) => {
    const basePR = parseFloat(it.pr) || 0;
    const bonus = shieldUseSkval > 0 ? shieldUseBonus(shieldUseSkval, basePR) : 0;
    return { idx, wielded: !!it.wielded, name: it.name, av: parseFloat(it.av) || 0, basePR, bonus, effectivePR: basePR + bonus, notes: it.notes || '' };
  });
  const shieldsCounted = shieldsComputed;

  const sumArmorAV = armorItems.reduce((sum, it) => sum + (parseFloat(it.av) || 0), 0);
  const sumArmorPR = armorItems.reduce((sum, it) => sum + (parseFloat(it.pr) || 0), 0);
  const sumShieldAV = shieldsCounted.reduce((sum, s) => sum + s.av, 0);
  const sumShieldPR = shieldsCounted.reduce((sum, s) => sum + s.effectivePR, 0);

  const avoidanceSkval = getSkillSkval(character, 'Avoidance');
  const protectionSkval = getSkillSkval(character, 'Protection');

  const combatExtras = character.combatExtras || {};
  // Weapon Protection: the hand-entered box, plus the Weapon PR of every
  // weapon in use (the one(s) actually in hand, e.g. a main gauche) -- not
  // every weapon owned, or a bag of spare weapons would count.
  const weaponProtectionManual = parseFloat(combatExtras.weaponProtection) || 0;
  const weaponProtectionWielded = items.filter(it => it.type === 'Weapon' && itemInUse(character, it))
    .reduce((sum, it) => sum + (parseFloat(it.weaponProtection) || 0), 0);
  const weaponProtection = weaponProtectionManual + weaponProtectionWielded;
  const otherBonuses = combatExtras.otherBonuses || [{},{},{}];
  const sumOtherAV = otherBonuses.reduce((sum, b) => sum + (parseFloat(b && b.av) || 0), 0);
  const sumOtherPR = otherBonuses.reduce((sum, b) => sum + (parseFloat(b && b.pr) || 0), 0);

  // Parry counts only from weapons in hand (and Hand/Foot, always there).
  const weaponItems = items.filter(it => it.type === 'Weapon' && itemInUse(character, it));
  const handFoot = handFootWeapon(character);
  const parryPointsTotal = weaponItems.reduce((sum, it) => sum + computeWeapon(character, it).parryPointsUsed, 0)
    + (handFoot ? computeWeapon(character, handFoot).parryPointsUsed : 0)
    + shieldWeaponItems(character).filter(sw => itemInUse(character, items[sw.shieldIdx])).reduce((sum, sw) => sum + computeWeapon(character, sw).parryPointsUsed, 0);

  const magicDefense = magicDefenseTotals(character);
  const spellMods = combatSpellMods(character);
  function buildTotals(includeShield) {
    const sumAV = sumArmorAV + (includeShield ? sumShieldAV : 0);
    const sumPR = sumArmorPR + (includeShield ? sumShieldPR : 0);
    const magicAV = magicDefense.av + (includeShield ? magicDefense.shieldAv : 0);
    const magicPR = magicDefense.pr + (includeShield ? magicDefense.shieldPr : 0);
    const totalAV = sumAV - avoidanceSkval + sumOtherAV - magicAV + spellMods.av;
    const totalPR = sumPR + (protectionSkval / 5) + weaponProtection + sumOtherPR + parryPointsTotal + magicPR + spellMods.pr;
    // Parry only defends against melee attacks -- it can't block a missile or a spell.
    const totalPRvsRangedOrMagic = totalPR - parryPointsTotal;
    return { sumAV, sumPR, totalAV, totalPR, totalPRvsRangedOrMagic, magicAV, magicPR,
             roll: protectionRollRange(totalPR), rollVsRangedOrMagic: protectionRollRange(totalPRvsRangedOrMagic) };
  }

  const withShield = buildTotals(true);
  const withoutShield = buildTotals(false);
  // What is in hand right now (see computeWielding): the shield column applies
  // when a shield is wielded, otherwise the no-shield column.
  const wield = computeWielding(character);
  const current = wield.shields ? withShield : withoutShield;

  return { spellMods, armorItems, shieldsComputed, shieldUseSkval, avoidanceSkval, protectionSkval,
           weaponProtection, weaponProtectionManual, weaponProtectionWielded, otherBonuses, sumOtherAV, sumOtherPR, parryPointsTotal,
           sumArmorAV, sumArmorPR, sumShieldAV, sumShieldPR,
           withShield, withoutShield, current, wield, shieldsCounted };
}


function getTrainedSkills(charId) {
  const char = state.characters[charId];
  if (!char) return [];
  return (char.skills || []).filter(s => !s.dropdownOnly);
}
