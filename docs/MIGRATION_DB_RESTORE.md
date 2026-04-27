# Восстановление `dump.sql` в self-hosted Postgres (Supabase Docker)

Дамп в репозитории собран с **PostgreSQL 17.6**; первая строка может содержать `\restrict` (метакоманда `psql` новых версий). Используйте **клиент `psql` версии ≥ 17** на машине, с которой подключаетесь, либо выполняйте restore **внутри** контейнера `db` образа PG17.

## Вариант A: через `scripts/vps/db-restore.sh` (рекомендуется)

На VPS, в каталоге с `docker-compose.yml` официального `supabase/docker`:

```bash
# из репозитория приложения (после scp dump.sql на сервер)
bash /path/to/vmix-replacer/scripts/vps/db-restore.sh /path/to/dump.sql
```

Скрипт:

1. Находит контейнер сервиса `db`.
2. Копирует дамп внутрь контейнера.
3. Запускает `psql -v ON_ERROR_STOP=1 -f /tmp/dump-restore.sql`.

Переменные окружения:

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `SUPABASE_DOCKER_DIR` | текущая директория | где лежит `docker-compose.yml` |
| `DB_SERVICE` | `db` | имя сервиса Postgres в compose |

## Вариант B: вручную

```bash
docker compose ps
docker compose cp /path/to/dump.sql db:/tmp/dump.sql
docker compose exec db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/dump.sql
```

## После restore: владельцы и права

Дамп содержит `ALTER ... OWNER TO supabase_*`. Если какие-то роли отсутствуют, возможны предупреждения или ошибки на отдельных объектах.

Минимальная нормализация (пример; выполняйте осознанно под вашу схему ролей):

```sql
-- от суперпользователя postgres внутри контейнера
REASSIGN OWNED BY старая_роль TO postgres;
DROP OWNED BY старая_роль;
```

Точный набор ролей смотрите в логе `psql` после restore.

## Проверки целостности (примеры)

```sql
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC NULLS LAST
LIMIT 30;

SELECT count(*) FROM public.users;
SELECT count(*) FROM public.chat_messages;
SELECT count(*) FROM storage.objects;
```

Сверьте числа с облачным проектом до cutover.

## Логическая репликация (опционально)

Если объём данных велик и окно cutover должно быть секундами — настройте репликацию **до** переключения DNS (отдельная задача DBA); в репозитории оставлен только путь «полный restore + короткий freeze».
