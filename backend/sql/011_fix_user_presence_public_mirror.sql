-- Fix presence mirror on self-hosted VPS DB.
-- Symptoms:
-- - public.user_presence_public contains duplicate user_id rows
-- - mirror does not update when public.users presence fields change
--
-- This script:
-- 1) Deduplicates user_presence_public (keep newest updated_at, then last_active_at)
-- 2) Ensures primary key on (user_id)
-- 3) Ensures upsert trigger function tg_mirror_user_presence_public()
-- 4) Ensures trigger on public.users to maintain the mirror
--
-- Safe to run multiple times.

begin;

-- 0) Make sure required columns exist (idempotent).
alter table public.user_presence_public
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_presence_public
  add column if not exists profile_show_online boolean not null default true;

-- 1) Deduplicate (only if table exists and has duplicates).
-- Keep the "best" row per user_id: latest updated_at, then latest last_active_at.
with ranked as (
  select
    ctid,
    user_id,
    row_number() over (
      partition by user_id
      order by updated_at desc nulls last, last_active_at desc nulls last, presence_last_background_at desc nulls last
    ) as rn
  from public.user_presence_public
)
delete from public.user_presence_public p
using ranked r
where p.ctid = r.ctid
  and r.rn > 1;

-- 2) Ensure primary key on user_id.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'user_presence_public'
      and c.contype = 'p'
  ) then
    alter table public.user_presence_public
      add constraint user_presence_public_pkey primary key (user_id);
  end if;
end;
$$;

-- 3) Upsert trigger function (copied from dump.sql, with minor safety).
create or replace function public.tg_mirror_user_presence_public()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.user_presence_public (
    user_id,
    last_active_at,
    presence_last_background_at,
    profile_show_online,
    updated_at
  )
  values (
    new.id,
    new.last_active_at,
    new.presence_last_background_at,
    coalesce(new.profile_show_online, true),
    now()
  )
  on conflict (user_id) do update set
    last_active_at = excluded.last_active_at,
    presence_last_background_at = excluded.presence_last_background_at,
    profile_show_online = excluded.profile_show_online,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

-- 4) Ensure trigger on public.users.
drop trigger if exists tg_users_mirror_presence_public on public.users;
create trigger tg_users_mirror_presence_public
after insert or update of last_active_at, presence_last_background_at, profile_show_online
on public.users
for each row
execute function public.tg_mirror_user_presence_public();

commit;

