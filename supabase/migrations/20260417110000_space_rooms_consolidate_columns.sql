-- Убрать дубли: is_persistent == retain_instance; invite_valid_until — заменено на access_mode + created_at (см. клиент).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'space_rooms'
      and column_name = 'invite_valid_until'
  ) then
    update public.space_rooms
       set access_mode = 'approval'
     where invite_valid_until is not null
       and invite_valid_until <= now()
       and coalesce(access_mode, 'link') = 'link';
  end if;
end
$$;

update public.space_rooms
   set access_mode = 'approval'
 where coalesce(retain_instance, false) = false
   and coalesce(access_mode, 'link') = 'link'
   and created_at <= now() - interval '2 minutes';

alter table public.space_rooms
  drop column if exists invite_valid_until;

alter table public.space_rooms
  drop column if exists is_persistent;

comment on column public.space_rooms.access_mode is
  'link: вход по ссылке (временные комнаты — ~2 мин после created_at, дальше ставится approval). approval | invite_only: вход по ссылке без хоста закрыт.';
