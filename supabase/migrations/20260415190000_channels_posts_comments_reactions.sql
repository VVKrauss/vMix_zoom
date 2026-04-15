-- Channels: conversations kind=channel with posts, comments (reply_to), and reactions.

-- Extend kind check
alter table public.chat_conversations
  drop constraint if exists chat_conversations_kind_check;

alter table public.chat_conversations
  add constraint chat_conversations_kind_check
    check (kind in ('room', 'direct', 'group', 'channel'));

-- Channel settings (stored on conversation row to avoid extra tables)
alter table public.chat_conversations
  add column if not exists channel_posting_mode text null
    check (channel_posting_mode in ('admins_only', 'everyone'));

alter table public.chat_conversations
  add column if not exists channel_comments_mode text null
    check (channel_comments_mode in ('everyone', 'disabled'));

alter table public.chat_conversations
  add column if not exists channel_is_public boolean not null default false;

comment on column public.chat_conversations.channel_posting_mode is 'Only for kind=channel: who can create top-level posts';
comment on column public.chat_conversations.channel_comments_mode is 'Only for kind=channel: who can comment on posts';
comment on column public.chat_conversations.channel_is_public is 'Only for kind=channel: allow join via public list';

-- Create channel
create or replace function public.create_channel(
  p_title text,
  p_is_public boolean default false,
  p_posting_mode text default 'admins_only',
  p_comments_mode text default 'everyone'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_title text := nullif(left(coalesce(p_title, ''), 200), '');
  v_id uuid;
  v_post text := case when p_posting_mode in ('admins_only','everyone') then p_posting_mode else 'admins_only' end;
  v_com text := case when p_comments_mode in ('everyone','disabled') then p_comments_mode else 'everyone' end;
begin
  if v_me is null then
    raise exception 'auth_required';
  end if;
  if v_title is null then
    raise exception 'title_required';
  end if;

  insert into public.chat_conversations (
    kind,
    title,
    created_by,
    closed_at,
    channel_is_public,
    channel_posting_mode,
    channel_comments_mode
  )
  values (
    'channel',
    v_title,
    v_me,
    null,
    coalesce(p_is_public, false),
    v_post,
    v_com
  )
  returning id into v_id;

  insert into public.chat_conversation_members (conversation_id, user_id, role)
  values (v_id, v_me, 'owner')
  on conflict (conversation_id, user_id) do nothing;

  return v_id;
end;
$$;

grant execute on function public.create_channel(text, boolean, text, text) to authenticated;

-- Join public channel
create or replace function public.join_public_channel(
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
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    where c.id = v_id
      and c.kind = 'channel'
      and c.channel_is_public = true
      and c.closed_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_joinable');
  end if;

  insert into public.chat_conversation_members (conversation_id, user_id, role)
  values (v_id, v_me, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.join_public_channel(uuid) to authenticated;

-- Append channel post (top-level message)
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

  if v_post_mode = 'admins_only' and v_role not in ('owner','moderator') then
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

grant execute on function public.append_channel_post(uuid, text) to authenticated;

-- Append channel comment (reply_to required)
create or replace function public.append_channel_comment(
  p_conversation_id uuid,
  p_reply_to_message_id uuid,
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
  v_comments_mode text;
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
  if p_conversation_id is null or p_reply_to_message_id is null then
    raise exception 'conversation_required';
  end if;
  if nullif(btrim(v_body), '') is null then
    raise exception 'message_body_required';
  end if;

  select c.channel_comments_mode into v_comments_mode
  from public.chat_conversations c
  where c.id = p_conversation_id and c.kind = 'channel' and c.closed_at is null;
  if v_comments_mode is null then
    raise exception 'channel_not_found';
  end if;
  if v_comments_mode = 'disabled' then
    raise exception 'comments_disabled';
  end if;

  select m.role into v_role
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id = v_me;
  if v_role is null then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.chat_messages rm
    where rm.id = p_reply_to_message_id
      and rm.conversation_id = p_conversation_id
      and rm.reply_to_message_id is null
      and rm.kind in ('text','system','image')
  ) then
    raise exception 'reply_target_invalid';
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
    p_reply_to_message_id
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

grant execute on function public.append_channel_comment(uuid, uuid, text) to authenticated;

-- Reactions in channel: stored as chat_messages(kind=reaction, meta.react_to)
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
  v_emoji text := left(trim(coalesce(p_emoji, '')), 32);
  v_allowed constant text[] := array['👍', '👏', '❤️', '😂', '🔥', '✋', '🖖'];
  v_existing_id uuid;
  v_created_at timestamptz := now();
  v_new_id uuid;
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

  select m.id into v_existing_id
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.kind = 'reaction'
    and m.sender_user_id = v_user_id
    and (m.meta ->> 'react_to')::uuid = p_target_message_id
    and m.body = v_emoji
  limit 1;

  if v_existing_id is not null then
    delete from public.chat_messages where id = v_existing_id;
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
    'Вы',
    'reaction',
    v_emoji,
    jsonb_build_object('react_to', p_target_message_id::text),
    v_created_at
  )
  returning id into v_new_id;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'action', 'added', 'message_id', v_new_id, 'created_at', v_created_at);
end;
$$;

grant execute on function public.toggle_channel_message_reaction(uuid, uuid, text) to authenticated;

