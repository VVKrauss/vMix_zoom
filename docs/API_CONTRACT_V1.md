# Контракт API v1 (черновик) — замена вызовов Supabase/shim

Документ **живой**: любое изменение маршрутов, тел запросов или стека — обновлять здесь и в `docs/SUPABASE_EXIT_RUNBOOK.md`.

Базовый URL (prod): `https://api2.redflow.online`.  
Префикс нового API: **`/api/v1`** (см. `backend/src/api/v1/register.ts`).

---

## 1. Соглашения

- **Авторизация:** `Authorization: Bearer <access_token>` где указано «auth».
- **Ошибки:** JSON `{ "message": string }`; коды 400 / 401 / 403 / 500 — уточнить по мере реализации.
- **Поля в JSON:** целевой стиль **camelCase** для v1 (TBD: миграция с snake_case строк Postgres в ответах legacy).

---

## 2. Инвентарь: фронт → что вызывается сегодня

### 2.1 Auth (уже свой бэкенд, не Supabase)

| Назначение | Метод и путь | Модуль фронта |
|------------|----------------|---------------|
| Сессия | `GET /api/auth/session` | `src/api/authApi.ts` |
| Регистрация | `POST /api/auth/signup` | `src/api/authApi.ts` |
| Вход | `POST /api/auth/login` | `src/api/authApi.ts` |
| Выход | `POST /api/auth/logout` | `src/api/authApi.ts` |
| Пользователь | `GET /api/auth/user` | `src/api/authApi.ts` |
| Профиль | `PATCH /api/auth/profile` | `src/api/authApi.ts` |
| Сброс пароля | `POST /api/auth/password/reset` | `src/api/authApi.ts` |
| Подтвердить сброс пароля | `POST /api/auth/password/reset/confirm` | (ручной вызов / будущий UI) |
| Смена пароля | `POST /api/auth/password/update` | `src/api/authApi.ts` |
| Refresh | `POST /api/auth/refresh` (cookie) | `src/api/http.ts` |

### 2.2 Универсальный слой БД (legacy, убрать после v1)

| Назначение | Путь | Модуль |
|------------|------|--------|
| RPC по имени | `POST /api/db/rpc/:name` | `src/api/dbApi.ts` → весь `supabase.rpc` |
| Select many | `POST /api/db/select` | `src/api/dbApi.ts` |
| Select one | `POST /api/db/select-one` | `src/api/dbApi.ts` |
| Update | `PATCH /api/db/update` | `src/api/dbApi.ts` |
| Insert | `POST /api/db/insert` | `src/api/dbApi.ts` |
| Delete | `DELETE /api/db/delete` | `src/api/dbApi.ts` |

Имена RPC (уникальные вызовы из `src/`) — см. исторический список в обсуждении миграции или выполнить поиск `supabase.rpc(` по репозиторию.

### 2.3 Остатки «как у Supabase»: `supabase.from` (убрать полностью)

**Это не облако Supabase.** В проекте нет SDK к чужому Supabase: объект `supabase` — это **shim** в `src/lib/supabase.ts`, а `.from('…')` внутри него уходит в **`/api/db/select` / `update` / `insert`** на вашем API. Смысл той же формы API, что у PostgREST (таблица + фильтры), поэтому в коде до сих пор читается как `supabase.from`.

**Цель v1:** этих вызовов в приложении **не должно остаться** — только явные `fetch` / клиент к **`/api/v1/...`** (например `PATCH /api/v1/me/profile`, `POST /api/v1/site-news`, `PUT /api/v1/me/push-subscription` — точные пути задаём при реализации). Пока не переписали — ниже список **долга**, который нужно закрыть.

| Сейчас (через shim) | Файлы | Замена в v1 (TBD) |
|---------------------|--------|-------------------|
| `users` + `update` | `src/hooks/useProfileData.ts` | маршрут «настройки профиля / расширенные поля», не generic table update |
| `site_news` insert/delete | `src/lib/siteNews.ts` | маршруты модерации/новостей под роль |
| `push_subscriptions` upsert | `src/lib/messengerWebPush.ts` | маршрут подписок Web Push для текущего пользователя |

### 2.4 Storage

| Действие | Путь | Модуль |
|----------|------|--------|
| Upload multipart | `POST /api/storage/upload` | `src/api/storageApi.ts` |
| Signed URL | `POST /api/storage/signed-url` | `src/api/storageApi.ts` |
| Remove | `POST /api/storage/remove` | `src/api/storageApi.ts` |

### 2.5 Realtime

| Действие | Путь / протокол | Модуль |
|----------|-----------------|--------|
| WebSocket | `wss://…/ws` (same host as API) | `src/api/realtime.ts`, `realtimeClient.ts` |

### 2.6 Edge / Functions (замена Supabase Functions)

| Имя | Сегодня | Статус на backend |
|-----|---------|-------------------|
| `link-preview` | `POST /api/functions/link-preview` через `supabase.functions.invoke` (`src/lib/linkPreview.ts`) | **Реализовано** в `backend/src/index.ts` (fetch OpenGraph/SEO, YouTube oEmbed). |

**`POST /api/functions/link-preview`**

- **Auth**: да (Bearer)
- **Body**: `{ "url": string }` (http/https)
- **200**: `{ "url": string, "title"?: string, "description"?: string, "image"?: string, "siteName"?: string }`
- **200 (soft-error)**: `{ "url": string, "error": string }` (если fetch/parse не удался; UI может просто не показывать карточку)
- **400**: `{ "error": "invalid_url" }`

### 2.7 Отдельные сервисы (не входят в «Postgres API»)

| Область | База URL | Примечание |
|---------|----------|------------|
| Signaling / комнаты | `SIGNALING_HTTP` + `/api/frontend/...` | `src/hooks/useRoom.ts`, типы в `src/types/index.ts` |
| Админ метрики студии | тот же signaling, `/api/admin/*` | `src/api/adminStatsApi.ts`, `ServerSettingsModal.tsx` |

---

## 3. Уже заведённые маршруты `/api/v1`

| Метод | Путь | Auth | Тело запроса | Ответ (черновик) |
|-------|------|------|--------------|------------------|
| `GET` | `/api/v1/meta` | нет | — | `{ apiVersion, service, time }` |
| `GET` | `/api/v1/me/conversations` | да | — | `{ direct, groups, channels }` — массивы строк как из SQL (временно snake_case полей) |
|  |  |  |  | (группы/каналы уже читаются через этот endpoint: `src/lib/groups.ts`, `src/lib/channels.ts`) |
| `POST` | `/api/v1/me/conversations/self-direct` | да | `{}` | `{ conversationId }` — **используется фронтом** (`src/lib/messenger.ts`) |
| `GET` | `/api/v1/me/room-chat-conversations` | да | query: `limit`, `offset` | `{ rows, hasMore }` — архив room-чата — **используется фронтом** (`src/lib/chatArchive.ts`) |
| `GET` | `/api/v1/conversations/:conversationId/messages` | да | query: `limit`, `beforeCreatedAt?`, `beforeId?` | `{ messages, hasMoreOlder }` — **используется фронтом** (`src/lib/messenger.ts`) |
| `POST` | `/api/v1/conversations/:conversationId/read` | да | `{}` | `{ data }` — `{ ok, updated }` — **используется фронтом** (`src/lib/messenger.ts`) |
|  |  |  |  | (также используется для групп/каналов: `src/lib/groups.ts`, `src/lib/channels.ts`) |
| `POST` | `/api/v1/conversations/:conversationId/messages` | да | `{ body, kind, meta?, replyToMessageId?, quoteToMessageId? }` | `{ data }` — `{ ok, message_id, created_at }` — **используется фронтом** (`src/lib/messenger.ts`) |
| `POST` | `/api/v1/conversations/:conversationId/reactions` | да | `{ targetMessageId, emoji }` | `{ data }` — `{ ok, action, message_id, created_at }` — **используется фронтом** (`src/lib/messenger.ts`) |
| `PATCH` | `/api/v1/conversations/:conversationId/messages/:messageId` | да | `{ newBody }` | `{ data }` — `{ ok }` — **используется фронтом** (`src/lib/messenger.ts`) |
| `DELETE` | `/api/v1/conversations/:conversationId/messages/:messageId` | да | — | `{ data }` — `{ ok }` — **используется фронтом** (`src/lib/messenger.ts`) |
| `POST` | `/api/v1/me/conversations/direct-with-user` | да | `{ targetUserId, targetTitle? }` | `{ conversationId }` — **используется фронтом** (`src/lib/messenger.ts`) |
| `GET` | `/api/v1/conversations/:conversationId/direct-peer-receipt-context` | да | — | `{ data }` — `{ ok, peer_last_read_at, peer_dm_receipts_private }` — **используется фронтом** (`src/lib/messenger.ts`) |
| `GET` | `/api/v1/me/contacts` | да | — | `{ contacts }` — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/me/contact-aliases` | да | `{ "ids": string[] }` (до 500) | `{ rows }` — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/me/contact-alias` | да | `{ "contactUserId": string, "alias": string }` | `{ data }` — `{ ok, alias }` — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/me/contact-display-avatar` | да | `{ "contactUserId": string, "displayAvatarUrl": string }` | `{ data }` — `{ ok, display_avatar_url }` — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/me/conversation-notification-mutes` | да | `{ "ids": string[] }` (до 500 conversation id) | `{ rows }` — `conversation_id`, `muted` |
| `POST` | `/api/v1/me/contact-statuses` | да | `{ "targetUserIds": string[] }` | `{ rows }` — статусы пары (favorite / blocked) — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/me/favorites` | да | `{ "targetUserId": string, "favorite": boolean }` | `{ data }` — результат toggle favorite — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/me/blocks` | да | `{ "targetUserId": string, "block": boolean }` | `{ data }` — результат toggle block — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/me/contact-list-hides` | да | `{ "hiddenUserId": string }` | `{ data }` — hide + (опц.) удаление DM — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/users/search` | да | `{ "query": string, "limit": number }` | `{ rows }` — поиск пользователей — **используется фронтом** (`src/lib/socialGraph.ts`) |
| `POST` | `/api/v1/channels` | да | `{ title, isPublic, postingMode, commentsMode }` | `{ channelId }` — создать канал — **используется фронтом** (`src/lib/channels.ts`) |
| `PATCH` | `/api/v1/channels/:conversationId` | да | patch `{ title?, publicNick?, isPublic?, postingMode?, commentsMode?, avatarPath?, avatarThumbPath? }` | `{ data }` — `{ ok }` — **используется фронтом** (`src/lib/channels.ts`) |
| `POST` | `/api/v1/channels/:conversationId/join` | да | `{}` | `{ data }` — `{ ok }` — join public channel — **используется фронтом** (`src/lib/channels.ts`) |
| `POST` | `/api/v1/channels/:conversationId/leave` | да | `{}` | `{ data }` — `{ ok }` — leave — **используется фронтом** (`src/lib/channels.ts`) |
| `GET` | `/api/v1/channels/:conversationId/posts` | да | query: `limit`, `beforeCreatedAt?`, `beforeId?` | `{ posts, hasMoreOlder }` — **используется фронтом** (`src/lib/channels.ts`) |
| `GET` | `/api/v1/channels/:conversationId/posts/:postId/comments` | да | query: `limit`, `beforeCreatedAt?`, `beforeId?` | `{ comments, hasMoreOlder }` — **используется фронтом** (`src/lib/channels.ts`) |
| `POST` | `/api/v1/channels/:conversationId/reactions-for-targets` | да | `{ targetIds: string[] }` | `{ rows }` — реакции для постов/комментов — **используется фронтом** (`src/lib/channels.ts`) |
| `POST` | `/api/v1/channels/:conversationId/comment-counts` | да | `{ postIds: string[] }` | `{ rows }` — `{ post_id, comment_count }[]` — **используется фронтом** (`src/lib/channels.ts`) |
| `POST` | `/api/v1/channels/:conversationId/posts` | да | `{ body, meta? }` | `{ data }` — `{ ok, message_id, created_at }` — append rich post — **используется фронтом** (`src/lib/channels.ts`) |
| `POST` | `/api/v1/channels/:conversationId/feed` | да | `{ kind, body, meta? }` | `{ data }` — `{ ok, message_id, created_at }` — append feed message — **используется фронтом** (`src/lib/channels.ts`) |
| `POST` | `/api/v1/channels/:conversationId/comments` | да | `{ postId, body, quoteToMessageId? }` | `{ data }` — `{ ok, message_id, created_at }` — append comment — **используется фронтом** (`src/lib/channels.ts`) |
| `PATCH` | `/api/v1/channels/:conversationId/comments/:messageId` | да | `{ newBody }` | `{ data }` — `{ ok }` — edit comment — **используется фронтом** (`src/lib/channels.ts`) |
| `DELETE` | `/api/v1/channels/:conversationId/comments/:messageId` | да | — | `{ data }` — `{ ok }` — delete comment — **используется фронтом** (`src/lib/channels.ts`) |
| `PATCH` | `/api/v1/channels/:conversationId/posts/:messageId` | да | `{ newBody, meta? }` | `{ data }` — `{ ok }` — edit post — **используется фронтом** (`src/lib/channels.ts`) |
| `DELETE` | `/api/v1/channels/:conversationId/posts/:messageId` | да | — | `{ data }` — `{ ok, deleted }` — delete post — **используется фронтом** (`src/lib/channels.ts`) |
| `POST` | `/api/v1/channels/:conversationId/reactions` | да | `{ targetMessageId, emoji }` | `{ data }` — `{ ok, action, message_id, created_at }` — toggle reaction — **используется фронтом** (`src/lib/channels.ts`) |
| `GET` | `/api/v1/me/conversation-join-requests/:conversationId/pending` | да | — | `{ pending }` — **используется фронтом** (`src/lib/chatRequests.ts`) |
| `POST` | `/api/v1/me/conversation-join-requests` | да | `{ conversationId }` | `{ data }` — `{ ok, requested?, already_member?, required_plan? }` — **используется фронтом** (`src/lib/chatRequests.ts`) |
| `GET` | `/api/v1/conversations/:conversationId/join-requests` | да | — | `{ rows }` — `{ request_id, user_id, display_name, created_at }[]` — **используется фронтом** (`src/lib/chatRequests.ts`) |
| `POST` | `/api/v1/conversation-join-requests/approve` | да | `{ requestId }` | `{ data }` — `{ ok }` — **используется фронтом** (`src/lib/chatRequests.ts`) |
| `POST` | `/api/v1/conversation-join-requests/deny` | да | `{ requestId }` | `{ data }` — `{ ok }` — **используется фронтом** (`src/lib/chatRequests.ts`) |
| `GET` | `/api/v1/conversations/:conversationId/members/management` | да | — | `{ rows }` — `{ user_id, member_role, display_name }[]` — **используется фронтом** (`src/lib/conversationMembers.ts`) |
| `GET` | `/api/v1/conversations/:conversationId/members/basic` | да | — | `{ rows }` — `{ user_id, display_name, avatar_url }[]` — **используется фронтом** (`src/lib/chatArchive.ts`) |
| `POST` | `/api/v1/conversations/:conversationId/members/kick` | да | `{ targetUserId }` | `{ data }` — `{ ok }` — **используется фронтом** (`src/lib/conversationMembers.ts`) |
| `GET` | `/api/v1/conversations/:conversationId/staff` | да | — | `{ rows }` — `{ user_id, member_role, display_name }[]` — **используется фронтом** (`src/lib/conversationStaff.ts`) |
| `POST` | `/api/v1/conversations/:conversationId/staff/role` | да | `{ targetUserId, newRole }` | `{ data }` — `{ ok, error? }` — **используется фронтом** (`src/lib/conversationStaff.ts`) |
| `POST` | `/api/v1/me/presence/foreground-pulse` | да | `{}` | `{ ok: true }` — **используется фронтом** (`src/hooks/usePresenceSession.ts`) |
| `POST` | `/api/v1/me/presence/mark-background` | да | `{}` | `{ ok: true }` — **используется фронтом** (`src/hooks/usePresenceSession.ts`) |
| `GET` | `/api/v1/presence/public` | да | query: `ids=uuid,uuid,...` (до 200) | `{ rows }` — `{ user_id, last_active_at, presence_last_background_at, profile_show_online }[]` — **используется фронтом** (`src/hooks/useOnlinePresenceMirror.ts`) |
| `GET` | `/api/v1/me/profile` | да | — | `{ profile, roles, plan }` — **используется фронтом** (`src/hooks/useProfileData.ts`) |
| `PATCH` | `/api/v1/me/profile` | да | patch (snake_case, whitelist) | `{ ok: true }` — **используется фронтом** (`src/hooks/useProfileData.ts`) |
| `GET` | `/api/v1/site-news` | нет | — | `{ rows }` — **используется фронтом** (`src/lib/siteNews.ts`, `src/components/NewsPage.tsx`) |
| `POST` | `/api/v1/site-news` | да (staff) | `{ published_at, title, body, image_url? }` | `{ ok: true }` — **используется фронтом** (`src/lib/siteNews.ts`) |
| `PATCH` | `/api/v1/site-news/:id` | да (staff) | `{ published_at, title, body, image_url? }` | `{ ok: true }` — **используется фронтом** (`src/lib/siteNews.ts`) |
| `DELETE` | `/api/v1/site-news/:id` | да (staff) | — | `{ ok: true }` — **используется фронтом** (`src/lib/siteNews.ts`) |
| `GET` | `/api/v1/me/push-subscriptions/exists` | да | query: `endpoint` | `{ exists }` — **используется фронтом** (`src/lib/messengerWebPush.ts`) |
| `POST` | `/api/v1/me/push-subscriptions` | да | `{ endpoint, subscription, user_agent? }` | `{ ok: true }` — **используется фронтом** (`src/lib/messengerWebPush.ts`) |
| `DELETE` | `/api/v1/me/push-subscriptions` | да | query: `endpoint` | `{ ok: true }` — **используется фронтом** (`src/lib/messengerWebPush.ts`) |

Фронт переносим по доменам; как только модуль переведён — отмечаем в runbook шаг 3 🎆.

---

## 4. Следующие блоки v1 (TBD — заполнять по мере реализации)

- **Контакты / избранное / блоки:** запись и поиск (`set_user_favorite`, `search_registered_users`, …) — читать уже можно через v1 выше; остальное RPC из `src/lib/socialGraph.ts`.
- **DM / группы / каналы:** замена RPC из `src/lib/messenger.ts`, `groups.ts`, `channels.ts`.
- **Join / staff:** `src/lib/chatRequests.ts`, `conversationMembers.ts`, `conversationStaff.ts`.
- **Presence:** RPC из `src/hooks/usePresenceSession.ts` + чтение `user_presence_public`.
- **Push pipeline:** дизайн вместо Supabase webhooks — раздел 9 runbook.

---

## 5. Технологический стек (зафиксировано на момент последнего обновления)

| Слой | Технология | Примечание |
|------|------------|------------|
| API | Node 20, Fastify 5, `zod`, `pg` | `backend/package.json` |
| БД | PostgreSQL 17 (compose) | `deploy/docker-compose.vps.yml` |
| Прокси TLS | Caddy 2.9 | `deploy/Caddyfile` |
| Объекты | S3-совместимый (Hetzner и т.д.) | `deploy/api.env.example` |

*Обновлять таблицу при смене версий или добавлении сервисов.*
