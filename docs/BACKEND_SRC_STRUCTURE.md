# backend/src structure (VPS sync checklist)

Этот файл фиксирует **фактическую** структуру `backend/src` на VPS (путь `/opt/vmix-replacer/backend/src`) на момент деплоя и служит чеклистом сверки перед следующими отправками/сборками.

## Зафиксировано (2026-04-24)

Вывод `ls -la /opt/vmix-replacer/backend/src`:

- `auth/`
- `channels/`
- `db.ts`
- `dm/`
- `env.ts`
- `files/`
- `groups/`
- `invites/`
- `index.ts`
- `s3.ts`
- `types/`
- `ws/`

### Связанные изменения (обновлено 2026-04-24)

- **Новые auth endpoints (backend)**: добавлены `/auth/forgot-password` и `/auth/reset-password` в `backend/src/auth/routes.ts` (reset-flow для переезда БД).
- **Новая миграция (backend/sql)**: `backend/sql/004_password_reset_tokens.sql` (таблица `public.password_reset_tokens`).
- **Импорт данных (локальные скрипты)**:
  - `scripts/make_redflow_import_from_csv.py` — генерация `dump.redflow.import.sql` из Supabase CSV exports.
  - `scripts/make_redflow_import_from_dump.py` — генерация импорта из `dump.sql` (первичный вариант).

## Правило работы

- Перед подготовкой деплоя сверять текущую структуру `backend/src` с этим списком.
- Если структура изменилась (добавились/удалились папки/файлы) — **сразу дописывать** изменения в этот файл.

