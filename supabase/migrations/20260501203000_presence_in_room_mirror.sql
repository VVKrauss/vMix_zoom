-- «В комнате» для индикатора присутствия: клиент выставляет флаг, пока реально подключён к звонку.

alter table public.users
  add column if not exists presence_in_room boolean not null default false;

alter table public.user_presence_public
  add column if not exists presence_in_room boolean not null default false;

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
    presence_in_room,
    updated_at
  )
  values (
    new.id,
    new.last_active_at,
    new.presence_last_background_at,
    coalesce(new.profile_show_online, true),
    coalesce(new.presence_in_room, false),
    now()
  )
  on conflict (user_id) do update set
    last_active_at = excluded.last_active_at,
    presence_last_background_at = excluded.presence_last_background_at,
    profile_show_online = excluded.profile_show_online,
    presence_in_room = excluded.presence_in_room,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists tg_users_mirror_presence_public on public.users;
create trigger tg_users_mirror_presence_public
  after insert or update of last_active_at, presence_last_background_at, profile_show_online, presence_in_room
  on public.users
  for each row
  execute function public.tg_mirror_user_presence_public();

update public.user_presence_public p
   set presence_in_room = coalesce(u.presence_in_room, false),
       updated_at = now()
  from public.users u
 where u.id = p.user_id;

-- Клиент: только свой uid, только колонка присутствия в комнате.
create or replace function public.set_presence_in_room(p_in_room boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return;
  end if;

  update public.users u
     set presence_in_room = coalesce(p_in_room, false)
   where u.id = v_me;
end;
$$;

grant execute on function public.set_presence_in_room(boolean) to authenticated;
