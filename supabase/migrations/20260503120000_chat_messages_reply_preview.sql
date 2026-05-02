-- Денормализованное превью ответа/цитаты: надёжно для любой глубины истории без join в клиенте.

alter table public.chat_messages
  add column if not exists reply_preview jsonb;

comment on column public.chat_messages.reply_preview is
  'Снимок цитируемого сообщения на момент отправки (snippet, автор, kind, thumb_path).';

-- Сборка JSON из строки сообщения (immutable по полям строки).
create or replace function public.reply_preview_json_from_message_row(
  p_kind text,
  p_body text,
  p_meta jsonb,
  p_sender_name_snapshot text,
  p_sender_user_id uuid
) returns jsonb
language plpgsql
immutable
parallel safe
security invoker
set search_path to 'public'
as $$
declare
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_cap text := trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  v_snippet text;
  v_thumb text;
  v_first jsonb;
  v_arr_len int;
begin
  if p_kind is null then
    return null;
  end if;

  if p_kind = 'audio' then
    v_snippet := case
      when length(v_cap) > 0 then left(v_cap, 280)
      else 'Голосовое сообщение'
    end;
  elsif p_kind = 'image' then
    if jsonb_typeof(v_meta -> 'images') = 'array' then
      v_arr_len := jsonb_array_length(v_meta -> 'images');
      if v_arr_len > 1 then
        v_snippet := case
          when length(v_cap) > 0 then left(v_cap || ' (' || v_arr_len::text || ' фото)', 280)
          else v_arr_len::text || ' фото'
        end;
      elsif length(v_cap) > 0 then
        v_snippet := left(v_cap, 280);
      else
        v_snippet := '📷 Фото';
      end if;
    elsif length(v_cap) > 0 then
      v_snippet := left(v_cap, 280);
    else
      v_snippet := '📷 Фото';
    end if;

    v_thumb := coalesce(
      nullif(trim(v_meta -> 'image' ->> 'thumb_path'), ''),
      nullif(trim(v_meta -> 'image' ->> 'path'), '')
    );
    if v_thumb is null
      and jsonb_typeof(v_meta -> 'images') = 'array'
      and jsonb_array_length(v_meta -> 'images') > 0
    then
      v_first := v_meta -> 'images' -> 0;
      v_thumb := coalesce(
        nullif(trim(v_first ->> 'thumb_path'), ''),
        nullif(trim(v_first ->> 'path'), '')
      );
    end if;
  elsif p_kind = 'system' then
    v_snippet := left(case when length(v_cap) > 0 then v_cap else '…' end, 280);
  else
    v_snippet := left(case when length(v_cap) > 0 then v_cap else '…' end, 280);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'kind', p_kind,
    'snippet', v_snippet,
    'sender_name', nullif(left(trim(coalesce(p_sender_name_snapshot, '')), 200), ''),
    'sender_user_id', p_sender_user_id,
    'thumb_path', nullif(trim(coalesce(v_thumb, '')), '')
  ));
end;
$$;

create or replace function public.append_direct_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default null,
  p_reply_to_message_id uuid default null,
  p_quote_to_message_id uuid default null
) returns jsonb
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
  v_reply_preview jsonb;
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

  if v_reply_to is not null then
    select public.reply_preview_json_from_message_row(rm.kind, rm.body, rm.meta, rm.sender_name_snapshot, rm.sender_user_id)
    into v_reply_preview
    from public.chat_messages rm
    where rm.id = v_reply_to;
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
    quote_to_message_id,
    reply_preview
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
    v_quote_to,
    v_reply_preview
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
) returns jsonb
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
  v_reply_preview jsonb;
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
      and c.kind = 'group'
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

  if v_reply_to is not null then
    select public.reply_preview_json_from_message_row(rm.kind, rm.body, rm.meta, rm.sender_name_snapshot, rm.sender_user_id)
    into v_reply_preview
    from public.chat_messages rm
    where rm.id = v_reply_to;
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
    quote_to_message_id,
    reply_preview
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
    v_quote_to,
    v_reply_preview
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

create or replace function public.append_channel_comment(
  p_conversation_id uuid,
  p_reply_to_message_id uuid,
  p_body text,
  p_quote_to_message_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_name text := coalesce(
    nullif(auth.jwt() ->> 'user_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    'Вы'
  );
  v_body text := left(coalesce(p_body, ''), 4000);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_post_preview text;
  v_preview_target uuid;
  v_reply_preview jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null or p_reply_to_message_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if nullif(btrim(v_body), '') is null then
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

  if not exists (
    select 1
    from public.chat_messages pm
    where pm.conversation_id = p_conversation_id
      and pm.id = p_reply_to_message_id
      and pm.reply_to_message_id is null
      and pm.kind in ('text','system','image')
  ) then
    return jsonb_build_object('ok', false, 'error', 'post_not_found');
  end if;

  if p_quote_to_message_id is not null then
    if not exists (
      select 1
      from public.chat_messages qm
      where qm.conversation_id = p_conversation_id
        and qm.id = p_quote_to_message_id
        and (
          qm.id = p_reply_to_message_id
          or qm.reply_to_message_id = p_reply_to_message_id
        )
        and qm.kind in ('text','system','image')
    ) then
      return jsonb_build_object('ok', false, 'error', 'quote_target_invalid');
    end if;
  end if;

  v_preview_target := coalesce(p_quote_to_message_id, p_reply_to_message_id);

  select public.reply_preview_json_from_message_row(rm.kind, rm.body, rm.meta, rm.sender_name_snapshot, rm.sender_user_id)
  into v_reply_preview
  from public.chat_messages rm
  where rm.id = v_preview_target;

  insert into public.chat_messages (
    conversation_id,
    sender_user_id,
    sender_name_snapshot,
    kind,
    body,
    meta,
    created_at,
    reply_to_message_id,
    quote_to_message_id,
    reply_preview
  )
  values (
    p_conversation_id,
    v_me,
    left(v_name, 200),
    'text',
    v_body,
    '{}'::jsonb,
    v_created_at,
    p_reply_to_message_id,
    p_quote_to_message_id,
    v_reply_preview
  )
  returning id into v_message_id;

  select left(coalesce(pm.body, ''), 280)
    into v_post_preview
  from public.chat_messages pm
  where pm.conversation_id = p_conversation_id
    and pm.reply_to_message_id is null
    and pm.kind in ('text','system','image')
  order by pm.created_at desc, pm.id desc
  limit 1;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = coalesce(nullif(v_post_preview, ''), c.last_message_preview)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'message_id', v_message_id, 'created_at', v_created_at);
end;
$$;

grant execute on function public.append_channel_comment(uuid, uuid, text, uuid) to authenticated;

drop function if exists public.list_group_messages_page(uuid, int, timestamptz, uuid);

create or replace function public.list_group_messages_page(
  p_conversation_id uuid,
  p_limit int default 50,
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
  reply_to_message_id uuid,
  quote_to_message_id uuid,
  reply_preview jsonb
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_lim int := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 120));
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'group'
      and m.user_id = v_uid
  ) then
    raise exception 'forbidden';
  end if;

  if p_before_created_at is not null and p_before_id is null then
    raise exception 'cursor_incomplete';
  end if;

  return query
  select
    x.id,
    x.sender_user_id,
    x.sender_name_snapshot,
    x.kind,
    x.body,
    x.meta,
    x.created_at,
    x.edited_at,
    x.reply_to_message_id,
    x.quote_to_message_id,
    x.reply_preview
  from (
    select
      m.id,
      m.sender_user_id,
      m.sender_name_snapshot,
      m.kind,
      m.body,
      m.meta,
      m.created_at,
      m.edited_at,
      m.reply_to_message_id,
      m.quote_to_message_id,
      m.reply_preview
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
      and (
        p_before_created_at is null
        or (m.created_at, m.id) < (p_before_created_at, p_before_id)
      )
    order by m.created_at desc, m.id desc
    limit v_lim
  ) x
  order by x.created_at asc, x.id asc;
end;
$$;

grant execute on function public.list_group_messages_page(uuid, int, timestamptz, uuid) to authenticated;

drop function if exists public.list_channel_comments_page(uuid, uuid, int, timestamptz, uuid);

create or replace function public.list_channel_comments_page(
  p_conversation_id uuid,
  p_post_id uuid,
  p_limit int default 50,
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
  reply_to_message_id uuid,
  quote_to_message_id uuid,
  reply_preview jsonb
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
    m.reply_to_message_id,
    m.quote_to_message_id,
    m.reply_preview
  from public.chat_messages m
  cross join me
  where me.uid is not null
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id = p_post_id
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
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 50), 120));
$$;

grant execute on function public.list_channel_comments_page(uuid, uuid, int, timestamptz, uuid) to authenticated;
