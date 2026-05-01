-- Messenger: message bookmarks ("Закладки") per conversation.
-- - DM: allow bookmarking for self or for both participants.
-- - Groups/Channels: only staff (owner/admin/moderator) can bookmark.
-- - Any member can "save" to self conversation (handled in app code), but bookmarks are separate.

create table if not exists public.chat_message_bookmarks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chat_message_bookmarks_owner_message_uniq unique (owner_user_id, message_id)
);

comment on table public.chat_message_bookmarks is 'Per-user message bookmarks scoped to a conversation';
comment on column public.chat_message_bookmarks.owner_user_id is 'User that sees this bookmark in their list';
comment on column public.chat_message_bookmarks.created_by_user_id is 'User who created the bookmark';

create index if not exists chat_message_bookmarks_owner_conversation_created_idx
  on public.chat_message_bookmarks(owner_user_id, conversation_id, created_at desc);

create index if not exists chat_message_bookmarks_conversation_idx
  on public.chat_message_bookmarks(conversation_id, created_at desc);

create index if not exists chat_message_bookmarks_message_idx
  on public.chat_message_bookmarks(message_id);

alter table public.chat_message_bookmarks enable row level security;

-- No direct table access; RPC only.
revoke all on table public.chat_message_bookmarks from anon, authenticated;

-- ── RPC: add bookmark ───────────────────────────────────────────────────────

create or replace function public.bookmark_message(
  p_message_id uuid,
  p_scope text default 'me' -- 'me' | 'all' (DM only)
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_mid uuid := p_message_id;
  v_scope text := lower(trim(coalesce(p_scope, 'me')));
  v_cid uuid;
  v_kind text;
  v_role text;
  v_msg_kind text;
  v_added integer := 0;
  v_is_dm boolean := false;
  v_is_gc boolean := false;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_mid is null then
    return jsonb_build_object('ok', false, 'error', 'message_required');
  end if;
  if v_scope not in ('me', 'all') then
    v_scope := 'me';
  end if;

  select msg.conversation_id, msg.kind
    into v_cid, v_msg_kind
  from public.chat_messages msg
  where msg.id = v_mid;

  if v_cid is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- don't allow bookmarking reactions (they are internal rows)
  if v_msg_kind = 'reaction' then
    return jsonb_build_object('ok', false, 'error', 'invalid_message_kind');
  end if;

  select c.kind into v_kind
  from public.chat_conversations c
  where c.id = v_cid and c.closed_at is null;

  if v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select m.role into v_role
  from public.chat_conversation_members m
  where m.conversation_id = v_cid and m.user_id = v_me;

  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_is_dm := v_kind = 'direct';
  v_is_gc := v_kind in ('group', 'channel');

  if v_is_gc and v_role not in ('owner', 'admin', 'moderator') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_is_dm and v_scope = 'all' then
    -- DM: create bookmark rows for all members of this direct conversation.
    -- If this is a self-only "Сохраненное" direct chat, it will only insert 1 row.
    insert into public.chat_message_bookmarks (conversation_id, message_id, owner_user_id, created_by_user_id)
    select v_cid, v_mid, m.user_id, v_me
    from public.chat_conversation_members m
    where m.conversation_id = v_cid
    on conflict (owner_user_id, message_id) do nothing;
    get diagnostics v_added = row_count;
  else
    insert into public.chat_message_bookmarks (conversation_id, message_id, owner_user_id, created_by_user_id)
    values (v_cid, v_mid, v_me, v_me)
    on conflict (owner_user_id, message_id) do nothing;
    get diagnostics v_added = row_count;
  end if;

  return jsonb_build_object('ok', true, 'added', v_added);
end;
$$;

grant execute on function public.bookmark_message(uuid, text) to authenticated;

-- ── RPC: remove bookmark (for current user) ─────────────────────────────────

create or replace function public.unbookmark_message(
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_mid uuid := p_message_id;
  v_deleted integer := 0;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_mid is null then
    return jsonb_build_object('ok', false, 'error', 'message_required');
  end if;

  delete from public.chat_message_bookmarks b
  where b.owner_user_id = v_me
    and b.message_id = v_mid;

  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

grant execute on function public.unbookmark_message(uuid) to authenticated;

-- ── RPC: list bookmarks for conversation ────────────────────────────────────

create or replace function public.list_message_bookmarks(
  p_conversation_id uuid,
  p_limit integer default 60,
  p_before timestamptz default null
)
returns table (
  bookmark_id uuid,
  bookmark_created_at timestamptz,
  message_id uuid,
  message_kind text,
  message_body text,
  message_created_at timestamptz,
  sender_user_id uuid,
  sender_name_snapshot text,
  edited_at timestamptz,
  reply_to_message_id uuid,
  quote_to_message_id uuid,
  meta jsonb
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select
    b.id as bookmark_id,
    b.created_at as bookmark_created_at,
    msg.id as message_id,
    msg.kind as message_kind,
    msg.body as message_body,
    msg.created_at as message_created_at,
    msg.sender_user_id,
    msg.sender_name_snapshot,
    msg.edited_at,
    msg.reply_to_message_id,
    msg.quote_to_message_id,
    msg.meta
  from public.chat_message_bookmarks b
  join public.chat_messages msg
    on msg.id = b.message_id
  where b.owner_user_id = auth.uid()
    and b.conversation_id = p_conversation_id
    and exists (
      select 1
      from public.chat_conversation_members m
      where m.conversation_id = p_conversation_id
        and m.user_id = auth.uid()
    )
    and (p_before is null or b.created_at < p_before)
  order by b.created_at desc, b.id desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

grant execute on function public.list_message_bookmarks(uuid, integer, timestamptz) to authenticated;

-- ── RPC: count bookmarks for conversation ───────────────────────────────────

create or replace function public.count_message_bookmarks(
  p_conversation_id uuid
)
returns integer
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select count(*)::integer
  from public.chat_message_bookmarks b
  where b.owner_user_id = auth.uid()
    and b.conversation_id = p_conversation_id
    and exists (
      select 1
      from public.chat_conversation_members m
      where m.conversation_id = p_conversation_id
        and m.user_id = auth.uid()
    );
$$;

grant execute on function public.count_message_bookmarks(uuid) to authenticated;

