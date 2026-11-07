# GuildSchool Chat

Each group has its own chat. Open it from **Other → 💬 Chat**, and use the
buttons at the top to switch between your groups. Everyone in a group can
read its chat.

The chat works like Roll20's text chat: the same slash commands, the same
dice syntax, inline rolls, macros and roll queries.

## Posting

- **Post as:** pick which of your characters in this group is speaking. Only
  characters linked to the group (on their General Info page) are listed.
  GMs can also post as the character selected at the top of the page, as the
  group's NPCs and temp characters, and as **GM**. Posting as a name works
  like `/as` and `/emas`. It starts on the selected character; after that
  the choice is remembered for each group.
- If none of your characters is in the group, you can read the chat but
  not post.
- Your sender name always comes from the character, so nobody can post
  under someone else's name.
- **Enter** sends. **Shift+Enter** starts a new line. Messages can be up to
  4,000 characters.
- **↑ / ↓** in an empty box steps back and forward through what you've sent.

## Commands

| Command | What it does |
|---|---|
| `/roll 1d20+5` or `/r 1d20+5` | Roll dice for everyone to see |
| `/gmroll 1d20` or `/gr 1d20` | Roll so only you and the GM see it |
| `/w Name message` | Whisper to a character in this group |
| `/w "Lira Vane" message` | Whisper to a name with spaces (use quotes) |
| `/w gm message` | Whisper to the group's GM(s) |
| `/w gm /r 1d20` | Whisper a roll |
| `/em draws a sword` or `/me …` | Emote: shown as "Bren draws a sword" |
| `/ooc brb` | Out of character |
| `/desc The door creaks open.` | **GM only.** Narration with no name |
| `/as "Old Man" Who goes there?` | **GM only.** Speak as anyone |
| `/emas "Old Man" coughs` | **GM only.** Emote as anyone |
| `/talktomyself` (or `on` / `off`) | Your messages stay on your screen only and are not sent or saved |
| `/help` | Show the command and dice list (also the **? Help** button) |

Whispers can contain plain messages, rolls, emotes and OOC. A whisper is
visible only to the person who sent it and the people it went to. As in
Roll20, a GM does **not** see whispers between players.

## Inline rolls

Put a roll inside any message with double square brackets:

```
I hit him for [[2d6+3]] damage!
```

The roll shows as a number in a box. Hover over it to see how it was
rolled. A green box means a critical success was rolled, red means a
critical failure, and blue means both.

Rolls can be nested. The inner roll goes first:

```
[[ [[1d4]]d6 ]]      rolls 1d4, then that many d6
```

## Dice syntax

| Syntax | Meaning |
|---|---|
| `2d6` `d20` `1d100` | Dice (a missing count means 1) |
| `d%` | Percentile (same as d100) |
| `4dF` | Fate dice: each is −1, 0 or +1 |
| `(1+1)d6` `2d(3+3)` | Worked-out number of dice or sides |
| `+ - * / % **` `( )` | Maths (`%` is remainder, `**` is power) |
| `floor()` `ceil()` `round()` `abs()` | Rounding and absolute value |
| `4d6kh3` or `4d6k3` | Keep the highest 3 |
| `2d20kl1` | Keep the lowest 1 (disadvantage) |
| `4d6dl1` or `4d6d1` | Drop the lowest 1 |
| `2d20dh1` | Drop the highest 1 |
| `3d6!` | Exploding: each max roll adds another die |
| `3d6!!` | Compounding: extra rolls add into the same die |
| `3d6!p` | Penetrating: each extra die counts 1 less |
| `1d10!>8` | Explode on 8 or more (any compare point) |
| `4d6r1` `4d6r<2` | Reroll while the die matches |
| `4d6ro1` | Reroll once |
| `10d6>4` | Count successes: dice of 4 **or more** |
| `10d6<2` | Count dice of 2 **or less** |
| `10d6>4f1` | Successes minus failures (1s) |
| `1d20cs>19` | Treat 19–20 as a critical success (green) |
| `1d20cf<3` | Treat 1–3 as a critical failure (red) |
| `8d6s` / `8d6sa` / `8d6sd` | Sort the dice ascending / descending |
| `10d6m` / `10d6m3` | Highlight matching values (pairs / sets of 3) |
| `10d6mt` | Total = number of matching sets |
| `{4d6kh3, 4d6kh3, 4d6kh3}` | Group: roll several, add them up |
| `{1d20+5, 1d20+5}kh1` | Group: keep the best total |
| `{3d6+3}>12` | Group: success if the total is 12 or more |
| `1d20+5[STR] + 2[bonus]` | Labels: notes only, ignored in the maths |

**Compare points** used by `!`, `r`, `cs`, `cf`, `f` and success counting
are `N` or `=N` (exactly), `>N` (N or more) or `<N` (N or less).

By default the highest face counts as a critical success and a 1 as a
critical failure. Dropped and rerolled dice show struck through.

Limits: up to 1,000 dice in a roll and 1,000,000 sides on a die.

## Character values: `@{…}`

These read values from your **Post as** character when you send:

| Syntax | Value |
|---|---|
| `@{ST}` `@{IN}` `@{WI}` `@{CD}` `@{HE}` `@{CH}` `@{AP}` | Attributes |
| `@{Hit Points}` `@{Avoidance}` | A skill's SKVAL |
| `@{Avoidance\|level}` | A skill's level |
| `@{Avoidance\|xp}` | A skill's raw XP |
| `@{name}` `@{hp}` `@{hp_max}` | Name, current HP, maximum HP |
| `@{Bren Ashford\|ST}` | The same, from another of **your** characters |
| `@{Bren Ashford\|Avoidance\|level}` | Another character's skill level |

Example: `/r 1d20+@{Avoidance}`.

You can only read your own characters' values.

## Roll queries: `?{…}`

These ask you for a value when you send:

| Syntax | Asks for |
|---|---|
| `?{Modifier}` | A typed value |
| `?{Modifier\|0}` | A typed value, with 0 filled in |
| `?{Weapon\|Sword,1d8\|Axe,1d10}` | A dropdown: picking "Axe" puts in `1d10` |

If the same question appears twice in one message, you're asked once and
the answer is used for both. Cancel stops the message from being sent.

Example: `/r 1d20+@{Avoidance}+?{Situational bonus|0}`

## Macros

A macro is a saved chat line. Macros belong to a character and are saved
with it.

- Click **Macros…** under the chat to add, edit or delete the **Post as**
  character's macros. A name is 1–30 letters, numbers, `-` or `_`.
- Each macro gets a button in the bar above the chat box. Click it to send.
- Or type `#name` in a message to run the Post as character's macro.
- `%{name}` does the same, and `%{Bren Ashford|name}` runs another of your
  characters' macros.

A macro can use everything above, for example:

```
/r 1d20+@{Avoidance}+?{Bonus|0}
/em swings: [[1d8+@{ST}]] damage
```

Macros are expanded first, then `@{…}` values, then `?{…}` questions, then
the dice are rolled. This is the same order as Roll20.

## Cards (roll templates)

```
&{template:default} {{name=Sword Swing}} {{Attack=[[1d20+5]]}} {{Damage=[[1d8+2]]}}
```

This shows a card with "Sword Swing" as its title and one row per `{{Key=Value}}`.
Values can hold inline rolls and formatting.

## Formatting

| Type | Shows as |
|---|---|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `~~strike~~` | ~~strike~~ |
| `[text](https://example.com)` | a link |
| `https://example.com` | a link |

Any HTML you type shows as plain text.

## Reading the chat

- New messages, edits and deletes appear live for everyone in the group.
- Unread counts show on each group's button, on the **Other** menu and on
  **Chat**. They're counted per browser.
- Messages show under **Today**, **Yesterday** or date headings. Several
  messages from the same sender within 5 minutes share one heading.
- The 50 most recent messages load first. Use **Load older messages** at
  the top for the rest.
- **Search this chat…** (top right) finds messages by text or sender name.
  **Back to chat** returns to the live view.

## Editing and deleting

- Hover over your own message for **Edit** and **Delete**. Edited messages
  are marked "(edited)".
- Messages with dice rolls can't be edited, so a roll can't be changed
  after the fact. Delete it and send a new one instead.
- GMs can delete any message in their group.
- A deleted message shows as "Message deleted", and its text is wiped
  from the database.

## Good to know

- Dice are rolled in the sender's browser, not on the server. A player
  with technical skill could fake a result.
- A character can be in only one group at a time, so it can post in only
  that group's chat.

## Setup (admins)

The chat's database setup (the `group_chat_messages` table, its access
rules, triggers and live updates) has already been run in Supabase. The SQL
isn't kept in this repo.

If sending ever fails with "permission denied for table
group_chat_messages", run this in the Supabase SQL editor:

```sql
grant select, insert, update on public.group_chat_messages to authenticated;
grant execute on function public.chat_is_member(uuid), public.chat_is_gm(uuid) to authenticated;
```
