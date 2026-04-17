-- Allow non-admin members to generate/reuse invite tokens.
-- Motivation: UI "Поделиться" is available to members; iOS share flow exposed `forbidden`
-- because `get_or_create_conversation_invite` required admin role.
--
-- Rules:
-- - auth required
-- - group/channel only
-- - allowed if requester is a member OR the conversation is public (shareable)
-- - otherwise forbidden

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
  v_is_public boolean := false;
  v_is_member boolean := false;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  select
    c.kind,
    case
      when c.kind = 'channel' then (c.channel_is_public = true)
      when c.kind = 'group' then (c.group_is_public = true)
      else false
    end as is_public
  into v_kind, v_is_public
  from public.chat_conversations c
  where c.id = v_id and c.closed_at is null;

  if v_kind is null or v_kind not in ('group','channel') then
    return jsonb_build_object('ok', false, 'error', 'not_supported');
  end if;

  select exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = v_id
      and m.user_id = v_me
  ) into v_is_member;

  if not v_is_member and not v_is_public then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select i.token into v_token
  from public.chat_conversation_invites i
  where i.conversation_id = v_id and i.revoked_at is null
  order by i.created_at desc
  limit 1;

  if v_token is null then
    -- URL-safe token, avoids pgcrypto dependency
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

