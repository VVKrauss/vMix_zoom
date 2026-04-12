-- Со-администраторы комнаты и право на UPDATE для хоста, staff и со-админов.

ALTER TABLE public.space_rooms
  ADD COLUMN IF NOT EXISTS room_admin_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.space_rooms.room_admin_user_ids IS
  'UUID пользователей с правами модерации этой комнаты (чат, вход, бан). Хост не дублируется в массиве.';

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'space_rooms'
      AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.space_rooms', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY space_rooms_update_by_host_staff_room_admins
ON public.space_rooms
FOR UPDATE
TO authenticated
USING (
  auth.uid() = host_user_id
  OR (SELECT public.admin_is_staff())
  OR (auth.uid() = ANY (COALESCE(room_admin_user_ids, '{}'::uuid[])))
)
WITH CHECK (
  auth.uid() = host_user_id
  OR (SELECT public.admin_is_staff())
  OR (auth.uid() = ANY (COALESCE(room_admin_user_ids, '{}'::uuid[])))
);
