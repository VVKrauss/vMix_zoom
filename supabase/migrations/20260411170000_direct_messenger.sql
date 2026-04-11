create or replace function public.ensure_self_direct_conversation()
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select c.id
    into v_conversation_id
  from public.chat_conversations c
  join public.chat_conversation_members m
    on m.conversation_id = c.id
  where c.kind = 'direct'
    and c.created_by = v_user_id
    and c.title = 'Сохраненное'
  group by c.id
  having count(*) = 1
     and bool_and(m.user_id = v_user_id)
  order by max(c.created_at) desc
  limit 1;

  if v_conversation_id is null then
    insert into public.chat_conversations (
      kind,
      title,
      created_by,
      closed_at
    )
    values (
      'direct',
      'Сохраненное',
      v_user_id,
      null
    )
    returning id into v_conversation_id;

    insert into public.chat_conversation_members (
      conversation_id,
      user_id,
      role
    )
    values (
      v_conversation_id,
      v_user_id,
      'owner'
    )
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_conversation_id;
end;
$$;

create or replace function public.append_direct_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text'
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
    when p_kind in ('text', 'reaction', 'system') then p_kind
    else 'text'
  end;
  v_body text := left(coalesce(p_body, ''), 4000);
  v_created_at timestamptz := now();
  v_message_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if nullif(btrim(v_body), '') is null then
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

  insert into public.chat_messages (
    conversation_id,
    sender_user_id,
    sender_name_snapshot,
    kind,
    body,
    created_at
  )
  values (
    p_conversation_id,
    v_user_id,
    left(v_name, 200),
    v_kind,
    v_body,
    v_created_at
  )
  returning id into v_message_id;

  update public.chat_conversations
     set last_message_at = v_created_at,
         last_message_preview = left(v_body, 280),
         message_count = message_count + 1
   where id = p_conversation_id;

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

grant execute on function public.ensure_self_direct_conversation() to authenticated;
grant execute on function public.append_direct_message(uuid, text, text) to authenticated;
