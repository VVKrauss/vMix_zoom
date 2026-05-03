-- Агрегированная статистика группы/канала для owner/admin (группа) и owner/admin/moderator (канал).

create or replace function public.get_conversation_admin_stats(
  p_conversation_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_role text;
  v_days int := greatest(1, least(coalesce(p_days, 30), 90));
  v_start_day date;
  v_since timestamptz;
  v_member_count int;
  v_pending_join int;
  v_messages_nr int;
  v_reactions int;
  v_unique_authors int;
  v_messages_with_reply int;
  v_channel_posts int;
  v_channel_comments int;
  v_members_by_role jsonb;
  v_messages_by_kind jsonb;
  v_top jsonb;
  v_daily jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  if p_conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  select c.kind, m.role
  into v_kind, v_role
  from public.chat_conversations c
  join public.chat_conversation_members m
    on m.conversation_id = c.id and m.user_id = v_uid
  where c.id = p_conversation_id
    and c.closed_at is null;

  if v_kind is null or v_kind not in ('group', 'channel') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_kind = 'group' and not (v_role in ('owner', 'admin')) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_kind = 'channel' and not (v_role in ('owner', 'admin', 'moderator')) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_start_day := ((timezone('utc', now()))::date - (v_days - 1));
  v_since := v_start_day::timestamp at time zone 'utc';

  select count(*)::int into v_member_count
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id;

  select count(*)::int into v_pending_join
  from public.chat_conversation_join_requests r
  where r.conversation_id = p_conversation_id;

  select count(*)::int into v_messages_nr
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.created_at >= v_since
    and m.kind <> 'reaction';

  select count(*)::int into v_reactions
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.created_at >= v_since
    and m.kind = 'reaction';

  select count(distinct m.sender_user_id)::int into v_unique_authors
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.created_at >= v_since
    and m.kind <> 'reaction'
    and m.sender_user_id is not null;

  if v_kind = 'channel' then
    select
      count(*) filter (where m.reply_to_message_id is null)::int,
      count(*) filter (where m.reply_to_message_id is not null)::int
    into v_channel_posts, v_channel_comments
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
      and m.created_at >= v_since
      and m.kind <> 'reaction';

    v_messages_with_reply := null;
  else
    v_channel_posts := null;
    v_channel_comments := null;

    select count(*)::int into v_messages_with_reply
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
      and m.created_at >= v_since
      and m.kind <> 'reaction'
      and (
        m.reply_to_message_id is not null
        or m.quote_to_message_id is not null
      );
  end if;

  select coalesce(jsonb_object_agg(s.role, s.cnt), '{}'::jsonb)
  into v_members_by_role
  from (
    select m.role, count(*)::int as cnt
    from public.chat_conversation_members m
    where m.conversation_id = p_conversation_id
    group by m.role
  ) s;

  select coalesce(jsonb_object_agg(x.kind, x.cnt), '{}'::jsonb)
  into v_messages_by_kind
  from (
    select m.kind, count(*)::int as cnt
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
      and m.created_at >= v_since
      and m.kind <> 'reaction'
    group by m.kind
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', q.sender_user_id,
        'message_count', q.message_count,
        'display_name',
          coalesce(nullif(trim(u.display_name), ''), 'Участник')
      )
      order by q.message_count desc
    ),
    '[]'::jsonb
  )
  into v_top
  from (
    select m.sender_user_id, count(*)::int as message_count
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
      and m.created_at >= v_since
      and m.kind <> 'reaction'
      and m.sender_user_id is not null
    group by m.sender_user_id
    order by count(*) desc
    limit 8
  ) q
  left join public.users u on u.id = q.sender_user_id;

  with bounds as (
    select
      ((timezone('utc', now()))::date - (v_days - 1)) as start_d,
      (timezone('utc', now()))::date as end_d
  ),
  days as (
    select generate_series(b.start_d, b.end_d, interval '1 day')::date as d
    from bounds b
  ),
  counts as (
    select ((m.created_at at time zone 'utc'))::date as d, count(*)::int as c
    from public.chat_messages m
    where m.conversation_id = p_conversation_id
      and m.created_at >= v_since
      and m.kind <> 'reaction'
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', to_char(days.d, 'YYYY-MM-DD'),
        'messages', coalesce(counts.c, 0)
      )
      order by days.d
    ),
    '[]'::jsonb
  )
  into v_daily
  from days
  left join counts on counts.d = days.d;

  return jsonb_build_object(
    'ok', true,
    'period_days', v_days,
    'conversation_kind', v_kind,
    'member_count', v_member_count,
    'pending_join_requests', v_pending_join,
    'messages_non_reaction', coalesce(v_messages_nr, 0),
    'reactions_count', coalesce(v_reactions, 0),
    'unique_authors', coalesce(v_unique_authors, 0),
    'messages_with_reply', v_messages_with_reply,
    'channel_posts', v_channel_posts,
    'channel_comments', v_channel_comments,
    'members_by_role', coalesce(v_members_by_role, '{}'::jsonb),
    'messages_by_kind', coalesce(v_messages_by_kind, '{}'::jsonb),
    'top_contributors', coalesce(v_top, '[]'::jsonb),
    'daily', coalesce(v_daily, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_conversation_admin_stats(uuid, integer) to authenticated;
