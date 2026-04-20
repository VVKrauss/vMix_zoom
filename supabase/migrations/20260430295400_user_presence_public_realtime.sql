-- Зеркало полей присутствия для Realtime: RLS на users не отдаёт чужие строки подписчику,
-- поэтому postgres_changes на users не срабатывает для собеседника в ЛС.

create table if not exists public.user_presence_public (
  user_id uuid primary key references public.users (id) on delete cascade,
  last_active_at timestamptz,
  presence_last_background_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.user_presence_public is 'Копия last_active_at / presence_last_background_at для Realtime (узкий SELECT по ЛС-парам)';

create or replace function public.tg_mirror_user_presence_public()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.user_presence_public (user_id, last_active_at, presence_last_background_at, updated_at)
  values (new.id, new.last_active_at, new.presence_last_background_at, now())
  on conflict (user_id) do update set
    last_active_at = excluded.last_active_at,
    presence_last_background_at = excluded.presence_last_background_at,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists tg_users_mirror_presence_public on public.users;
create trigger tg_users_mirror_presence_public
  after insert or update of last_active_at, presence_last_background_at on public.users
  for each row
  execute function public.tg_mirror_user_presence_public();

insert into public.user_presence_public (user_id, last_active_at, presence_last_background_at, updated_at)
select u.id, u.last_active_at, u.presence_last_background_at, now()
  from public.users u
  on conflict (user_id) do update set
    last_active_at = excluded.last_active_at,
    presence_last_background_at = excluded.presence_last_background_at,
    updated_at = excluded.updated_at;

alter table public.user_presence_public enable row level security;

drop policy if exists user_presence_public_select on public.user_presence_public;
create policy user_presence_public_select
  on public.user_presence_public
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
        from public.chat_conversation_members m_self
        join public.chat_conversation_members m_peer
          on m_peer.conversation_id = m_self.conversation_id
         and m_peer.user_id = user_presence_public.user_id
        join public.chat_conversations c on c.id = m_self.conversation_id
       where m_self.user_id = auth.uid()
         and c.kind = 'direct'
         and m_self.user_id <> m_peer.user_id
    )
  );

grant select on public.user_presence_public to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'users'
    ) then
      alter publication supabase_realtime drop table public.users;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'user_presence_public'
    ) then
      alter publication supabase_realtime add table public.user_presence_public;
    end if;
  end if;
end;
$$;
