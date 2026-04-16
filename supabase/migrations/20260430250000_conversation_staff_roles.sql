-- Назначение ролей staff (admin/moderator) участникам группы/канала владельцем или админом.
-- + исправление: в режиме admins_only посты разрешены и роли admin.

alter table public.chat_conversation_members
  drop constraint if exists chat_conversation_members_role_check;

alter table public.chat_conversation_members
  add constraint chat_conversation_members_role_check
    check (role in ('member', 'owner', 'moderator', 'admin'));

create or replace function public.can_assign_conversation_staff_roles(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1
    from public.chat_conversation_members m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.user_id = p_user_id
      and c.kind in ('group', 'channel')
      and c.closed_at is null
      and m.role in ('owner', 'admin')
  );
$$;

grant execute on function public.can_assign_conversation_staff_roles(uuid, uuid) to authenticated;

create or replace function public.list_conversation_staff_members(
  p_conversation_id uuid
)
returns table (
  user_id uuid,
  member_role text,
  display_name text
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;
  if not public.can_assign_conversation_staff_roles(p_conversation_id, auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.user_id,
    m.role as member_role,
    coalesce(nullif(btrim(u.display_name), ''), 'Пользователь')::text as display_name
  from public.chat_conversation_members m
  join public.chat_conversations c on c.id = m.conversation_id
  left join public.users u on u.id = m.user_id
  where m.conversation_id = p_conversation_id
    and c.kind in ('group', 'channel')
    and c.closed_at is null
    and m.role <> 'owner'
  order by display_name asc, m.user_id asc;
end;
$$;

grant execute on function public.list_conversation_staff_members(uuid) to authenticated;

create or replace function public.set_conversation_member_staff_role(
  p_conversation_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := p_conversation_id;
  v_target uuid := p_target_user_id;
  v_new text := lower(trim(coalesce(p_new_role, '')));
  v_caller_role text;
  v_target_role text;
  v_kind text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null or v_target is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if v_target = v_me then
    return jsonb_build_object('ok', false, 'error', 'cannot_change_self');
  end if;

  if not public.can_assign_conversation_staff_roles(v_id, v_me) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_new not in ('member', 'moderator', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;

  select c.kind into v_kind
  from public.chat_conversations c
  where c.id = v_id and c.closed_at is null;
  if v_kind is null or v_kind not in ('group', 'channel') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select m.role into v_caller_role
  from public.chat_conversation_members m
  where m.conversation_id = v_id and m.user_id = v_me;
  if v_caller_role is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select m.role into v_target_role
  from public.chat_conversation_members m
  where m.conversation_id = v_id and m.user_id = v_target;
  if v_target_role is null then
    return jsonb_build_object('ok', false, 'error', 'target_not_member');
  end if;
  if v_target_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'cannot_change_owner');
  end if;

  if v_caller_role = 'admin' then
    if v_new = 'admin' then
      return jsonb_build_object('ok', false, 'error', 'only_owner_promotes_admin');
    end if;
    if v_target_role = 'admin' then
      return jsonb_build_object('ok', false, 'error', 'cannot_change_other_admin');
    end if;
  end if;

  update public.chat_conversation_members m
     set role = v_new
   where m.conversation_id = v_id
     and m.user_id = v_target;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_updated');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_conversation_member_staff_role(uuid, uuid, text) to authenticated;

-- Посты в канале: admins_only — учитывать роль admin
create or replace function public.append_channel_post(
  p_conversation_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_body text := left(coalesce(p_body, ''), 4000);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_role text;
  v_post_mode text;
  v_name text := coalesce(
    nullif(auth.jwt() ->> 'user_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    'Вы'
  );
begin
  if v_me is null then
    raise exception 'auth_required';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;
  if nullif(btrim(v_body), '') is null then
    raise exception 'message_body_required';
  end if;

  select c.channel_posting_mode into v_post_mode
  from public.chat_conversations c
  where c.id = p_conversation_id and c.kind = 'channel' and c.closed_at is null;
  if v_post_mode is null then
    raise exception 'channel_not_found';
  end if;

  select m.role into v_role
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id = v_me;
  if v_role is null then
    raise exception 'forbidden';
  end if;

  if v_post_mode = 'admins_only' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'post_not_allowed';
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
    v_me,
    left(v_name, 200),
    'text',
    v_body,
    '{}'::jsonb,
    v_created_at,
    null
  )
  returning id into v_message_id;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = left(v_body, 280)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'message_id', v_message_id, 'created_at', v_created_at);
end;
$$;

create or replace function public.append_channel_post_rich(
  p_conversation_id uuid,
  p_body text,
  p_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_body text := left(coalesce(p_body, ''), 4000);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_role text;
  v_post_mode text;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_name text := coalesce(
    nullif(auth.jwt() ->> 'user_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    'Вы'
  );
begin
  if v_me is null then
    raise exception 'auth_required';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;
  if nullif(btrim(v_body), '') is null then
    raise exception 'message_body_required';
  end if;

  select c.channel_posting_mode into v_post_mode
  from public.chat_conversations c
  where c.id = p_conversation_id and c.kind = 'channel' and c.closed_at is null;
  if v_post_mode is null then
    raise exception 'channel_not_found';
  end if;

  select m.role into v_role
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id = v_me;
  if v_role is null then
    raise exception 'forbidden';
  end if;

  if v_post_mode = 'admins_only' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'post_not_allowed';
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
    v_me,
    left(v_name, 200),
    'text',
    v_body,
    v_meta,
    v_created_at,
    null
  )
  returning id into v_message_id;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = left(v_body, 280)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'message_id', v_message_id, 'created_at', v_created_at);
end;
$$;
