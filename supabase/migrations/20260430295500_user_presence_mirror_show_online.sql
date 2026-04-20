-- Зеркало: profile_show_online — чтобы клиент по Realtime совпадал с get_user_profile_for_peek.

alter table public.user_presence_public
  add column if not exists profile_show_online boolean not null default true;

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

drop trigger if exists tg_users_mirror_presence_public on public.users;
create trigger tg_users_mirror_presence_public
  after insert or update of last_active_at, presence_last_background_at, profile_show_online on public.users
  for each row
  execute function public.tg_mirror_user_presence_public();

update public.user_presence_public p
   set profile_show_online = coalesce(u.profile_show_online, true),
       updated_at = now()
  from public.users u
 where u.id = p.user_id;
