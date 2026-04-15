-- get_or_create_conversation_invite used encode(gen_random_bytes(12), 'base64url'),
-- which requires extension pgcrypto. On some DBs it is not enabled → runtime error.
-- Replace with built-in gen_random_uuid() (hex, URL-safe in path/query).

create or replace function public.get_or_create_conversation_invite(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := p_conversation_id;
  v_kind text;
  v_token text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  select c.kind into v_kind
  from public.chat_conversations c
  where c.id = v_id and c.closed_at is null;
  if v_kind is null or v_kind not in ('group','channel') then
    return jsonb_build_object('ok', false, 'error', 'not_supported');
  end if;

  if v_kind = 'group' then
    if not public.is_group_admin(v_id, v_me) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  else
    if not public.is_channel_admin(v_id, v_me) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  end if;

  select i.token into v_token
  from public.chat_conversation_invites i
  where i.conversation_id = v_id and i.revoked_at is null
  order by i.created_at desc
  limit 1;

  if v_token is null then
    v_token :=
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
    insert into public.chat_conversation_invites (conversation_id, token, created_by)
    values (v_id, v_token, v_me);
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

grant execute on function public.get_or_create_conversation_invite(uuid) to authenticated;
