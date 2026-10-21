-- GuildSchool Supabase schema v27: Beastiary archive
--
-- The Beastiary is one long list per GM and was getting unwieldy. Foes can
-- now be archived: they stay in the library (and can be restored or edited)
-- but are hidden from the Active tab and from the Add Combatants foe list.
--
-- Column only -- bestiary_entries already has its table grants and its
-- created_by = auth.uid() RLS policies, which cover the new column.
--
-- HOW TO RUN: paste into the Supabase SQL Editor and run once, after
-- schema_v26_track_tie_order.sql.

alter table public.bestiary_entries add column if not exists archived boolean not null default false;
