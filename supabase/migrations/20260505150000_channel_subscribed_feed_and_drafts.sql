-- Лента подписанных каналов, черновики постов в БД, настройка «всегда показывать ленту».
-- В meta.postDraft: showInSubscribedFeed + coverImage (ms://) — обязательны вместе.

alter table public.users
  add column if not exists messenger_feed_always_show boolean not null default false;

comment on column public.users.messenger_feed_always_show is
  'Показывать блок «Лента» в дереве чатов при любом фильтре; если false — только при фильтре «Каналы».';

create table if not exists public.channel_post_drafts (
  user_id uuid not null references public.users(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists channel_post_drafts_conv_idx on public.channel_post_drafts (conversation_id);

alter table public.channel_post_drafts enable row level security;

drop policy if exists channel_post_drafts_own on public.channel_post_drafts;
create policy channel_post_drafts_own
on public.channel_post_drafts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update, delete on public.channel_post_drafts to authenticated;

-- ---------------------------------------------------------------------------
-- append_channel_post_rich: валидация ленты
-- ---------------------------------------------------------------------------
create or replace function public.append_channel_post_rich(
  p_conversation_id uuid,
  p_body text,
  p_meta jsonb default null
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
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_cover text;
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

  if coalesce((v_meta -> 'postDraft' ->> 'showInSubscribedFeed')::boolean, false) then
    v_cover := nullif(trim(v_meta #>> '{postDraft,coverImage}'), '');
    if v_cover is null or v_cover not like 'ms://%' then
      raise exception 'feed_cover_required';
    end if;
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

  if v_post_mode = 'admins_only' and v_role not in ('owner', 'admin', 'moderator') then
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
    v_meta,
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

-- ---------------------------------------------------------------------------
-- edit_channel_post_rich: валидация ленты при смене meta
-- ---------------------------------------------------------------------------
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
  v_meta jsonb;
  v_cover text;
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

  v_meta := case when p_meta is null then null else p_meta end;
  if v_meta is not null and coalesce((v_meta -> 'postDraft' ->> 'showInSubscribedFeed')::boolean, false) then
    v_cover := nullif(trim(v_meta #>> '{postDraft,coverImage}'), '');
    if v_cover is null or v_cover not like 'ms://%' then
      return jsonb_build_object('ok', false, 'error', 'feed_cover_required');
    end if;
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
grant execute on function public.append_channel_post_rich(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Лента: посты из всех каналов, где пользователь участник; только посты в общую ленту.
-- ---------------------------------------------------------------------------
create or replace function public.list_subscribed_channel_feed_page(
  p_limit int default 24,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  conversation_id uuid,
  channel_title text,
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
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    m.conversation_id,
    coalesce(nullif(trim(c.title), ''), 'Канал') as channel_title,
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
  inner join public.chat_conversations c
    on c.id = m.conversation_id
   and c.kind = 'channel'
   and c.closed_at is null
  cross join me
  where me.uid is not null
    and m.reply_to_message_id is null
    and m.kind in ('text', 'system', 'image')
    and coalesce((m.meta -> 'postDraft' ->> 'showInSubscribedFeed')::boolean, false) = true
    and nullif(trim(m.meta #>> '{postDraft,coverImage}'), '') is not null
    and trim(m.meta #>> '{postDraft,coverImage}') like 'ms://%'
    and coalesce((m.meta ->> 'deleted')::boolean, false) = false
    and exists (
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
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 24), 60));
$$;

grant execute on function public.list_subscribed_channel_feed_page(int, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Настройка ленты (через RPC — единый контракт; колонку можно править и из клиента)
-- ---------------------------------------------------------------------------
create or replace function public.set_messenger_feed_always_show(p_value boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  update public.users
     set messenger_feed_always_show = coalesce(p_value, false)
   where id = v_me;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_messenger_feed_always_show(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Черновик поста канала (один на пару user + conversation)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_channel_post_draft(
  p_conversation_id uuid,
  p_draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null then
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

  insert into public.channel_post_drafts (user_id, conversation_id, draft, updated_at)
  values (v_me, p_conversation_id, coalesce(p_draft, '{}'::jsonb), now())
  on conflict (user_id, conversation_id)
  do update set draft = excluded.draft, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_channel_post_draft(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_draft jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  select d.draft into v_draft
  from public.channel_post_drafts d
  where d.user_id = v_me
    and d.conversation_id = p_conversation_id;

  return jsonb_build_object('ok', true, 'draft', coalesce(v_draft, '{}'::jsonb));
end;
$$;

create or replace function public.delete_channel_post_draft(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  delete from public.channel_post_drafts
   where user_id = v_me
     and conversation_id = p_conversation_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.upsert_channel_post_draft(uuid, jsonb) to authenticated;
grant execute on function public.get_channel_post_draft(uuid) to authenticated;
grant execute on function public.delete_channel_post_draft(uuid) to authenticated;
