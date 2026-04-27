# Репетиция cutover (staging на VPS)

Цель: убедиться, что self-hosted stack полностью заменяет облако для клиента `supabase-js`.

## Предусловия

- [ ] Поднят VPS stack (см. `docs/VPS_BOOTSTRAP.md`, `deploy/docker-compose.vps.yml`).
- [ ] Выполнен restore БД (см. [`MIGRATION_DB_RESTORE.md`](./MIGRATION_DB_RESTORE.md)).
- [ ] Зеркалирован Storage (см. [`MIGRATION_STORAGE.md`](./MIGRATION_STORAGE.md)).
- [ ] Задеплоены функции и webhooks (см. [`MIGRATION_FUNCTIONS_WEBHOOKS.md`](./MIGRATION_FUNCTIONS_WEBHOOKS.md)).
- [ ] WS `/ws` готов: `db_change` события и ограничения на broadcast (см. шаг 8 в `docs/SUPABASE_EXIT_RUNBOOK.md`).

## Переключение фронта на staging

В отдельной сборке или локально `.env`:

```env
VITE_API_BASE=https://<ваш-api-vps>
```

## Регрессия (ручной чеклист)

- [ ] Регистрация / вход / выход (ожидаемый разовый релогин при смене ключей).
- [ ] ЛС: список диалогов, отправка текста, реакция, редактирование.
- [ ] Группа / канал: лента, пост, комментарий.
- [ ] Загрузка аватара (`avatars`) и медиа в `messenger-media`; отображение signed URL.
- [ ] Realtime: непрочитанные, DM thread, group/channel thread, space room settings, presence mirror.
- [ ] `link-preview` из мессенджера (если включено в UI).
- [ ] Web Push: тестовое сообщение → webhook → функция (логи без 401).

## Критерий готовности к prod

Все пункты чеклиста зелёные; зафиксированы версии образов; есть план отката (см. [`MIGRATION_CUTOVER_PRODUCTION.md`](./MIGRATION_CUTOVER_PRODUCTION.md)).
