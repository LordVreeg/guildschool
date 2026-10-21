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

## UI

- **Top bar overflows on narrow screens.** When signed in, the header needs about
  1,400px. On anything narrower (laptops, tablets, phones, a docked window),
  the buttons don't fit and the whole page scrolls sideways.

## Local development

- **Opening `index.html` straight from disk doesn't work.** The app fetches
  its reference data from `data/*.json`, and browsers block that for
  `file://` pages. Serve the folder instead, for example with
  `python -m http.server 8765`, then open `http://localhost:8765/`.
