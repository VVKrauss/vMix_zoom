-- Старая версия host_leave_space_room на удалённой БД могла иметь другой тип возврата — снимаем перед replace.
drop function if exists public.host_leave_space_room(text) cascade;

-- Накопление времени, пока комната в статусе open (эфир «открыт»).
alter table public.space_rooms
  add column if not exists cumulative_open_seconds bigint not null default 0;

alter table public.space_rooms
  add column if not exists open_session_started_at timestamptz null;

comment on column public.space_rooms.cumulative_open_seconds is
  'Суммарная длительность в статусе open (секунды), без текущей открытой сессии.';
comment on column public.space_rooms.open_session_started_at is
  'Начало текущей открытой сессии (status=open); при закрытии интервал прибавляется к cumulative_open_seconds.';

-- Текущие открытые комнаты: старт сессии, если ещё не задан.
update public.space_rooms
set open_session_started_at = coalesce(open_session_started_at, updated_at, created_at, now())
where status = 'open';

create or replace function public.space_rooms_track_open_duration()
returns trigger
language plpgsql
as $$
declare
  delta bigint;
begin
  if tg_op = 'INSERT' then
    if new.status = 'open' and new.open_session_started_at is null then
      new.open_session_started_at := clock_timestamp();
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'open' and new.status is distinct from 'open' then
      if old.open_session_started_at is not null then
        delta := least(
          2000000000::bigint,
          greatest(0, extract(epoch from (clock_timestamp() - old.open_session_started_at))::bigint)
        );
        new.cumulative_open_seconds := coalesce(old.cumulative_open_seconds, 0) + delta;
      end if;
      new.open_session_started_at := null;
    elsif old.status is distinct from 'open' and new.status = 'open' then
      if new.open_session_started_at is null then
        new.open_session_started_at := clock_timestamp();
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists space_rooms_track_open_duration_biur on public.space_rooms;
create trigger space_rooms_track_open_duration_biur
  before insert or update on public.space_rooms
  for each row
  execute function public.space_rooms_track_open_duration();

-- Выход хоста: для временной комнаты сначала закрываем (триггер накопит время), затем удаляем строку.
create or replace function public.host_leave_space_room(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_slug text := btrim(p_slug);
  v_room public.space_rooms%rowtype;
begin
  if v_slug = '' then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select *
    into v_room
    from public.space_rooms
   where slug = v_slug
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  if v_room.host_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_room.retain_instance then
    update public.space_rooms
       set status = 'closed',
           updated_at = now()
     where slug = v_slug;
    return jsonb_build_object('ok', true, 'action', 'closed');
  end if;

  update public.space_rooms
     set status = 'closed',
         updated_at = now()
   where slug = v_slug;

  delete from public.space_rooms
   where slug = v_slug;

  return jsonb_build_object('ok', true, 'action', 'deleted');
end;
$$;

grant execute on function public.host_leave_space_room(text) to authenticated;
grant execute on function public.host_leave_space_room(text) to service_role;

-- Доступ к данным чата комнаты в кабинете: участник ИЛИ хост space_rooms по slug беседы.
create or replace function public.can_access_room_chat_dashboard(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.chat_conversations cc
    join public.space_rooms sr on sr.slug = cc.space_room_slug
    where cc.id = p_conversation_id
      and cc.kind = 'room'
      and sr.host_user_id = auth.uid()
  );
$$;

grant execute on function public.can_access_room_chat_dashboard(uuid) to authenticated;

create or replace function public.dashboard_room_stats_for_host(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_slug text := btrim(p_slug);
  v_host uuid := auth.uid();
  v_room public.space_rooms%rowtype;
  v_convo record;
  v_members int := 0;
begin
  if v_slug = '' then
    return jsonb_build_object('ok', false, 'error', 'bad_slug');
  end if;
  if v_host is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_room from public.space_rooms where slug = v_slug limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;
  if v_room.host_user_id is distinct from v_host then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select c.id, c.message_count, c.created_at, c.closed_at, c.last_message_at, c.title
    into v_convo
    from public.chat_conversations c
   where c.kind = 'room'
     and c.space_room_slug = v_slug
   limit 1;

  if v_convo.id is not null then
    select count(*)::int into v_members from public.chat_conversation_members m where m.conversation_id = v_convo.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'displayName', v_room.display_name,
    'roomStatus', v_room.status,
    'cumulativeOpenSeconds', v_room.cumulative_open_seconds,
    'openSessionStartedAt', v_room.open_session_started_at,
    'conversationId', v_convo.id,
    'messageCount', coalesce(v_convo.message_count, 0),
    'chatCreatedAt', v_convo.created_at,
    'chatClosedAt', v_convo.closed_at,
    'chatTitle', v_convo.title,
    'registeredMemberCount', coalesce(v_members, 0)
  );
end;
$$;

grant execute on function public.dashboard_room_stats_for_host(text) to authenticated;

create or replace function public.list_room_chat_guest_senders_dashboard(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  guests jsonb := '[]'::jsonb;
  gcount int := 0;
begin
  if not public.can_access_room_chat_dashboard(p_conversation_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'senderPeerId', q.sender_peer_id,
        'senderNameSnapshot', q.sender_name_snapshot,
        'messageCount', q.cnt
      )
      order by q.sender_name_snapshot
    ),
    '[]'::jsonb
  )
  into guests
  from (
    select
      coalesce(nullif(trim(sender_peer_id), ''), '') as sender_peer_id,
      min(sender_name_snapshot) as sender_name_snapshot,
      count(*)::bigint as cnt
    from public.chat_messages
    where conversation_id = p_conversation_id
      and sender_user_id is null
      and kind = 'text'
    group by 1
  ) q;

  select count(*)::int into gcount
  from (
    select 1
    from public.chat_messages
    where conversation_id = p_conversation_id
      and sender_user_id is null
      and kind = 'text'
    group by coalesce(nullif(trim(sender_peer_id), ''), '')
  ) t;

  return jsonb_build_object('ok', true, 'guests', guests, 'guestDistinctCount', coalesce(gcount, 0));
end;
$$;

grant execute on function public.list_room_chat_guest_senders_dashboard(uuid) to authenticated;

create or replace function public.list_room_chat_registered_members_dashboard(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if not public.can_access_room_chat_dashboard(p_conversation_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  return coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'members', coalesce(
          jsonb_agg(
            jsonb_build_object(
              'userId', u.id,
              'displayName', coalesce(nullif(trim(u.display_name), ''), 'Участник'),
              'avatarUrl', u.avatar_url
            )
            order by coalesce(nullif(trim(u.display_name), ''), '')
          ),
          '[]'::jsonb
        )
      )
      from public.chat_conversation_members m
      join public.users u on u.id = m.user_id
      where m.conversation_id = p_conversation_id
    ),
    jsonb_build_object('ok', true, 'members', '[]'::jsonb)
  );
end;
$$;

grant execute on function public.list_room_chat_registered_members_dashboard(uuid) to authenticated;
