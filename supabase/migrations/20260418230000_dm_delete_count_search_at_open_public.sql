-- 1) DM soft-delete: stub must not inflate message_count (exclude «deleted» from counter UX).
-- 2) User search: leading @ matches profile_slug/display_name (same as without @).
-- 3) Discover open groups/channels by title or public_nick from global search.

create or replace function public.delete_direct_message(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text;
  v_updated int := 0;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null or p_message_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    join public.chat_conversation_members m
      on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'direct'
      and m.user_id = v_user_id
  ) then
    raise exception 'forbidden';
  end if;

  select m.kind into v_kind
  from public.chat_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id
    and m.sender_user_id = v_user_id;

  if v_kind is null then
    raise exception 'message_not_found';
  end if;

  if v_kind = 'reaction' or v_kind = 'system' then
    raise exception 'message_not_deletable';
  end if;

  update public.chat_messages
     set kind = 'system',
         body = 'Сообщение удалено',
         meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('deleted', true, 'deleted_kind', v_kind),
         edited_at = now()
   where id = p_message_id;

  get diagnostics v_updated = row_count;

  update public.chat_conversations c
     set last_message_preview = left(
       coalesce(
         (
           select m.body
           from public.chat_messages m
           where m.conversation_id = p_conversation_id
             and m.kind in ('text', 'system', 'image')
           order by m.created_at desc, m.id desc
           limit 1
         ),
         c.last_message_preview
       ),
       280
     ),
     message_count = greatest(0, coalesce(c.message_count, 0) - 1)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'updated', v_updated, 'message_id', p_message_id);
end;
$$;

grant execute on function public.delete_direct_message(uuid, uuid) to authenticated;

-- Strip leading @ in search query (profile handles)
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
    select case
      when lower(btrim(coalesce(p_query, ''))) like '@%'
      then lower(btrim(substring(btrim(coalesce(p_query, '')) from 2)))
      else lower(btrim(coalesce(p_query, '')))
    end as t
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
    and length(q.t) >= 2
    and (
      position(q.t in lower(coalesce(u.display_name, ''))) > 0
      or position(q.t in lower(coalesce(u.profile_slug, ''))) > 0
    )
  order by
    case when lower(coalesce(u.profile_slug, '')) = q.t then 0 else 1 end,
    u.display_name asc nulls last
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 20), 50));
$$;

grant execute on function public.search_registered_users(text, int) to authenticated;

-- Open (public) groups/channels — for messenger sidebar global search
create or replace function public.search_open_public_conversations(
  p_query text,
  p_limit int default 20
)
returns table (
  id uuid,
  kind text,
  title text,
  public_nick text,
  member_count int,
  last_message_preview text,
  last_message_at timestamptz,
  avatar_path text,
  avatar_thumb_path text,
  is_public boolean,
  posting_mode text,
  comments_mode text,
  created_at timestamptz
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
    select case
      when lower(btrim(coalesce(p_query, ''))) like '@%'
      then lower(btrim(substring(btrim(coalesce(p_query, '')) from 2)))
      else lower(btrim(coalesce(p_query, '')))
    end as t
  ),
  mb as (
    select m.conversation_id, count(*)::int as member_count
    from public.chat_conversation_members m
    group by m.conversation_id
  )
  select
    c.id,
    c.kind,
    coalesce(nullif(btrim(c.title), ''), case when c.kind = 'channel' then 'Канал' else 'Группа' end)::text as title,
    c.public_nick,
    coalesce(mb.member_count, 0) as member_count,
    c.last_message_preview,
    c.last_message_at,
    c.avatar_path,
    c.avatar_thumb_path,
    (case when c.kind = 'channel' then c.channel_is_public else c.group_is_public end) as is_public,
    case when c.kind = 'channel' then coalesce(c.channel_posting_mode, 'admins_only') else null end as posting_mode,
    case when c.kind = 'channel' then coalesce(c.channel_comments_mode, 'everyone') else null end as comments_mode,
    c.created_at
  from public.chat_conversations c
  left join mb on mb.conversation_id = c.id
  cross join me
  cross join q
  where me.uid is not null
    and c.closed_at is null
    and c.kind in ('group', 'channel')
    and (
      (c.kind = 'group' and c.group_is_public = true)
      or (c.kind = 'channel' and c.channel_is_public = true)
    )
    and length(q.t) >= 2
    and (
      position(q.t in lower(coalesce(c.title, ''))) > 0
      or (
        c.public_nick is not null
        and length(btrim(c.public_nick)) > 0
        and position(q.t in lower(c.public_nick)) > 0
      )
    )
  order by c.last_message_at desc nulls last, c.created_at desc
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 20), 50));
$$;

grant execute on function public.search_open_public_conversations(text, int) to authenticated;
