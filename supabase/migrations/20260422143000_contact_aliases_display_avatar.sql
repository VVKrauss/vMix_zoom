-- Локальные «отображаемые аватары» контактов (URL, видит только владелец), вместе с алиасами имён.

alter table public.contact_aliases
  add column if not exists display_avatar_url text;

alter table public.contact_aliases
  drop constraint if exists contact_aliases_alias_len;

alter table public.contact_aliases
  alter column alias drop not null;

alter table public.contact_aliases
  drop constraint if exists contact_aliases_has_display;

alter table public.contact_aliases
  add constraint contact_aliases_has_display check (
    (alias is not null and char_length(btrim(alias)) between 1 and 64)
    or
    (display_avatar_url is not null and char_length(btrim(display_avatar_url)) between 1 and 2048)
  );

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
    update public.contact_aliases
       set alias = null
     where owner_user_id = v_me
       and contact_user_id = v_target;
    delete from public.contact_aliases
     where owner_user_id = v_me
       and contact_user_id = v_target
       and (alias is null or char_length(btrim(alias)) = 0)
       and (display_avatar_url is null or char_length(btrim(display_avatar_url)) = 0);
    return jsonb_build_object('ok', true, 'alias', null);
  end if;

  if char_length(v_alias) > 64 then
    v_alias := left(v_alias, 64);
  end if;

  insert into public.contact_aliases(owner_user_id, contact_user_id, alias, display_avatar_url)
  values (v_me, v_target, v_alias, null)
  on conflict (owner_user_id, contact_user_id)
  do update set alias = excluded.alias;

  return jsonb_build_object('ok', true, 'alias', v_alias);
end;
$$;

create or replace function public.set_my_contact_display_avatar(
  p_contact_user_id uuid,
  p_display_avatar_url text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid := p_contact_user_id;
  v_url text := btrim(coalesce(p_display_avatar_url, ''));
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

  if v_url = '' then
    update public.contact_aliases
       set display_avatar_url = null
     where owner_user_id = v_me
       and contact_user_id = v_target;
    delete from public.contact_aliases
     where owner_user_id = v_me
       and contact_user_id = v_target
       and (alias is null or char_length(btrim(alias)) = 0)
       and (display_avatar_url is null or char_length(btrim(display_avatar_url)) = 0);
    return jsonb_build_object('ok', true, 'display_avatar_url', null);
  end if;

  if char_length(v_url) > 2048 then
    v_url := left(v_url, 2048);
  end if;

  insert into public.contact_aliases(owner_user_id, contact_user_id, alias, display_avatar_url)
  values (v_me, v_target, null, v_url)
  on conflict (owner_user_id, contact_user_id)
  do update set display_avatar_url = excluded.display_avatar_url;

  return jsonb_build_object('ok', true, 'display_avatar_url', v_url);
end;
$$;

grant execute on function public.set_my_contact_display_avatar(uuid, text) to authenticated;

drop function if exists public.list_my_contact_aliases(uuid[]);

create or replace function public.list_my_contact_aliases(p_contact_user_ids uuid[])
returns table(contact_user_id uuid, alias text, display_avatar_url text)
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
  select a.contact_user_id, a.alias, a.display_avatar_url
  from public.contact_aliases a
  where a.owner_user_id = v_me
    and a.contact_user_id = any(p_contact_user_ids);
end;
$$;

grant execute on function public.list_my_contact_aliases(uuid[]) to authenticated;
