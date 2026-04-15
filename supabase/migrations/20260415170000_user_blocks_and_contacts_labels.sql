-- Blocks + contact semantics: add user_blocks; exclude blocked users from search/DM/contacts.

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references public.users(id) on delete cascade,
  blocked_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_blocks_not_self check (blocker_user_id <> blocked_user_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_user_id, created_at desc);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_own on public.user_blocks;
create policy user_blocks_own
  on public.user_blocks
  for all
  to authenticated
  using (auth.uid() = blocker_user_id)
  with check (auth.uid() = blocker_user_id);

grant select, insert, delete on public.user_blocks to authenticated;
grant all on public.user_blocks to service_role;

create or replace function public.users_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    p_a is not null
    and p_b is not null
    and p_a <> p_b
    and exists(
      select 1
      from public.user_blocks b
      where b.blocker_user_id = p_a
        and b.blocked_user_id = p_b
    );
$$;

grant execute on function public.users_blocked(uuid, uuid) to authenticated;

create or replace function public.set_user_block(
  p_target_user_id uuid,
  p_block boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid := p_target_user_id;
  v_blocked_by_me boolean := false;
  v_blocked_me boolean := false;
begin
  if v_me is null then
    raise exception 'auth_required';
  end if;

  if v_target is null then
    raise exception 'target_user_required';
  end if;

  if v_target = v_me then
    raise exception 'cannot_block_self';
  end if;

  if p_block then
    insert into public.user_blocks (blocker_user_id, blocked_user_id)
    values (v_me, v_target)
    on conflict (blocker_user_id, blocked_user_id) do nothing;
  else
    delete from public.user_blocks
     where blocker_user_id = v_me
       and blocked_user_id = v_target;
  end if;

  select exists(
    select 1
    from public.user_blocks b
    where b.blocker_user_id = v_me
      and b.blocked_user_id = v_target
  ) into v_blocked_by_me;

  select exists(
    select 1
    from public.user_blocks b
    where b.blocker_user_id = v_target
      and b.blocked_user_id = v_me
  ) into v_blocked_me;

  return jsonb_build_object(
    'ok', true,
    'target_user_id', v_target,
    'blocked_by_me', v_blocked_by_me,
    'blocked_me', v_blocked_me
  );
end;
$$;

grant execute on function public.set_user_block(uuid, boolean) to authenticated;

-- Search: hide blocked pairs in both directions.
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
    and public.users_blocked(me.uid, u.id) = false
    and public.users_blocked(u.id, me.uid) = false
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

-- Contacts list: add blocked flags and exclude blocked pairs.
create or replace function public.list_my_contacts()
returns table (
  target_user_id uuid,
  display_name text,
  profile_slug text,
  avatar_url text,
  status text,
  outbound_favorite boolean,
  inbound_favorite boolean,
  is_friend boolean,
  favorited_at timestamptz,
  blocked_by_me boolean,
  blocked_me boolean
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
    m.favorited_at,
    public.users_blocked(me.uid, u.id) as blocked_by_me,
    public.users_blocked(u.id, me.uid) as blocked_me
  from merged m
  join public.users u on u.id = m.target_user_id
  cross join me
  where not exists(
    select 1
      from public.user_contact_list_hides h
     where h.owner_user_id = me.uid
       and h.hidden_user_id = m.target_user_id
  )
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
  is_friend boolean,
  blocked_by_me boolean,
  blocked_me boolean
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
    ) as is_friend,
    public.users_blocked((select uid from me), r.target_user_id) as blocked_by_me,
    public.users_blocked(r.target_user_id, (select uid from me)) as blocked_me
  from requested r;
$$;

-- DM ensure: block gate
create or replace function public.ensure_direct_conversation_with_user(
  p_target_user_id uuid,
  p_target_title text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_title text := nullif(left(coalesce(p_target_title, ''), 200), '');
  v_dm text;
  v_ok boolean;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_target_user_id is null then
    raise exception 'target_user_required';
  end if;

  if p_target_user_id = v_user_id then
    return public.ensure_self_direct_conversation();
  end if;

  if public.users_blocked(v_user_id, p_target_user_id) or public.users_blocked(p_target_user_id, v_user_id) then
    raise exception 'dm_blocked';
  end if;

  select c.id
    into v_conversation_id
  from public.chat_conversations c
  join public.chat_conversation_members m
    on m.conversation_id = c.id
  where c.kind = 'direct'
  group by c.id
  having count(*) = 2
     and bool_or(m.user_id = v_user_id)
     and bool_or(m.user_id = p_target_user_id)
     and bool_and(m.user_id in (v_user_id, p_target_user_id))
  order by max(c.created_at) desc
  limit 1;

  if v_conversation_id is not null then
    if v_title is not null then
      update public.chat_conversations
         set title = coalesce(title, v_title)
       where id = v_conversation_id;
    end if;
    return v_conversation_id;
  end if;

  select u.dm_allow_from into v_dm
  from public.users u
  where u.id = p_target_user_id;

  if v_dm = 'contacts_only' then
    v_ok := public.users_are_mutual_contacts(v_user_id, p_target_user_id);
    if not v_ok then
      raise exception 'dm_not_allowed';
    end if;
  end if;

  insert into public.chat_conversations (
    kind,
    title,
    created_by,
    closed_at
  )
  values (
    'direct',
    coalesce(v_title, 'Личный чат'),
    v_user_id,
    null
  )
  returning id into v_conversation_id;

  insert into public.chat_conversation_members (conversation_id, user_id, role)
  values
    (v_conversation_id, v_user_id, 'owner'),
    (v_conversation_id, p_target_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

