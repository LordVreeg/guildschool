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
  `data/`, change `?v=` in `index.html` on the stylesheet and all 15 script
  tags, all to the same new value. Use the date plus a counter, e.g.
  `2026-10-23.1`. One way to do it:
  `sed -i -E 's/\?v=[0-9.-]+"/?v=2026-10-23.1"/' index.html`
  `js/data.js` reuses the value for the data files. Without the bump,
  players keep running cached old files after a deploy.
- **Wiki syncs edit `data/*.json`.** The wiki mirror is an HTTrack copy of
  celtricia.pbworks.com. A sync must not inline data into the JS, and it
  must bump the version tag too.
- **The reference data stays in `data/*.json` for now.** Moving it into
  Supabase is on hold.

## Running locally

Opening `index.html` straight from disk doesn't work, because browsers
block `fetch()` of `data/*.json` on `file://` pages. Serve the repo root
instead:

```bash
python -m http.server 8765
```

Then open http://localhost:8765/. `.claude/launch.json` already defines this
server, so the in-app browser can start it.
