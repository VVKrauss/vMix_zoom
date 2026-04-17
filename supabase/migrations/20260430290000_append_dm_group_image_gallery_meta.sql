-- Галерея в одном сообщении: meta.images[{path,...}] в дополнение к meta.image.
-- Должна применяться ПОСЛЕ 20260420120000 (там снова создаётся устаревшая 5-арг append_direct_message).

drop function if exists public.append_direct_message(uuid, text, text, jsonb, uuid);

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
    when p_kind in ('text', 'reaction', 'system', 'image') then p_kind
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
        and rm.kind in ('text', 'system', 'image')
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
        and qm.kind in ('text', 'system', 'image')
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
    when p_kind in ('text', 'reaction', 'system', 'image') then p_kind
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
        and rm.kind in ('text', 'system', 'image')
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
        and qm.kind in ('text', 'system', 'image')
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

grant execute on function public.append_group_message(uuid, text, text, jsonb, uuid, uuid) to authenticated;
