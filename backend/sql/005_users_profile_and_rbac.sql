-- Profile columns (Supabase-compatible) + RBAC catalog (roles / permissions / user_global_roles).
-- Apply after 001–004. Safe to re-run (IF NOT EXISTS / IF NOT EXISTS constraints where applicable).

-- --- public.users: profile & privacy (nullable / defaults preserve existing rows) ---
alter table public.users add column if not exists phone citext;
alter table public.users add column if not exists status text not null default 'active';
alter table public.users add column if not exists is_email_verified boolean not null default false;
alter table public.users add column if not exists is_phone_verified boolean not null default false;
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users add column if not exists room_ui_preferences jsonb;
alter table public.users add column if not exists profile_slug citext;
alter table public.users add column if not exists profile_search_closed boolean not null default false;
alter table public.users add column if not exists profile_search_allow_by_name boolean not null default true;
alter table public.users add column if not exists profile_search_allow_by_email boolean not null default false;
alter table public.users add column if not exists profile_search_allow_by_slug boolean not null default true;
alter table public.users add column if not exists dm_allow_from text not null default 'everyone';
alter table public.users add column if not exists profile_view_allow_from text not null default 'everyone';
alter table public.users add column if not exists profile_show_avatar boolean not null default true;
alter table public.users add column if not exists profile_show_slug boolean not null default true;
alter table public.users add column if not exists profile_show_last_active boolean not null default false;
alter table public.users add column if not exists profile_show_online boolean not null default false;
alter table public.users add column if not exists profile_dm_receipts_private boolean not null default false;
alter table public.users add column if not exists messenger_pinned_conversation_ids jsonb;
alter table public.users add column if not exists last_active_at timestamptz;
alter table public.users add column if not exists presence_last_background_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'users' and c.conname = 'users_status_check'
  ) then
    alter table public.users add constraint users_status_check
      check (status in ('active', 'blocked', 'pending', 'deleted'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'users' and c.conname = 'users_dm_allow_from_check'
  ) then
    alter table public.users add constraint users_dm_allow_from_check
      check (dm_allow_from in ('everyone', 'contacts_only'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'users' and c.conname = 'users_profile_view_allow_from_check'
  ) then
    alter table public.users add constraint users_profile_view_allow_from_check
      check (profile_view_allow_from in ('everyone', 'contacts_only'));
  end if;
end $$;

create unique index if not exists users_phone_uq on public.users (phone) where phone is not null;
create unique index if not exists users_profile_slug_uq on public.users (profile_slug) where profile_slug is not null;

-- --- RBAC (matches legacy Supabase shape; stable UUIDs from seed file) ---
create table if not exists public.roles (
  id uuid primary key,
  code text not null,
  scope_type text not null,
  title text not null,
  description text,
  constraint roles_scope_type_check check (scope_type in ('global', 'account', 'room', 'session'))
);

create unique index if not exists roles_code_uq on public.roles (code);

create table if not exists public.permissions (
  id uuid primary key,
  code text not null,
  description text
);

create unique index if not exists permissions_code_uq on public.permissions (code);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_global_roles (
  user_id uuid not null references public.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  assigned_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists user_global_roles_role_idx on public.user_global_roles (role_id);
create index if not exists user_global_roles_user_idx on public.user_global_roles (user_id);
