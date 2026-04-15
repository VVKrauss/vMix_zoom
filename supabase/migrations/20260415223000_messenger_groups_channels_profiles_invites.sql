-- Groups/Channels profile: nick + logo + invite links (open/closed).
-- Adds:
-- - chat_conversations.public_nick (unique among group/channel)
-- - chat_conversations.avatar_path/thumb_path (stored in `messenger-media` bucket)
-- - invite table + RPC to resolve/join by invite token
--
-- Notes:
-- - Storage access is already controlled by `messenger_media_*` policies (members only).
-- - Invites are resolved via SECURITY DEFINER functions (bypass RLS safely).

-- ── Conversation profile fields ─────────────────────────────────────────────

alter table public.chat_conversations
  add column if not exists public_nick text null;

alter table public.chat_conversations
  add column if not exists avatar_path text null;

alter table public.chat_conversations
  add column if not exists avatar_thumb_path text null;

comment on column public.chat_conversations.public_nick is 'Public handle for kind=group/channel, used in share links';
comment on column public.chat_conversations.avatar_path is 'Storage path in messenger-media bucket for conversation avatar (full)';
comment on column public.chat_conversations.avatar_thumb_path is 'Storage path in messenger-media bucket for conversation avatar (thumb)';

-- Basic format for nick (lowercase latin, digits, underscore; 3..32).
alter table public.chat_conversations
  drop constraint if exists chat_conversations_public_nick_format_check;

alter table public.chat_conversations
  add constraint chat_conversations_public_nick_format_check
    check (
      public_nick is null
      or public_nick ~ '^[a-z0-9_]{3,32}$'
    );

-- Unique among active group/channel.
drop index if exists public.chat_conversations_public_nick_uniq_idx;
create unique index chat_conversations_public_nick_uniq_idx
  on public.chat_conversations (lower(public_nick))
  where public_nick is not null
    and closed_at is null
    and kind in ('group','channel');

-- ── Helpers: channel admin check ────────────────────────────────────────────

create or replace function public.is_channel_admin(
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
      and c.kind = 'channel'
      and m.role in ('owner','admin','moderator')
  );
$$;

grant execute on function public.is_channel_admin(uuid, uuid) to authenticated;

-- ── Update profile (owner/admin) ────────────────────────────────────────────

create or replace function public.update_group_profile(
  p_conversation_id uuid,
  p_title text default null,
  p_public_nick text default null,
  p_is_public boolean default null,
  p_avatar_path text default null,
  p_avatar_thumb_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := p_conversation_id;
  v_title text := nullif(left(coalesce(p_title, ''), 200), '');
  v_nick text := nullif(trim(coalesce(p_public_nick, '')), '');
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if not public.is_group_admin(v_id, v_me) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.chat_conversations c
     set title = coalesce(v_title, c.title),
         group_is_public = coalesce(p_is_public, c.group_is_public),
         public_nick = coalesce(v_nick, c.public_nick),
         avatar_path = coalesce(nullif(trim(coalesce(p_avatar_path, '')), ''), c.avatar_path),
         avatar_thumb_path = coalesce(nullif(trim(coalesce(p_avatar_thumb_path, '')), ''), c.avatar_thumb_path)
   where c.id = v_id
     and c.kind = 'group'
     and c.closed_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'nick_taken');
end;
$$;

grant execute on function public.update_group_profile(uuid, text, text, boolean, text, text) to authenticated;

create or replace function public.update_channel_profile(
  p_conversation_id uuid,
  p_title text default null,
  p_public_nick text default null,
  p_is_public boolean default null,
  p_posting_mode text default null,
  p_comments_mode text default null,
  p_avatar_path text default null,
  p_avatar_thumb_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := p_conversation_id;
  v_title text := nullif(left(coalesce(p_title, ''), 200), '');
  v_nick text := nullif(trim(coalesce(p_public_nick, '')), '');
  v_post text := case
    when p_posting_mode in ('admins_only','everyone') then p_posting_mode
    else null
  end;
  v_com text := case
    when p_comments_mode in ('everyone','disabled') then p_comments_mode
    else null
  end;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;
  if not public.is_channel_admin(v_id, v_me) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.chat_conversations c
     set title = coalesce(v_title, c.title),
         channel_is_public = coalesce(p_is_public, c.channel_is_public),
         channel_posting_mode = coalesce(v_post, c.channel_posting_mode),
         channel_comments_mode = coalesce(v_com, c.channel_comments_mode),
         public_nick = coalesce(v_nick, c.public_nick),
         avatar_path = coalesce(nullif(trim(coalesce(p_avatar_path, '')), ''), c.avatar_path),
         avatar_thumb_path = coalesce(nullif(trim(coalesce(p_avatar_thumb_path, '')), ''), c.avatar_thumb_path)
   where c.id = v_id
     and c.kind = 'channel'
     and c.closed_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'nick_taken');
end;
$$;

grant execute on function public.update_channel_profile(uuid, text, text, boolean, text, text, text, text) to authenticated;

-- ── Invites table ───────────────────────────────────────────────────────────

create table if not exists public.chat_conversation_invites (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create index if not exists chat_conversation_invites_conversation_idx
  on public.chat_conversation_invites(conversation_id)
  where revoked_at is null;

alter table public.chat_conversation_invites enable row level security;

-- No direct table access; RPC only.
revoke all on table public.chat_conversation_invites from anon, authenticated;

-- Generate/reuse invite token (owner/admin).
create or replace function public.get_or_create_conversation_invite(
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
  v_kind text;
  v_token text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  select c.kind into v_kind
  from public.chat_conversations c
  where c.id = v_id and c.closed_at is null;
  if v_kind is null or v_kind not in ('group','channel') then
    return jsonb_build_object('ok', false, 'error', 'not_supported');
  end if;

  if v_kind = 'group' then
    if not public.is_group_admin(v_id, v_me) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  else
    if not public.is_channel_admin(v_id, v_me) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  end if;

  select i.token into v_token
  from public.chat_conversation_invites i
  where i.conversation_id = v_id and i.revoked_at is null
  order by i.created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(gen_random_bytes(12), 'base64url');
    insert into public.chat_conversation_invites (conversation_id, token, created_by)
    values (v_id, v_token, v_me);
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

grant execute on function public.get_or_create_conversation_invite(uuid) to authenticated;

-- Resolve invite -> preview (authenticated).
create or replace function public.resolve_conversation_by_invite(
  p_token text
)
returns table (
  id uuid,
  kind text,
  title text,
  public_nick text,
  avatar_path text,
  avatar_thumb_path text,
  member_count integer,
  is_public boolean,
  posting_mode text,
  comments_mode text
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  with inv as (
    select i.conversation_id
    from public.chat_conversation_invites i
    where i.token = nullif(trim(coalesce(p_token, '')), '')
      and i.revoked_at is null
    limit 1
  ),
  conv as (
    select c.*
    from public.chat_conversations c
    join inv on inv.conversation_id = c.id
    where c.closed_at is null
      and c.kind in ('group','channel')
  ),
  cnt as (
    select m.conversation_id, count(*)::integer as member_count
    from public.chat_conversation_members m
    join conv c on c.id = m.conversation_id
    group by m.conversation_id
  )
  select
    c.id,
    c.kind,
    coalesce(nullif(btrim(c.title), ''), case when c.kind = 'channel' then 'Канал' else 'Группа' end) as title,
    c.public_nick,
    c.avatar_path,
    c.avatar_thumb_path,
    coalesce(cnt.member_count, 0) as member_count,
    case when c.kind = 'channel' then c.channel_is_public else c.group_is_public end as is_public,
    coalesce(c.channel_posting_mode, 'admins_only') as posting_mode,
    coalesce(c.channel_comments_mode, 'everyone') as comments_mode
  from conv c
  left join cnt on cnt.conversation_id = c.id;
$$;

grant execute on function public.resolve_conversation_by_invite(text) to authenticated;

-- Join by invite (works for closed/public).
create or replace function public.join_conversation_by_invite(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_id uuid;
  v_kind text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_token is null then
    return jsonb_build_object('ok', false, 'error', 'token_required');
  end if;

  select i.conversation_id into v_id
  from public.chat_conversation_invites i
  where i.token = v_token and i.revoked_at is null
  limit 1;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select c.kind into v_kind
  from public.chat_conversations c
  where c.id = v_id and c.closed_at is null;
  if v_kind is null or v_kind not in ('group','channel') then
    return jsonb_build_object('ok', false, 'error', 'not_supported');
  end if;

  insert into public.chat_conversation_members (conversation_id, user_id, role)
  values (v_id, v_me, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'conversation_id', v_id, 'kind', v_kind);
end;
$$;

grant execute on function public.join_conversation_by_invite(text) to authenticated;

-- ── Extend listing RPCs with profile fields + member counts ─────────────────
-- Postgres: нельзя CREATE OR REPLACE, если меняется RETURNS TABLE (другой row type).
drop function if exists public.list_my_group_chats();
drop function if exists public.list_my_channels();

-- Groups list (add: public_nick, avatar_path, avatar_thumb_path, member_count)
create or replace function public.list_my_group_chats()
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count integer,
  unread_count integer,
  is_public boolean,
  public_nick text,
  avatar_path text,
  avatar_thumb_path text,
  member_count integer
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
      c.public_nick,
      c.avatar_path,
      c.avatar_thumb_path,
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
  ),
  members as (
    select m.conversation_id, count(*)::integer as member_count
    from public.chat_conversation_members m
    join gr g on g.id = m.conversation_id
    group by m.conversation_id
  )
  select
    g.id,
    coalesce(nullif(btrim(g.title), ''), 'Группа') as title,
    g.created_at,
    g.last_message_at,
    g.last_message_preview,
    g.message_count,
    coalesce(u.unread_count, 0) as unread_count,
    g.group_is_public as is_public,
    g.public_nick,
    g.avatar_path,
    g.avatar_thumb_path,
    coalesce(mb.member_count, 0) as member_count
  from gr g
  left join unread u on u.conversation_id = g.id
  left join members mb on mb.conversation_id = g.id
  order by coalesce(g.last_message_at, g.created_at) desc;
$$;

grant execute on function public.list_my_group_chats() to authenticated;

-- Channels list (add: public_nick, avatar_path, avatar_thumb_path, member_count)
create or replace function public.list_my_channels()
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count integer,
  unread_count integer,
  is_public boolean,
  posting_mode text,
  comments_mode text,
  public_nick text,
  avatar_path text,
  avatar_thumb_path text,
  member_count integer
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
  chans as (
    select
      c.id,
      c.title,
      c.created_at,
      c.last_message_at,
      c.last_message_preview,
      c.message_count,
      c.channel_is_public,
      c.channel_posting_mode,
      c.channel_comments_mode,
      c.public_nick,
      c.avatar_path,
      c.avatar_thumb_path,
      mm.last_read_at
    from public.chat_conversations c
    join my_membership mm
      on mm.conversation_id = c.id
    where c.kind = 'channel'
      and c.closed_at is null
  ),
  unread as (
    select
      ch.id as conversation_id,
      count(msg.id)::integer as unread_count
    from chans ch
    left join public.chat_messages msg
      on msg.conversation_id = ch.id
     and msg.created_at > coalesce(ch.last_read_at, to_timestamp(0))
     and msg.kind in ('text','system','image')
     and msg.reply_to_message_id is null
    group by ch.id
  ),
  members as (
    select m.conversation_id, count(*)::integer as member_count
    from public.chat_conversation_members m
    join chans ch on ch.id = m.conversation_id
    group by m.conversation_id
  )
  select
    ch.id,
    coalesce(nullif(btrim(ch.title), ''), 'Канал') as title,
    ch.created_at,
    ch.last_message_at,
    ch.last_message_preview,
    ch.message_count,
    coalesce(u.unread_count, 0) as unread_count,
    ch.channel_is_public as is_public,
    coalesce(ch.channel_posting_mode, 'admins_only') as posting_mode,
    coalesce(ch.channel_comments_mode, 'everyone') as comments_mode,
    ch.public_nick,
    ch.avatar_path,
    ch.avatar_thumb_path,
    coalesce(mb.member_count, 0) as member_count
  from chans ch
  left join unread u on u.conversation_id = ch.id
  left join members mb on mb.conversation_id = ch.id
  order by coalesce(ch.last_message_at, ch.created_at) desc;
$$;

grant execute on function public.list_my_channels() to authenticated;

