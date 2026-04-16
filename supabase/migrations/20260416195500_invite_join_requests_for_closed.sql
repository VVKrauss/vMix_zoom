-- Invites: for closed (non-public) group/channel create join request instead of auto-joining.

drop function if exists public.join_conversation_by_invite(text);

create or replace function public.join_conversation_by_invite(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_id uuid;
  v_kind text;
  v_is_public boolean;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_token is null then
    return jsonb_build_object('ok', false, 'error', 'token_required');
  end if;

  select i.conversation_id into v_id
  from public.chat_conversation_invites i
  where i.token = v_token and i.revoked_at is null
  limit 1;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select
    c.kind,
    case when c.kind = 'channel' then c.channel_is_public else c.group_is_public end as is_public
  into v_kind, v_is_public
  from public.chat_conversations c
  where c.id = v_id and c.closed_at is null;

  if v_kind is null or v_kind not in ('group','channel') then
    return jsonb_build_object('ok', false, 'error', 'not_supported');
  end if;

  -- Already member: nothing to do.
  if exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = v_id and m.user_id = v_me
  ) then
    return jsonb_build_object('ok', true, 'conversation_id', v_id, 'kind', v_kind, 'already_member', true);
  end if;

  if v_is_public = true then
    insert into public.chat_conversation_members (conversation_id, user_id, role)
    values (v_id, v_me, 'member')
    on conflict (conversation_id, user_id) do nothing;

    return jsonb_build_object('ok', true, 'conversation_id', v_id, 'kind', v_kind, 'joined', true);
  end if;

  -- Closed: create join request and wait for approval.
  insert into public.chat_conversation_join_requests (conversation_id, user_id)
  values (v_id, v_me)
  on conflict (conversation_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'conversation_id', v_id, 'kind', v_kind, 'requested', true);
end;
$$;

grant execute on function public.join_conversation_by_invite(text) to authenticated;

