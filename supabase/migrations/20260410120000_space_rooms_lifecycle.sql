alter table if exists public.space_rooms
  add column if not exists access_mode text not null default 'link';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'space_rooms_access_mode_check'
  ) then
    alter table public.space_rooms
      add constraint space_rooms_access_mode_check
      check (access_mode in ('link', 'approval', 'invite_only'));
  end if;
end
$$;

create or replace function public.close_space_room(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_room public.space_rooms%rowtype;
  v_is_staff boolean := public.admin_is_staff();
begin
  if p_slug is null or btrim(p_slug) = '' then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select *
    into v_room
    from public.space_rooms
   where slug = btrim(p_slug)
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  if v_room.host_user_id is distinct from auth.uid() and not v_is_staff then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.space_rooms
     set status = 'closed'
   where slug = v_room.slug;

  return jsonb_build_object('ok', true, 'status', 'closed');
end;
$$;

grant execute on function public.close_space_room(text) to authenticated;
grant execute on function public.close_space_room(text) to service_role;
