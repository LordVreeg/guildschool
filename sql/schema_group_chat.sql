-- ============================================================
-- Group chat: one chat per group. Run once in the Supabase SQL editor.
-- ============================================================
-- Who can do what:
--   * Read:   anyone in group_members for that group (players and GMs).
--   * Post:   a group member, as one of their OWN characters that is in
--             that group. A GM may also post as "GM" with no character.
--   * Edit:   the author, their own message text only.
--   * Delete: the author, or a GM of the group. Deletes are soft: the text
--             is wiped and the row stays, so the conversation keeps its shape.
-- The sender's display name is filled in by the database from the
-- character's name, so nobody can post under someone else's name.

create table if not exists public.group_chat_messages (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  author_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  sender_name  text not null default '',
  body         text not null check (char_length(body) between 1 and 4000),
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  deleted_at   timestamptz
);

create index if not exists group_chat_messages_group_created_idx
  on public.group_chat_messages (group_id, created_at desc);

-- Membership checks. SECURITY DEFINER so they can read group_members
-- without tripping over that table's own row-level security.
create or replace function public.chat_is_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group_id and user_id = auth.uid());
$$;

create or replace function public.chat_is_gm(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group_id and user_id = auth.uid() and role = 'gm');
$$;

-- On insert: stamp the author and time, and set the sender name from the
-- character (which must be the poster's own, in this group).
create or replace function public.chat_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  new.author_id  := auth.uid();
  new.created_at := now();
  new.edited_at  := null;
  new.deleted_at := null;
  if new.character_id is not null then
    select coalesce(nullif(trim(data->>'name'), ''), '(unnamed)') into v_name
      from characters
     where id = new.character_id and owner_id = auth.uid() and group_id = new.group_id;
    if not found then
      raise exception 'You can only post as one of your own characters in this group.';
    end if;
    new.sender_name := v_name;
  elsif chat_is_gm(new.group_id) then
    new.sender_name := 'GM';
  else
    raise exception 'Pick one of your characters in this group to post as.';
  end if;
  return new;
end;
$$;

-- On update: only the text (author) or the deleted flag (author or GM)
-- may change. Edits are timestamped; deletes wipe the text.
create or replace function public.chat_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is distinct from old.group_id
     or new.author_id is distinct from old.author_id
     or new.character_id is distinct from old.character_id
     or new.sender_name is distinct from old.sender_name
     or new.created_at is distinct from old.created_at then
    raise exception 'Only a message''s text can be changed.';
  end if;
  if old.deleted_at is not null then
    raise exception 'This message was deleted.';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '(deleted)';
    return new;
  end if;
  if new.body is distinct from old.body then
    if old.author_id <> auth.uid() then
      raise exception 'Only the author can edit a message.';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists chat_before_insert on public.group_chat_messages;
create trigger chat_before_insert before insert on public.group_chat_messages
  for each row execute function public.chat_before_insert();

drop trigger if exists chat_before_update on public.group_chat_messages;
create trigger chat_before_update before update on public.group_chat_messages
  for each row execute function public.chat_before_update();

alter table public.group_chat_messages enable row level security;

drop policy if exists chat_select on public.group_chat_messages;
create policy chat_select on public.group_chat_messages
  for select using (chat_is_member(group_id));

drop policy if exists chat_insert on public.group_chat_messages;
create policy chat_insert on public.group_chat_messages
  for insert with check (chat_is_member(group_id));

drop policy if exists chat_update on public.group_chat_messages;
create policy chat_update on public.group_chat_messages
  for update using (author_id = auth.uid() or chat_is_gm(group_id))
  with check (author_id = auth.uid() or chat_is_gm(group_id));

-- No delete policy: messages are only ever soft-deleted (see above).

-- Table access for signed-in users. The policies above still decide which
-- rows; without these grants every request fails with "permission denied".
grant select, insert, update on public.group_chat_messages to authenticated;
grant execute on function public.chat_is_member(uuid), public.chat_is_gm(uuid) to authenticated;

-- Live updates: new, edited and deleted messages are pushed to open pages.
-- Supabase still applies the select policy, so each person only receives
-- messages from their own groups.
do $$
begin
  alter publication supabase_realtime add table public.group_chat_messages;
exception when duplicate_object then null;
end $$;
