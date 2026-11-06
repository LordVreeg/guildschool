# Known Issues

## Supabase settings needed for password recovery

The sign-in screen has a "Forgot password?" link. It sends Supabase's reset
email, and the link in that email returns to the app's "Set a New Password"
screen. Two settings in the Supabase dashboard decide whether this works.
Neither one is a code or database change.

### 1. Redirect URLs

**Where:** Authentication → URL Configuration

- Add `https://lordvreeg.github.io/guildschool/` to **Redirect URLs**.
- For local testing, also add `http://localhost:8765/`.
- Set **Site URL** to `https://lordvreeg.github.io/guildschool/`.

Supabase only sends people back to addresses on the Redirect URLs list. A
reset link for any other address goes to the Site URL instead. That means a
wrong Site URL sends reset links, and sign-up confirmation links, to the
wrong place.

### 2. Email sending (SMTP)

**Where:** Authentication → SMTP Settings

Supabase's built-in email sender only delivers to members of the Supabase
project's team. It is also rate-limited to a few emails an hour. Until a
custom email provider is set up (Resend, Postmark, Gmail SMTP, etc.):

- Players outside the team get no password reset email.
- Players outside the team also get no sign-up confirmation email.
- Even team members can hit the hourly limit.

## Bump the version tag on every CSS, JS or data change

`index.html` adds a version tag to the stylesheet and to every script tag,
for example `css/app.css?v=2026-10-22.1`. `js/data.js` reads that same value
and adds it to each `data/*.json` request. The tag makes browsers fetch the
new files instead of reusing cached copies.

**Rule:** any commit that changes a file in `css/`, `js/` or `data/` must
also bump `?v=` in `index.html`. That includes wiki syncs that only touch
`data/`.

- Change all 17 tags (1 stylesheet + 16 scripts) to the same new value.
- Use the date plus a counter for that day, e.g. `2026-10-23.1`, then
  `2026-10-23.2`.
- One way to do it from the repo root:
  `sed -i -E 's/\?v=[0-9.-]+"/?v=2026-10-23.1"/' index.html`

If the bump is forgotten, nothing breaks. Players just keep the old files
for up to about 10 minutes after a deploy, until GitHub Pages' cache
expires, or until they press Ctrl+F5.

## Inventory catalog gaps

In the Add/Edit Item popup, the Weapon Class list is the fixed
`WEAPON_CLASSES` in `js/data.js`. The Model list after it comes from
`data/weapons.json`, matched to a class through `WEAPON_CATEGORY_TO_SKILL`.
Two entries don't match up:

- **Thrown weapons can't be picked.** `data/weapons.json` has a "Thrown"
  category, but `WEAPON_CATEGORY_TO_SKILL` maps it to no weapon class
  (`'Thrown': null`). No Weapon Class leads to those models, so they never
  appear in the Model list.
- **"Basic Shield Use" has no models.** It is in `WEAPON_CLASSES`, but no
  weapon category maps to it. Choosing it as the Weapon Class always gives
  an empty Model list.

## UI

- **Top bar overflows on narrow screens.** When signed in, the header needs about
  1,400px. On anything narrower (laptops, tablets, phones, a docked window),
  the buttons don't fit and the whole page scrolls sideways.

## Local development

- **Opening `index.html` straight from disk doesn't work.** The app fetches
  its reference data from `data/*.json`, and browsers block that for
  `file://` pages. Serve the folder instead, for example with
  `python -m http.server 8765`, then open `http://localhost:8765/`.

## Game Schedule needs a one-time Supabase setup

The Game Schedule page (Other menu, or the button on a group page) stores
sessions in `game_sessions` and emails the group through an Edge Function.
None of that exists until it is set up in the Supabase dashboard:

1. Run `schema_v28_game_schedule.sql` in the SQL Editor.
2. Deploy `edge_functions/session-mail/index.ts` as a function named
   `session-mail` with "Enforce JWT verification" off, and add its secrets
   (the comments at the top of the file list them: `CRON_SECRET`, `APP_URL`,
   `MAIL_FROM`, and either `RESEND_API_KEY` or the `SMTP_*` settings).
3. Enable `pg_cron` and `pg_net`, then run the `cron.schedule(...)` statement
   from the end of the SQL file. It sends the 9 AM day-before reminders.

Until step 2 is done a GM can still schedule games; the page says the email
did not go out. Until step 1 is done the page says the table is missing.
These SQL and function files live in the private `GS Tool` folder, not in
this repo.
