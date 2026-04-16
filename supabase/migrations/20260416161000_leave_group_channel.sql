-- Leave group/channel: remove membership for current user (except owner).

create or replace function public.leave_group_chat(
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
  v_role text;
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
  if v_kind is distinct from 'group' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select m.role into v_role
  from public.chat_conversation_members m
  where m.conversation_id = v_id
    and m.user_id = v_me;
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if v_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_cannot_leave');
  end if;

  delete from public.chat_conversation_members
  where conversation_id = v_id
    and user_id = v_me;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.leave_group_chat(uuid) to authenticated;

create or replace function public.leave_channel(
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
  v_role text;
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
  if v_kind is distinct from 'channel' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select m.role into v_role
  from public.chat_conversation_members m
  where m.conversation_id = v_id
    and m.user_id = v_me;
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if v_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_cannot_leave');
  end if;

  delete from public.chat_conversation_members
  where conversation_id = v_id
    and user_id = v_me;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.leave_channel(uuid) to authenticated;

