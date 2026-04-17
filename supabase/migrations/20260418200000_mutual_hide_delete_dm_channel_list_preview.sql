-- 1) When both users hid each other from contact lists, delete their 1:1 direct conversation (cascade messages, members, etc.).
-- 2) Channel list preview: after edit/delete comment, derive preview from latest *post* (reply_to_message_id is null), not latest comment.

create or replace function public.hide_contact_from_my_list(p_hidden_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_peer_dm_id uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_hidden_user_id is null or p_hidden_user_id = v_me then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  insert into public.user_contact_list_hides (owner_user_id, hidden_user_id)
  values (v_me, p_hidden_user_id)
  on conflict (owner_user_id, hidden_user_id) do nothing;

  -- Peer already hid me → mutual "unfriend" from lists: drop DM between us.
  if exists (
    select 1
    from public.user_contact_list_hides h2
    where h2.owner_user_id = p_hidden_user_id
      and h2.hidden_user_id = v_me
  ) then
    select c.id
      into v_peer_dm_id
    from public.chat_conversations c
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.kind = 'direct'
    group by c.id
    having count(*) = 2
       and bool_or(m.user_id = v_me)
       and bool_or(m.user_id = p_hidden_user_id)
       and bool_and(m.user_id in (v_me, p_hidden_user_id))
    order by max(c.created_at) desc
    limit 1;

    if v_peer_dm_id is not null then
      delete from public.chat_conversations where id = v_peer_dm_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'deleted_peer_dm_id', v_peer_dm_id);
end;
$$;

grant execute on function public.hide_contact_from_my_list(uuid) to authenticated;

-- edit_channel_comment: sidebar preview = latest post body, not latest row (could be a comment).
create or replace function public.edit_channel_comment(
  p_conversation_id uuid,
  p_message_id uuid,
  p_new_body text
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
  v_reply_to uuid;
  v_kind text;
  v_post_preview text;
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

  select m.reply_to_message_id, m.kind, (m.sender_user_id = v_me)
    into v_reply_to, v_kind, v_is_author
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id;

  if v_reply_to is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_comment');
  end if;
  if v_kind is null or v_kind not in ('text', 'image') then
    return jsonb_build_object('ok', false, 'error', 'not_editable');
  end if;

  if not exists (
    select 1
    from public.chat_messages p
    where p.id = v_reply_to
      and p.conversation_id = p_conversation_id
      and p.reply_to_message_id is null
      and p.kind in ('text', 'system', 'image')
  ) then
    return jsonb_build_object('ok', false, 'error', 'parent_not_found');
  end if;

  v_is_admin := public.is_channel_admin(p_conversation_id, v_me);
  if not (v_is_author or v_is_admin) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.chat_messages
     set body = v_new,
         edited_at = now()
   where id = p_message_id;

  select left(coalesce(m2.body, ''), 280)
    into v_post_preview
  from public.chat_messages m2
  where m2.conversation_id = p_conversation_id
    and m2.reply_to_message_id is null
    and m2.kind in ('text', 'system', 'image')
  order by m2.created_at desc, m2.id desc
  limit 1;

  update public.chat_conversations c
     set last_message_preview = coalesce(nullif(v_post_preview, ''), c.last_message_preview)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.edit_channel_comment(uuid, uuid, text) to authenticated;

create or replace function public.delete_channel_comment(
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
  v_reply_to uuid;
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
      and c.kind = 'channel'
      and c.closed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select m.reply_to_message_id, m.kind, (m.sender_user_id = v_me)
    into v_reply_to, v_kind, v_is_author
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id;

  if v_reply_to is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_comment');
  end if;
  if v_kind is null or v_kind not in ('text', 'image') then
    return jsonb_build_object('ok', false, 'error', 'not_deletable');
  end if;

  v_is_admin := public.is_channel_admin(p_conversation_id, v_me);
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
    and m.reply_to_message_id is null
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

grant execute on function public.delete_channel_comment(uuid, uuid) to authenticated;

-- 3) Repair channel rows whose preview matched a comment (e.g. after edit_comment).
do $$
begin
  update public.chat_conversations c
     set last_message_preview = left(coalesce(p.body, ''), 280)
    from lateral (
      select m.body
      from public.chat_messages m
      where m.conversation_id = c.id
        and c.kind = 'channel'
        and m.reply_to_message_id is null
        and m.kind in ('text', 'system', 'image')
      order by m.created_at desc, m.id desc
      limit 1
    ) p
   where c.kind = 'channel'
     and p.body is not null;
exception
  when others then
    null;
end $$;
