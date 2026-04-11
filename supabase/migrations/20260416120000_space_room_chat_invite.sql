-- Room chat policy + optional time-limited invite link (cold join after expiry blocked for non-host).

alter table public.space_rooms
  add column if not exists chat_visibility text;

update public.space_rooms
   set chat_visibility = 'everyone'
 where chat_visibility is null;

alter table public.space_rooms
  alter column chat_visibility set default 'everyone';

alter table public.space_rooms
  alter column chat_visibility set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'space_rooms_chat_visibility_check'
  ) then
    alter table public.space_rooms
      add constraint space_rooms_chat_visibility_check
      check (chat_visibility in ('everyone', 'authenticated_only', 'staff_only', 'closed'));
  end if;
end
$$;

comment on column public.space_rooms.chat_visibility is
  'Room chat: everyone | authenticated_only | staff_only | closed';
