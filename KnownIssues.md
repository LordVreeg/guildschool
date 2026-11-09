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

- Change all 21 tags (1 stylesheet + 20 scripts) to the same new value.
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
`data/weapons.json`, matched to a class through `WEAPON_CATEGORY_TO_SKILL`
(a class can cover more than one category). One entry doesn't match up:

- **Thrown weapons** were here until 2026-11-06: the "Thrown" category
  mapped to no class. Thrown weapons, like Hand/Foot, are covered by Basic
  Martial artist, so "Thrown" now maps to it and its models (Sling,
  Shuriken, Chakram, Lead Ball, the spiked net) are in that class's Model
  list.
- **"Basic Shield Use" has no models.** It is in `WEAPON_CLASSES`, but no
  weapon category maps to it. Choosing it as the Weapon Class always gives
  an empty Model list.

## Ammunition

`data/ammunition.json` isn't a list on the wiki; it is worked out from the
weapon tables (see the ammunition rule in `CLAUDE.md`).

- **Arrows and bolts:** the wiki's Bows page is one table: the seven bows,
  the three crossbows, then "Bolt, Crossbow" and five arrows. Nothing labels
  the last six as ammunition; they just have no weapon stats (STN, CDN,
  mods, speeds and range are all 0). The app's first data extraction (in
  LordVreeg's first commit, 2026-07-30, with no script or notes kept) moved
  them into an ammunition list, set `compatible_with` from their names
  ("Bolt, Crossbow" → Crossbow, "… Arrow" → Bows), and gave the crossbows
  their own "Crossbow" category, which the wiki page doesn't have.
- **Small lead shot** (2026-11-06): it was a Thrown weapon in
  `data/weapons.json` with no stat requirements. The wiki's Thrown page
  footnotes the Sling "to use with small lead shot", and the Sling's "+2"
  damage "adds to lead shot". It is now ammunition, `compatible_with`
  "Sling". Its "-1" was extracted as a threat range, so it keeps
  `threat_range: -1`; it may really be the table's range adjustment
  (`range_mod`), which would need checking against the wiki. Characters who
  already have it as a weapon item keep that item until they replace it.
- **`compatible_with` is used** (2026-11-06): the weapon popup only offers
  ammunition the weapon takes, and the Combat page warns when a weapon in use
  that takes ammunition has none loaded, or the wrong kind. See
  `ammoFitsWeapon` in `js/data.js`. Custom ammunition (not picked from the
  catalog) has to say what fires it: the item popup's required "Fires From"
  dropdown (Bows, Crossbow, Sling: whatever the catalog's ammunition names),
  saved as the item's `compatibleWith`. Custom ammunition added before that
  has none, so it still fits any weapon that takes ammunition until it is
  edited, and editing it asks for Fires From. A fully custom launcher (not a catalog model, a weapon class
  with catalog ammunition, or named "Sling") isn't recognised as taking any.
- **`range_mod` isn't used yet:** range adjustments like the Hunting
  Arrow's +20 or the Heavy Head's −15 aren't applied to the weapon's range.

## Skill catalog

- **Call Damage and Disarm should be templated.** In `data/skills.json`,
  Call Damage (under Damage Bonus) and Disarm (under Parry) have
  `"templated": false`. They are weapon-class skills, like their parents,
  so they should be templated and bound to a weapon class. As it is, they
  aren't bound to one: `autoPopulateDropdownChildren` in `js/modals.js`
  adds each of them only once per character, under whichever weapon class
  was populated first, and a second weapon class never gets its own.
  The other untemplated dropdowns under the shared weapon skills are in the
  same position and may need the same fix: Stunning Attack (Damage Bonus),
  Frenzy and Swarm (Multiple attack), Autohit (Attack Versus), Quickdraw
  (Initiative Bonus) and Slay (perfect attack) (Critical Hit Bonus).
  Fixing it should be a data change only: set `"templated": true` on them
  (and make sure a wiki sync doesn't reset it). The populate code already
  binds a templated dropdown to its parent's weapon class. Existing
  characters keep their unbound copy until it is re-bound or removed.
- **Slay (perfect attack) has no rule yet. Waiting on Norm.** The catalog
  has it as a dropdown of Critical Hit Bonus (`"dropdown": 0.1`, attmod
  `((WI-13)*.005)+((CD-16)*.01)`, per level 1D10+1, commonality 4), and
  the populate code now adds it under Critical Hit Bonus. But the wiki's
  Combat Skills page lists it by name only, with no description, so the app
  doesn't know what it does and nothing uses its skill value. Once Norm
  writes up the rule: add it to the Combat page's weapon numbers, and
  decide whether it should be templated (see the item above). Its catalog
  entry also spells its parent "Critical hit bonus"; that still matches,
  since the lookup ignores case.

## UI

- **Top bar overflows on narrow screens.** When signed in, the header needs about
  1,400px. On anything narrower (laptops, tablets, phones, a docked window),
  the buttons don't fit and the whole page scrolls sideways.

## Characters

### Transfer Ownership does nothing

Character → Transfer Ownership asks for the new owner's email and calls the
Supabase function `transfer_character_ownership`, but the character stays
with its owner. The menu item is disabled until this is fixed. The admin
panel's Transfer button calls the same function, so it probably fails the
same way.

To look into: whether `transfer_character_ownership` exists in the Supabase
project, whether it finds the new owner by email in `profiles`, and whether
it is allowed to change `owner_id` for a character the caller owns.

### Deleting a character in a group

Deleting a character used to drop it from the page even when Supabase
refused the delete, so it came back on the next load. Now the app deletes
the row first and, if Supabase refuses, says why and keeps the character.
A character that belongs to a group (or sits in an encounter) may be refused
because other tables still point to it. If that's the cause, the fix is in
Supabase (cascade, or remove it from the group first).

### Deleting a character that is in a combat encounter

Confirmed 2026-11-07. Deleting a character that is (or was) a combatant
fails with: `new row for relation "combat_combatants" violates check
constraint "combat_combatants_one_source"`. The link from
`combat_combatants.character_id` to `characters` is probably
`ON DELETE SET NULL`, so the delete clears `character_id` on the combatant
row. That leaves the row with no source, which `combat_combatants_one_source`
forbids, and Postgres rolls the whole delete back. Deleting a bestiary entry
(NPC or temp character) that is in an encounter likely fails the same way
through `bestiary_entry_id`.

Needed in the Supabase dashboard (SQL Editor). Check the current rules first:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.combat_combatants'::regclass;
```

Then either:

- **Cascade** (recommended): the combatant is deleted with the character.
  ```sql
  alter table public.combat_combatants
    drop constraint combat_combatants_character_id_fkey,
    add constraint combat_combatants_character_id_fkey
      foreign key (character_id) references public.characters(id) on delete cascade;
  ```
  Do the same for `bestiary_entry_id`. Make sure `combat_action_tracks`
  also cascades when its combatant is deleted, or that will fail next.
- **Keep the combatant as a name only:** relax the check to allow no source,
  e.g. `check (num_nonnulls(character_id, bestiary_entry_id) <= 1)`.
  Past encounters keep their history, but the combatant no longer links to
  a sheet.

Until then: remove the character from its encounters on the Combat page
(the GM can do this), then delete it.

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

## Group inventory needs a one-time Supabase setup

The Group Inventory and GM Inventory pages (sidebar, under the group, and
buttons on the group page) keep the group's items in a `group_items` table.
Until it exists, both pages say it isn't set up. Run this once in the SQL
Editor:

```sql
create table public.group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  -- 'gm': the GM Inventory (GM only); 'group': group treasure;
  -- 'delivery': moved to to_char_id, waiting for its owner's app to take it
  place text not null default 'group' check (place in ('gm', 'group', 'delivery')),
  item jsonb not null,
  starred boolean not null default false,            -- put in the group by the GM, not yet accepted
  assigned_char_id uuid references public.characters(id) on delete set null,  -- may use it
  to_char_id uuid references public.characters(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (place <> 'delivery' or to_char_id is not null)
);
create index on public.group_items (group_id);
create index on public.group_items (assigned_char_id);
create index on public.group_items (to_char_id);

-- security definer, so the policies below don't run into the RLS of
-- group_members and characters
create or replace function public.gi_is_gm(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'gm');
$$;
create or replace function public.gi_is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid())
      or exists (select 1 from characters where group_id = gid and owner_id = auth.uid());
$$;
create or replace function public.gi_owns_char(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select cid is not null and exists (select 1 from characters where id = cid and owner_id = auth.uid());
$$;

-- signed-in users may use the table at all (the policies below decide which rows);
-- without it every request fails with "permission denied for table group_items"
grant select, insert, update, delete on public.group_items to authenticated;

alter table public.group_items enable row level security;
create policy group_items_select on public.group_items for select using (
  gi_is_gm(group_id) or (place <> 'gm' and (gi_is_member(group_id) or gi_owns_char(to_char_id) or gi_owns_char(assigned_char_id))));
create policy group_items_insert on public.group_items for insert with check (
  gi_is_gm(group_id) or (place = 'group' and gi_is_member(group_id)));
create policy group_items_update on public.group_items for update
  using (gi_is_gm(group_id) or (place = 'group' and (gi_is_member(group_id) or gi_owns_char(assigned_char_id))))
  with check (gi_is_gm(group_id) or (place in ('group', 'delivery') and (gi_is_member(group_id) or gi_owns_char(assigned_char_id))));
create policy group_items_delete on public.group_items for delete using (
  gi_is_gm(group_id) or (place <> 'gm' and (gi_is_member(group_id) or gi_owns_char(to_char_id) or gi_owns_char(assigned_char_id))));
```

How it works (`js/group-inventory.js`):

- **Assigned** items stay the group's. The character's inventory shows a
  copy ("Group (assigned)") that works like their own: In Use, magic
  modifiers, Cast / Use. Changes go back to the group's row; using up the
  last of it removes the row. The copy is never saved in the character's
  data. The GM's views of other players' sheets (the roster HP, attack
  checks) read the saved data, so they don't count assigned items.
- **Moved** items become the character's. A character you own gets it at
  once; anyone else's gets it the next time their owner opens the app (or
  their Inventory or Combat page).
- Item numbers and weights on items the GM made (`gmMade`) can only be
  changed by that group's GM. This is checked in the app, not by these
  policies.
