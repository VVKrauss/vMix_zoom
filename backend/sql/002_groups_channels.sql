-- Incremental migration: add group/channel support to self-hosted schema.
-- Safe to run multiple times (uses IF EXISTS / IF NOT EXISTS where possible).

-- chat_conversations: widen kind enum + add shared fields
alter table public.chat_conversations
  add column if not exists title text,
  add column if not exists is_public boolean not null default false,
  add column if not exists public_nick text,
  add column if not exists avatar_path text,
  add column if not exists avatar_thumb_path text,
  add column if not exists required_subscription_plan text,
  add column if not exists posting_mode text,
  add column if not exists comments_mode text;

-- allow null direct columns for non-direct kinds
alter table public.chat_conversations
  alter column direct_user_a drop not null,
  alter column direct_user_b drop not null;

alter table public.chat_conversations
  drop constraint if exists chat_conversations_kind_check;

alter table public.chat_conversations
  add constraint chat_conversations_kind_check check (kind in ('direct', 'group', 'channel'));

alter table public.chat_conversations
  drop constraint if exists chat_conversations_posting_mode_check;

alter table public.chat_conversations
  add constraint chat_conversations_posting_mode_check check (posting_mode in ('admins_only', 'everyone'));

alter table public.chat_conversations
  drop constraint if exists chat_conversations_comments_mode_check;

alter table public.chat_conversations
  add constraint chat_conversations_comments_mode_check check (comments_mode in ('everyone', 'disabled'));

alter table public.chat_conversations
  drop constraint if exists chat_conversations_direct_fields_check;

alter table public.chat_conversations
  add constraint chat_conversations_direct_fields_check
  check (
    kind <> 'direct'
    or (direct_user_a is not null and direct_user_b is not null and direct_user_a <> direct_user_b)
  );

-- chat_messages: allow more kinds
alter table public.chat_messages
  drop constraint if exists chat_messages_kind_check;

alter table public.chat_messages
  add constraint chat_messages_kind_check check (kind in ('text', 'image', 'audio', 'reaction', 'system'));

