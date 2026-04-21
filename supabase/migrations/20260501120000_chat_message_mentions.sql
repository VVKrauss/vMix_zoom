-- Упоминания (@profile_slug) в сообщениях: in-app + push (override mute).

create table if not exists public.chat_message_mentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  constraint chat_message_mentions_user_message_unique unique (user_id, message_id)
);

create index if not exists chat_message_mentions_user_unread_idx
  on public.chat_message_mentions (user_id, read_at nulls first, created_at desc);

create index if not exists chat_message_mentions_conversation_idx
  on public.chat_message_mentions (conversation_id, created_at desc);

alter table public.chat_message_mentions enable row level security;

grant select, update on public.chat_message_mentions to authenticated;
grant all on public.chat_message_mentions to service_role;

drop policy if exists chat_message_mentions_select_own on public.chat_message_mentions;
create policy chat_message_mentions_select_own
on public.chat_message_mentions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists chat_message_mentions_update_own on public.chat_message_mentions;
create policy chat_message_mentions_update_own
on public.chat_message_mentions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public._extract_mention_slugs(p_text text)
returns table(slug text)
language sql
stable
as $$
  select lower(m[1])::text as slug
  from regexp_matches(coalesce(p_text, ''), '@([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)', 'g') as m
$$;

create or replace function public._insert_chat_message_mentions()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_sender uuid := new.sender_user_id;
begin
  if new.kind in ('reaction', 'system') then
    return new;
  end if;

  -- Без автора — не создаём упоминаний (гостевой/системный импорт).
  if v_sender is null then
    return new;
  end if;

  insert into public.chat_message_mentions (user_id, conversation_id, message_id, created_at)
  select
    u.id as user_id,
    new.conversation_id,
    new.id,
    new.created_at
  from public._extract_mention_slugs(new.body) s
  join public.users u
    on lower(coalesce(u.profile_slug, '')) = s.slug
  where u.id <> v_sender
    and exists (
      select 1
      from public.chat_conversation_members m
      where m.conversation_id = new.conversation_id
        and m.user_id = u.id
    )
  on conflict (user_id, message_id) do nothing;

  return new;
end;
$$;

drop trigger if exists chat_messages_mentions_insert on public.chat_messages;
create trigger chat_messages_mentions_insert
after insert on public.chat_messages
for each row execute function public._insert_chat_message_mentions();

create or replace function public.mark_my_mentions_read(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  update public.chat_message_mentions
     set read_at = now()
   where user_id = v_uid
     and conversation_id = p_conversation_id
     and read_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.mark_my_mentions_read(uuid) to authenticated;

create or replace function public.list_conversation_members_for_mentions(
  p_conversation_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  profile_slug text,
  avatar_url text
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = v_uid
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    u.id,
    coalesce(nullif(btrim(u.display_name), ''), 'Пользователь')::text as display_name,
    nullif(btrim(u.profile_slug), '')::text as profile_slug,
    coalesce(nullif(btrim(u.avatar_url), ''), '')::text as avatar_url
  from public.chat_conversation_members m
  join public.users u
    on u.id = m.user_id
  where m.conversation_id = p_conversation_id
    and nullif(btrim(u.profile_slug), '') is not null
  order by display_name asc, u.id asc;
end;
$$;

grant execute on function public.list_conversation_members_for_mentions(uuid) to authenticated;

