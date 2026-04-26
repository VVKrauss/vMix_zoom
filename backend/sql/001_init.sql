-- Minimal schema for self-hosted auth + sessions (redflow backend)
-- Run on the VPS Postgres (DB: redflow) before starting the API.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text not null,
  avatar_url text,
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_created_at_idx on public.users(created_at desc);

create table if not exists public.refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  refresh_token_hash text not null unique,
  user_agent text,
  ip inet,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists refresh_sessions_user_idx on public.refresh_sessions(user_id);
create index if not exists refresh_sessions_expires_idx on public.refresh_sessions(expires_at);

create table if not exists public.files (
  id uuid primary key,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  purpose text not null check (purpose in ('avatar', 'messenger_media')),
  object_key text not null,
  content_type text not null,
  size_bytes bigint not null,
  status text not null check (status in ('pending', 'uploaded', 'deleted')),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  deleted_at timestamptz
);

create index if not exists files_owner_idx on public.files(owner_user_id, created_at desc);

-- Messenger core (conversations + members + messages) for MVP
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('room', 'direct', 'group', 'channel')),
  -- room (legacy room chat archive)
  space_room_slug text,
  -- shared title (group/channel/room; direct can be null)
  title text,
  created_by uuid references public.users(id) on delete set null,
  avatar_path text,
  avatar_thumb_path text,
  -- channel-specific
  posting_mode text check (posting_mode in ('admins_only', 'everyone')),
  comments_mode text check (comments_mode in ('everyone', 'disabled')),
  channel_is_public boolean not null default false,
  group_is_public boolean not null default false,
  public_nick text check (public_nick is null or public_nick ~ '^[a-z0-9_]{3,32}$'),
  required_subscription_plan text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  message_count int not null default 0,
  last_message_at timestamptz,
  last_message_preview text
);

-- NOTE:
-- - Direct uniqueness is enforced logically by ensuring only one conversation exists per 2-member set.
--   (Portable schema from VPS does not store direct pair columns on chat_conversations.)
-- - Public flags differ for group vs channel: group_is_public / channel_is_public.

create table if not exists public.chat_conversation_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member',
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists chat_conversation_members_user_idx
  on public.chat_conversation_members(user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_user_id uuid references public.users(id) on delete set null,
  kind text not null check (kind in ('text', 'image', 'audio', 'reaction', 'system')),
  body text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  reply_to_message_id uuid references public.chat_messages(id) on delete set null
);

create index if not exists chat_messages_conversation_cursor_idx
  on public.chat_messages(conversation_id, created_at desc, id desc);

