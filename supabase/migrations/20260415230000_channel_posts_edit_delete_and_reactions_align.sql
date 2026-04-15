-- Channels: edit/delete posts + align reaction whitelist with REACTION_EMOJI_WHITELIST.

-- ── Edit channel post (author or admin) ────────────────────────────────────
create or replace function public.edit_channel_post(
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

  -- Must be a member of the channel
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
         edited_at = now()
   where id = p_message_id;

  -- If it was the last preview source, update preview.
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

grant execute on function public.edit_channel_post(uuid, uuid, text) to authenticated;

-- ── Delete channel post (author or admin) ──────────────────────────────────
create or replace function public.delete_channel_post(
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
  v_comment_ids uuid[];
  v_deleted integer := 0;
  v_rc integer := 0;
  v_last_at timestamptz;
  v_last_preview text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null or p_message_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  -- Must be a member of the channel
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

  -- Collect comment ids for cleanup of reactions.
  select array_agg(m.id)
    into v_comment_ids
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.reply_to_message_id = p_message_id
    and m.kind in ('text','system','image');

  -- Delete reactions to post and its comments (meta.react_to stores UUID as text).
  delete from public.chat_messages r
  where r.conversation_id = p_conversation_id
    and r.kind = 'reaction'
    and (
      coalesce(r.meta ->> 'react_to', '') = p_message_id::text
      or (v_comment_ids is not null and (r.meta ->> 'react_to')::uuid = any (v_comment_ids))
    );
  get diagnostics v_rc = row_count;
  v_deleted := v_deleted + v_rc;

  -- Delete comments.
  delete from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.reply_to_message_id = p_message_id;
  get diagnostics v_rc = row_count;
  v_deleted := v_deleted + v_rc;

  -- Delete the post itself.
  delete from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.id = p_message_id;
  get diagnostics v_rc = row_count;
  v_deleted := v_deleted + v_rc;

  -- Recompute last_message_at and preview for top-level posts (skip reactions).
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
    and m.kind in ('text','system','image')
  order by m.created_at desc, m.id desc
  limit 1;

  update public.chat_conversations c
     set message_count = greatest(0, c.message_count - greatest(0, v_deleted)),
         last_message_at = v_last_at,
         last_message_preview = v_last_preview
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

grant execute on function public.delete_channel_post(uuid, uuid) to authenticated;

-- ── Align channel reaction whitelist with app (10 emojis) ───────────────────
create or replace function public.toggle_channel_message_reaction(
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
  v_allowed constant text[] := array['👍', '👏', '❤️', '😂', '😭', '🔥', '✋', '🖖', '👎', '💩'];
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
    join public.chat_conversation_members m on m.conversation_id = c.id
    where c.id = p_conversation_id and c.kind = 'channel' and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;
  if not exists (
    select 1
    from public.chat_messages tm
    where tm.id = p_target_message_id
      and tm.conversation_id = p_conversation_id
      and tm.kind in ('text','system','image')
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
      and m.reply_to_message_id is null
      and m.kind in ('text', 'system', 'image')
    order by m.created_at desc, m.id desc
    limit 1;

    update public.chat_conversations c
       set message_count = greatest(0, c.message_count - 1),
           last_message_at = v_last_at,
           last_message_preview = v_last_preview
     where c.id = p_conversation_id;

    return jsonb_build_object('ok', true, 'action', 'removed', 'message_id', v_existing_id);
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
               and m.reply_to_message_id is null
               and m.kind in ('text', 'system', 'image')
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

  return jsonb_build_object('ok', true, 'action', 'added', 'message_id', v_new_id, 'created_at', v_created_at);
end;
$$;

grant execute on function public.toggle_channel_message_reaction(uuid, uuid, text) to authenticated;

