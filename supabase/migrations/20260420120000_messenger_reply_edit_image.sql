-- Messenger: reply, edit, image messages, storage for attachments.

-- ── chat_messages: reply + edit + kind image ───────────────────────────────

alter table public.chat_messages
  drop constraint if exists chat_messages_kind_check;

alter table public.chat_messages
  add constraint chat_messages_kind_check
  check (kind in ('text', 'system', 'reaction', 'image'));

alter table public.chat_messages
  add column if not exists reply_to_message_id uuid references public.chat_messages(id) on delete set null;

alter table public.chat_messages
  add column if not exists edited_at timestamptz null;

create index if not exists chat_messages_reply_to_idx
  on public.chat_messages(reply_to_message_id)
  where reply_to_message_id is not null;

-- ── Storage bucket (public URLs; paths include conversation_id) ─────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messenger-media',
  'messenger-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "messenger_media_select" on storage.objects;
create policy "messenger_media_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'messenger-media'
  and exists (
    select 1
    from public.chat_conversation_members m
    where m.user_id = auth.uid()
      and m.conversation_id = split_part(name, '/', 1)::uuid
  )
);

drop policy if exists "messenger_media_insert" on storage.objects;
create policy "messenger_media_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'messenger-media'
  and exists (
    select 1
    from public.chat_conversation_members m
    where m.user_id = auth.uid()
      and m.conversation_id = split_part(name, '/', 1)::uuid
  )
);

-- ── append_direct_message: reply + image (empty caption allowed) ───────────

drop function if exists public.append_direct_message(uuid, text, text, jsonb);
drop function if exists public.append_direct_message(uuid, text, text);

create or replace function public.append_direct_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default null,
  p_reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := coalesce(
    nullif(auth.jwt() ->> 'user_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    'Вы'
  );
  v_kind text := case
    when p_kind in ('text', 'reaction', 'system', 'image') then p_kind
    else 'text'
  end;
  v_body text := left(coalesce(p_body, ''), 4000);
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_image_path text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if v_kind = 'image' then
    v_image_path := nullif(trim(coalesce(v_meta -> 'image' ->> 'path', '')), '');
    if v_image_path is null then
      raise exception 'image_path_required';
    end if;
  else
    if nullif(btrim(v_body), '') is null then
      raise exception 'message_body_required';
    end if;
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'direct'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  if p_reply_to_message_id is not null then
    if not exists (
      select 1
      from public.chat_messages rm
      where rm.id = p_reply_to_message_id
        and rm.conversation_id = p_conversation_id
        and rm.kind in ('text', 'system', 'image')
    ) then
      raise exception 'reply_target_invalid';
    end if;
  end if;

  insert into public.chat_messages (
    conversation_id,
    sender_user_id,
    sender_name_snapshot,
    kind,
    body,
    meta,
    created_at,
    reply_to_message_id
  )
  values (
    p_conversation_id,
    v_user_id,
    left(v_name, 200),
    v_kind,
    v_body,
    v_meta,
    v_created_at,
    p_reply_to_message_id
  )
  returning id into v_message_id;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = case
           when v_kind = 'reaction' then coalesce(
             (
               select left(m.body, 280)
               from public.chat_messages m
               where m.conversation_id = p_conversation_id
                 and m.kind in ('text', 'system', 'image')
               order by m.created_at desc, m.id desc
               limit 1
             ),
             c.last_message_preview
           )
           when v_kind = 'image' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '📷 Фото'
           )
           else left(v_body, 280)
         end
   where c.id = p_conversation_id;

  update public.chat_conversation_members
     set last_read_at = v_created_at
   where conversation_id = p_conversation_id
     and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'message_id', v_message_id,
    'created_at', v_created_at
  );
end;
$$;

grant execute on function public.append_direct_message(uuid, text, text, jsonb, uuid) to authenticated;

-- ── edit_direct_message ─────────────────────────────────────────────────────

create or replace function public.edit_direct_message(
  p_conversation_id uuid,
  p_message_id uuid,
  p_new_body text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_new text := left(coalesce(p_new_body, ''), 4000);
  v_kind text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null or p_message_id is null then
    raise exception 'conversation_required';
  end if;

  if nullif(btrim(v_new), '') is null then
    raise exception 'message_body_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'direct'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  select m.kind into v_kind
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id
    and m.sender_user_id = v_user_id;

  if v_kind is null then
    raise exception 'message_not_found';
  end if;

  if v_kind not in ('text', 'image') then
    raise exception 'message_not_editable';
  end if;

  update public.chat_messages
     set body = v_new,
         edited_at = now()
   where id = p_message_id;

  update public.chat_conversations c
     set last_message_preview = left(
       coalesce(
         (
           select m.body
           from public.chat_messages m
           where m.conversation_id = p_conversation_id
             and m.kind in ('text', 'system', 'image')
           order by m.created_at desc, m.id desc
           limit 1
         ),
         c.last_message_preview
       ),
       280
     )
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'message_id', p_message_id);
end;
$$;

grant execute on function public.edit_direct_message(uuid, uuid, text) to authenticated;

-- ── Reactions: allow target image messages ──────────────────────────────────

create or replace function public.toggle_direct_message_reaction(
  p_conversation_id uuid,
  p_target_message_id uuid,
  p_emoji text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := coalesce(
    nullif(auth.jwt() ->> 'user_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    'Вы'
  );
  v_emoji text := left(trim(coalesce(p_emoji, '')), 32);
  v_allowed constant text[] := array['👍', '👏', '❤️', '😂', '🔥', '✋', '🖖'];
  v_existing_id uuid;
  v_created_at timestamptz := now();
  v_new_id uuid;
  v_last_at timestamptz;
  v_last_preview text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null or p_target_message_id is null then
    raise exception 'conversation_required';
  end if;

  if not (v_emoji = any (v_allowed)) then
    raise exception 'invalid_reaction_emoji';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'direct'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.chat_messages tm
    where tm.id = p_target_message_id
      and tm.conversation_id = p_conversation_id
      and tm.kind in ('text', 'system', 'image')
  ) then
    raise exception 'target_not_found';
  end if;

  select m.id
    into v_existing_id
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.sender_user_id = v_user_id
    and m.kind = 'reaction'
    and m.body = v_emoji
    and coalesce(m.meta ->> 'react_to', '') = p_target_message_id::text
  limit 1;

  if v_existing_id is not null then
    delete from public.chat_messages where id = v_existing_id;

    select m.created_at
      into v_last_at
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at desc, m.id desc
    limit 1;

    select left(coalesce(m.body, ''), 280)
      into v_last_preview
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
      and m.kind in ('text', 'system', 'image')
    order by m.created_at desc, m.id desc
    limit 1;

    update public.chat_conversations c
       set message_count = greatest(0, c.message_count - 1),
           last_message_at = v_last_at,
           last_message_preview = v_last_preview
     where c.id = p_conversation_id;

    return jsonb_build_object(
      'ok', true,
      'action', 'removed',
      'message_id', v_existing_id
    );
  end if;

  insert into public.chat_messages (
    conversation_id,
    sender_user_id,
    sender_name_snapshot,
    kind,
    body,
    meta,
    created_at
  )
  values (
    p_conversation_id,
    v_user_id,
    left(v_name, 200),
    'reaction',
    v_emoji,
    jsonb_build_object('react_to', p_target_message_id::text),
    v_created_at
  )
  returning id into v_new_id;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = coalesce(
           (
             select left(coalesce(m.body, ''), 280)
             from public.chat_messages m
             where m.conversation_id = p_conversation_id
               and m.kind in ('text', 'system', 'image')
             order by m.created_at desc, m.id desc
             limit 1
           ),
           c.last_message_preview
         )
   where c.id = p_conversation_id;

  update public.chat_conversation_members
     set last_read_at = v_created_at
   where conversation_id = p_conversation_id
     and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'action', 'added',
    'message_id', v_new_id,
    'created_at', v_created_at
  );
end;
$$;
