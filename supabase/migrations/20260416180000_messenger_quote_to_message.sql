-- Messenger: unify quoting/reply across DM/group/channel comments.
-- Adds quote_to_message_id so channel comments can stay attached to a post (reply_to_message_id)
-- and also quote another comment/message inside the same thread.

-- ── chat_messages: quote pointer (separate from reply_to for channel comments) ───────────────

alter table public.chat_messages
  add column if not exists quote_to_message_id uuid references public.chat_messages(id) on delete set null;

create index if not exists chat_messages_quote_to_idx
  on public.chat_messages(quote_to_message_id)
  where quote_to_message_id is not null;

-- ── append_direct_message: store quote_to in addition to reply_to ──────────────────────────

drop function if exists public.append_direct_message(uuid, text, text, jsonb, uuid);

create or replace function public.append_direct_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default null,
  p_reply_to_message_id uuid default null,
  p_quote_to_message_id uuid default null
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
  v_reply_to uuid := coalesce(p_reply_to_message_id, p_quote_to_message_id);
  v_quote_to uuid := coalesce(p_quote_to_message_id, p_reply_to_message_id);
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
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

  if v_reply_to is not null then
    if not exists (
      select 1
      from public.chat_messages rm
      where rm.id = v_reply_to
        and rm.conversation_id = p_conversation_id
        and rm.kind in ('text', 'system', 'image')
    ) then
      raise exception 'reply_target_invalid';
    end if;
  end if;

  if v_quote_to is not null then
    if not exists (
      select 1
      from public.chat_messages qm
      where qm.id = v_quote_to
        and qm.conversation_id = p_conversation_id
        and qm.kind in ('text', 'system', 'image')
    ) then
      raise exception 'quote_target_invalid';
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
    v_user_id,
    left(v_name, 200),
    v_kind,
    v_body,
    v_meta,
    v_created_at,
    v_reply_to,
    v_quote_to
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

grant execute on function public.append_direct_message(uuid, text, text, jsonb, uuid, uuid) to authenticated;

-- ── append_group_message: store quote_to in addition to reply_to ───────────────────────────

drop function if exists public.append_group_message(uuid, text, text, jsonb, uuid);

create or replace function public.append_group_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default null,
  p_reply_to_message_id uuid default null,
  p_quote_to_message_id uuid default null
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
  v_reply_to uuid := coalesce(p_reply_to_message_id, p_quote_to_message_id);
  v_quote_to uuid := coalesce(p_quote_to_message_id, p_reply_to_message_id);
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

  if v_reply_to is not null then
    if not exists (
      select 1
      from public.chat_messages rm
      where rm.id = v_reply_to
        and rm.conversation_id = p_conversation_id
        and rm.kind in ('text', 'system', 'image')
    ) then
      raise exception 'reply_target_invalid';
    end if;
  end if;

  if v_quote_to is not null then
    if not exists (
      select 1
      from public.chat_messages qm
      where qm.id = v_quote_to
        and qm.conversation_id = p_conversation_id
        and qm.kind in ('text', 'system', 'image')
    ) then
      raise exception 'quote_target_invalid';
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
    v_user_id,
    left(v_name, 200),
    v_kind,
    v_body,
    v_meta,
    v_created_at,
    v_reply_to,
    v_quote_to
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

grant execute on function public.append_group_message(uuid, text, text, jsonb, uuid, uuid) to authenticated;

-- ── list_group_messages_page: include quote_to_message_id ──────────────────────────────────

drop function if exists public.list_group_messages_page(uuid, int, timestamptz, uuid);

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
  reply_to_message_id uuid,
  quote_to_message_id uuid
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
    x.reply_to_message_id,
    x.quote_to_message_id
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
      m.reply_to_message_id,
      m.quote_to_message_id
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

-- ── append_channel_comment: allow quoting another comment while attached to post ───────────

drop function if exists public.append_channel_comment(uuid, uuid, text);

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
  v_body text := left(coalesce(p_body, ''), 4000);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_role text;
  v_comments_mode text;
  v_quote_to uuid := p_quote_to_message_id;
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

  -- Parent post must exist and be top-level.
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

  -- Quoted target must be in the same conversation and belong to the same post thread (either the post itself or its comment).
  if v_quote_to is not null then
    if not exists (
      select 1
      from public.chat_messages qm
      where qm.id = v_quote_to
        and qm.conversation_id = p_conversation_id
        and qm.kind in ('text','system','image')
        and (
          qm.id = p_reply_to_message_id
          or qm.reply_to_message_id = p_reply_to_message_id
        )
    ) then
      raise exception 'quote_target_invalid';
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
    v_quote_to
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

grant execute on function public.append_channel_comment(uuid, uuid, text, uuid) to authenticated;

-- ── list_channel_comments_page: include quote_to_message_id ─────────────────────────────────

drop function if exists public.list_channel_comments_page(uuid, uuid, int, timestamptz, uuid);

create or replace function public.list_channel_comments_page(
  p_conversation_id uuid,
  p_post_id uuid,
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
  reply_to_message_id uuid,
  quote_to_message_id uuid
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    m.id,
    m.sender_user_id,
    m.sender_name_snapshot,
    m.kind,
    m.body,
    m.meta,
    m.created_at,
    m.edited_at,
    m.reply_to_message_id,
    m.quote_to_message_id
  from public.chat_messages m
  cross join me
  where me.uid is not null
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id = p_post_id
    and exists(
      select 1
      from public.chat_conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = me.uid
    )
    and (
      p_before_created_at is null
      or (
        m.created_at < p_before_created_at
        or (m.created_at = p_before_created_at and (p_before_id is null or m.id < p_before_id))
      )
    )
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 50), 120));
$$;

grant execute on function public.list_channel_comments_page(uuid, uuid, int, timestamptz, uuid) to authenticated;

