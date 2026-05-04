-- Причина 406 на GET /rest/v1/users?...&id=eq.<uid> с .single():
-- в public.users не было строки при существующей auth.users (триггер не был подключён).
-- Восстанавливаем after insert на auth.users, делаем backfill и RPC на случай регресса.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

insert into public.users (id, email, display_name, is_email_verified, created_at, updated_at)
select
  au.id,
  au.email,
  coalesce(
    nullif(trim(au.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(split_part(coalesce(au.email, ''), '@', 1)), ''),
    'User'
  ),
  coalesce(au.email_confirmed_at is not null, false),
  coalesce(au.created_at, now()),
  now()
from auth.users au
where not exists (select 1 from public.users pu where pu.id = au.id)
on conflict (id) do nothing;

create or replace function public.ensure_my_public_user_row()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  au record;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if exists (select 1 from public.users where id = v_me) then
    return jsonb_build_object('ok', true, 'created', false);
  end if;

  select id, email, raw_user_meta_data, email_confirmed_at, created_at
    into au
  from auth.users
  where id = v_me;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'auth_user_missing');
  end if;

  insert into public.users (id, email, display_name, is_email_verified, created_at, updated_at)
  values (
    au.id,
    au.email,
    coalesce(
      nullif(trim(au.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(split_part(coalesce(au.email, ''), '@', 1)), ''),
      'User'
    ),
    coalesce(au.email_confirmed_at is not null, false),
    coalesce(au.created_at, now()),
    now()
  )
  on conflict (id) do nothing;

  return jsonb_build_object('ok', true, 'created', true);
end;
$$;

grant execute on function public.ensure_my_public_user_row() to authenticated;
grant execute on function public.ensure_my_public_user_row() to service_role;
