-- Heartbeat активности на сайте + отдельная приватность «в сети»

alter table public.users
  add column if not exists last_active_at timestamptz;

alter table public.users
  add column if not exists profile_show_online boolean not null default true;

comment on column public.users.last_active_at is 'Последний heartbeat активности (вкладка в фокусе)';
comment on column public.users.profile_show_online is 'Показывать статус «в сети» (при разрешённом доступе к карточке)';

update public.users u
set last_active_at = u.last_login_at
where u.last_active_at is null
  and u.last_login_at is not null;

-- Троттлинг на сервере: не чаще одного обновления на пользователя за ~75 с
create or replace function public.touch_my_presence()
returns void
language plpgsql
volatile
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
     set last_active_at = now()
   where u.id = v_me
     and (
       u.last_active_at is null
       or u.last_active_at < now() - interval '75 seconds'
     );
end;
$$;

grant execute on function public.touch_my_presence() to authenticated;

create or replace function public.get_user_profile_for_peek(p_target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid := p_target_user_id;
  r record;
  v_mutual boolean := false;
  v_allow boolean := false;
  v_activity timestamptz;
  v_online boolean := false;
begin
  if v_me is null then
    return jsonb_build_object('error', 'auth_required');
  end if;

  if v_target is null then
    return jsonb_build_object('error', 'target_required');
  end if;

  select
    u.id,
    u.display_name,
    u.avatar_url,
    u.profile_slug,
    u.last_login_at,
    u.last_active_at,
    u.profile_view_allow_from,
    u.profile_show_avatar,
    u.profile_show_slug,
    u.profile_show_last_active,
    u.profile_show_online
  into r
  from public.users u
  where u.id = v_target
  limit 1;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_activity :=
    case
      when r.last_active_at is null and r.last_login_at is null then null
      when r.last_active_at is null then r.last_login_at
      when r.last_login_at is null then r.last_active_at
      else greatest(r.last_active_at, r.last_login_at)
    end;

  if v_me = v_target then
    v_online :=
      r.last_active_at is not null
      and r.last_active_at > (now() - interval '90 seconds');

    return jsonb_build_object(
      'ok', true,
      'self', true,
      'id', r.id,
      'display_name', coalesce(nullif(btrim(r.display_name), ''), 'Пользователь'),
      'avatar_url', r.avatar_url,
      'profile_slug', r.profile_slug,
      'last_activity_at', v_activity,
      'is_online', v_online
    );
  end if;

  v_mutual := public.users_are_mutual_contacts(v_me, v_target);

  v_allow :=
    r.profile_view_allow_from = 'everyone'
    or (r.profile_view_allow_from = 'contacts_only' and v_mutual);

  if not v_allow then
    return jsonb_build_object(
      'ok', true,
      'restricted', true,
      'id', r.id,
      'display_name', 'Закрытый профиль',
      'avatar_url', null,
      'profile_slug', null,
      'last_activity_at', null,
      'is_online', false
    );
  end if;

  v_online :=
    coalesce(r.profile_show_online, true)
    and r.last_active_at is not null
    and r.last_active_at > (now() - interval '90 seconds');

  return jsonb_build_object(
    'ok', true,
    'restricted', false,
    'id', r.id,
    'display_name', coalesce(nullif(btrim(r.display_name), ''), 'Пользователь'),
    'avatar_url', case when r.profile_show_avatar then r.avatar_url else null end,
    'profile_slug', case when r.profile_show_slug then r.profile_slug else null end,
    'last_activity_at', case when r.profile_show_last_active then v_activity else null end,
    'is_online', case when coalesce(r.profile_show_online, true) then v_online else false end
  );
end;
$$;

grant execute on function public.get_user_profile_for_peek(uuid) to authenticated;
