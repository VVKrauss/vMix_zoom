-- Members list for join-requests modal (owner/admin/moderator).

create or replace function public.list_conversation_members_for_management(
  p_conversation_id uuid
)
returns table (
  user_id uuid,
  member_role text,
  display_name text
)
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
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversation_members m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.user_id = v_me
      and c.kind in ('group', 'channel')
      and c.closed_at is null
      and m.role in ('owner', 'admin', 'moderator')
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.user_id,
    m.role as member_role,
    coalesce(nullif(btrim(u.display_name), ''), 'Пользователь')::text as display_name
  from public.chat_conversation_members m
  join public.chat_conversations c on c.id = m.conversation_id
  left join public.users u on u.id = m.user_id
  where m.conversation_id = p_conversation_id
    and c.kind in ('group', 'channel')
    and c.closed_at is null
  order by
    case m.role
      when 'owner' then 0
      when 'admin' then 1
      when 'moderator' then 2
      else 3
    end,
    display_name asc,
    m.user_id asc;
end;
$$;

grant execute on function public.list_conversation_members_for_management(uuid) to authenticated;

