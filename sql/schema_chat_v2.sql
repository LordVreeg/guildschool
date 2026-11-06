-- ============================================================
-- Group chat v2: Roll20-style commands. Run once in the Supabase SQL
-- editor, AFTER schema_group_chat.sql. Safe to run again.
-- ============================================================
-- Adds:
--   kind          message | emote | ooc | desc | as | emas | roll
--   payload       dice results, template cards (drawn by the page)
--   whisper_to    who may read a whisper (author included); null = everyone
--   whisper_label the recipients' names, e.g. "Bren, GM"
-- Rules the database enforces:
--   * /desc, /as and /emas are GM-only. /as and /emas take their name from
--     the message; everything else still gets the character's real name.
--   * Whisper recipients are worked out here from the character ids / "gm"
--     the page asks for, so nobody can read or fake a whisper's audience.
--     Whispers are visible only to the author and the recipients (as in
--     Roll20, a GM doesn't see whispers between players).
--   * Messages with dice can't have their text edited.

alter table public.group_chat_messages add column if not exists kind text not null default 'message';
alter table public.group_chat_messages add column if not exists payload jsonb;
alter table public.group_chat_messages add column if not exists whisper_to uuid[];
alter table public.group_chat_messages add column if not exists whisper_label text;

do $$
begin
  alter table public.group_chat_messages add constraint group_chat_messages_kind_check
    check (kind in ('message','emote','ooc','desc','as','emas','roll'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.group_chat_messages add constraint group_chat_messages_payload_size
    check (payload is null or pg_column_size(payload) <= 200000);
exception when duplicate_object then null;
end $$;

create or replace function public.chat_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_ids    uuid[];
  v_names  text;
  v_gm_ids uuid[];
begin
  new.author_id  := auth.uid();
  new.created_at := now();
  new.edited_at  := null;
  new.deleted_at := null;

  -- Sender name
  if new.kind in ('desc', 'as', 'emas') then
    if not chat_is_gm(new.group_id) then
      raise exception '/% is for the GM.', new.kind;
    end if;
    if new.kind = 'desc' then
      new.sender_name := '';
    else
      new.sender_name := left(trim(coalesce(new.sender_name, '')), 60);
      if new.sender_name = '' then
        raise exception 'Give a name to speak as.';
      end if;
    end if;
  elsif new.character_id is not null then
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

  -- Whisper audience, from payload.whisper = {characters: [ids], gm: bool}
  if new.payload ? 'whisper' then
    select coalesce(array_agg(distinct c.owner_id), '{}'),
           string_agg(distinct coalesce(nullif(trim(c.data->>'name'), ''), '(unnamed)'), ', ')
      into v_ids, v_names
      from characters c
     where c.group_id = new.group_id
       and c.id::text in (select jsonb_array_elements_text(coalesce(new.payload->'whisper'->'characters', '[]'::jsonb)));
    if coalesce((new.payload->'whisper'->>'gm')::boolean, false) then
      select coalesce(array_agg(user_id), '{}') into v_gm_ids
        from group_members where group_id = new.group_id and role = 'gm';
      if cardinality(v_gm_ids) = 0 then
        raise exception 'This group has no GM to whisper to.';
      end if;
      v_ids := v_ids || v_gm_ids;
      v_names := concat_ws(', ', v_names, 'GM');
    end if;
    if cardinality(v_ids) = 0 then
      raise exception 'No one in this group to whisper to.';
    end if;
    new.whisper_to := array(select distinct u from unnest(v_ids || auth.uid()) as u);
    new.whisper_label := v_names;
    new.payload := new.payload - 'whisper';
    if new.payload = '{}'::jsonb then new.payload := null; end if;
  else
    new.whisper_to := null;
    new.whisper_label := null;
  end if;
  return new;
end;
$$;

create or replace function public.chat_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is distinct from old.group_id
     or new.author_id is distinct from old.author_id
     or new.character_id is distinct from old.character_id
     or new.sender_name is distinct from old.sender_name
     or new.created_at is distinct from old.created_at
     or new.kind is distinct from old.kind
     or new.whisper_to is distinct from old.whisper_to
     or new.whisper_label is distinct from old.whisper_label then
    raise exception 'Only a message''s text can be changed.';
  end if;
  if old.deleted_at is not null then
    raise exception 'This message was deleted.';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '(deleted)';
    new.payload := null;
    return new;
  end if;
  if new.payload is distinct from old.payload then
    raise exception 'Only a message''s text can be changed.';
  end if;
  if new.body is distinct from old.body then
    if old.author_id <> auth.uid() then
      raise exception 'Only the author can edit a message.';
    end if;
    if old.payload is not null then
      raise exception 'Messages with dice rolls can''t be edited.';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

-- Whispers: only the author and recipients can read them.
drop policy if exists chat_select on public.group_chat_messages;
create policy chat_select on public.group_chat_messages
  for select using (chat_is_member(group_id) and (whisper_to is null or auth.uid() = any(whisper_to)));
