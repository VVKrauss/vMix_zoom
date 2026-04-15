-- Редактирование поста канала: тело + meta (черновик редактора, SEO и т.д.)

create or replace function public.edit_channel_post_rich(
  p_conversation_id uuid,
  p_message_id uuid,
  p_new_body text,
  p_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_new text := left(coalesce(p_new_body, ''), 4000);
  v_is_admin boolean := false;
  v_is_author boolean := false;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null or p_message_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if nullif(btrim(v_new), '') is null then
    return jsonb_build_object('ok', false, 'error', 'message_body_required');
  end if;

  if not exists (
    select 1
    from public.chat_conversation_members m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.user_id = v_me
      and c.kind = 'channel'
      and c.closed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_is_admin := public.is_channel_admin(p_conversation_id, v_me);

  select (m.sender_user_id = v_me)
    into v_is_author
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id is null
    and m.kind in ('text','system','image')
  limit 1;

  if v_is_author is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not (v_is_author or v_is_admin) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.chat_messages
     set body = v_new,
         meta = case
           when p_meta is null then meta
           else p_meta
         end,
         edited_at = now()
   where id = p_message_id;

  update public.chat_conversations c
     set last_message_preview = left(v_new, 280)
   where c.id = p_conversation_id
     and exists (
       select 1
       from public.chat_messages m
       where m.conversation_id = p_conversation_id
         and m.reply_to_message_id is null
         and m.kind in ('text','system','image')
       order by m.created_at desc, m.id desc
       limit 1
     )
     and (
       select m.id
       from public.chat_messages m
       where m.conversation_id = p_conversation_id
         and m.reply_to_message_id is null
         and m.kind in ('text','system','image')
       order by m.created_at desc, m.id desc
       limit 1
     ) = p_message_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.edit_channel_post_rich(uuid, uuid, text, jsonb) to authenticated;
