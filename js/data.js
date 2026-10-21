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

async function fetchDataFile(name) {
  const res = await fetch(`data/${name}.json`);
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
