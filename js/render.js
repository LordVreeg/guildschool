// ============================================================
// RENDER
// ============================================================
function renderApp() {
  renderCharSelect();
  if (state.activeChar) {
    renderSidebar();
    renderMain();
  }
}

function renderCharSelect() {
  const sel = document.getElementById('char-select');
  const sortSel = document.getElementById('char-sort');
  const chars = Object.values(state.characters);
  const mode = state.charSortMode || 'name';
  if (sortSel) sortSel.value = mode;

  const charXP = c => (c.skills || []).reduce((sum, si) => sum + (parseFloat(si.rawXP) || 0), 0);
  const label = c => `${c.name}${c.isNPC ? ' (NPC)' : ''} (${charXP(c).toLocaleString()} XP)`;
  const groupName = c => { const g = myGroups.find(x => x.id === c.playGroupId); return g ? g.name : null; };

  let html = '<option value="">— select character —</option>';
  if (mode === 'name') {
    const sorted = [...chars].sort((a,b) => (a.name||'').localeCompare(b.name||''));
    html += sorted.map(c => `<option value="${c.id}" ${c.id === state.activeChar ? 'selected' : ''}>${label(c)}${groupName(c) ? ' ['+groupName(c)+']' : ''}${c.locale ? ' - '+c.locale : ''}</option>`).join('');
  } else {
    const groups = {};
    for (const c of chars) {
      const key = mode === 'group' ? (groupName(c) || '(No Group)') : (c.locale || '(No Locale)');
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    const keys = Object.keys(groups).sort((a,b) => {
      if (a.startsWith('(No')) return 1;
      if (b.startsWith('(No')) return -1;
      return a.localeCompare(b);
    });
    for (const key of keys) {
      const sorted = groups[key].sort((a,b) => (a.name||'').localeCompare(b.name||''));
      html += `<optgroup label="${key}">` +
        sorted.map(c => `<option value="${c.id}" ${c.id === state.activeChar ? 'selected' : ''}>${label(c)}</option>`).join('') +
        `</optgroup>`;
    }
  }
  sel.innerHTML = html;
}

// Top bar dropdown menus (File / Character / Other). Click a menu to open it;
// clicking outside, pressing Escape, or picking an item closes it.
function toggleTopMenu(name, event) {
  if (event) event.stopPropagation();
  document.querySelectorAll('#topbar .top-menu').forEach(m => {
    m.classList.toggle('open', m.dataset.menu === name && !m.classList.contains('open'));
  });
}
function closeTopMenus() {
  document.querySelectorAll('#topbar .top-menu.open').forEach(m => m.classList.remove('open'));
}
document.addEventListener('click', e => { if (!e.target.closest('#topbar .top-menu')) closeTopMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTopMenus(); });
// The layout fills the window below the top bar, whose height can change (two rows, wrapping).
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--topbar-h', entry.target.offsetHeight + 'px');
}).observe(document.getElementById('topbar'));

let collapsedSections = {};

function toggleSection(type) {
  collapsedSections[type] = !collapsedSections[type];
  renderSidebar();
  if (state.activeView === 'spell') renderSpellModule();
}

// Sidebar skill tree: within each type section only top-level skills show;
// a skill's sub-skills appear when it is expanded (its ▸ toggle). Opening a
// skill collapses everything else, leaving just the path to it and its own
// sub-skills open.
let expandedSkillIds = new Set();

function toggleSkillExpanded(skillId, event) {
  if (event) event.stopPropagation();
  if (expandedSkillIds.has(skillId)) expandedSkillIds.delete(skillId);
  else expandedSkillIds.add(skillId);
  renderSidebar();
}

// A skill's parent is the instance it is explicitly linked to (parentSkillId),
// else the character's instance of its catalog parent. Parents in another
// type section don't nest, so those skills stay top-level in their own section.
function sidebarParentId(si, sectionIds, allSkills) {
  if (si.parentSkillId && sectionIds.has(si.parentSkillId)) return si.parentSkillId;
  const def = SKILLS.find(s => s.name === si.skillName);
  const parentName = def && !def.templated && def.parent ? def.parent.trim().toLowerCase() : '';
  if (!parentName) return null;
  const parent = allSkills.find(s => s.id !== si.id && sectionIds.has(s.id) && s.skillName.trim().toLowerCase() === parentName);
  return parent ? parent.id : null;
}

// Map of skill id -> child instances, in sidebar order; .parentOf maps child id -> parent id.
function skillChildrenMap(sectionSkills, allSkills) {
  const sectionIds = new Set(sectionSkills.map(si => si.id));
  const children = new Map();
  children.parentOf = new Map();
  for (const si of sectionSkills) {
    const parentId = sidebarParentId(si, sectionIds, allSkills);
    if (!parentId) continue;
    // Skip a link that would loop back on itself (A under B under A).
    let up = parentId, loops = false;
    for (let n = 0; up && n < 50; n++) {
      if (up === si.id) { loops = true; break; }
      up = children.parentOf.get(up);
    }
    if (loops) continue;
    children.parentOf.set(si.id, parentId);
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(si);
  }
  return children;
}

// Expand only the active skill and its ancestors, collapsing everything else.
function focusSkillInSidebar(skillId) {
  const char = state.characters[state.activeChar];
  const skills = (char && char.skills) || [];
  const si = skills.find(s => s.id === skillId);
  expandedSkillIds = new Set([skillId]);
  if (!si) return;
  const def = SKILLS.find(s => s.name === si.skillName);
  const type = def ? def.type : 'Other';
  const section = skills.filter(s => { const d = SKILLS.find(x => x.name === s.skillName); return (d ? d.type : 'Other') === type; });
  const parentOf = skillChildrenMap(section, skills).parentOf;
  for (let up = parentOf.get(skillId), n = 0; up && n < 50; up = parentOf.get(up), n++) expandedSkillIds.add(up);
}

// The Spells page only applies once a character has at least one level of Spirit SP.
function hasSpiritLevel(char) {
  if (!char) return false;
  const skills = char.skills || [];
  return skills.some(si => si.skillName === 'Spirit SP' && !si.dropdownOnly &&
    computeSkillValues(si, char, skills).level >= 1);
}

function renderSidebar() {
  const char = state.characters[state.activeChar];
  if (!char) return;
  const skills = char.skills || [];
  const byType = {};
  for (const si of skills) {
    const def = SKILLS.find(s => s.name === si.skillName);
    const type = def ? def.type : 'Other';
    if (!byType[type]) byType[type] = [];
    byType[type].push(si);
  }
  const view = state.activeSkillId ? 'skill' : (state.activeView || 'overview');
  const navItem = (key, onclick, label) => `<div class="sidebar-item ${view === key ? 'active' : ''}" onclick="${onclick}">${label}</div>`;
  let html = navItem('overview', 'showOverview()', '📋 Overview');
  html += navItem('general', 'showGeneralModule()', '👤 General Info');
  html += navItem('combat', 'showCombatModule()', '⚔ Combat');
  if (hasSpiritLevel(char)) html += navItem('spell', 'showSpellModule()', '✦ Spells');
  html += navItem('inventory', 'showInventoryModule()', '🎒 Inventory');
  html += `<hr style="border-color:var(--border);margin:4px 0">`;
  const typeOrder = ['Combat','Spell','Acting','Alchemic','Art','Artisan','Curative','Dance','Detect','Engineer','Language','Mind','Movement','Music','Priest','Scholar','Social','Thieves','Torturer','Outdoor','Other'];
  const sortedTypes = typeOrder.filter(t => byType[t]).concat(Object.keys(byType).filter(t => !typeOrder.includes(t)));
  for (const type of sortedTypes) {
    // Auto-expand a section if it contains the currently active skill, unless the user has explicitly collapsed it
    const containsActive = byType[type].some(si => si.id === state.activeSkillId);
    if (containsActive && collapsedSections[type] === undefined) collapsedSections[type] = false;
    const isCollapsed = collapsedSections[type] === undefined ? true : collapsedSections[type];
    const arrow = isCollapsed ? '▶' : '▼';
    html += `<div class="sidebar-section" style="cursor:pointer;display:flex;align-items:center;gap:5px" onclick="toggleSection('${type}')">
      <span style="font-size:9px">${arrow}</span>${type} <span style="color:var(--text-dim);font-weight:normal">(${byType[type].length})</span>
    </div>`;
    if (isCollapsed) continue;
    const children = skillChildrenMap(byType[type], skills);
    const renderNode = (si, depth) => {
      const vals = computeSkillValues(si, char, skills);
      const dot = si.dropdownOnly ? 'dot-dropdown' : 'dot-trained';
      const active = si.id === state.activeSkillId ? 'active' : '';
      const kids = children.get(si.id) || [];
      const open = expandedSkillIds.has(si.id);
      const toggle = kids.length
        ? `<span class="skill-toggle" title="${open ? 'Hide' : 'Show'} ${kids.length} sub-skill${kids.length === 1 ? '' : 's'}" onclick="toggleSkillExpanded('${si.id}', event)">${open ? '▾' : '▸'}</span>`
        : `<span class="skill-toggle"></span>`;
      html += `<div class="sidebar-item skill-node ${active}" style="--depth:${depth}" onclick="showSkillModule('${si.id}')">
        ${toggle}<span class="dot ${dot}"></span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${si.skillName}${si.binding ? ` <span style="color:var(--text-dim)">(${si.binding})</span>` : ''}</span>
        <span class="lv">L${vals.level} / ${vals.skval}</span>
      </div>`;
      if (open) for (const kid of kids) renderNode(kid, depth + 1);
    };
    for (const si of byType[type]) if (!children.parentOf.has(si.id)) renderNode(si, 0);
  }
  html += `<div class="sidebar-add"><button onclick="openAddSkillModal()">+ Add Skill</button></div>`;
  html += `<hr style="border-color:var(--border);margin:4px 0">`;
  document.getElementById('sidebar').innerHTML = html;
}

function renderMain() {
  if (!state.activeSkillId && state.activeView === 'overview') { renderOverview(); return; }
  if (state.activeView === 'general') { renderGeneralModule(); return; }
  if (state.activeView === 'combat') { renderCombatModule(); return; }
  if (state.activeView === 'inventory') { renderInventoryModule(); return; }
  if (state.activeView === 'spell') {
    if (!hasSpiritLevel(state.characters[state.activeChar])) { showOverview(); return; }
    renderSpellModule(); return;
  }
  if (state.activeView === 'utilities') { renderUtilitiesModule(); return; }
  if (state.activeView === 'group') { renderGroupModule(); return; }
  if (state.activeView === 'bestiary') { renderBestiaryModule(); return; }
  if (state.activeView === 'encounter') { renderEncounterModule(); return; }
  if (state.activeSkillId) { renderSkillModule(state.activeSkillId); return; }
  renderOverview();
}

function showOverview() {
  state.activeSkillId = null;
  state.activeView = 'overview';
  renderSidebar();
  renderOverview();
}

function showGeneralModule() {
  state.activeSkillId = null;
  state.activeView = 'general';
  renderSidebar();
  renderGeneralModule();
}

function showInventoryModule() {
  state.activeSkillId = null;
  state.activeView = 'inventory';
  renderSidebar();
  renderInventoryModule();
}

function showCombatModule() {
  state.activeSkillId = null;
  state.activeView = 'combat';
  renderSidebar();
  renderCombatModule();
  showPageIntroOnce('combat', 'The Combat page', COMBAT_PAGE_INTRO_HTML);
}

function showSpellModule() {
  state.activeSkillId = null;
  state.activeView = 'spell';
  renderSidebar();
  renderSpellModule();
  showPageIntroOnce('spell', 'The Spells page', SPELL_PAGE_INTRO_HTML);
}

// A short explainer the first time someone opens the Combat or Spells page
// in this browser. Remembered in localStorage (and in memory, for browsers
// that block it), so it never nags again.
const pageIntrosShown = new Set();
function showPageIntroOnce(key, title, bodyHtml) {
  let seen = pageIntrosShown.has(key);
  try { if (!seen) seen = localStorage.getItem('gs_intro_' + key) === '1'; } catch (e) {}
  if (seen) return;
  pageIntrosShown.add(key);
  try { localStorage.setItem('gs_intro_' + key, '1'); } catch (e) {}
  openModal(`
    <h3>${title}</h3>
    <div style="font-size:13px;line-height:1.5">${bodyHtml}</div>
    <div class="modal-actions"><button class="btn btn-gold" onclick="closeModal()">Got it</button></div>`, { wide: true });
}

const COMBAT_PAGE_INTRO_HTML = `
  <p>This page builds itself from your inventory.</p>
  <ul style="margin:6px 0 6px 18px;padding:0">
    <li><b>Weapons:</b> any item of type Weapon on your Inventory page (<i>+ Add Item</i>) appears here with its to-hit, damage bonus, speed, crit and fumble chances, and parry, worked out from your attributes and your skill in that weapon's class. Set the weapon's class to the skill you trained (for example Basic Spears).</li>
    <li><b>Armor and shields:</b> items of type Armor or Shield add to your Avoidance and Protection totals here. Your Avoidance and Protection skills are applied on top.</li>
    <li><b>Hit Points:</b> track your current HP here. It uses your Hit Points skill and works for both the Standard and Collegium systems.</li>
    <li><b>Nothing is entered twice:</b> add, change or remove an item in your inventory and this page updates to match.</li>
  </ul>`;

const SPELL_PAGE_INTRO_HTML = `
  <p>This page holds your spell points and your spellbook.</p>
  <ul style="margin:6px 0 6px 18px;padding:0">
    <li><b>The whole library is open to you.</b> Add a line to your spellbook, choose a school, then pick the spell from the full list for that school; its cost fills in.</li>
    <li><b>Spell points:</b> your pools come from the spell skills you have trained (Spirit SP plus each school). Short in a school? Spirit can cover the gap at a conversion ratio.</li>
    <li><b>Casting:</b> press <i>Cast</i> on a spell and choose Hardcast, Plaque or Scrollcast. It works out the cost and your success chance, spends the points, then rolls (or lets you enter) the GM's d50 and your d100.</li>
    <li><b>Recovery:</b> if your character is linked to a group, spell points come back as the group's clock moves forward.</li>
  </ul>`;

// Brand-new characters (the creation screen sets welcomeShown) are nudged
// until they have chosen a main guild. Imported and older characters, and
// NPCs, are left alone.
function mainGuildBannerHtml(char, onGeneralPage) {
  if (char.guild || char.isNPC || char.welcomeShown === undefined) return '';
  return `<div style="border:2px solid var(--gold);border-radius:4px;padding:10px 12px;margin-bottom:12px;background:rgba(201,162,39,.12)">
    <b>Pick your main Guild/School first.</b> Do this before anything else. Your guild decides what you are better and worse at: it adjusts how fast every skill levels (the EXP modifier), so some skills come easily and others slowly. Skills you add afterwards are tagged to it.
    ${onGeneralPage ? '<div class="note" style="margin-top:4px">Set it under Guilds, Primary Guild, further down this page.</div>' : '<div style="margin-top:6px"><button class="btn btn-gold" onclick="showGeneralModule()">Choose Primary Guild</button></div>'}
  </div>`;
}

function showUtilitiesModule() {
  state.activeSkillId = null;
  state.activeView = 'utilities';
  renderSidebar();
  renderUtilitiesModule();
}
