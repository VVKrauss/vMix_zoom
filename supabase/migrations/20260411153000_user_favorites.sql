create table if not exists public.user_favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  favorite_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, favorite_user_id),
  constraint user_favorites_not_self check (user_id <> favorite_user_id)
);

create index if not exists user_favorites_favorite_idx
  on public.user_favorites(favorite_user_id, created_at desc);

alter table public.user_favorites enable row level security;

grant select, insert, update, delete on public.user_favorites to authenticated;
grant all on public.user_favorites to service_role;

drop policy if exists user_favorites_select_visible on public.user_favorites;
create policy user_favorites_select_visible
on public.user_favorites
for select
to authenticated
using (auth.uid() = user_id or auth.uid() = favorite_user_id);

drop policy if exists user_favorites_insert_own on public.user_favorites;
create policy user_favorites_insert_own
on public.user_favorites
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_favorites_update_own on public.user_favorites;
create policy user_favorites_update_own
on public.user_favorites
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_favorites_delete_own on public.user_favorites;
create policy user_favorites_delete_own
on public.user_favorites
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_user_favorite(
  p_target_user_id uuid,
  p_favorite boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid := p_target_user_id;
  v_favors_me boolean := false;
begin
  if v_me is null then
    raise exception 'auth_required';
  end if;

  if v_target is null then
    raise exception 'target_user_required';
  end if;

  if v_target = v_me then
    raise exception 'cannot_favorite_self';
  end if;

  if p_favorite then
    insert into public.user_favorites (
      user_id,
      favorite_user_id,
      created_at,
      updated_at
    )
    values (
      v_me,
      v_target,
      now(),
      now()
    )
    on conflict (user_id, favorite_user_id)
    do update set updated_at = now();
  else
    delete from public.user_favorites
     where user_id = v_me
       and favorite_user_id = v_target;
  end if;

  select exists(
    select 1
      from public.user_favorites f
     where f.user_id = v_target
       and f.favorite_user_id = v_me
  )
  into v_favors_me;

  return jsonb_build_object(
    'ok', true,
    'target_user_id', v_target,
    'is_favorite', p_favorite,
    'favors_me', v_favors_me,
    'is_friend', p_favorite and v_favors_me
  );
end;
$$;

create or replace function public.list_my_contacts()
returns table (
  target_user_id uuid,
  display_name text,
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

create or replace function public.get_contact_statuses(
  p_target_user_ids uuid[]
)
returns table (
  target_user_id uuid,
  is_favorite boolean,
  favors_me boolean,
  is_friend boolean
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  ),
  requested as (
    select distinct unnest(coalesce(p_target_user_ids, '{}'::uuid[])) as target_user_id
  )
  select
    r.target_user_id,
    exists(
      select 1
      from public.user_favorites f, me
      where f.user_id = me.uid
        and f.favorite_user_id = r.target_user_id
    ) as is_favorite,
    exists(
      select 1
      from public.user_favorites f, me
      where f.user_id = r.target_user_id
        and f.favorite_user_id = me.uid
    ) as favors_me,
    (
      exists(
        select 1
        from public.user_favorites f, me
        where f.user_id = me.uid
          and f.favorite_user_id = r.target_user_id
      )
      and exists(
        select 1
        from public.user_favorites f, me
        where f.user_id = r.target_user_id
          and f.favorite_user_id = me.uid
      )
    ) as is_friend
  from requested r;
$$;

grant execute on function public.set_user_favorite(uuid, boolean) to authenticated;
grant execute on function public.list_my_contacts() to authenticated;
grant execute on function public.get_contact_statuses(uuid[]) to authenticated;
