-- Пользователь убирает комнату из списка «Комнаты»; пустой room-чат удаляется целиком.
-- Админ: массовая уборка пустых room-чатов и сирот без участников.

CREATE OR REPLACE FUNCTION public.leave_room_chat_archive_entry(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_kind text;
  v_msg int;
BEGIN
  IF p_conversation_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;

  SELECT c.kind INTO v_kind
  FROM public.chat_conversations c
  INNER JOIN public.chat_conversation_members m
    ON m.conversation_id = c.id AND m.user_id = auth.uid()
  WHERE c.id = p_conversation_id;

  IF v_kind IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_kind <> 'room' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_room_chat');
  END IF;

  SELECT COUNT(*)::int INTO v_msg
  FROM public.chat_messages
  WHERE conversation_id = p_conversation_id;

  DELETE FROM public.chat_conversation_members
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  IF v_msg = 0 THEN
    DELETE FROM public.chat_conversations
    WHERE id = p_conversation_id AND kind = 'room';
    RETURN jsonb_build_object('ok', true, 'removed_conversation', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'removed_conversation', false);
END;
$$;

COMMENT ON FUNCTION public.leave_room_chat_archive_entry(uuid) IS
  'Удаляет membership текущего пользователя в room-архиве; если сообщений не было — удаляет весь диалог.';

CREATE OR REPLACE FUNCTION public.admin_purge_stale_room_chats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_deleted int := 0;
BEGIN
  IF NOT (SELECT public.admin_is_staff()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM public.chat_conversations c
  WHERE c.kind = 'room'
    AND (
      NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.conversation_id = c.id)
      OR NOT EXISTS (SELECT 1 FROM public.chat_conversation_members mm WHERE mm.conversation_id = c.id)
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$$;

COMMENT ON FUNCTION public.admin_purge_stale_room_chats() IS
  'Удаляет room-диалоги без сообщений или без ни одного участника (staff).';

GRANT EXECUTE ON FUNCTION public.leave_room_chat_archive_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_stale_room_chats() TO authenticated;
