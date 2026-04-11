-- Модерация в space_rooms: бан-лист и список одобренных на вход.

ALTER TABLE space_rooms
  ADD COLUMN IF NOT EXISTS banned_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_joiners uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN space_rooms.banned_user_ids IS
  'UUID аутентифицированных пользователей, заблокированных хостом в этой комнате.';

COMMENT ON COLUMN space_rooms.approved_joiners IS
  'UUID пользователей, которых хост одобрил для входа (access_mode=approval). '
  'Элементы удаляются после первого успешного входа.';
