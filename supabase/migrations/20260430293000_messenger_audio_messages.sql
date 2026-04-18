-- Голосовые сообщения: kind = audio, meta.audio.path (+ duration_sec), bucket messenger-media.

alter table public.chat_messages
  drop constraint if exists chat_messages_kind_check;

alter table public.chat_messages
  add constraint chat_messages_kind_check
  check (kind in ('text', 'system', 'reaction', 'image', 'audio'));

update storage.buckets
set
  allowed_mime_types = array(
    select distinct u
    from unnest(
      coalesce(allowed_mime_types, '{}'::text[]) || array[
        'audio/webm',
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
        'audio/aac',
        'audio/wav',
        'audio/x-m4a'
      ]::text[]
    ) as t(u)
    order by u
  ),
  file_size_limit = greatest(coalesce(file_size_limit, 0), 10485760)
where id = 'messenger-media';

-- ── append_direct_message / append_group_message (как 20260430290000 + audio) ─

create or replace function public.append_direct_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default null,
  p_reply_to_message_id uuid default null,
  p_quote_to_message_id uuid default null
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
    when p_kind in ('text', 'reaction', 'system', 'image', 'audio') then p_kind
    else 'text'
  end;
  v_body text := left(coalesce(p_body, ''), 4000);
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_image_path text;
  v_reply_to uuid := coalesce(p_reply_to_message_id, p_quote_to_message_id);
  v_quote_to uuid := coalesce(p_quote_to_message_id, p_reply_to_message_id);
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if v_kind = 'image' then
    v_image_path := nullif(trim(coalesce(v_meta -> 'image' ->> 'path', '')), '');
    if v_image_path is null and jsonb_typeof(v_meta -> 'images') = 'array' then
      select nullif(trim(coalesce(elem ->> 'path', '')), '') into v_image_path
      from jsonb_array_elements(v_meta -> 'images') as elem
      where nullif(trim(coalesce(elem ->> 'path', '')), '') is not null
      limit 1;
    end if;
    if v_image_path is null then
      raise exception 'image_path_required';
    end if;
  elsif v_kind = 'audio' then
    if nullif(trim(coalesce(v_meta -> 'audio' ->> 'path', '')), '') is null then
      raise exception 'audio_path_required';
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

  if v_reply_to is not null then
    if not exists (
      select 1
      from public.chat_messages rm
      where rm.id = v_reply_to
        and rm.conversation_id = p_conversation_id
        and rm.kind in ('text', 'system', 'image', 'audio')
    ) then
      raise exception 'reply_target_invalid';
    end if;
  end if;

  if v_quote_to is not null then
    if not exists (
      select 1
      from public.chat_messages qm
      where qm.id = v_quote_to
        and qm.conversation_id = p_conversation_id
        and qm.kind in ('text', 'system', 'image', 'audio')
    ) then
      raise exception 'quote_target_invalid';
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
    reply_to_message_id,
    quote_to_message_id
  )
  values (
    p_conversation_id,
    v_user_id,
    left(v_name, 200),
    v_kind,
    v_body,
    v_meta,
    v_created_at,
    v_reply_to,
    v_quote_to
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
                 and m.kind in ('text', 'system', 'image', 'audio')
               order by m.created_at desc, m.id desc
               limit 1
             ),
             c.last_message_preview
           )
           when v_kind = 'image' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '📷 Фото'
           )
           when v_kind = 'audio' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '🎤 Голосовое'
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

grant execute on function public.append_direct_message(uuid, text, text, jsonb, uuid, uuid) to authenticated;

create or replace function public.append_group_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default null,
  p_reply_to_message_id uuid default null,
  p_quote_to_message_id uuid default null
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
    when p_kind in ('text', 'reaction', 'system', 'image', 'audio') then p_kind
    else 'text'
  end;
  v_body text := left(coalesce(p_body, ''), 4000);
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_image_path text;
  v_reply_to uuid := coalesce(p_reply_to_message_id, p_quote_to_message_id);
  v_quote_to uuid := coalesce(p_quote_to_message_id, p_reply_to_message_id);
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'group'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  if v_kind = 'image' then
    v_image_path := nullif(trim(coalesce(v_meta -> 'image' ->> 'path', '')), '');
    if v_image_path is null and jsonb_typeof(v_meta -> 'images') = 'array' then
      select nullif(trim(coalesce(elem ->> 'path', '')), '') into v_image_path
      from jsonb_array_elements(v_meta -> 'images') as elem
      where nullif(trim(coalesce(elem ->> 'path', '')), '') is not null
      limit 1;
    end if;
    if v_image_path is null then
      raise exception 'image_path_required';
    end if;
  elsif v_kind = 'audio' then
    if nullif(trim(coalesce(v_meta -> 'audio' ->> 'path', '')), '') is null then
      raise exception 'audio_path_required';
    end if;
  else
    if nullif(btrim(v_body), '') is null then
      raise exception 'message_body_required';
    end if;
  end if;

  if v_reply_to is not null then
    if not exists (
      select 1
      from public.chat_messages rm
      where rm.id = v_reply_to
        and rm.conversation_id = p_conversation_id
        and rm.kind in ('text', 'system', 'image', 'audio')
    ) then
      raise exception 'reply_target_invalid';
    end if;
  end if;

  if v_quote_to is not null then
    if not exists (
      select 1
      from public.chat_messages qm
      where qm.id = v_quote_to
        and qm.conversation_id = p_conversation_id
        and qm.kind in ('text', 'system', 'image', 'audio')
    ) then
      raise exception 'quote_target_invalid';
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
    reply_to_message_id,
    quote_to_message_id
  )
  values (
    p_conversation_id,
    v_user_id,
    left(v_name, 200),
    v_kind,
    v_body,
    v_meta,
    v_created_at,
    v_reply_to,
    v_quote_to
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
                 and m.kind in ('text', 'system', 'image', 'audio')
               order by m.created_at desc, m.id desc
               limit 1
             ),
             c.last_message_preview
           )
           when v_kind = 'image' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '📷 Фото'
           )
           when v_kind = 'audio' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '🎤 Голосовое'
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

grant execute on function public.append_group_message(uuid, text, text, jsonb, uuid, uuid) to authenticated;

create or replace function public.append_channel_feed_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default null
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
    when p_kind in ('text', 'reaction', 'system', 'image', 'audio') then p_kind
    else 'text'
  end;
  v_body text := left(coalesce(p_body, ''), 4000);
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_image_path text;
  v_role text;
  v_post_mode text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'channel'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  select c.channel_posting_mode into v_post_mode
  from public.chat_conversations c
  where c.id = p_conversation_id and c.kind = 'channel' and c.closed_at is null;
  if v_post_mode is null then
    raise exception 'channel_not_found';
  end if;

  select m.role into v_role
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id = v_user_id;
  if v_role is null then
    raise exception 'forbidden';
  end if;

  if v_post_mode = 'admins_only' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'post_not_allowed';
  end if;

  if v_kind = 'image' then
    v_image_path := nullif(trim(coalesce(v_meta -> 'image' ->> 'path', '')), '');
    if v_image_path is null and jsonb_typeof(v_meta -> 'images') = 'array' then
      select nullif(trim(coalesce(elem ->> 'path', '')), '') into v_image_path
      from jsonb_array_elements(v_meta -> 'images') as elem
      where nullif(trim(coalesce(elem ->> 'path', '')), '') is not null
      limit 1;
    end if;
    if v_image_path is null then
      raise exception 'image_path_required';
    end if;
  elsif v_kind = 'audio' then
    if nullif(trim(coalesce(v_meta -> 'audio' ->> 'path', '')), '') is null then
      raise exception 'audio_path_required';
    end if;
  else
    if nullif(btrim(v_body), '') is null then
      raise exception 'message_body_required';
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
    reply_to_message_id,
    quote_to_message_id
  )
  values (
    p_conversation_id,
    v_user_id,
    left(v_name, 200),
    v_kind,
    v_body,
    v_meta,
    v_created_at,
    null,
    null
  )
  returning id into v_message_id;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = case
           when v_kind = 'image' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '📷 Фото'
           )
           when v_kind = 'audio' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '🎤 Голосовое'
           )
           else left(v_body, 280)
         end
   where c.id = p_conversation_id;

  update public.chat_conversation_members
     set last_read_at = v_created_at
   where conversation_id = p_conversation_id
     and user_id = v_user_id;

  return jsonb_build_object('ok', true, 'message_id', v_message_id, 'created_at', v_created_at);
end;
$$;

grant execute on function public.append_channel_feed_message(uuid, text, text, jsonb) to authenticated;

create or replace function public.list_channel_posts_page(
  p_conversation_id uuid,
  p_limit int default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  sender_user_id uuid,
  sender_name_snapshot text,
  kind text,
  body text,
  meta jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  reply_to_message_id uuid
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    m.id,
    m.sender_user_id,
    m.sender_name_snapshot,
    m.kind,
    m.body,
    m.meta,
    m.created_at,
    m.edited_at,
    m.reply_to_message_id
  from public.chat_messages m
  cross join me
  where me.uid is not null
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id is null
    and m.kind in ('text', 'system', 'image', 'audio')
    and exists(
      select 1
      from public.chat_conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = me.uid
    )
    and (
      p_before_created_at is null
      or (
        m.created_at < p_before_created_at
        or (m.created_at = p_before_created_at and (p_before_id is null or m.id < p_before_id))
      )
    )
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 30), 80));
$$;

grant execute on function public.list_channel_posts_page(uuid, int, timestamptz, uuid) to authenticated;

-- ── Реакции: цель audio ─────────────────────────────────────────────────────

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
  v_allowed constant text[] := array['👍', '👏', '❤️', '😂', '😭', '🔥', '✋', '🖖', '👎', '💩'];
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
      and tm.kind in ('text', 'system', 'image', 'audio')
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
      and m.kind in ('text', 'system', 'image', 'audio')
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
               and m.kind in ('text', 'system', 'image', 'audio')
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

create or replace function public.toggle_group_message_reaction(
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
      and c.kind = 'group'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.chat_messages tm
    where tm.id = p_target_message_id
      and tm.conversation_id = p_conversation_id
      and tm.kind in ('text', 'system', 'image', 'audio')
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

    select m.created_at,
           left(
             case
               when m.kind = 'reaction' then coalesce(
                 (
                   select left(x.body, 280)
                   from public.chat_messages x
                   where x.conversation_id = p_conversation_id
                     and x.kind in ('text','system','image','audio')
                   order by x.created_at desc, x.id desc
                   limit 1
                 ),
                 nullif(trim(m.body), '')
               )
               when m.kind = 'image' then coalesce(nullif(left(btrim(m.body), 280), ''), '📷 Фото')
               when m.kind = 'audio' then coalesce(nullif(left(btrim(m.body), 280), ''), '🎤 Голосовое')
               else m.body
             end,
             280
           )
      into v_last_at, v_last_preview
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at desc, m.id desc
    limit 1;

    update public.chat_conversations c
       set message_count = greatest(0, c.message_count - 1),
           last_message_at = v_last_at,
           last_message_preview = v_last_preview
     where c.id = p_conversation_id;

    return jsonb_build_object('ok', true, 'action', 'removed', 'message_id', v_existing_id);
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
             select left(m.body, 280)
             from public.chat_messages m
             where m.conversation_id = p_conversation_id
               and m.kind in ('text', 'system', 'image', 'audio')
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

  return jsonb_build_object('ok', true, 'action', 'added', 'message_id', v_new_id, 'created_at', v_created_at);
end;
$$;

grant execute on function public.toggle_group_message_reaction(uuid, uuid, text) to authenticated;

create or replace function public.toggle_channel_message_reaction(
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
  v_allowed constant text[] := array['👍', '👏', '❤️', '😂', '😭', '🔥', '✋', '🖖', '👎', '💩'];
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
    join public.chat_conversation_members m on m.conversation_id = c.id
    where c.id = p_conversation_id and c.kind = 'channel' and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;
  if not exists (
    select 1
    from public.chat_messages tm
    where tm.id = p_target_message_id
      and tm.conversation_id = p_conversation_id
      and tm.kind in ('text','system','image','audio')
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
      and m.reply_to_message_id is null
      and m.kind in ('text', 'system', 'image', 'audio')
    order by m.created_at desc, m.id desc
    limit 1;

    update public.chat_conversations c
       set message_count = greatest(0, c.message_count - 1),
           last_message_at = v_last_at,
           last_message_preview = v_last_preview
     where c.id = p_conversation_id;

    return jsonb_build_object('ok', true, 'action', 'removed', 'message_id', v_existing_id);
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
               and m.reply_to_message_id is null
               and m.kind in ('text', 'system', 'image', 'audio')
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

  return jsonb_build_object('ok', true, 'action', 'added', 'message_id', v_new_id, 'created_at', v_created_at);
end;
$$;

grant execute on function public.toggle_channel_message_reaction(uuid, uuid, text) to authenticated;

-- ── Удаление / правка ЛС и групп / постов канала ────────────────────────────

create or replace function public.delete_direct_message(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text;
  v_updated int := 0;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null or p_message_id is null then
    raise exception 'conversation_required';
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

  if v_kind = 'reaction' or v_kind = 'system' then
    raise exception 'message_not_deletable';
  end if;

  update public.chat_messages
     set kind = 'system',
         body = 'Сообщение удалено',
         meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('deleted', true, 'deleted_kind', v_kind),
         edited_at = now()
   where id = p_message_id;

  get diagnostics v_updated = row_count;

  update public.chat_conversations c
     set last_message_preview = left(
       coalesce(
         (
           select case
             when m.kind = 'image' and nullif(btrim(m.body), '') is null then '📷 Фото'
             when m.kind = 'audio' and nullif(btrim(m.body), '') is null then '🎤 Голосовое'
             else m.body
           end
           from public.chat_messages m
           where m.conversation_id = p_conversation_id
             and m.kind in ('text', 'system', 'image', 'audio')
           order by m.created_at desc, m.id desc
           limit 1
         ),
         c.last_message_preview
       ),
       280
     ),
     message_count = greatest(0, coalesce(c.message_count, 0) - 1)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'updated', v_updated, 'message_id', p_message_id);
end;
$$;

grant execute on function public.delete_direct_message(uuid, uuid) to authenticated;

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

  if v_kind not in ('text', 'image', 'audio') then
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
             and m.kind in ('text', 'system', 'image', 'audio')
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

create or replace function public.delete_group_message(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_author boolean := false;
  v_kind text;
  v_last_at timestamptz;
  v_last_preview text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null or p_message_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  if not exists (
    select 1
    from public.chat_conversation_members m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.user_id = v_me
      and c.kind = 'group'
      and c.closed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select m.kind, (m.sender_user_id = v_me)
    into v_kind, v_is_author
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id;

  if v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'message_not_found');
  end if;
  if v_kind not in ('text', 'image', 'audio') then
    return jsonb_build_object('ok', false, 'error', 'not_deletable');
  end if;

  v_is_admin := public.is_group_admin(p_conversation_id, v_me);
  if not (v_is_author or v_is_admin) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  delete from public.chat_messages r
  where r.conversation_id = p_conversation_id
    and r.kind = 'reaction'
    and coalesce(r.meta ->> 'react_to', '') = p_message_id::text;

  delete from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id;

  update public.chat_conversations c
     set message_count = greatest(0, c.message_count - 1)
   where c.id = p_conversation_id;

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
    and m.kind in ('text', 'system', 'image', 'audio')
  order by m.created_at desc, m.id desc
  limit 1;

  update public.chat_conversations c
     set last_message_at = coalesce(v_last_at, c.last_message_at),
         last_message_preview = coalesce(v_last_preview, c.last_message_preview)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_group_message(uuid, uuid) to authenticated;

create or replace function public.edit_channel_post(
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
  v_me uuid := auth.uid();
  v_new text := left(coalesce(p_new_body, ''), 4000);
  v_is_admin boolean := false;
  v_is_author boolean := false;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null or p_message_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if nullif(btrim(v_new), '') is null then
    return jsonb_build_object('ok', false, 'error', 'message_body_required');
  end if;

  if not exists (
    select 1
    from public.chat_conversation_members m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.user_id = v_me
      and c.kind = 'channel'
      and c.closed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_is_admin := public.is_channel_admin(p_conversation_id, v_me);

  select (m.sender_user_id = v_me)
    into v_is_author
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id is null
    and m.kind in ('text','system','image','audio')
  limit 1;

  if v_is_author is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not (v_is_author or v_is_admin) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.chat_messages
     set body = v_new,
         edited_at = now()
   where id = p_message_id;

  update public.chat_conversations c
     set last_message_preview = left(v_new, 280)
   where c.id = p_conversation_id
     and exists (
       select 1
       from public.chat_messages m
       where m.conversation_id = p_conversation_id
         and m.reply_to_message_id is null
         and m.kind in ('text','system','image','audio')
       order by m.created_at desc, m.id desc
       limit 1
     )
     and (
       select m.id
       from public.chat_messages m
       where m.conversation_id = p_conversation_id
         and m.reply_to_message_id is null
         and m.kind in ('text','system','image','audio')
       order by m.created_at desc, m.id desc
       limit 1
     ) = p_message_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.edit_channel_post(uuid, uuid, text) to authenticated;

create or replace function public.delete_channel_post(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_author boolean := false;
  v_comment_ids uuid[];
  v_deleted integer := 0;
  v_rc integer := 0;
  v_last_at timestamptz;
  v_last_preview text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null or p_message_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  if not exists (
    select 1
    from public.chat_conversation_members m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.user_id = v_me
      and c.kind = 'channel'
      and c.closed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_is_admin := public.is_channel_admin(p_conversation_id, v_me);

  select (m.sender_user_id = v_me)
    into v_is_author
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id is null
    and m.kind in ('text','system','image','audio')
  limit 1;

  if v_is_author is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not (v_is_author or v_is_admin) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select array_agg(m.id)
    into v_comment_ids
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.reply_to_message_id = p_message_id
    and m.kind in ('text','system','image');

  delete from public.chat_messages r
  where r.conversation_id = p_conversation_id
    and r.kind = 'reaction'
    and (
      coalesce(r.meta ->> 'react_to', '') = p_message_id::text
      or (v_comment_ids is not null and (r.meta ->> 'react_to')::uuid = any (v_comment_ids))
    );
  get diagnostics v_rc = row_count;
  v_deleted := v_deleted + v_rc;

  delete from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.reply_to_message_id = p_message_id;
  get diagnostics v_rc = row_count;
  v_deleted := v_deleted + v_rc;

  delete from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.id = p_message_id;
  get diagnostics v_rc = row_count;
  v_deleted := v_deleted + v_rc;

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
    and m.reply_to_message_id is null
    and m.kind in ('text','system','image','audio')
  order by m.created_at desc, m.id desc
  limit 1;

  update public.chat_conversations c
     set message_count = greatest(0, c.message_count - greatest(0, v_deleted)),
         last_message_at = v_last_at,
         last_message_preview = v_last_preview
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

grant execute on function public.delete_channel_post(uuid, uuid) to authenticated;
