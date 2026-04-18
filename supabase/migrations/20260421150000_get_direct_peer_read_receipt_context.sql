-- Контекст квитанций ЛС для собеседника: last_read_at + profile_dm_receipts_private.
-- Прямой SELECT из public.users с клиента для чужого id часто блокируется RLS — из-за этого
-- peer_dm_receipts_private ошибочно считался «включённым» и индикатор всегда оставался «отправлено».

create or replace function public.get_direct_peer_read_receipt_context(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_peer uuid;
  v_lr timestamptz;
  v_priv boolean;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  if p_conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  if not public.user_is_member_of_conversation(p_conversation_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    where c.id = p_conversation_id
      and c.kind = 'direct'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_direct');
  end if;

  select m.user_id
    into v_peer
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id
    and m.user_id <> v_me
  limit 1;

  if v_peer is null then
    return jsonb_build_object('ok', false, 'error', 'peer_not_found');
  end if;

  select m.last_read_at
    into v_lr
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id
    and m.user_id = v_peer;

  select u.profile_dm_receipts_private
    into v_priv
  from public.users u
  where u.id = v_peer;

  return jsonb_build_object(
    'ok', true,
    'peer_last_read_at', v_lr,
    'peer_dm_receipts_private', coalesce(v_priv, false)
  );
end;
$$;

comment on function public.get_direct_peer_read_receipt_context(uuid) is
  'Для ЛС: last_read_at и флаг приватности квитанций собеседника (обход RLS на users для колонки).';

grant execute on function public.get_direct_peer_read_receipt_context(uuid) to authenticated;
