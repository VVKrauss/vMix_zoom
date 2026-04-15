-- Приватность ЛС и профиля; скрытие входящих контактов из списка; гейты для ensure_direct

alter table public.users
  add column if not exists dm_allow_from text not null default 'everyone'
    check (dm_allow_from in ('everyone', 'contacts_only'));

alter table public.users
  add column if not exists profile_view_allow_from text not null default 'everyone'
    check (profile_view_allow_from in ('everyone', 'contacts_only'));

alter table public.users
  add column if not exists profile_show_avatar boolean not null default true;

alter table public.users
  add column if not exists profile_show_slug boolean not null default true;

alter table public.users
  add column if not exists profile_show_last_active boolean not null default true;

comment on column public.users.dm_allow_from is 'Кто может начать ЛС: everyone | contacts_only (взаимные закрепы)';
comment on column public.users.profile_view_allow_from is 'Кто видит карточку профиля: everyone | contacts_only';
comment on column public.users.profile_show_avatar is 'Показывать аватар зрителям (при разрешённом доступе)';
comment on column public.users.profile_show_slug is 'Показывать slug зрителям';
comment on column public.users.profile_show_last_active is 'Показывать последнюю активность';

-- Взаимные «закрепы» (бывш. избранное с двух сторон)
create or replace function public.users_are_mutual_contacts(p_a uuid, p_b uuid)
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
        from public.user_favorites f1
       where f1.user_id = p_a
         and f1.favorite_user_id = p_b
    )
    and exists(
      select 1
        from public.user_favorites f2
       where f2.user_id = p_b
         and f2.favorite_user_id = p_a
    );
$$;

grant execute on function public.users_are_mutual_contacts(uuid, uuid) to authenticated;

create table if not exists public.user_contact_list_hides (
  owner_user_id uuid not null references public.users(id) on delete cascade,
  hidden_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, hidden_user_id),
  constraint user_contact_list_hides_not_self check (owner_user_id <> hidden_user_id)
);

create index if not exists user_contact_list_hides_owner_idx
  on public.user_contact_list_hides (owner_user_id, created_at desc);

alter table public.user_contact_list_hides enable row level security;

drop policy if exists user_contact_list_hides_own on public.user_contact_list_hides;
create policy user_contact_list_hides_own
  on public.user_contact_list_hides
  for all
  to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

grant select, insert, delete on public.user_contact_list_hides to authenticated;

-- Профиль для просмотра другим пользователем (учёт приватности)
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
    u.profile_view_allow_from,
    u.profile_show_avatar,
    u.profile_show_slug,
    u.profile_show_last_active
  into r
  from public.users u
  where u.id = v_target
  limit 1;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_me = v_target then
    return jsonb_build_object(
      'ok', true,
      'self', true,
      'id', r.id,
      'display_name', coalesce(nullif(btrim(r.display_name), ''), 'Пользователь'),
      'avatar_url', r.avatar_url,
      'profile_slug', r.profile_slug,
      'last_login_at', r.last_login_at
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
      'last_login_at', null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'restricted', false,
    'id', r.id,
    'display_name', coalesce(nullif(btrim(r.display_name), ''), 'Пользователь'),
    'avatar_url', case when r.profile_show_avatar then r.avatar_url else null end,
    'profile_slug', case when r.profile_show_slug then r.profile_slug else null end,
    'last_login_at', case when r.profile_show_last_active then r.last_login_at else null end
  );
end;
$$;

grant execute on function public.get_user_profile_for_peek(uuid) to authenticated;

-- Новый ЛС: если у адресата только контакты — нужен взаимный закреп
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

-- Список контактов: скрыть помеченных вручную (в т.ч. только входящий закреп)
drop function if exists public.list_my_contacts();
drop function if exists public.hide_contact_from_my_list(uuid);

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

create or replace function public.hide_contact_from_my_list(p_hidden_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_hidden_user_id is null or p_hidden_user_id = v_me then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  insert into public.user_contact_list_hides (owner_user_id, hidden_user_id)
  values (v_me, p_hidden_user_id)
  on conflict (owner_user_id, hidden_user_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.hide_contact_from_my_list(uuid) to authenticated;
