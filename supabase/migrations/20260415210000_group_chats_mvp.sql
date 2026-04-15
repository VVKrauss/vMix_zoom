-- Group chats MVP: conversations kind=group with public/invite access, messages, reactions, unread listing.

-- Conversation settings
alter table public.chat_conversations
  add column if not exists group_is_public boolean not null default false;

comment on column public.chat_conversations.group_is_public is 'Only for kind=group: allow join without invite';

-- Helpers
create or replace function public.is_group_admin(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1
    from public.chat_conversation_members m
    join public.chat_conversations c
      on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.user_id = p_user_id
      and c.kind = 'group'
      and m.role in ('owner','admin')
  );
$$;

grant execute on function public.is_group_admin(uuid, uuid) to authenticated;

-- Create group chat (creator becomes owner)
create or replace function public.create_group_chat(
  p_title text,
  p_is_public boolean default false
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
    group_is_public
  )
  values (
    'group',
    v_title,
    v_me,
    null,
    coalesce(p_is_public, false)
  )
  returning id into v_id;

  insert into public.chat_conversation_members (conversation_id, user_id, role)
  values (v_id, v_me, 'owner')
  on conflict (conversation_id, user_id) do nothing;

  return v_id;
end;
$$;

grant execute on function public.create_group_chat(text, boolean) to authenticated;

-- Add users to group chat (owner/admin)
create or replace function public.add_users_to_group_chat(
  p_conversation_id uuid,
  p_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := p_conversation_id;
  v_added integer := 0;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return jsonb_build_object('ok', true, 'added', 0);
  end if;

  if not public.is_group_admin(v_id, v_me) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.chat_conversation_members (conversation_id, user_id, role)
  select v_id, u, 'member'
  from unnest(p_user_ids) as u
  on conflict (conversation_id, user_id) do nothing;

  get diagnostics v_added = row_count;
  return jsonb_build_object('ok', true, 'added', v_added);
end;
$$;

grant execute on function public.add_users_to_group_chat(uuid, uuid[]) to authenticated;

-- Join public group chat (self)
create or replace function public.join_public_group_chat(
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
      and c.kind = 'group'
      and c.group_is_public = true
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

grant execute on function public.join_public_group_chat(uuid) to authenticated;

-- Mark group read
create or replace function public.mark_group_read(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  update public.chat_conversation_members
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = v_user_id;

  get diagnostics v_updated = row_count;
  return jsonb_build_object('ok', true, 'updated', v_updated);
end;
$$;

grant execute on function public.mark_group_read(uuid) to authenticated;

-- List my group chats (with unread count)
create or replace function public.list_my_group_chats()
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count integer,
  unread_count integer,
  is_public boolean
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with my_membership as (
    select m.conversation_id, m.last_read_at
    from public.chat_conversation_members m
    where m.user_id = auth.uid()
  ),
  gr as (
    select
      c.id,
      c.title,
      c.created_at,
      c.last_message_at,
      c.last_message_preview,
      c.message_count,
      c.group_is_public,
      mm.last_read_at
    from public.chat_conversations c
    join my_membership mm
      on mm.conversation_id = c.id
    where c.kind = 'group'
      and c.closed_at is null
  ),
  unread as (
    select
      g.id as conversation_id,
      count(msg.id)::integer as unread_count
    from gr g
    left join public.chat_messages msg
      on msg.conversation_id = g.id
     and msg.created_at > coalesce(g.last_read_at, to_timestamp(0))
     and msg.kind in ('text','system','image')
    group by g.id
  )
  select
    g.id,
    coalesce(nullif(btrim(g.title), ''), 'Группа') as title,
    g.created_at,
    g.last_message_at,
    g.last_message_preview,
    g.message_count,
    coalesce(u.unread_count, 0) as unread_count,
    g.group_is_public as is_public
  from gr g
  left join unread u
    on u.conversation_id = g.id
  order by coalesce(g.last_message_at, g.created_at) desc;
$$;

grant execute on function public.list_my_group_chats() to authenticated;

-- Page group messages: newest-first in storage, returned chronological.
create or replace function public.list_group_messages_page(
  p_conversation_id uuid,
  p_limit int default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  sender_user_id uuid,
  sender_name_snapshot text,
  kind text,
  body text,
  meta jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  reply_to_message_id uuid
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_lim int := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 120));
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'group'
      and m.user_id = v_uid
  ) then
    raise exception 'forbidden';
  end if;

  if p_before_created_at is not null and p_before_id is null then
    raise exception 'cursor_incomplete';
  end if;

  return query
  select
    x.id,
    x.sender_user_id,
    x.sender_name_snapshot,
    x.kind,
    x.body,
    x.meta,
    x.created_at,
    x.edited_at,
    x.reply_to_message_id
  from (
    select
      m.id,
      m.sender_user_id,
      m.sender_name_snapshot,
      m.kind,
      m.body,
      m.meta,
      m.created_at,
      m.edited_at,
      m.reply_to_message_id
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
      and (
        p_before_created_at is null
        or (m.created_at, m.id) < (p_before_created_at, p_before_id)
      )
    order by m.created_at desc, m.id desc
    limit v_lim
  ) x
  order by x.created_at asc, x.id asc;
end;
$$;

grant execute on function public.list_group_messages_page(uuid, int, timestamptz, uuid) to authenticated;

-- Append group message (text/image/system/reaction) with reply support
create or replace function public.append_group_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default null,
  p_reply_to_message_id uuid default null
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
  v_kind text := case
    when p_kind in ('text', 'reaction', 'system', 'image') then p_kind
    else 'text'
  end;
  v_body text := left(coalesce(p_body, ''), 4000);
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_image_path text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'group'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  if v_kind = 'image' then
    v_image_path := nullif(trim(coalesce(v_meta -> 'image' ->> 'path', '')), '');
    if v_image_path is null then
      raise exception 'image_path_required';
    end if;
  else
    if nullif(btrim(v_body), '') is null then
      raise exception 'message_body_required';
    end if;
  end if;

  if p_reply_to_message_id is not null then
    if not exists (
      select 1
      from public.chat_messages rm
      where rm.id = p_reply_to_message_id
        and rm.conversation_id = p_conversation_id
        and rm.kind in ('text', 'system', 'image')
    ) then
      raise exception 'reply_target_invalid';
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
    reply_to_message_id
  )
  values (
    p_conversation_id,
    v_user_id,
    left(v_name, 200),
    v_kind,
    v_body,
    v_meta,
    v_created_at,
    p_reply_to_message_id
  )
  returning id into v_message_id;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = case
           when v_kind = 'reaction' then coalesce(
             (
               select left(m.body, 280)
               from public.chat_messages m
               where m.conversation_id = p_conversation_id
                 and m.kind in ('text', 'system', 'image')
               order by m.created_at desc, m.id desc
               limit 1
             ),
             c.last_message_preview
           )
           when v_kind = 'image' then coalesce(
             nullif(left(btrim(v_body), 280), ''),
             '📷 Фото'
           )
           else left(v_body, 280)
         end
   where c.id = p_conversation_id;

  update public.chat_conversation_members
     set last_read_at = v_created_at
   where conversation_id = p_conversation_id
     and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'message_id', v_message_id,
    'created_at', v_created_at
  );
end;
$$;

grant execute on function public.append_group_message(uuid, text, text, jsonb, uuid) to authenticated;

-- Toggle reaction in group
create or replace function public.toggle_group_message_reaction(
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
  v_allowed constant text[] := array['👍', '👏', '❤️', '😂', '🔥', '✋', '🖖'];
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
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'group'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.chat_messages tm
    where tm.id = p_target_message_id
      and tm.conversation_id = p_conversation_id
      and tm.kind in ('text', 'system', 'image')
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

    select m.created_at,
           left(
             case
               when m.kind = 'reaction' then coalesce(
                 (
                   select left(x.body, 280)
                   from public.chat_messages x
                   where x.conversation_id = p_conversation_id
                     and x.kind in ('text','system','image')
                   order by x.created_at desc, x.id desc
                   limit 1
                 ),
                 nullif(trim(m.body), '')
               )
               when m.kind = 'image' then coalesce(nullif(left(btrim(m.body), 280), ''), '📷 Фото')
               else m.body
             end,
             280
           )
      into v_last_at, v_last_preview
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
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
             select left(m.body, 280)
             from public.chat_messages m
             where m.conversation_id = p_conversation_id
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

grant execute on function public.toggle_group_message_reaction(uuid, uuid, text) to authenticated;

