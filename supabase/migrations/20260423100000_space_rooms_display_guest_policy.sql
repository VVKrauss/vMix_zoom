-- Имя и аватар комнаты в UI, политика гостей (jsonb), флаг «холодный вход только при хосте-создателе в эфире» (намерение для клиента/signaling).

ALTER TABLE public.space_rooms
  ADD COLUMN IF NOT EXISTS display_name text NULL,
  ADD COLUMN IF NOT EXISTS avatar_url text NULL,
  ADD COLUMN IF NOT EXISTS guest_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS require_creator_host_for_join boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.space_rooms.display_name IS
  'Отображаемое имя комнаты (кабинет, приглашение); slug остаётся id в URL.';

COMMENT ON COLUMN public.space_rooms.avatar_url IS
  'Публичный URL или путь к аватарке комнаты (при необходимости — signed URL на клиенте).';

COMMENT ON COLUMN public.space_rooms.guest_policy IS
  'Политика гостей и приоритеты (схему задаёт клиент). Пример: {"guest_join_order":"after_authenticated"}.';

COMMENT ON COLUMN public.space_rooms.require_creator_host_for_join IS
  'true: не пускать гостей без присутствия хоста-создателя в эфире (реализуется приложением; в БД хранится намерение).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'space_rooms_display_name_len'
  ) THEN
    ALTER TABLE public.space_rooms
      ADD CONSTRAINT space_rooms_display_name_len
      CHECK (display_name IS NULL OR char_length(display_name) <= 160);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'space_rooms_avatar_url_len'
  ) THEN
    ALTER TABLE public.space_rooms
      ADD CONSTRAINT space_rooms_avatar_url_len
      CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2048);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS space_rooms_host_retain_created_idx
  ON public.space_rooms (host_user_id, retain_instance, created_at DESC);
