-- Enforce 1:1 direct conversation uniqueness per user pair.
-- Safe to run multiple times.

-- VPS portable dumps may miss PK/UNIQUE constraints. Foreign keys require referenced columns
-- to be backed by a UNIQUE index/constraint, so we ensure that first.
create unique index if not exists users_id_uq on public.users(id);
create unique index if not exists chat_conversations_id_uq on public.chat_conversations(id);

create table if not exists public.direct_conversation_pairs (
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint direct_conversation_pairs_not_self check (user_a <> user_b),
  constraint direct_conversation_pairs_order check (user_a < user_b),
  primary key (user_a, user_b),
  unique (conversation_id)
);

-- Backfill canonical direct conversation for existing pairs.
-- Pick the conversation with the most recent activity (last_message_at, then created_at).
insert into public.direct_conversation_pairs (user_a, user_b, conversation_id)
select distinct on (a, b)
  a as user_a,
  b as user_b,
  conversation_id
from (
  select
    c.id as conversation_id,
    least(m1.user_id, m2.user_id) as a,
    greatest(m1.user_id, m2.user_id) as b,
    c.last_message_at,
    c.created_at
  from public.chat_conversations c
  join public.chat_conversation_members m1 on m1.conversation_id = c.id
  join public.chat_conversation_members m2 on m2.conversation_id = c.id and m2.user_id <> m1.user_id
  where c.kind = 'direct'
    and not exists (
      select 1
      from public.chat_conversation_members mx
      where mx.conversation_id = c.id
        and mx.user_id not in (m1.user_id, m2.user_id)
    )
) t
where a <> b
order by a, b, last_message_at desc nulls last, created_at desc
on conflict (user_a, user_b) do nothing;

