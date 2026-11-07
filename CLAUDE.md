# GuildSchool

GuildSchool is a character system for the Celtricia tabletop game. It is a
static site served by GitHub Pages from `main`
(https://lordvreeg.github.io/guildschool/). It uses Supabase for sign-in and
for all user and campaign data. There is no build step: edit the files and
commit.

## Layout

- `index.html` is the page shell. It holds the markup, then the stylesheet
  link and the script tags.
- `css/app.css` holds all the styles.
- `js/*.js` are plain scripts, not ES modules. They load in the order the
  `<script>` tags list them, and they all share global scope. Inline
  `onclick="..."` handlers call these globals, so keep functions top-level.
  Code that has to run after every file has loaded belongs in `js/init.js`.
- `data/*.json` is the game's reference data: skills, guilds, spells,
  weapons, armor, items, Bestiary templates and lookup tables.
  `loadData()` in `js/data.js` fetches it after sign-in.
- `assets/img/` holds the images.
- `KnownIssues.md` lists open problems and needed Supabase dashboard
  settings.

## Rules

- **Bump the version tag.** In any commit that changes `css/`, `js/` or
  `data/`, change `?v=` in `index.html` on the stylesheet and all 16 script
  tags, all to the same new value. Use the date plus a counter, e.g.
  `2026-10-23.1`. One way to do it:
  `sed -i -E 's/\?v=[0-9.-]+"/?v=2026-10-23.1"/' index.html`
  `js/data.js` reuses the value for the data files. Without the bump,
  players keep running cached old files after a deploy.
- **Wiki syncs edit `data/*.json`.** The wiki mirror is an HTTrack copy of
  celtricia.pbworks.com. A sync must not inline data into the JS, and it
  must bump the version tag too.
- **A weapon-table row with no stat requirements is ammunition.** On the
  wiki, arrows, bolts and sling shot sit in the weapon tables (Bows, Thrown)
  with nothing marking them as ammunition. A row with no STN, CDN, STMOD or
  CDMOD (all blank or 0) goes in `data/ammunition.json`, not
  `data/weapons.json`: keep its cost, weight, size, damage dice, dividing
  die, real min, max and average damage, put the table's range value in
  `range_mod`, and set `compatible_with` to what fires it: a weapon
  category ("Bows", "Crossbow") or a weapon's name ("Sling"), or a list of
  them; `ammoFitsWeapon` in `js/data.js` reads it. A wiki sync
  must keep this split. See "Ammunition" in `KnownIssues.md`.
- **The reference data stays in `data/*.json` for now.** Moving it into
  Supabase is on hold.
- **Look skills up with `findSkillDef(name)`.** To get a skill's catalog
  entry, call `findSkillDef` in `js/data.js`. Don't compare names yourself
  with `SKILLS.find(s => s.name === ...)`. `findSkillDef` ignores case and
  extra spaces, and it follows `SKILL_NAME_ALIASES`; add an alias there when
  the wiki renames a skill. A skill it can't find shows under the flagged
  "⚠ Not in skill catalog" group, so don't let that fail silently.
- **Skill types must match `SKILL_TYPE_ORDER`.** Every `type` in
  `data/skills.json` must be spelled exactly like an entry in
  `SKILL_TYPE_ORDER` in `js/data.js`. That list sets the order of type
  groups in the sidebar, the Overview, Add Skill and the Utilities Type
  dropdown. A wiki sync that brings in a new or misspelled type (e.g.
  "Mind>", "Thieve's Tree") puts its skills in a stray group at the end.
  Fix the typo in the data, or add a genuinely new type to the list.
- **Help text.** Text that explains a page follows one rule, so pages stay
  compact and consistent:
  - **Warnings** stay on the page: `<div class="warn">`. Use them only when
    something is wrong or about to be lost (too much in hand, no uses left,
    data stored only in this browser).
  - **Empty states** stay on the page: `<div class="note">No items yet…</div>`.
  - **Formulas and rule explanations** go in a ⓘ: `infoTip(text)` (in
    `js/auth.js`) puts a small ⓘ next to the label, heading or column they
    explain, and its text shows in the app's own tooltip on hover, click/tap
    or focus. Don't put them in a note under a table, and don't use a
    `title` attribute for them (it doesn't show in every browser, or on
    touch screens).
  - **Instructions**: at most one short line per section, and only where the
    action isn't obvious ("Use ✎ to change an item.").
  - **No inline styles on notes.** Spacing and colour come from `.note`,
    `.warn` and `.info-tip` in `css/app.css`. Page placeholders use
    `<div class="note placeholder">`.
  - When a feature moves, update or remove the text that points at its old
    place.

## Running locally

Opening `index.html` straight from disk doesn't work, because browsers
block `fetch()` of `data/*.json` on `file://` pages. Serve the repo root
instead:

```bash
python -m http.server 8765
```

Then open http://localhost:8765/. `.claude/launch.json` already defines this
server, so the in-app browser can start it.
