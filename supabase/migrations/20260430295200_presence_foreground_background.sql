-- Модель присутствия: на переднем плане = онлайн; уход в фон = зафиксированный момент «перестал быть на переднем плане».
-- Пульс на переднем плане нужен, чтобы отличить «всё ещё открыто» от «закрыли без события pagehide».

alter table public.users
  add column if not exists presence_last_background_at timestamptz;

comment on column public.users.last_active_at is 'Последнее подтверждение: вкладка на переднем плане (пульс, пока пользователь на сайте)';
comment on column public.users.presence_last_background_at is 'Когда вкладка ушла в фон / окно потеряло передний план';

create or replace function public.presence_foreground_pulse()
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
       or u.last_active_at < now() - interval '40 seconds'
     );
end;
$$;

grant execute on function public.presence_foreground_pulse() to authenticated;

create or replace function public.presence_mark_background()
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
     set presence_last_background_at = now()
   where u.id = v_me;
end;
$$;

grant execute on function public.presence_mark_background() to authenticated;

drop function if exists public.touch_my_presence();

create or replace function public.get_user_profile_for_peek(p_target_user_id uuid)
returns jsonb
language plpgsql
volatile
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
    u.presence_last_background_at,
    au.last_sign_in_at,
    u.profile_view_allow_from,
    u.profile_show_avatar,
    u.profile_show_slug,
    u.profile_show_last_active,
    u.profile_show_online
  into r
  from public.users u
  left join auth.users au on au.id = u.id
  where u.id = v_target
  limit 1;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select max(x) into v_activity
  from unnest(array[r.last_active_at, r.last_login_at, r.last_sign_in_at, r.presence_last_background_at]) as t(x)
  where x is not null;

  if v_me = v_target then
    v_online :=
      r.last_active_at is not null
      and r.last_active_at > (now() - interval '3 minutes')
      and (
        r.presence_last_background_at is null
        or r.last_active_at > r.presence_last_background_at
      );

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
    and r.last_active_at > (now() - interval '3 minutes')
    and (
      r.presence_last_background_at is null
      or r.last_active_at > r.presence_last_background_at
    );

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
