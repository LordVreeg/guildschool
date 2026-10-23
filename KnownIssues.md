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

- Change all 16 tags (1 stylesheet + 15 scripts) to the same new value.
- Use the date plus a counter for that day, e.g. `2026-10-23.1`, then
  `2026-10-23.2`.
- One way to do it from the repo root:
  `sed -i -E 's/\?v=[0-9.-]+"/?v=2026-10-23.1"/' index.html`

If the bump is forgotten, nothing breaks. Players just keep the old files
for up to about 10 minutes after a deploy, until GitHub Pages' cache
expires, or until they press Ctrl+F5.

## UI

- **Top bar overflows on narrow screens.** When signed in, the header needs about
  1,400px. On anything narrower (laptops, tablets, phones, a docked window),
  the buttons don't fit and the whole page scrolls sideways.

## Local development

- **Opening `index.html` straight from disk doesn't work.** The app fetches
  its reference data from `data/*.json`, and browsers block that for
  `file://` pages. Serve the folder instead, for example with
  `python -m http.server 8765`, then open `http://localhost:8765/`.
