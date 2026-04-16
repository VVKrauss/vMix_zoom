-- Allow group/channel owner or admin to remove another member (kick).

create or replace function public.remove_conversation_member_by_staff(
  p_conversation_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
  v_kind text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null or p_target_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'params_required');
  end if;

  if v_me = p_target_user_id then
    return jsonb_build_object('ok', false, 'error', 'use_leave');
  end if;

  select c.kind into v_kind
  from public.chat_conversations c
  where c.id = p_conversation_id
    and c.closed_at is null;
  if v_kind is null or v_kind not in ('group', 'channel') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_kind = 'group' then
    if not public.is_group_admin(p_conversation_id, v_me) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  else
    if not public.is_channel_admin(p_conversation_id, v_me) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  end if;

  select m.role into v_caller_role
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id
    and m.user_id = v_me;
  if v_caller_role is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select m.role into v_target_role
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id
    and m.user_id = p_target_user_id;
  if v_target_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if v_target_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;

  if v_caller_role = 'admin' then
    if v_target_role in ('admin', 'owner') then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  end if;

  delete from public.chat_conversation_members
  where conversation_id = p_conversation_id
    and user_id = p_target_user_id;

  delete from public.chat_conversation_join_requests
  where conversation_id = p_conversation_id
    and user_id = p_target_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.remove_conversation_member_by_staff(uuid, uuid) to authenticated;
