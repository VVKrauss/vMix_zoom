# Runbook: полный уход с Supabase → свой VPS + Postgres + API

**Статус прод-VPS:** на момент плана отдельного прод-сервера нет; Supabase ещё может использоваться параллельно до cutover.

**Легенда шагов**

- `[ ]` — не начато  
- `[~]` — в работе  
- `[x] 🎆` — готово (фейрверк в коммите / в этом файле фиксируем дату в скобках при мерже)

**Особое внимание (всегда)**

1. **Любое изменение стека или путей** — сразу править этот файл и при необходимости `docs/API_CONTRACT_V1.md` + ключевые пути внизу.  
2. **Не раздувать** устаревший слой: новые фичи — в `/api/v1` и доменные модули, не в `AllowedRpc` / произвольный `/api/db/*`.  
3. **Секреты** не в git: `deploy/api.env` только на сервере из `deploy/api.env.example`.  
4. **Релиз-архив:** не включать `*.tgz`, дампы, `node_modules` (см. `.cursor/rules/main.mdc`).

---

## Шаг 1 — Инвентарь фронта и зафиксированный контракт-скелет

**Цель:** один источник правды «что UI требует от бэкенда», без догадок.

- `[x] 🎆` Зафиксированы артефакты:
  - этот runbook (шаги 1–10);
  - `docs/API_CONTRACT_V1.md` — скелет контракта + таблица «фронт → сегодняшний HTTP/RPC».
- **Проверка:** в `API_CONTRACT_V1.md` есть разделы Auth, DB-legacy, Storage, WS, Functions, Push; указаны пути к модулям `src/`.

⚠️ При добавлении нового вызова API в UI — **в тот же PR** обновить инвентарь/контракт.

---

## Шаг 2 — First-party API (`/api/v1`)

**Цель:** доменные маршруты и `backend/src/domain/*`, без эмуляции `public.fn(...)`.

- `[x] 🎆` Часть v1 и домена: контакты, алиасы, mutes чтение — `backend/src/api/v1/register.ts`, `backend/src/domain/meContacts.ts`, `backend/src/domain/uuidList.ts`; те же три RPC в `index.ts` дергают домен.
- `[ ]` Остальные RPC → домен + маршруты v1 по мере переноса фронта.

⚠️ Не добавлять имена в `AllowedRpc` для **новых** сценариев — только для временной совместимости со старым фронтом.

---

## Шаг 3 — Фронт под контракт v1

**Цель:** убрать зависимость от `supabase.rpc` / `supabase.from` / shimx там, где есть v1.

- `[x] 🎆` Переведён домен контактов на v1 (кроме алиас-редактирования): `src/lib/socialGraph.ts` использует `src/api/meApi.ts` вместо RPC `list_my_contacts`, `list_my_contact_aliases`, `get_contact_statuses`, `set_user_favorite`, `hide_contact_from_my_list`, `set_user_block`, `search_registered_users`.
- `[x] 🎆` Переведено редактирование алиаса/аватара контакта на v1: убраны `set_my_contact_alias`, `set_my_contact_display_avatar` из `socialGraph`.
- `[x] 🎆` Переведены базовые sidebar-операции ЛС на v1: `ensure_self_direct_conversation`, `list_my_direct_conversations` (и unread count на их основе) — `src/lib/messenger.ts` → `src/api/messengerApi.ts`.
- `[x] 🎆` Переведена загрузка страницы DM сообщений на v1: `src/lib/messenger.ts` больше не использует `supabase.from('chat_messages')`.
- `[x] 🎆` Переведены DM мутации на v1: `append_direct_message`, `toggle_direct_message_reaction`, `edit_direct_message`, `delete_direct_message`, `mark_direct_conversation_read` больше не вызываются с фронта.
- `[x] 🎆` Убраны последние RPC из `messenger.ts`: `ensure_direct_conversation_with_user`, `get_direct_peer_read_receipt_context` → v1.
- `[x] 🎆` Переведены списки групп/каналов на v1: `list_my_group_chats`, `list_my_channels` больше не вызываются с фронта.
- `[x] 🎆` Переведены group/channel read + group messages page на v1: `mark_group_read`, `mark_channel_read`, `list_group_messages_page` больше не вызываются с фронта.
- `[x] 🎆` Переведены group message mutations на v1: `append_group_message`, `toggle_group_message_reaction`, `delete_group_message` больше не вызываются с фронта.
- `[x] 🎆` Переведён `channels.ts` целиком на v1: posts/comments/reactions + join/leave + create/update profile — больше нет `supabase.rpc` в `src/lib/channels.ts`.
- `[x] 🎆` Переведены join-requests + staff-management на v1: `chatRequests.ts`, `conversationMembers.ts`, `conversationStaff.ts` больше не вызывают `supabase.rpc`.
- `[x] 🎆` Переведён presence session на v1: `usePresenceSession.ts` больше не вызывает `supabase.rpc`.
- `[x] 🎆` Переведено presence-зеркало (`user_presence_public`) на v1: `useOnlinePresenceMirror.ts` больше не использует `supabase.from` / realtime.
- `[x] 🎆` Переведены последние `supabase.from`-модули на v1: `useProfileData.ts`, `siteNews.ts`, `messengerWebPush.ts`.
- `[x] 🎆` Убраны все `supabase.rpc(...)` в `src/` (переведено на `/api/v1/*` и/или временный `legacyRpc` поверх `/api/db/rpc/:name`).  
  `supabase.from(...)` в `src/` отсутствует; `src/lib/supabase.ts` остаётся как shim до удаления legacy `/api/db/*`.

⚠️ Не ломать `PUBLIC_ORIGIN` / CORS / cookie path для refresh без явной задачи.

---

## Шаг 4 — Схема БД portable (чистый Postgres)

**Цель:** один способ получить схему на пустой БД: миграции и/или schema-only, **без** зависимости от Supabase `auth.*` / RLS на `auth.uid()`.

- `[x] 🎆` Зафиксирован канон: **schema-only** файл `docs/db-schema.vps.sql` — это снимок **реально работающей** БД на VPS (pg_dump schema-only).
- `[x] 🎆` Документирована команда снятия + применения:
  - Снять на VPS (файл): `/tmp/db-schema.vps.actual.sql` (см. `docs/DATABASE.md`)
  - Применение (psql): `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/db-schema.vps.actual.sql`
  - Проверка (пример): `psql "$DATABASE_URL" -c "select 1 from public.users limit 1"`

⚠️ Любой `pg_dump` с прод-Supabase — не путать с «portable» без фильтрации схем.

---

## Шаг 5 — Чистый VPS (Docker + Caddy + systemd)

**Цель:** предсказуемое окружение: `deploy/cloud-init.yaml`, `docker-compose.vps.yml`, `/opt/redflow/{releases,shared,current}`.

- `[x] 🎆` Зафиксирован bootstrap-док: `docs/VPS_BOOTSTRAP.md` (cloud-init → релизы → schema apply → systemd → health).
- `[x] 🎆` Базовые артефакты VPS готовы: `deploy/cloud-init.yaml`, `deploy/docker-compose.vps.yml`, `deploy/Caddyfile`, `deploy/stack.env.example`, `deploy/api.env.example`.

⚠️ Первый `up` без схемы — API упадёт на запросах к БД; порядок: Postgres **→** DDL **→** API.
⚠️ systemd unit: `ExecStop` должен быть `docker-compose stop` (не `down`), иначе `stop/restart` удаляет контейнеры.
⚠️ TLS: при rate limit Let’s Encrypt можно временно тестировать по HTTP (потом вернуть HTTPS).

---

## Шаг 6 — Данные (опционально)

**Цель:** если нужна история — data-only / subset `public.*` после совместимой схемы и проверки FK.

- `[ ]` Иначе оставить пустую БД и регистрацию пользователей через новый auth.

⚠️ Subset дампа без FK-графа даёт «немые» чаты.

---

## Шаг 7 — S3 (Hetzner OS или иной)

**Цель:** avatars + messenger-media, `deploy/api.env.example` переменные заполнены на VPS.

- `[x] 🎆` Upload + signed URL + download + remove — пройден smoke на VPS (один бакет + prefix paths через `bucket`/`path`).

---

## Шаг 8 — Realtime (`/ws`) + совместимость с `src/api/realtimeClient.ts`

**Цель:** подписки `subscribe` / `unsubscribe`, события `db_change` как сейчас ожидает фронт.

- `[x] 🎆` WS scaffold проверен на VPS: `ws://.../ws?access_token=...` + `subscribe` + `broadcast` (echo через сервер).
- `[ ]` Довести до “db_change” событий (как ожидает Supabase realtime), и ограничить broadcast-правилами.

---

## Шаг 9 — Замена Edge + webhooks (Web Push и пр.)

**Цель:** `POST /api/functions/link-preview` и цепочка push без Supabase (внутренний HTTP + секрет, очередь или `pg_net` — решение зафиксировать в контракте).

- `[ ]` Документ `docs/MIGRATION_FUNCTIONS_WEBHOOKS.md` заменить ссылкой на актуальный дизайн в `API_CONTRACT_V1.md` или приложение.

⚠️ Секрет webhook ≠ JWT пользователя.

---

## Шаг 10 — Cutover и мониторинг

**Цель:** переключить фронт на свой API origin; Supabase отключить для этого приложения.

- `[ ]` Чеклист: health, логин, список чатов, сообщение, upload, ws, push (если включено).

---

## Ключевые пути (обновлять при изменениях)

| Компонент | Путь |
|-----------|------|
| Монолит API (временно auth, db-facade, ws, storage) | `backend/src/index.ts` |
| First-party v1 регистрация маршрутов | `backend/src/api/v1/register.ts` |
| Доменные запросы (пример) | `backend/src/domain/messengerLists.ts` |
| Каналы: create/join/posts/comments/reactions | `backend/src/domain/channels.ts` |
| Join requests + staff roles | `backend/src/domain/conversationJoinRequests.ts`, `backend/src/domain/conversationStaff.ts` |
| Presence (foreground/background) | `backend/src/domain/presence.ts`, `src/api/presenceApi.ts`, `src/hooks/usePresenceSession.ts` |
| Presence mirror (public) | `backend/src/domain/presenceMirror.ts`, `src/api/presenceMirrorApi.ts`, `src/hooks/useOnlinePresenceMirror.ts` |
| Me profile v1 | `backend/src/domain/meProfile.ts`, `src/api/meProfileApi.ts`, `src/hooks/useProfileData.ts` |
| Site news v1 | `backend/src/domain/siteNews.ts`, `src/api/siteNewsApi.ts`, `src/lib/siteNews.ts` |
| Push subscriptions v1 | `backend/src/domain/pushSubscriptions.ts`, `src/api/pushSubscriptionsApi.ts`, `src/lib/messengerWebPush.ts` |
| Контакты / алиасы / mutes (чтение) | `backend/src/domain/meContacts.ts` |
| Общий парсер списков id | `backend/src/domain/uuidList.ts` |
| Shim фронта | `src/lib/supabase.ts` |
| HTTP к legacy `/api/db/*` | `src/api/dbApi.ts` |
| Auth фронт | `src/api/authApi.ts` |
| Storage фронт | `src/api/storageApi.ts` |
| Channels API фронт | `src/api/channelApi.ts` |
| Conversation admin API фронт | `src/api/conversationAdminApi.ts` |
| WS клиент | `src/api/realtime.ts`, `src/api/realtimeClient.ts` |
| Compose VPS | `deploy/docker-compose.vps.yml` |
| Секреты пример | `deploy/api.env.example`, `deploy/stack.env.example` |
| Схема/данные (док) | `docs/DATABASE.md` |

---

## История отметок 🎆

| Дата | Шаг | Заметка |
|------|-----|---------|
| 2026-04-26 | 1 | Первичная фиксация runbook + `API_CONTRACT_V1.md` + правило Cursor. |
| 2026-04-26 | 2 (часть) | v1: `me/contacts`, `me/contact-aliases`, `me/conversation-notification-mutes`; домен + рефактор RPC. |
| 2026-04-26 | 3 (часть) | Фронт: `socialGraph` чтение контактов/алиасов переведено на `/api/v1/me/*`. |
| 2026-04-26 | 3 (часть) | Фронт: `socialGraph` статусы/поиск/блоки/избранное/скрытие переведены на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: `socialGraph` редактирование алиаса/аватара переведено на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: `messenger` self-direct + list direct conversations переведено на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: `messenger` DM messages page переведено на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: `messenger` DM append/reaction/edit/delete/read переведено на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: `messenger` ensure DM + peer receipts context переведено на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: `groups/channels` sidebar lists переведены на `/api/v1/me/conversations`. |
| 2026-04-26 | 3 (часть) | Фронт: `groups/channels` mark read + `groups` messages page переведены на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: `groups` append/reaction/delete переведены на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: `channels.ts` полностью переведён на `/api/v1` (posts/comments/reactions/join/leave/create/update). |
| 2026-04-26 | 3 (часть) | Фронт: join-requests + staff-management (`chatRequests`, `conversationMembers`, `conversationStaff`) переведены на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: presence foreground/background (`usePresenceSession`) переведено на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: online presence mirror (`useOnlinePresenceMirror`) переведено на `/api/v1`. |
| 2026-04-26 | 3 (часть) | Фронт: последние `supabase.from` (profile/siteNews/pushSubscriptions) переведены на `/api/v1`. |
| 2026-04-26 | 3 🎆 | Шаг 3 завершён: в `src/` больше нет `supabase.rpc` / `supabase.from`; остаётся только shim `src/lib/supabase.ts` до удаления legacy `/api/db/*`. |
| 2026-04-27 | 4 🎆 | Обновлён канон schema snapshot: `docs/db-schema.vps.sql` теперь = фактический `pg_dump --schema-only` с VPS (включая `app_realtime` и triggers). |
| 2026-04-26 | 5 🎆 | Зафиксирован clean VPS bootstrap: `docs/VPS_BOOTSTRAP.md` + артефакты `deploy/*` + systemd unit в cloud-init. |
| 2026-04-26 | 7 🎆 | S3 smoke на VPS: `/api/storage/upload` → `/api/storage/signed-url` → download → `/api/storage/remove` (один бакет, prefixes). |
| 2026-04-26 | 8 🎆 | WS smoke на VPS: `/ws?access_token=...` + `subscribe`/`broadcast` (scaffold). |
