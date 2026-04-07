-- Удаление пользователя из auth + очистка связей с RESTRICT до удаления.
-- Права: support — только без staff-ролей; platform — до support; superadmin — всех кроме себя.

CREATE OR REPLACE FUNCTION public.admin_delete_registered_user(p_target_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  caller_rank int;
  target_rank int;
BEGIN
  IF NOT (SELECT public.admin_is_staff()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_target_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;

  IF p_target_user = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_self');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT COALESCE(MAX(
    CASE r.code
      WHEN 'superadmin' THEN 3
      WHEN 'platform_admin' THEN 2
      WHEN 'support_admin' THEN 1
      ELSE 0
    END
  ), 0) INTO caller_rank
  FROM public.user_global_roles ugr
  JOIN public.roles r ON r.id = ugr.role_id
  WHERE ugr.user_id = auth.uid() AND r.scope_type = 'global'
    AND r.code IN ('superadmin', 'platform_admin', 'support_admin');

  SELECT COALESCE(MAX(
    CASE r.code
      WHEN 'superadmin' THEN 3
      WHEN 'platform_admin' THEN 2
      WHEN 'support_admin' THEN 1
      ELSE 0
    END
  ), 0) INTO target_rank
  FROM public.user_global_roles ugr
  JOIN public.roles r ON r.id = ugr.role_id
  WHERE ugr.user_id = p_target_user AND r.scope_type = 'global'
    AND r.code IN ('superadmin', 'platform_admin', 'support_admin');

  IF COALESCE(caller_rank, 0) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF caller_rank = 1 AND target_rank > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_staff');
  END IF;

  IF caller_rank = 2 AND target_rank > 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_peer');
  END IF;

  DELETE FROM public.moderation_actions WHERE created_by_user_id = p_target_user;
  DELETE FROM public.access_invites WHERE created_by_user_id = p_target_user;
  DELETE FROM public.live_sessions WHERE created_by_user_id = p_target_user;
  DELETE FROM public.events WHERE created_by_user_id = p_target_user;
  DELETE FROM public.accounts WHERE owner_user_id = p_target_user;
  DELETE FROM public.rooms WHERE owner_user_id = p_target_user;

  DELETE FROM auth.users WHERE id = p_target_user;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'delete_failed', 'detail', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_registered_user(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_registered_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_registered_user(uuid) TO service_role;
