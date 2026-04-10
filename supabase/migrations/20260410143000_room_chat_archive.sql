create extension if not exists pgcrypto;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  space_room_slug text null,
  title text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  closed_at timestamptz null,
  last_message_at timestamptz null,
  last_message_preview text null,
  message_count integer not null default 0,
  constraint chat_conversations_kind_check
    check (kind in ('room', 'direct', 'group')),
  constraint chat_conversations_room_unique
    unique (kind, space_room_slug)
);

create table if not exists public.chat_conversation_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz null,
  primary key (conversation_id, user_id),
  constraint chat_conversation_members_role_check
    check (role in ('member', 'owner', 'moderator'))
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_user_id uuid null,
  sender_peer_id text null,
  sender_name_snapshot text not null,
  kind text not null default 'text',
  body text not null,
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint chat_messages_kind_check
    check (kind in ('text', 'system', 'reaction')),
  constraint chat_messages_body_len_check
    check (char_length(body) <= 4000)
);

create index if not exists chat_conversations_last_message_idx
  on public.chat_conversations(last_message_at desc nulls last, created_at desc);

create index if not exists chat_conversation_members_user_idx
  on public.chat_conversation_members(user_id, joined_at desc);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages(conversation_id, created_at asc);

create index if not exists chat_messages_sender_user_idx
  on public.chat_messages(sender_user_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;

grant select on public.chat_conversations to authenticated;
grant select on public.chat_conversation_members to authenticated;
grant select on public.chat_messages to authenticated;
grant all on public.chat_conversations to service_role;
grant all on public.chat_conversation_members to service_role;
grant all on public.chat_messages to service_role;

drop policy if exists chat_conversations_select_member on public.chat_conversations;
create policy chat_conversations_select_member
on public.chat_conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = chat_conversations.id
      and m.user_id = auth.uid()
  )
);

drop policy if exists chat_conversation_members_select_member on public.chat_conversation_members;
create policy chat_conversation_members_select_member
on public.chat_conversation_members
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversation_members self_m
    where self_m.conversation_id = chat_conversation_members.conversation_id
      and self_m.user_id = auth.uid()
  )
);

drop policy if exists chat_messages_select_member on public.chat_messages;
create policy chat_messages_select_member
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = chat_messages.conversation_id
      and m.user_id = auth.uid()
  )
);

create or replace function public.ensure_room_chat_conversation(
  p_room_slug text,
  p_created_by uuid default null,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_slug text := nullif(btrim(p_room_slug), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id uuid;
begin
  if v_slug is null then
    raise exception 'room_slug_required';
  end if;

  insert into public.chat_conversations (
    kind,
    space_room_slug,
    title,
    created_by,
    closed_at
  )
  values (
    'room',
    v_slug,
    coalesce(v_title, 'Комната ' || v_slug),
    p_created_by,
    null
  )
  on conflict (kind, space_room_slug)
  do update set
    title = coalesce(public.chat_conversations.title, excluded.title),
    closed_at = null
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_room_chat_membership(
  p_room_slug text,
  p_user_id uuid,
  p_role text default 'member'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_conversation_id uuid;
  v_role text := case
    when p_role in ('member', 'owner', 'moderator') then p_role
    else 'member'
  end;
begin
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  v_conversation_id := public.ensure_room_chat_conversation(p_room_slug, p_user_id, null);

  insert into public.chat_conversation_members (
    conversation_id,
    user_id,
    role
  )
  values (
    v_conversation_id,
    p_user_id,
    v_role
  )
  on conflict (conversation_id, user_id)
  do update set
    role = case
      when public.chat_conversation_members.role = 'owner' then public.chat_conversation_members.role
      else excluded.role
    end;

  return v_conversation_id;
end;
$$;

create or replace function public.append_room_chat_message(
  p_room_slug text,
  p_sender_user_id uuid default null,
  p_sender_peer_id text default null,
  p_sender_name_snapshot text default null,
  p_body text default null,
  p_kind text default 'text',
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_conversation_id uuid;
  v_kind text := case
    when p_kind in ('text', 'system', 'reaction') then p_kind
    else 'text'
  end;
  v_body text := left(coalesce(p_body, ''), 4000);
  v_name text := nullif(left(coalesce(p_sender_name_snapshot, ''), 200), '');
  v_message_id uuid;
  v_created_at timestamptz := now();
begin
  if nullif(btrim(coalesce(p_room_slug, '')), '') is null then
    raise exception 'room_slug_required';
  end if;
  if nullif(btrim(v_body), '') is null then
    raise exception 'message_body_required';
  end if;
  if v_name is null then
    v_name := 'Гость';
  end if;

  v_conversation_id := public.ensure_room_chat_conversation(
    p_room_slug,
    p_sender_user_id,
    null
  );

  if p_sender_user_id is not null then
    perform public.record_room_chat_membership(p_room_slug, p_sender_user_id, 'member');
  end if;

  insert into public.chat_messages (
    conversation_id,
    sender_user_id,
    sender_peer_id,
    sender_name_snapshot,
    kind,
    body,
    created_at,
    meta
  )
  values (
    v_conversation_id,
    p_sender_user_id,
    nullif(btrim(coalesce(p_sender_peer_id, '')), ''),
    v_name,
    v_kind,
    v_body,
    v_created_at,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_message_id;

  update public.chat_conversations
     set last_message_at = v_created_at,
         last_message_preview = left(v_body, 280),
         message_count = message_count + 1
   where id = v_conversation_id;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'created_at', v_created_at
  );
end;
$$;

create or replace function public.close_room_chat_conversation(
  p_room_slug text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_slug text := nullif(btrim(p_room_slug), '');
  v_updated integer := 0;
begin
  if v_slug is null then
    return jsonb_build_object('ok', false, 'error', 'room_slug_required');
  end if;

  update public.chat_conversations
     set closed_at = coalesce(closed_at, now())
   where kind = 'room'
     and space_room_slug = v_slug;

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'ok', true,
    'updated', v_updated
  );
end;
$$;

grant execute on function public.ensure_room_chat_conversation(text, uuid, text) to service_role;
grant execute on function public.record_room_chat_membership(text, uuid, text) to service_role;
grant execute on function public.append_room_chat_message(text, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.close_room_chat_conversation(text) to service_role;
