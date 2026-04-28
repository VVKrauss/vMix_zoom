# Перенос Supabase → VPS (runbook)

Порядок работ и артефакты в репозитории. План cutover: freeze → финальный дамп/Storage → переключение URL/ключей → smoke (релогин пользователей допустим).

| Шаг | Документ / каталог |
|-----|-------------------|
| Инвентаризация (таблицы, RPC, Storage, Realtime, Functions) | [MIGRATION_INVENTORY.md](./MIGRATION_INVENTORY.md) |
| Поднять stack на VPS | Self-hosted Supabase путь **удалён** (перешли на Fastify + Postgres + S3). См. `docs/SUPABASE_EXIT_RUNBOOK.md` и `deploy/docker-compose.vps.yml`. |
| Восстановить БД из `dump.sql` | [MIGRATION_DB_RESTORE.md](./MIGRATION_DB_RESTORE.md), [scripts/vps/db-restore.sh](../scripts/vps/db-restore.sh) |
| Зеркалировать Storage | [MIGRATION_STORAGE.md](./MIGRATION_STORAGE.md) (скрипт миграции из Supabase удалён после cutover). |
| Функции + Database Webhooks | [MIGRATION_FUNCTIONS_WEBHOOKS.md](./MIGRATION_FUNCTIONS_WEBHOOKS.md) |
| Репетиция staging | [MIGRATION_CUTOVER_STAGING.md](./MIGRATION_CUTOVER_STAGING.md) |
| Production cutover | [MIGRATION_CUTOVER_PRODUCTION.md](./MIGRATION_CUTOVER_PRODUCTION.md) |

## Быстрые команды

```bash
# Источник правды по текущему пути
cat docs/SUPABASE_EXIT_RUNBOOK.md
```
