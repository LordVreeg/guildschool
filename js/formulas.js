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
  const onPerson = character.storageOnPerson || {};
  const carried = items.filter(it => {
    const loc = it.location ? it.location.trim() : '';
    return !loc || onPerson[loc];
  }).reduce((sum, it) => sum + ((parseFloat(it.weight) || 0) * (parseFloat(it.qty) || 1)), 0);
  return { possible, carried };
}

// Groups items by their storage location (blank = carried on person) so a
// player can see how much is banked or sitting in a given void-space bag,
// separately from what's actually weighing them down. Locations can have a
// capacity limit (character.storageCapacities[location]) -- a real bag of
// holding or satchel only holds so much, even though its contents are
// weightless on the character themselves.
// An inventory entry with nothing filled in at all. The old "+ Add Item"
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
  const armoredMoveTrained = (character.skills||[]).some(s => s.skillName === 'Armored Move');
  return { baseSpeed, adjustedSpeed, dashRoutSpeed, dashRoutMaxDistance, armoredMoveTrained };
}

function shieldUseBonus(skval, shieldBasePR) {
  const doublingPart = Math.min(skval, shieldBasePR);
  const remainder = Math.max(0, skval - shieldBasePR);
  const ratioPart = Math.floor(remainder / 10);
  return doublingPart + ratioPart;
}

function fmtCrit(critChance) {
  const n = Math.round(critChance);
  return `01-${String(n).padStart(2,'0')}`;
}
function fmtFumble(fumbleThreshold) {
  const n = Math.round(fumbleThreshold);
  const start = n >= 100 ? '00' : String(n).padStart(2,'0');
  return `${start}-00`;
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
  const magicDamageAfterDivider = parseFloat(item.magicDamageAfterDivider) || 0;

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

  function critFumble(totalToHit) {
    const threatRange = parseFloat(item.threatRange) || 0;
    const rawCrit = 7 + Math.floor(totalToHit/10) + (0.10 * critHitBonusSkval) + threatRange;
    const cappedCrit = Math.min(rawCrit, totalToHit/2);
    const critChance = Math.max(cappedCrit, 3);
    const fumbleThreshold = Math.max(93, totalToHit);
    const fumbleChance = Math.max(0, 101 - fumbleThreshold);
    return { critChance, fumbleThreshold, fumbleChance };
  }

  function calc(stn, cdn) {
    const hit = ((a.ST||0)-stn)*stmod + ((a.CD||0)-cdn)*cdmod + skillAbility + magicBonusToHit - parryPointsUsed;
    const dmgBonus = (((a.ST||0)-stn)*stmod)/4 + magicDamageAfterDivider;
    const speed = Math.max(1, speedMelee - ((((a.CD||0)-cdn)*cdmod)/4));
    const cf = critFumble(hit);
    return { hit, dmgBonus, speed, critChance: cf.critChance, fumbleThreshold: cf.fumbleThreshold, fumbleChance: cf.fumbleChance };
  }

  const oneHandUsable = !(stn1h === 0 && cdn1h === 0);
  const oneHand = oneHandUsable ? calc(stn1h, cdn1h) : null;
  // A weapon with no two-handed requirements (a spiked shield) is one-handed only.
  const twoHand = (stn2h === 0 && cdn2h === 0) ? null : calc(stn2h, cdn2h);

  const speedMissile = parseFloat(item.speedMissile) || 0;
  const range = parseFloat(item.range) || 0;
  const targetDistance = parseFloat(item.targetDistance) || 0;
  let missile = null;
  if (speedMissile > 0) {
    const missileStn = oneHandUsable ? stn1h : stn2h;
    const missileCdn = oneHandUsable ? cdn1h : cdn2h;
    const ammoItem = (item.ammunitionItemIdx !== undefined && item.ammunitionItemIdx !== '') ?
      (character.items || [])[item.ammunitionItemIdx] : null;
    const ammoMagicToHit = ammoItem ? (parseFloat(ammoItem.magicBonusToHit) || 0) : 0;
    const rawHit = ((a.ST||0)-missileStn)*stmod + ((a.CD||0)-missileCdn)*cdmod + skillAbility + magicBonusToHit + ammoMagicToHit;
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
    missile = { rawHit, rangeMod, effectiveRange, spearThrownRange, finalHit, ammoItem, speedMissile, usedGrip: oneHandUsable ? '1H' : '2H', critChance: cf.critChance, fumbleThreshold: cf.fumbleThreshold, fumbleChance: cf.fumbleChance };
  }

  return { skillAbility, baseWeaponSkval, singleWeapSpec, critHitBonusSkval, parrySkval, parryPointsUsed, multipleAttackSkval, oneHand, twoHand, missile };
}

function computeSpellPools(character) {
  const skills = character.skills || [];
  const trainedNames = new Set(skills.map(s => s.skillName));
  const poolDefs = SKILLS.filter(s => s.type === 'Spell' && !s.parent);
  const spellState = character.spellState || {};

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
    const currentSP = spellState[poolDef.name] && spellState[poolDef.name].current !== undefined ? spellState[poolDef.name].current : maxSP;
    const usedSP = Math.max(0, maxSP - currentSP);

    let familiarity = 'Familiar', conversionRatio = 3, effectiveLevel = spiritLevel;
    if (poolDef.name === 'Spirit SP') {
      familiarity = '—'; conversionRatio = null; effectiveLevel = spiritLevel;
    } else {
      const halfSpirit = spiritLevel / 2;
      const threeQuarterSpirit = spiritLevel * 0.75;
      if (level >= 6 && (level >= threeQuarterSpirit || level >= 12)) {
        familiarity = 'Devoted'; conversionRatio = 1.5; effectiveLevel = spiritLevel + (level * 0.75);
      } else if (level >= 3 && (level >= halfSpirit || level >= 8)) {
        familiarity = 'Specialized'; conversionRatio = 2; effectiveLevel = spiritLevel + (level * 0.5);
      } else {
        familiarity = 'Familiar'; conversionRatio = 3; effectiveLevel = spiritLevel;
      }
    }
    const reclamationChild = childStatus.find(c => c.name.toLowerCase().includes('reclamation'));
    const reclamationSkval = reclamationChild ? reclamationChild.skval : 0;
    const enhancers = (character.spellEnhancers && character.spellEnhancers[poolDef.name]) || {};
    const spReduction = parseFloat(enhancers.spReduction) || 0;
    const reclamationBonus = parseFloat(enhancers.reclamationBonus) || 0;
    const successBonus = parseFloat(enhancers.successBonus) || 0;
    const recoverAwake = Math.round(((reclamationSkval * 0.10) + reclamationBonus) * 10) / 10;
    const recoverSleep = Math.round(((reclamationSkval * 0.20) + reclamationBonus) * 10) / 10;
    pools.push({ name: poolDef.name, maxSP, currentSP, usedSP, level, children: childStatus,
                 familiarity, conversionRatio, effectiveLevel: Math.ceil(effectiveLevel - 1e-9), // spell levels are whole numbers, rounded up
                 reclamationSkval, recoverAwake, recoverSleep,
                 spReduction, reclamationBonus, successBonus });
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

function computeHP(character) {
  const totalHP = getSkillSkval(character, 'Hit Points');
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
    // rest at the awake rate. Always applies the fractional gain so it keeps
    // accumulating silently across settlements.
    const applySlice = (dtHours, sleepNames) => {
      for (const pool of computeSpellPools(character)) {
        if (pool.currentSP >= pool.maxSP) continue;
        const rate = sleepNames.has(pool.name) ? pool.recoverSleep : pool.recoverAwake;
        if (rate <= 0) continue;
        const next = Math.min(pool.maxSP, pool.currentSP + rate * dtHours);
        if (next > pool.currentSP) {
          if (!character.spellState[pool.name]) character.spellState[pool.name] = {};
          character.spellState[pool.name].current = next;
        }
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
      const gained = Math.round((p.currentSP - (before[p.name] || 0)) * 10) / 10;
      // Only mention a pool once it adds up to a full point.
      if (gained >= 1) spGains.push(`+${Math.floor(gained)} ${p.name}`);
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

// What the character has in hand, from the "Wielding" ticks on weapons and
// shields. One weapon alone is held in two hands (2H values); two weapons are
// each held in one hand (1H values); a weapon with a shield is 1H too. Wielded
// weapons add their Weapon PR; a wielded shield adds its AV and PR. With
// nothing ticked, nothing is assumed (mode null) and both 1H and 2H show.
function computeWielding(character) {
  const items = character.items || [];
  const weapons = items.filter(it => it.type === 'Weapon' && it.wielded).length;
  const shields = items.filter(it => it.type === 'Shield' && it.wielded).length;
  // A lone weapon is held two-handed only if it has two-handed values at all.
  const lone = weapons === 1 && shields === 0 ? items.find(it => it.type === 'Weapon' && it.wielded) : null;
  const canTwoHand = lone && ((parseFloat(lone.stn2h) || 0) !== 0 || (parseFloat(lone.cdn2h) || 0) !== 0);
  const mode = weapons === 0 ? null : (canTwoHand ? 'two' : 'one');
  return { weapons, shields, mode, active: weapons + shields > 0 };
}

function computeArmor(character) {
  const items = character.items || [];
  const armorItems = items.filter(it => it.type === 'Armor');
  const shieldItems = items.filter(it => it.type === 'Shield');
  const shieldUseSkval = getSkillSkval(character, 'Basic Shield Use');

  const shieldsComputed = items.map((it, idx) => ({ it, idx })).filter(x => x.it.type === 'Shield').map(({ it, idx }) => {
    const basePR = parseFloat(it.pr) || 0;
    const bonus = shieldUseSkval > 0 ? shieldUseBonus(shieldUseSkval, basePR) : 0;
    return { idx, wielded: !!it.wielded, name: it.name, av: parseFloat(it.av) || 0, basePR, bonus, effectivePR: basePR + bonus, notes: it.notes || '' };
  });
  // If any shield is ticked "Wielding", only those count toward the With
  // Shield totals; with none ticked, every shield counts, as before.
  const shieldsCounted = shieldsComputed.some(s => s.wielded) ? shieldsComputed.filter(s => s.wielded) : shieldsComputed;

  const sumArmorAV = armorItems.reduce((sum, it) => sum + (parseFloat(it.av) || 0), 0);
  const sumArmorPR = armorItems.reduce((sum, it) => sum + (parseFloat(it.pr) || 0), 0);
  const sumShieldAV = shieldsCounted.reduce((sum, s) => sum + s.av, 0);
  const sumShieldPR = shieldsCounted.reduce((sum, s) => sum + s.effectivePR, 0);

  const avoidanceSkval = getSkillSkval(character, 'Avoidance');
  const protectionSkval = getSkillSkval(character, 'Protection');

  const combatExtras = character.combatExtras || {};
  // Weapon Protection: the hand-entered box, plus the Weapon PR of every
  // weapon ticked "Wielding" (the one(s) actually in hand, e.g. a main
  // gauche) -- not every weapon owned, or a bag of spare weapons would count.
  const weaponProtectionManual = parseFloat(combatExtras.weaponProtection) || 0;
  const weaponProtectionWielded = items.filter(it => it.type === 'Weapon' && it.wielded)
    .reduce((sum, it) => sum + (parseFloat(it.weaponProtection) || 0), 0);
  const weaponProtection = weaponProtectionManual + weaponProtectionWielded;
  const otherBonuses = combatExtras.otherBonuses || [{},{},{}];
  const sumOtherAV = otherBonuses.reduce((sum, b) => sum + (parseFloat(b && b.av) || 0), 0);
  const sumOtherPR = otherBonuses.reduce((sum, b) => sum + (parseFloat(b && b.pr) || 0), 0);

  const weaponItems = items.filter(it => it.type === 'Weapon');
  const handFoot = handFootWeapon(character);
  const parryPointsTotal = weaponItems.reduce((sum, it) => sum + computeWeapon(character, it).parryPointsUsed, 0)
    + (handFoot ? computeWeapon(character, handFoot).parryPointsUsed : 0)
    + shieldWeaponItems(character).reduce((sum, sw) => sum + computeWeapon(character, sw).parryPointsUsed, 0);

  function buildTotals(includeShield) {
    const sumAV = sumArmorAV + (includeShield ? sumShieldAV : 0);
    const sumPR = sumArmorPR + (includeShield ? sumShieldPR : 0);
    const totalAV = sumAV - avoidanceSkval + sumOtherAV;
    const totalPR = sumPR + (protectionSkval / 5) + weaponProtection + sumOtherPR + parryPointsTotal;
    // Parry only defends against melee attacks -- it can't block a missile or a spell.
    const totalPRvsRangedOrMagic = totalPR - parryPointsTotal;
    return { sumAV, sumPR, totalAV, totalPR, totalPRvsRangedOrMagic };
  }

  const withShield = buildTotals(true);
  const withoutShield = buildTotals(false);
  // What is in hand right now (see computeWielding): the shield column applies
  // when a shield is wielded, otherwise the no-shield column.
  const wield = computeWielding(character);
  const current = wield.shields ? withShield : withoutShield;

  return { armorItems, shieldsComputed, shieldUseSkval, avoidanceSkval, protectionSkval,
           weaponProtection, weaponProtectionManual, weaponProtectionWielded, otherBonuses, sumOtherAV, sumOtherPR, parryPointsTotal,
           sumArmorAV, sumArmorPR, sumShieldAV, sumShieldPR,
           withShield, withoutShield, current, wield, shieldsCounted };
}


function getTrainedSkills(charId) {
  const char = state.characters[charId];
  if (!char) return [];
  return (char.skills || []).filter(s => !s.dropdownOnly);
}
