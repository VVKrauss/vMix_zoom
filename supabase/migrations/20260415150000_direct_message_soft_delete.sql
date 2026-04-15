-- Soft-delete direct messages: replace with system stub.

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
           select m.body
           from public.chat_messages m
           where m.conversation_id = p_conversation_id
             and m.kind in ('text', 'system', 'image')
           order by m.created_at desc, m.id desc
           limit 1
         ),
         c.last_message_preview
       ),
       280
     )
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'updated', v_updated, 'message_id', p_message_id);
end;
$$;

grant execute on function public.delete_direct_message(uuid, uuid) to authenticated;

