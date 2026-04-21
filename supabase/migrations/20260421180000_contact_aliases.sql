-- Локальные «отображаемые имена» контактов (видит только владелец).

create table if not exists public.contact_aliases (
  owner_user_id uuid not null references public.users(id) on delete cascade,
  contact_user_id uuid not null references public.users(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_aliases_pk primary key (owner_user_id, contact_user_id),
  constraint contact_aliases_alias_len check (char_length(btrim(alias)) between 1 and 64)
);

alter table public.contact_aliases enable row level security;

grant select, insert, update, delete on public.contact_aliases to authenticated;
grant all on public.contact_aliases to service_role;

drop policy if exists contact_aliases_own_rw on public.contact_aliases;
create policy contact_aliases_own_rw
on public.contact_aliases
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create or replace function public._touch_contact_aliases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contact_aliases_touch_updated_at on public.contact_aliases;
create trigger contact_aliases_touch_updated_at
before update on public.contact_aliases
for each row execute function public._touch_contact_aliases_updated_at();

create or replace function public.set_my_contact_alias(
  p_contact_user_id uuid,
  p_alias text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid := p_contact_user_id;
  v_alias text := btrim(coalesce(p_alias, ''));
begin
  if v_me is null then
    return jsonb_build_object('error', 'auth_required');
  end if;
  if v_target is null then
    return jsonb_build_object('error', 'target_required');
  end if;
  if v_target = v_me then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if v_alias = '' then
    delete from public.contact_aliases
     where owner_user_id = v_me
       and contact_user_id = v_target;
    return jsonb_build_object('ok', true, 'alias', null);
  end if;

  if char_length(v_alias) > 64 then
    v_alias := left(v_alias, 64);
  end if;

  insert into public.contact_aliases(owner_user_id, contact_user_id, alias)
  values (v_me, v_target, v_alias)
  on conflict (owner_user_id, contact_user_id)
  do update set alias = excluded.alias;

  return jsonb_build_object('ok', true, 'alias', v_alias);
end;
$$;

grant execute on function public.set_my_contact_alias(uuid, text) to authenticated;

create or replace function public.list_my_contact_aliases(p_contact_user_ids uuid[])
returns table(contact_user_id uuid, alias text)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'auth_required';
  end if;
  return query
  select a.contact_user_id, a.alias
  from public.contact_aliases a
  where a.owner_user_id = v_me
    and a.contact_user_id = any(p_contact_user_ids);
end;
$$;

grant execute on function public.list_my_contact_aliases(uuid[]) to authenticated;

