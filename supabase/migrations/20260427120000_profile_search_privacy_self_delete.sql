-- Приватность глобального поиска пользователей + самоудаление аккаунта

alter table public.users
  add column if not exists profile_search_closed boolean not null default false;

alter table public.users
  add column if not exists profile_search_allow_by_name boolean not null default true;

alter table public.users
  add column if not exists profile_search_allow_by_email boolean not null default false;

alter table public.users
  add column if not exists profile_search_allow_by_slug boolean not null default true;

comment on column public.users.profile_search_closed is 'true — профиль не участвует в глобальном поиске';
comment on column public.users.profile_search_allow_by_name is 'Имеет смысл при profile_search_closed = false';
comment on column public.users.profile_search_allow_by_email is 'Имеет смысл при profile_search_closed = false; сопоставление по email из public.users';
comment on column public.users.profile_search_allow_by_slug is 'Имеет смысл при profile_search_closed = false';

-- Замена поиска: учёт приватности + опционально email
create or replace function public.search_registered_users(
  p_query text,
  p_limit int default 20
)
returns table (
  id uuid,
  display_name text,
  profile_slug text,
  avatar_url text
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  ),
  q as (
    select lower(btrim(coalesce(p_query, ''))) as t
  )
  select
    u.id,
    u.display_name,
    u.profile_slug,
    u.avatar_url
  from public.users u
  cross join me
  cross join q
  where me.uid is not null
    and u.id <> me.uid
    and u.status = 'active'
    and coalesce(u.profile_search_closed, false) = false
    and length(q.t) >= 2
    and (
      (
        u.profile_search_allow_by_name
        and position(q.t in lower(coalesce(u.display_name, ''))) > 0
      )
      or (
        u.profile_search_allow_by_slug
        and position(q.t in lower(coalesce(u.profile_slug, ''))) > 0
      )
      or (
        u.profile_search_allow_by_email
        and position(q.t in lower(coalesce(u.email, ''))) > 0
      )
    )
  order by
    case when lower(coalesce(u.profile_slug, '')) = q.t then 0 else 1 end,
    u.display_name asc nulls last
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 20), 50));
$$;

grant execute on function public.search_registered_users(text, int) to authenticated;

-- Самоудаление: та же очистка зависимостей, что и у админского удаления
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if not exists (select 1 from public.users where id = v_me) then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  delete from public.moderation_actions where created_by_user_id = v_me;
  delete from public.access_invites where created_by_user_id = v_me;
  delete from public.live_sessions where created_by_user_id = v_me;
  delete from public.events where created_by_user_id = v_me;
  delete from public.accounts where owner_user_id = v_me;
  delete from public.rooms where owner_user_id = v_me;

  delete from auth.users where id = v_me;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', 'delete_failed', 'detail', sqlerrm);
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.delete_my_account() to service_role;
