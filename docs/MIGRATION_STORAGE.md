# Миграция Storage (avatars, messenger-media)

Бакеты из инвентаризации: см. [`MIGRATION_INVENTORY.md`](./MIGRATION_INVENTORY.md).

## Предусловия

Текущий целевой стек: **Fastify API + S3**, без Supabase Storage.

1. На **приёмнике** (S3) создан bucket (например `redflow-media`) и настроены ключи доступа.
2. Если нужно переносить объекты из Supabase Storage — используйте внешний инструмент миграции или временный скрипт (в репозитории supabase-скрипты удалены после cutover).

## Перенос

Рекомендуемая схема:

- **Скачивание** объектов из Supabase Storage (service role) любым надёжным способом.
- **Загрузка** в S3 с сохранением ключей вида:
  - `avatars/<path>`
  - `messenger-media/<path>`

## Верификация

1. Сравнить `SELECT bucket_id, count(*) FROM storage.objects GROUP BY 1` на источнике и приёмнике.
2. Выборочно открыть публичный URL для `avatars` и signed URL для `messenger-media`.

## npm

Скрипт `migrate:storage` удалён как legacy.
