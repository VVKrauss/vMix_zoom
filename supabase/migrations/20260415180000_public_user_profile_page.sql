-- Public (guest-accessible) minimal user profile by slug.
-- Actions (DM / contacts) are still gated by auth on the client.

create or replace function public.get_user_public_profile_by_slug(
  p_profile_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_slug text := lower(btrim(coalesce(p_profile_slug, '')));
  r record;
begin
  if v_slug is null or v_slug = '' then
    return jsonb_build_object('error', 'slug_required');
  end if;

  select
    u.id,
    u.display_name,
    u.profile_slug,
    u.avatar_url,
    u.profile_view_allow_from,
    u.profile_show_avatar,
    u.profile_show_slug
  into r
  from public.users u
  where lower(btrim(coalesce(u.profile_slug, ''))) = v_slug
    and u.status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if r.profile_view_allow_from = 'contacts_only' then
    return jsonb_build_object(
      'ok', true,
      'restricted', true,
      'id', r.id,
      'display_name', 'Закрытый профиль',
      'avatar_url', null,
      'profile_slug', null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'restricted', false,
    'id', r.id,
    'display_name', coalesce(nullif(btrim(r.display_name), ''), 'Пользователь'),
    'avatar_url', case when r.profile_show_avatar then r.avatar_url else null end,
    'profile_slug', case when r.profile_show_slug then r.profile_slug else null end
  );
end;
$$;

