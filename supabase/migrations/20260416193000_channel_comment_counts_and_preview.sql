-- Channel: comment counts for post list + keep conversation preview based on latest post.

-- 1) list_channel_comment_counts: fast counts for a batch of post ids (30-80 ids).
create or replace function public.list_channel_comment_counts(
  p_conversation_id uuid,
  p_post_ids uuid[]
)
returns table (
  post_id uuid,
  comment_count int
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    m.reply_to_message_id as post_id,
    count(*)::int as comment_count
  from public.chat_messages m
  cross join me
  where me.uid is not null
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id = any(p_post_ids)
    and m.kind in ('text','image')
    and exists(
      select 1
      from public.chat_conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = me.uid
    )
  group by m.reply_to_message_id;
$$;

grant execute on function public.list_channel_comment_counts(uuid, uuid[]) to authenticated;

-- 2) append_channel_comment: update last_message_preview from latest post, not from comment.
--    We still bump last_message_at to the comment timestamp (activity/unread).
drop function if exists public.append_channel_comment(uuid, uuid, text, uuid);

create or replace function public.append_channel_comment(
  p_conversation_id uuid,
  p_reply_to_message_id uuid,
  p_body text,
  p_quote_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_name text := coalesce(
    nullif(auth.jwt() ->> 'user_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    'Вы'
  );
  v_body text := left(coalesce(p_body, ''), 4000);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_post_preview text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null or p_reply_to_message_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if nullif(btrim(v_body), '') is null then
    return jsonb_build_object('ok', false, 'error', 'message_body_required');
  end if;

  -- Member & channel open checks
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

  -- Ensure post exists in this channel
  if not exists (
    select 1
    from public.chat_messages pm
    where pm.conversation_id = p_conversation_id
      and pm.id = p_reply_to_message_id
      and pm.reply_to_message_id is null
      and pm.kind in ('text','system','image')
  ) then
    return jsonb_build_object('ok', false, 'error', 'post_not_found');
  end if;

  -- Optional quote target: allow quoting either another comment of this post or the post itself
  if p_quote_to_message_id is not null then
    if not exists (
      select 1
      from public.chat_messages qm
      where qm.conversation_id = p_conversation_id
        and qm.id = p_quote_to_message_id
        and (
          qm.id = p_reply_to_message_id
          or qm.reply_to_message_id = p_reply_to_message_id
        )
        and qm.kind in ('text','system','image')
    ) then
      return jsonb_build_object('ok', false, 'error', 'quote_target_invalid');
    end if;
  end if;

  insert into public.chat_messages (
    conversation_id,
    sender_user_id,
    sender_name_snapshot,
    kind,
    body,
    meta,
    created_at,
    reply_to_message_id,
    quote_to_message_id
  )
  values (
    p_conversation_id,
    v_me,
    left(v_name, 200),
    'text',
    v_body,
    '{}'::jsonb,
    v_created_at,
    p_reply_to_message_id,
    p_quote_to_message_id
  )
  returning id into v_message_id;

  -- Find preview from latest post (not comment)
  select left(coalesce(pm.body, ''), 280)
    into v_post_preview
  from public.chat_messages pm
  where pm.conversation_id = p_conversation_id
    and pm.reply_to_message_id is null
    and pm.kind in ('text','system','image')
  order by pm.created_at desc, pm.id desc
  limit 1;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = coalesce(nullif(v_post_preview, ''), c.last_message_preview)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'message_id', v_message_id, 'created_at', v_created_at);
end;
$$;

grant execute on function public.append_channel_comment(uuid, uuid, text, uuid) to authenticated;

-- 3) One-time: if a channel preview currently points to a comment body, restore it to latest post preview.
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
        and m.kind in ('text','system','image')
      order by m.created_at desc, m.id desc
      limit 1
    ) p
   where c.kind = 'channel'
     and p.body is not null;
exception
  when others then
    -- ignore; migration should not fail due to preview repair
    null;
end $$;

