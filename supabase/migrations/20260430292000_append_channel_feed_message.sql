-- Лента канала: сообщения как в группе (текст + meta, в т.ч. ссылка; фото).

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
    when p_kind in ('text', 'reaction', 'system', 'image') then p_kind
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
