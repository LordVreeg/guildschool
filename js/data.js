// ============================================================
// DATA — loaded from external JSON files
// ============================================================
let SKILLS = [];
let BASIC_ITEMS = [];
let ARMOR = [];
let SHIELDS = [];
let WEAPONS = [];
let AMMUNITION = [];
let SPELLS = [];
let RACIAL_BONUSES = {};
let COINAGE = [];
let ACQUISITIONS_CHART = [];
const RACE_LANGUAGE_MAP = {
  'Omwo~': { default: 'Omwo~' },
  'Klaxik': { default: 'Klaxik' },
  'Orcash': { default: 'Orcash', 'Zyjmanese': 'Zyjmanese' },
  'Hobytalia': { default: 'Hobyt', 'Red': 'Red Hobyt' },
  'Human': { 'Southern': 'Vox (Southern Common)', 'Grey March': 'Marcher (grey March)', 'Omnian': 'Omnian' },
};
let BASE_RACE_TABLE = {};
let SUBRACE_TABLES = {};
let SOCIAL_CHARTS = {};
const SPELL_SCHOOL_TO_POOL = {
  'Air': 'House of Air SP', 'Animist': 'Animist SP', 'Artificer': 'Artificer SP',
  'Chaos': 'House of Chaos SP', 'Death': 'House of Death SP', 'Earth': 'House of Earth SP',
  'Fire': 'House of Fire SP', 'Life': 'House of Life SP', 'Mentalist': 'Mentalist SP',
  'Necromantic': 'Necromantic SP', 'Order': 'House of Order SP', 'Restorative': 'Restorative SP',
  'Water': 'House of Water SP', 'Spirit': 'Spirit SP', 'Shade': 'Shade SP'
};
// The per-spell cost breakdown (costs field) uses the raw wiki cost-category names, which
// use 'Law' rather than 'Order' for that pool — different from SPELL_SCHOOL_TO_POOL's school
// dropdown labels. Keep this separate rather than aliasing into SPELL_SCHOOL_TO_POOL, which
// would add a confusing duplicate option to that dropdown.
const COST_KEY_TO_POOL = {
  'Spirit': 'Spirit SP', 'Earth': 'House of Earth SP', 'Water': 'House of Water SP',
  'Fire': 'House of Fire SP', 'Air': 'House of Air SP', 'Life': 'House of Life SP',
  'Death': 'House of Death SP', 'Law': 'House of Order SP', 'Chaos': 'House of Chaos SP',
  'Restorative': 'Restorative SP', 'Necromantic': 'Necromantic SP', 'Mentalist': 'Mentalist SP',
  'Artificer': 'Artificer SP', 'Animist': 'Animist SP',
};
const WEAPON_CATEGORY_TO_SKILL = {
  'Axes': 'Basic Axe', 'Blunt': 'Basic Blunt Weapons', 'Bows': 'Basic Bows',
  'Crossbow': 'Basic Crossbow', 'Curved Swords': 'Basic Curved Swords', 'Daggers': 'Basic Dagger',
  'Dress Swords': 'Basic Dress swords', 'Martial': 'Basic Martial artist', 'Pole Arms': 'Basic Pole Weapons', 'Spears': 'Basic Spears',
  'Straight Swords': 'Basic Straight Swords', 'Thrown': null
};
let GUILDS = {};
let LEVELS = [];
const WEAPON_CLASSES = [
  'Basic Axe', 'Basic Blunt Weapons', 'Basic Bows', 'Basic Crossbow',
  'Basic Curved Swords', 'Basic Dagger', 'Basic Dress swords',
  'Basic Martial artist', 'Basic Pole Weapons', 'Basic Shield Use',
  'Basic Spears', 'Basic Straight Swords'
];
// Inventory item types, as saved on each item. Code elsewhere matches these
// exact names (e.g. the Combat page uses 'Weapon', 'Armor', 'Shield' and
// 'Ammunition' items), so to rename one for display, add it to
// ITEM_TYPE_LABELS instead of changing the saved name.
const ITEM_TYPE_LABELS = { 'Ammunition': 'Weapon, Ammunition' };
function itemTypeLabel(type) { return ITEM_TYPE_LABELS[type] || type; }
// Listed alphabetically by label in the Add/Edit Item popup.
const ITEM_TYPES = ['Ammunition', 'Armor', 'Coin', 'Item', 'Magic Item', 'Shield', 'Weapon']
  .sort((a, b) => itemTypeLabel(a).localeCompare(itemTypeLabel(b)));
// The "Magic Item Class" choices for a Magic Item.
const MAGIC_ITEM_CLASSES = ['Books', 'Clothing', 'Jewelry', 'Misc', 'Potions', 'Scrolls'];

// Base-creature stat templates transcribed from the wiki's Bestiary section.
// Picking one of these in the Bestiary editor pre-fills the stat fields below, same
// pattern as selectBestiaryArmor/selectBestiaryAttackWeapon -- always still
// editable after. Add more entries to data/bestiary-templates.json as more wiki Bestiary pages appear.
//
// avg_damage is left at 0 for every template except Goblin: the wiki's
// damage notation is "((dice+flat)/dX)+flat" -- a division by an
// independently-rolled die -- and the exact resolution rule (rounding,
// order of operations) isn't documented on these pages, so no reliable
// single average could be computed without guessing at core mechanics.
// The raw formula is preserved in full in each attack's damageDice field;
// fill in avg_damage by hand once loaded, if you want it to feed the XP box.
let BESTIARY_RACE_TEMPLATES = [];

// Skill catalog lookup by name. Ignores case and extra spaces, so "hit points"
// or "Hit  Points " still find "Hit Points". Every lookup of a skill's catalog
// entry goes through findSkillDef rather than comparing names directly.
// SKILL_NAME_ALIASES maps an old name (lowercase) to its current catalog name;
// add an entry when the wiki renames a skill.
const SKILL_NAME_ALIASES = {};
// The order skill types are listed in (sidebar, Overview, Add Skill, and the
// Utilities custom-skill Type list). Names must match the types in
// data/skills.json exactly; a type missing here is listed after these.
const SKILL_TYPE_ORDER = ['Combat', 'Spell', 'Acting', 'Alchemic', 'Art', 'Artisan', 'Athletics', 'Curative', 'Dance', 'Detect', 'Engineer', 'Language', 'Mind', 'Movement', 'Music', 'Priest', 'Scholar', 'Social', 'Thieves Tree', 'Torturer', 'Outdoor'];
// The sidebar/Overview group for a skill that isn't in the catalog at all.
const UNKNOWN_SKILL_TYPE = '(not in skill catalog)';
function normalizeSkillName(name) {
  return String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();
}
let skillIndexCache = { list: null, size: -1, map: null };
function findSkillDef(name) {
  if (skillIndexCache.list !== SKILLS || skillIndexCache.size !== SKILLS.length) {
    const map = new Map();
    for (const sk of SKILLS) { const k = normalizeSkillName(sk.name); if (!map.has(k)) map.set(k, sk); }
    skillIndexCache = { list: SKILLS, size: SKILLS.length, map };
  }
  const key = normalizeSkillName(name);
  if (!key) return undefined;
  const alias = SKILL_NAME_ALIASES[key];
  return skillIndexCache.map.get(key) || (alias ? skillIndexCache.map.get(normalizeSkillName(alias)) : undefined);
}
// A skill instance's type for grouping; skills missing from the catalog get
// their own flagged group instead of quietly landing somewhere else.
function skillTypeOf(skillName) {
  const def = findSkillDef(skillName);
  return def ? def.type : UNKNOWN_SKILL_TYPE;
}

// Same ?v= as this script's own tag in index.html, so bumping it there also
// makes browsers fetch updated data files instead of cached ones.
const ASSET_VERSION = (document.currentScript && new URL(document.currentScript.src).searchParams.get('v')) || '';

async function fetchDataFile(name) {
  const res = await fetch(`data/${name}.json` + (ASSET_VERSION ? `?v=${encodeURIComponent(ASSET_VERSION)}` : ''));
  if (!res.ok) throw new Error(`data/${name}.json: HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  [SKILLS, GUILDS, LEVELS, ARMOR, SHIELDS, WEAPONS, AMMUNITION, SPELLS, BASIC_ITEMS, RACIAL_BONUSES, BASE_RACE_TABLE, SUBRACE_TABLES, SOCIAL_CHARTS, COINAGE, ACQUISITIONS_CHART,
   BESTIARY_RACE_TEMPLATES] = await Promise.all([
    'skills', 'guilds', 'levels', 'armor', 'shields', 'weapons', 'ammunition', 'spells', 'basic-items', 'racial-bonuses', 'base-race-table', 'subrace-tables', 'social-charts', 'coinage', 'acquisitions-chart',
    'bestiary-templates',
  ].map(fetchDataFile));
  applyCustomData();
  renderApp();
}
