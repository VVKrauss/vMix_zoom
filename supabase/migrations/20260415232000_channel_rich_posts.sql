-- Channels: rich posts with meta (markdown + link preview).

create or replace function public.append_channel_post_rich(
  p_conversation_id uuid,
  p_body text,
  p_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_body text := left(coalesce(p_body, ''), 4000);
  v_created_at timestamptz := now();
  v_message_id uuid;
  v_role text;
  v_post_mode text;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_name text := coalesce(
    nullif(auth.jwt() ->> 'user_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    'Вы'
  );
begin
  if v_me is null then
    raise exception 'auth_required';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;
  if nullif(btrim(v_body), '') is null then
    raise exception 'message_body_required';
  end if;

  select c.channel_posting_mode into v_post_mode
  from public.chat_conversations c
  where c.id = p_conversation_id and c.kind = 'channel' and c.closed_at is null;
  if v_post_mode is null then
    raise exception 'channel_not_found';
  end if;

  select m.role into v_role
  from public.chat_conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id = v_me;
  if v_role is null then
    raise exception 'forbidden';
  end if;

  if v_post_mode = 'admins_only' and v_role not in ('owner','moderator') then
    raise exception 'post_not_allowed';
  end if;

  insert into public.chat_messages (
    conversation_id,
    sender_user_id,
    sender_name_snapshot,
    kind,
    body,
    meta,
    created_at,
    reply_to_message_id
  )
  values (
    p_conversation_id,
    v_me,
    left(v_name, 200),
    'text',
    v_body,
    v_meta,
    v_created_at,
    null
  )
  returning id into v_message_id;

  update public.chat_conversations c
     set last_message_at = v_created_at,
         message_count = c.message_count + 1,
         last_message_preview = left(v_body, 280)
   where c.id = p_conversation_id;

  return jsonb_build_object('ok', true, 'message_id', v_message_id, 'created_at', v_created_at);
end;
$$;

grant execute on function public.append_channel_post_rich(uuid, text, jsonb) to authenticated;

