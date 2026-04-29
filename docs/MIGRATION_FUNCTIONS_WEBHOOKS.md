# Edge Functions и Database Webhooks после переноса

Функции в репозитории: [`supabase/functions/`](../supabase/functions/).

| Функция | Назначение | JWT |
|---------|------------|-----|
| `send-dm-webpush` | Web Push при событиях в `chat_messages` | `verify_jwt = false` — вызов только с секретом webhook |
| `send-channel-webpush` | Web Push для канала | `verify_jwt = false` |
| `link-preview` | OpenGraph по URL из клиента | обычно с пользовательским JWT |

## Деплой на self-hosted

Используйте Supabase CLI с URL и ключом **VPS** проекта:

```bash
npx supabase@latest link --project-ref <local-ref-or-use-db-url>
# или задать SUPABASE_ACCESS_TOKEN / host по доке self-hosted CLI
npx supabase@latest functions deploy send-dm-webpush
npx supabase@latest functions deploy send-channel-webpush
npx supabase@latest functions deploy link-preview
```

Точные флаги для self-hosted см. в [документации Supabase CLI для self-hosting](https://supabase.com/docs/guides/cli) (параметры `--project-ref` / custom API URL зависят от версии CLI).

## Секреты (VPS / Studio / CLI)

На приёмнике должны совпасть с фронтом и БД:

- `WEBHOOK_PUSH_SECRET` — заголовок `Authorization: Bearer ...` из Database Webhook.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — пара VAPID; публичный дублируется во фронте (`VITE_VAPID_PUBLIC_KEY` в `.env.example`).
- `PUBLIC_APP_URL` — базовый URL сайта (для ссылок в пушах, если используется в коде функций).

Проверьте тела функций: [`send-dm-webpush`](../supabase/functions/send-dm-webpush/index.ts), [`send-channel-webpush`](../supabase/functions/send-channel-webpush/index.ts).

## Database Webhooks

В Supabase Dashboard (или Studio self-hosted) настройте webhooks:

- Таблица `public.chat_messages` (INSERT и при необходимости UPDATE) → URL `https://<API>/functions/v1/send-dm-webpush` с заголовком `Authorization: Bearer <WEBHOOK_PUSH_SECRET>`.

Повторите для сценария канала (`send-channel-webpush`), если отдельный триггер.

## Smoke end-to-end

1. Зарегистрировать Web Push на staging VPS.
2. Вставить тестовое сообщение в ЛС → в логах Edge нет 401 → попытка доставки в web-push (даже если endpoint мёртвый — не 401 на секрет).
