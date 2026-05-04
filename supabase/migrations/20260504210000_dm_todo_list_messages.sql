-- ЛС: сообщения kind = todo_list (meta.todo_list: title + items[] с id/text/done).
-- Оба участника могут обновлять список через RPC update_direct_message_todo_list.

alter table public.chat_messages
  drop constraint if exists chat_messages_kind_check;

alter table public.chat_messages
  add constraint chat_messages_kind_check
  check (kind in ('text', 'system', 'reaction', 'image', 'audio', 'todo_list'));

-- Нормализация и валидация payload (1–10 пунктов, непустой text, uuid id).
create or replace function public.validate_and_strip_dm_todo_list(p_tl jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
security invoker
set search_path to 'public'
as $$
declare
  title text := left(trim(coalesce(p_tl ->> 'title', '')), 500);
  raw jsonb := p_tl -> 'items';
  n int;
  i int;
  el jsonb;
  acc jsonb := '[]'::jsonb;
  tid_text text;
  ttxt text;
  tdone boolean;
  test_uuid uuid;
begin
  if jsonb_typeof(p_tl) <> 'object' then
    raise exception 'todo_list_invalid';
  end if;
  if jsonb_typeof(raw) <> 'array' then
    raise exception 'todo_list_items_invalid';
  end if;
  n := jsonb_array_length(raw);
  if n < 1 or n > 10 then
    raise exception 'todo_list_count_invalid';
  end if;

  for i in 0 .. n - 1 loop
    el := raw -> i;
    tid_text := nullif(trim(el ->> 'id'), '');
    if tid_text is null then
      raise exception 'todo_list_item_id_required';
    end if;
    begin
      test_uuid := tid_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'todo_list_item_id_invalid';
    end;
    ttxt := nullif(trim(el ->> 'text'), '');
    if ttxt is null then
      raise exception 'todo_list_item_text_required';
    end if;
    ttxt := left(ttxt, 500);
    tdone := case
      when coalesce(el ->> 'done', 'false') in ('true', 't', '1') then true
      else false
    end;
    acc := acc || jsonb_build_array(jsonb_build_object('id', tid_text, 'text', ttxt, 'done', tdone));
  end loop;

  return jsonb_strip_nulls(
    jsonb_build_object(
      'title',
      nullif(title, ''),
      'items',
      acc
    )
  );
end;
$$;

create or replace function public.dm_todo_list_body_preview(p_tl jsonb)
returns text
language sql
immutable
parallel safe
security invoker
set search_path to 'public'
as $$
  select left(
    case
      when nullif(trim(coalesce(p_tl ->> 'title', '')), '') is not null then trim(p_tl ->> 'title')
      when jsonb_typeof(p_tl -> 'items') = 'array'
        and jsonb_array_length(p_tl -> 'items') > 0 then trim(coalesce((p_tl -> 'items' -> 0) ->> 'text', ''))
      else '📋 Список дел'
    end,
    4000
  );
$$;

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
  elsif p_kind = 'todo_list' then
    v_snippet := case
      when nullif(trim(coalesce(v_meta -> 'todo_list' ->> 'title', '')), '') is not null then
        left(trim(v_meta -> 'todo_list' ->> 'title'), 280)
      when jsonb_typeof(v_meta -> 'todo_list' -> 'items') = 'array'
        and jsonb_array_length(v_meta -> 'todo_list' -> 'items') > 0 then
        left(
          trim(coalesce((v_meta -> 'todo_list' -> 'items' -> 0) ->> 'text', '')),
          280
        )
      else '📋 Список дел'
    end;
  elsif p_kind = 'system' then
    v_snippet := left(case when length(v_cap) > 0 then v_cap else '…' end, 280);
  else
    v_snippet := left(case when length(v_cap) > 0 then v_cap else '…' end, 280);
  end if;

  return jsonb_strip_nulls(
    jsonb_build_object(
      'kind',
      p_kind,
      'snippet',
      v_snippet,
      'sender_name',
      nullif(left(trim(coalesce(p_sender_name_snapshot, '')), 200), ''),
      'sender_user_id',
      p_sender_user_id,
      'thumb_path',
      nullif(trim(coalesce(v_thumb, '')), '')
    )
  );
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
    when p_kind in ('text', 'reaction', 'system', 'image', 'audio', 'todo_list') then p_kind
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
  v_tl_norm jsonb;
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
  elsif v_kind = 'todo_list' then
    v_tl_norm := public.validate_and_strip_dm_todo_list(v_meta -> 'todo_list');
    v_meta := jsonb_set(v_meta, '{todo_list}', v_tl_norm, true);
    v_body := public.dm_todo_list_body_preview(v_tl_norm);
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
        and rm.kind in ('text', 'system', 'image', 'audio', 'todo_list')
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
        and qm.kind in ('text', 'system', 'image', 'audio', 'todo_list')
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
                 and m.kind in ('text', 'system', 'image', 'audio', 'todo_list')
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
           when v_kind = 'todo_list' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '📋 Список дел'
           )
           else left(v_body, 280)
         end
   where c.id = p_conversation_id;

  update public.chat_conversation_members
     set last_read_at = v_created_at
   where conversation_id = p_conversation_id
     and user_id = v_user_id;

  return jsonb_build_object(
    'ok',
    true,
    'conversation_id',
    p_conversation_id,
    'message_id',
    v_message_id,
    'created_at',
    v_created_at
  );
end;
$$;

create or replace function public.update_direct_message_todo_list(
  p_conversation_id uuid,
  p_message_id uuid,
  p_title text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_kind text;
  v_meta jsonb;
  v_tl_norm jsonb;
  v_body text;
begin
  if v_me is null then
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
      and m.user_id = v_me
  ) then
    raise exception 'forbidden';
  end if;

  select m.kind, m.meta
    into v_kind, v_meta
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id;

  if v_kind is null then
    raise exception 'message_not_found';
  end if;
  if v_kind <> 'todo_list' then
    raise exception 'message_not_todo_list';
  end if;

  v_tl_norm := public.validate_and_strip_dm_todo_list(
    jsonb_build_object('title', coalesce(p_title, ''), 'items', coalesce(p_items, '[]'::jsonb))
  );
  v_meta := jsonb_set(coalesce(v_meta, '{}'::jsonb), '{todo_list}', v_tl_norm, true);
  v_body := public.dm_todo_list_body_preview(v_tl_norm);

  update public.chat_messages
     set meta = v_meta,
         body = v_body,
         edited_at = now()
   where id = p_message_id;

  update public.chat_conversations c
     set last_message_preview = left(
       coalesce(
         (
           select case
             when m.kind = 'image' and nullif(btrim(m.body), '') is null then '📷 Фото'
             when m.kind = 'audio' and nullif(btrim(m.body), '') is null then '🎤 Голосовое'
             when m.kind = 'todo_list' and nullif(btrim(m.body), '') is null then '📋 Список дел'
             else m.body
           end
           from public.chat_messages m
           where m.conversation_id = p_conversation_id
             and m.kind in ('text', 'system', 'image', 'audio', 'todo_list')
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

grant execute on function public.update_direct_message_todo_list(uuid, uuid, text, jsonb) to authenticated;

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
  v_allowed constant text[] := array['👍', '👏', '❤️', '😂', '😭', '🔥', '✋', '🖖', '👎', '💩', '🤗', '😘', '😛', '😳', '😉', '😃', '😀', '😆', '😁', '😅', '🤣', '😊', '😇', '🙂', '😍', '🥰', '😗', '😙', '😚', '😋', '😜', '🤪', '😝', '🤑', '🤭'];
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
      and tm.kind in ('text', 'system', 'image', 'audio', 'todo_list')
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
      and m.kind in ('text', 'system', 'image', 'audio', 'todo_list')
    order by m.created_at desc, m.id desc
    limit 1;

    update public.chat_conversations c
       set message_count = greatest(0, c.message_count - 1),
           last_message_at = v_last_at,
           last_message_preview = v_last_preview
     where c.id = p_conversation_id;

    return jsonb_build_object(
      'ok',
      true,
      'action',
      'removed',
      'message_id',
      v_existing_id
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
               and m.kind in ('text', 'system', 'image', 'audio', 'todo_list')
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
    'ok',
    true,
    'action',
    'added',
    'message_id',
    v_new_id,
    'created_at',
    v_created_at
  );
end;
$$;

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
             when m.kind = 'todo_list' and nullif(btrim(m.body), '') is null then '📋 Список дел'
             else m.body
           end
           from public.chat_messages m
           where m.conversation_id = p_conversation_id
             and m.kind in ('text', 'system', 'image', 'audio', 'todo_list')
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
