-- Conversation invites (token -> conversation_id)

create table if not exists public.conversation_invites (
  token text primary key,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists conversation_invites_conversation_uq on public.conversation_invites(conversation_id);

