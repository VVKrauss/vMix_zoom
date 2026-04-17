-- ЛС: выйти из чата (только у себя) или удалить переписку для обоих.
-- Группа/канал: удалить целиком только владелец (для всех участников).

create or replace function public.leave_direct_conversation(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := p_conversation_id;
  v_kind text;
  v_left int;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  select c.kind into v_kind
  from public.chat_conversations c
  where c.id = v_id and c.closed_at is null;
  if v_kind is distinct from 'direct' then
    return jsonb_build_object('ok', false, 'error', 'not_direct');
  end if;

  if not exists (
    select 1 from public.chat_conversation_members m
    where m.conversation_id = v_id and m.user_id = v_me
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  delete from public.chat_conversation_members
  where conversation_id = v_id and user_id = v_me;

  select count(*)::int into v_left from public.chat_conversation_members where conversation_id = v_id;
  if v_left = 0 then
    delete from public.chat_conversations where id = v_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.leave_direct_conversation(uuid) to authenticated;

create or replace function public.delete_direct_conversation_for_all(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := p_conversation_id;
  v_kind text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  select c.kind into v_kind
  from public.chat_conversations c
  where c.id = v_id and c.closed_at is null;
  if v_kind is distinct from 'direct' then
    return jsonb_build_object('ok', false, 'error', 'not_direct');
  end if;

  if not exists (
    select 1 from public.chat_conversation_members m
    where m.conversation_id = v_id and m.user_id = v_me
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  delete from public.chat_conversations where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_direct_conversation_for_all(uuid) to authenticated;

create or replace function public.delete_owned_group_or_channel(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := p_conversation_id;
  v_kind text;
  v_role text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  select c.kind, m.role into v_kind, v_role
  from public.chat_conversations c
  join public.chat_conversation_members m
    on m.conversation_id = c.id and m.user_id = v_me
  where c.id = v_id and c.closed_at is null;

  if v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_kind not in ('group', 'channel') then
    return jsonb_build_object('ok', false, 'error', 'not_group_or_channel');
  end if;
  if v_role is distinct from 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_only');
  end if;

  delete from public.chat_conversations where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_owned_group_or_channel(uuid) to authenticated;
