-- Delete group messages (author or group admin). Also removes reactions and updates conversation tail.

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
  if v_kind not in ('text', 'image') then
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
    and m.kind in ('text', 'system', 'image')
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

