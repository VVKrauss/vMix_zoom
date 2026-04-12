-- Публичный slug профиля + поиск пользователей + поле в list_my_contacts

alter table public.users
  add column if not exists profile_slug text;

comment on column public.users.profile_slug is 'Уникальный латинский slug для поиска и ссылок; nullable до первой установки.';

create unique index if not exists users_profile_slug_lower_key
  on public.users (lower(btrim(profile_slug)))
  where profile_slug is not null and btrim(profile_slug) <> '';

-- Поиск активных пользователей по имени или slug (без LIKE-спецсимволов в запросе)
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
    and length(q.t) >= 2
    and (
      position(q.t in lower(coalesce(u.display_name, ''))) > 0
      or position(q.t in lower(coalesce(u.profile_slug, ''))) > 0
    )
  order by
    case when lower(coalesce(u.profile_slug, '')) = q.t then 0 else 1 end,
    u.display_name asc nulls last
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 20), 50));
$$;

grant execute on function public.search_registered_users(text, int) to authenticated;

-- Старая сигнатура OUT-полей: без DROP Postgres не даст заменить возвращаемый тип.
drop function if exists public.list_my_contacts() cascade;

-- list_my_contacts: добавляем profile_slug
create function public.list_my_contacts()
returns table (
  target_user_id uuid,
  display_name text,
  profile_slug text,
  avatar_url text,
  status text,
  outbound_favorite boolean,
  inbound_favorite boolean,
  is_friend boolean,
  favorited_at timestamptz
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  ),
  links as (
    select
      uf.favorite_user_id as target_user_id,
      true as outbound_favorite,
      false as inbound_favorite,
      uf.created_at as edge_created_at
    from public.user_favorites uf
    join me on uf.user_id = me.uid
    union all
    select
      uf.user_id as target_user_id,
      false as outbound_favorite,
      true as inbound_favorite,
      uf.created_at as edge_created_at
    from public.user_favorites uf
    join me on uf.favorite_user_id = me.uid
  ),
  merged as (
    select
      l.target_user_id,
      bool_or(l.outbound_favorite) as outbound_favorite,
      bool_or(l.inbound_favorite) as inbound_favorite,
      max(l.edge_created_at) as favorited_at
    from links l
    group by l.target_user_id
  )
  select
    u.id as target_user_id,
    u.display_name,
    u.profile_slug,
    u.avatar_url,
    u.status,
    m.outbound_favorite,
    m.inbound_favorite,
    (m.outbound_favorite and m.inbound_favorite) as is_friend,
    m.favorited_at
  from merged m
  join public.users u on u.id = m.target_user_id
  order by
    (m.outbound_favorite and m.inbound_favorite) desc,
    m.outbound_favorite desc,
    m.favorited_at desc nulls last,
    u.display_name asc;
$$;

grant execute on function public.list_my_contacts() to authenticated;
