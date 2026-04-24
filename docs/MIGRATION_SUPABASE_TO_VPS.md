# Migration context: Supabase → Self‑Hosted VPS

Цель: убрать Supabase (auth/db/storage/realtime/functions) и перейти на собственный backend + Postgres + S3 + Redis + socket.io, с работой из РФ без VPN.

## Договорённости (фиксируем заранее)

- **Supabase полностью убираем из frontend**: `@supabase/supabase-js` уходит.
- **Временная совместимость не приоритет**: лучше сразу проектировать “как надо”, без попыток сохранить старые контракты Supabase.
- **`VITE_SUPABASE_PROXY_ORIGIN` больше не нужен**: текущий механизм прокси для Supabase (`src/lib/supabase.ts`) — временное решение; в новой архитектуре источник API будет наш backend.

## Что именно используется из Supabase сейчас (по коду)

Ниже — фактическая инвентаризация вызовов в `src/` (апрель 2026). Это “контракт” того, что нужно заменить на собственные API/WS.

### Auth (`supabase.auth.*`)

- **Сессия/пользователь**: `getSession()`, `onAuthStateChange()`, `getUser()`
- **Логин/регистрация/выход**: `signUp()`, `signInWithPassword()`, `signOut()`
- **Сброс пароля**: `resetPasswordForEmail()`, `updateUser({ password })`

Ключевые файлы:
- `src/context/AuthContext.tsx`
- `src/components/ForgotPasswordPage.tsx`
- `src/components/ResetPasswordPage.tsx`

### Database: PostgREST (`supabase.from('table')…`)

Таблицы, которые дергаются напрямую с клиента:
- `push_subscriptions` (upsert)
- `users` (select/update)
- `space_rooms` (insert/select)
- `site_news` (insert/delete)
- `chat_conversation_members` (select)
- `chat_messages` (select с пагинацией/курсором)

Файлы (основные):
- `src/lib/messenger.ts`
- `src/hooks/useProfileData.ts`
- `src/lib/messengerWebPush.ts`
- `src/lib/spaceRoom.ts`
- `src/lib/siteNews.ts`
- `src/lib/profileSlugAvailability.ts`

### Database: RPC (`supabase.rpc('fn', payload)`)

Список обнаруженных RPC имён:
- `admin_access_info`
- `admin_delete_registered_user`
- `admin_list_registered_users`
- `admin_purge_stale_room_chats`
- `admin_set_user_global_role`
- `append_channel_comment`
- `append_channel_feed_message`
- `append_channel_post_rich`
- `append_direct_message`
- `append_group_message`
- `approve_conversation_join_request`
- `create_channel`
- `create_group_chat`
- `dashboard_room_stats_for_host`
- `delete_channel_comment`
- `delete_channel_post`
- `delete_direct_conversation_for_all`
- `delete_direct_message`
- `delete_group_message`
- `delete_my_account`
- `delete_owned_group_or_channel`
- `deny_conversation_join_request`
- `edit_channel_comment`
- `edit_channel_post_rich`
- `edit_direct_message`
- `ensure_direct_conversation_with_user`
- `ensure_self_direct_conversation`
- `get_app_version`
- `get_contact_statuses`
- `get_direct_peer_read_receipt_context`
- `get_my_conversation_notification_mutes`
- `get_or_create_conversation_invite`
- `get_public_conversation_guest_preview`
- `get_user_profile_for_peek`
- `get_user_public_profile_by_slug`
- `has_pending_conversation_join_request`
- `hide_contact_from_my_list`
- `host_leave_space_room`
- `join_conversation_by_invite`
- `join_public_channel`
- `join_public_group_chat`
- `leave_channel`
- `leave_direct_conversation`
- `leave_group_chat`
- `leave_room_chat_archive_entry`
- `list_channel_comment_counts`
- `list_channel_comments_page`
- `list_channel_posts_page`
- `list_channel_reactions_for_targets`
- `list_conversation_join_requests`
- `list_conversation_members_for_management`
- `list_conversation_members_for_mentions`
- `list_conversation_staff_members`
- `list_group_messages_page`
- `list_my_channels`
- `list_my_contact_aliases`
- `list_my_contacts`
- `list_my_direct_conversations`
- `list_my_group_chats`
- `list_room_chat_guest_senders_dashboard`
- `list_room_chat_registered_members_dashboard`
- `mark_channel_read`
- `mark_direct_conversation_read`
- `mark_group_read`
- `mark_my_mentions_read`
- `presence_mark_background`
- `remove_conversation_member_by_staff`
- `request_conversation_join`
- `resolve_conversation_by_invite`
- `search_open_public_conversations`
- `search_registered_users`
- `set_conversation_member_staff_role`
- `set_conversation_notifications_muted`
- `set_my_contact_alias`
- `set_my_contact_display_avatar`
- `set_user_block`
- `set_user_favorite`
- `toggle_channel_message_reaction`
- `toggle_direct_message_reaction`
- `toggle_group_message_reaction`
- `update_channel_profile`
- `update_group_profile`

Примечания:
- Сейчас значимая часть backend‑логики живёт в SQL функциях + (вероятно) RLS. При переезде это нужно перенести в Node.js сервисный слой (и/или частично оставить в БД как SQL, но уже без Supabase‑обвязки).

### Storage (`supabase.storage.from('bucket')…`)

Buckets:
- `avatars`
  - `getPublicUrl(path)`
  - `remove([...])`
- `messenger-media`
  - `upload(path, blob, { contentType, upsert })`
  - `createSignedUrl(path, expiresSec)`

Файлы:
- `src/hooks/useProfileData.ts`
- `src/lib/messenger.ts`

### Realtime (`supabase.channel(...)`)

Используется во многих компонентах/хуках (чаты/комнаты/присутствие):
- `supabase.channel(<topic>)`
- `supabase.removeChannel(channel)`

Это будет заменено на socket.io (с JWT авторизацией) и перечень событий/комнат нужно сопоставить по существующим “топикам”.

### Edge Functions (`supabase.functions.invoke`)

- `link-preview` — получение превью для URL в сообщениях.

Файл:
- `src/lib/linkPreview.ts`

## Важные следствия для новой архитектуры

- **Нужно покрыть забытые фичи из UI**: сейчас уже есть flow `Forgot/Reset password`, значит в новом backend нужны соответствующие эндпоинты/письма.
- **Storage приватный**: UI ожидает signed URL для отображения медиа, а не публичные ссылки.
- **Realtime семантика**: заменить “каналы Supabase” на socket.io rooms/events, сохранив UX (typing/presence/new message/unread).

## TODO (переезд, уровень “карты работ”)

- Собрать соответствие: `rpc(fn)` → `HTTP endpoint / service method` (и права доступа).
- Собрать соответствие: `from(table)` → `HTTP endpoint` (или включить в сервис).
- Собрать соответствие: `channel(topic)` → `socket.io room/event` + payload contracts.
- Заменить `link-preview` edge function на backend handler.

## Карта замены: Supabase → будущие HTTP/WS (черновик)

Это рабочая “карта контрактов” для бэкенда. По мере реализации сюда добавляем request/response схемы и права доступа.

### Auth

Текущее:
- `supabase.auth.signUp({ email, password, options.data.display_name })`
- `supabase.auth.signInWithPassword({ email, password })`
- `supabase.auth.getSession()` / `onAuthStateChange()`
- `supabase.auth.signOut()`
- `supabase.auth.resetPasswordForEmail(email, …)` / `supabase.auth.updateUser({ password })`

Будущее (HTTP):
- `POST /auth/register` → создаёт пользователя, возвращает access+refresh (или только access) + профиль
- `POST /auth/login` → access+refresh
- `POST /auth/refresh` → новый access (+ rotation refresh)
- `POST /auth/logout` → инвалидировать refresh/session
- `GET /me` → профиль текущего пользователя
- `POST /auth/forgot-password` → письмо со ссылкой/кодом
- `POST /auth/reset-password` → смена пароля по токену/коду

### Link preview (замена Edge Function)

Текущее:
- `supabase.functions.invoke('link-preview', { body: { url } })`

Будущее (HTTP):
- `POST /link-preview` `{ url }` → `{ url, title?, description?, image?, siteName? }` (с таймаутом и whitelist/anti-SSRF)

### Storage (S3)

Текущее:
- `storage.from('avatars').getPublicUrl(path)` + `remove([...])`
- `storage.from('messenger-media').upload(...)`
- `storage.from('messenger-media').createSignedUrl(path, expiresSec)`

Будущее (HTTP):
- `POST /files/presign-upload` → presigned URL + `fileId` (в т.ч. content-type/size constraints)
- `POST /files/complete-upload` → фиксирует файл в БД, привязка к сущности (avatar/message)
- `GET /files/:id` → signed download URL (или redirect)
- (опционально) `DELETE /files/:id` → удалить объект + запись

Buckets как понятие в API не показываем; остаётся “тип файла/назначение”: `avatar`, `messenger_media`, …

### DB: прямые таблицы `from(...)` (перевод в HTTP)

- `users` (select/update) → `PATCH /me` (и `GET /users/:id`/`GET /users/by-slug/:slug` где нужно)
- `push_subscriptions` (upsert) → `PUT /push/subscriptions` (upsert по endpoint/keys)
- `site_news` (insert/delete) → `POST /admin/site-news`, `DELETE /admin/site-news/:id`
- `space_rooms` (insert/select поля модерации) → `POST /space-rooms`, `GET /space-rooms/:slug/mod-state`
- `chat_messages` (select page) → `GET /dm/:conversationId/messages?before=...&limit=...`
- `chat_conversation_members` (select last_read_at) → обычно не нужно наружу; заменить на `GET /dm/:conversationId/read-state`

### DB: RPC `rpc(...)` (перевод в HTTP и/или WS)

Правило: **всё, что сейчас `rpc()` — это backend service method**, а HTTP — внешний контракт.

Минимальный набор для мессенджера (как основа):
- `list_my_direct_conversations` → `GET /dm`
- `ensure_direct_conversation_with_user` → `POST /dm` `{ targetUserId }`
- `list_direct_messages_page` (сейчас через `from(chat_messages)` fallback) → `GET /dm/:id/messages`
- `append_direct_message` → `POST /dm/:id/messages`
- `mark_direct_conversation_read` → `POST /dm/:id/read`
- `toggle_direct_message_reaction` → `POST /dm/:id/messages/:msgId/reactions`
- `edit_direct_message` → `PATCH /dm/:id/messages/:msgId`
- `delete_direct_message` → `DELETE /dm/:id/messages/:msgId`

Группы/каналы (следующий слой):
- `list_my_group_chats` → `GET /groups`
- `create_group_chat` → `POST /groups`
- `join_public_group_chat` / `leave_group_chat` → `POST /groups/:id/join`, `POST /groups/:id/leave`
- `list_group_messages_page` → `GET /groups/:id/messages`
- `append_group_message` → `POST /groups/:id/messages`

Админка:
- `admin_access_info` → `GET /admin/access`
- `admin_list_registered_users` → `GET /admin/users`
- `admin_set_user_global_role` → `PATCH /admin/users/:id/role`
- `admin_delete_registered_user` → `DELETE /admin/users/:id`

Presence:
- `presence_mark_background` → заменить на WS heartbeat/ack (не HTTP), плюс серверный presence cache (Redis).

### Realtime: `channel(topic)` → socket.io

Текущее: `supabase.channel("<topic>")` с разными топиками (dm/thread/group/room-mod/…).

Будущее (socket.io):
- Rooms: `dm:<conversationId>`, `group:<conversationId>`, `channel:<conversationId>`, `room-mod:<roomId|slug>`
- Events (база):
  - Client→Server: `room:join`, `room:leave`, `message:send`, `typing:start`, `typing:stop`
  - Server→Client: `message:new`, `typing:update`, `user:online`, `user:offline`

Детализация payload’ов и список всех room topics — отдельным шагом (нужно снять из текущего кода `supabase.channel(`...`)`).

#### Фактические топики Supabase Realtime (снято из кода)

Ниже перечислены все `channel(\`...\`)`, найденные в `src/` (на момент инвентаризации), и что на них подписывается.

- **`mentions-${uid}`**
  - **Тип**: `postgres_changes`
  - **Событие**: `INSERT`
  - **Таблица**: `public.chat_message_mentions`
  - **Фильтр**: `user_id=eq.${uid}`
  - **Назначение**: in-app уведомления/бейджи упоминаний (когда диалог не в фокусе).
- **`dm-thread:${conversationId}`**
  - **Тип**: `postgres_changes`
  - **События**: `INSERT` / `UPDATE` / `DELETE`
  - **Таблица**: `public.chat_messages`
  - **Фильтр**: `conversation_id=eq.${conversationId}`
  - **Назначение**: realtime лента ЛС (новые/изменённые/удалённые сообщения), звук, mark-read debounce.
- **`dm-peer-read:${conversationId}`**
  - **Тип**: `postgres_changes`
  - **Событие**: `UPDATE`
  - **Таблица**: `public.chat_conversation_members`
  - **Фильтр**: `conversation_id=eq.${conversationId}`
  - **Назначение**: обновление `last_read_at` собеседника (индикаторы “прочитано”).
- **`messenger-my-reads:${uid}`**
  - **Тип**: `postgres_changes`
  - **Событие**: `UPDATE`
  - **Таблица**: `public.chat_conversation_members`
  - **Фильтр**: `user_id=eq.${uid}`
  - **Назначение**: синхронизация “прочитано” между устройствами (сброс unread в списке).
- **`messenger-unread:${uid}`**
  - **Тип**: `postgres_changes`
  - **События**:
    - `INSERT` на `public.chat_messages` (без фильтра) — сигнал “что-то новое” + диспатч фонового события
    - `UPDATE` на `public.chat_conversation_members` с фильтром `user_id=eq.${uid}` — пересчёт бейджа/непрочитанных
  - **Назначение**: единый канал “бейдж непрочитанных + фоновые новые сообщения”.
- **`channel-thread:${conversationId}`**
  - **Назначение**: realtime тред канала (детали см. `src/components/messenger/ChannelThreadPane.tsx`).
- **`group-thread:${conversationId}`**
  - **Назначение**: realtime тред группы (детали см. `src/components/messenger/GroupThreadPane.tsx`).
- **`space_room:${slug}`**
  - **Тип**: `postgres_changes`
  - **Событие**: `*`
  - **Таблица**: `public.space_rooms`
  - **Фильтр**: `slug=eq.${slug}`
  - **Назначение**: live-обновление настроек room (access_mode, visibility, status, admins…).
- **`presence-mirror:${ids.length}-${ids[0]?.slice(0, 8)}`**
  - **Назначение**: “зеркало” онлайна/присутствия (детали см. `src/hooks/useOnlinePresenceMirror.ts`).
- **`messenger-member-self-delete:${uid}`**
  - **Назначение**: realtime сигнал о само-удалении membership (детали см. `src/hooks/useMessengerSelfMembershipDeleteRealtime.ts`).
- **`room-mod:${slug}`**
  - **Тип**: `broadcast` (и местами доп. подписки)
  - **События (broadcast)**: `join-request`, `join-approved`, `join-request-denied`, `host-transfer-claimed`
  - **Назначение**: модерация входа в room и “перехват хоста” между устройствами.
- **`room-approval-watch:${slug}:${userId}`**
  - **Тип**: `postgres_changes`
  - **Событие**: `UPDATE`
  - **Таблица**: `public.space_rooms`
  - **Фильтр**: `slug=eq.${slug}`
  - **Назначение**: гостю/юзеру “триггер” проверить, что его одобрили (fallback поверх broadcast).

#### Предлагаемая замена топиков на socket.io rooms/events

Принцип: вместо “слушаем изменения Postgres” клиент слушает **доменные события** от backend.

- **`mentions-${uid}`** → room `user:${uid}`
  - server event: `mention:new` `{ conversationId, messageId, ... }`
- **`dm-thread:${cid}`** → room `dm:${cid}`
  - server events: `message:new`, `message:updated`, `message:deleted`
- **`dm-peer-read:${cid}`** + **`messenger-my-reads:${uid}`** → room `dm:${cid}` и/или `user:${uid}`
  - server event: `dm:read-updated` `{ conversationId, userId, lastReadAt }`
- **`messenger-unread:${uid}`** → room `user:${uid}`
  - server event: `unread:changed` `{ totals, byConversation? }`
  - server event: `bg-message:new` (если нужен отдельный сигнал)
- **`space_room:${slug}`** → room `space-room:${slug}`
  - server event: `space-room:updated` `{ patch | full }`
- **`room-mod:${slug}`** + **`room-approval-watch...`** → room `room-mod:${slug}` + room `user:${uid}`
  - client→server: `room:join-request` payload `{ requestId, userId?, displayName }`
  - server→host: `room:join-requested`
  - host→server: `room:join-approve` / `room:join-deny`
  - server→user: `room:join-approved` / `room:join-denied`

## Socket.io: контракты событий (минимум для реализации)

Ниже — минимальный контракт, которого достаточно, чтобы заменить текущие realtime‑сценарии Supabase.
Формат — “event name” и JSON payload. Точные поля можно расширять, но удалять/переименовывать — только через версионирование.

### Подключение и авторизация

- **Handshake**: клиент подключается с JWT access token.
  - **Вариант A (рекомендуется)**: `io({ auth: { token: "<access>" } })`
  - **Вариант B**: `Authorization: Bearer <access>` в extraHeaders (если окружение позволяет)
- **Server→Client**: `auth:invalid` `{ reason: "expired" | "invalid" }` → клиент делает refresh и переподключается.

### Общие комнаты

- **Server** автоматически подписывает сокет на:
  - `user:<userId>` (персональная комната)
- **Client→Server**: `room:join` `{ room: "dm:<cid>" | "space-room:<slug>" | "room-mod:<slug>" | "group:<cid>" | "channel:<cid>" }`
- **Client→Server**: `room:leave` `{ room: "<same>" }`
- **Server→Client**: `room:joined` `{ room }` / `room:left` `{ room }` (опционально, для дебага/UI)

### DM (личные сообщения)

#### Отправка сообщения

- **Client→Server**: `dm:message:send`

Payload:
- `conversationId: string`
- `clientMessageId: string` (локальный id для идемпотентности/сопоставления, например `local-...`)
- `kind: "text" | "image" | "audio" | "reaction" | "system"` (минимум: text/image/audio/reaction)
- `body: string`
- `meta?: object | null` (json, как сейчас `meta` в БД)
- `replyToMessageId?: string | null`

- **Server→Client (ACK)**: `dm:message:sent`

Payload:
- `conversationId: string`
- `clientMessageId: string`
- `message: { id: string; createdAt: string; senderUserId: string | null; kind: string; body: string; meta?: object | null; replyToMessageId?: string | null; editedAt?: string | null }`

Ошибки:
- **Server→Client**: `dm:message:error` `{ conversationId, clientMessageId, error: "not_member" | "blocked" | "rate_limited" | "validation" | "unknown" }`

#### Новое сообщение (всем подписанным)

- **Server→Client**: `dm:message:new` (в room `dm:<cid>`)

Payload:
- `conversationId: string`
- `message: { ...как выше... }`

#### Редактирование/удаление

- **Client→Server**: `dm:message:edit` `{ conversationId, messageId, newBody }`
- **Server→Client**: `dm:message:updated` `{ conversationId, message: { id, editedAt, body, meta? } }`

- **Client→Server**: `dm:message:delete` `{ conversationId, messageId }`
- **Server→Client**: `dm:message:deleted` `{ conversationId, messageId }`

#### Реакции

- **Client→Server**: `dm:reaction:toggle` `{ conversationId, messageId, emoji }`
- **Server→Client**: `dm:reaction:updated` `{ conversationId, messageId, emoji, action: "added" | "removed", createdAt?: string | null }`

#### Typing

- **Client→Server**: `dm:typing:start` `{ conversationId }`
- **Client→Server**: `dm:typing:stop` `{ conversationId }`
- **Server→Client**: `dm:typing:update` `{ conversationId, userId, typing: boolean }`

#### Read receipts / last_read_at

- **Client→Server**: `dm:read:mark` `{ conversationId, lastReadAt: string }`
  - `lastReadAt` — ISO, как сейчас `chat_conversation_members.last_read_at`
- **Server→Client**: `dm:read:updated` `{ conversationId, userId, lastReadAt: string }`
  - отправляется в room `dm:<cid>` (для “peer read”) и/или `user:<uid>` (для синка между устройствами)

### Mentions / Unread (замена `mentions-*` и `messenger-unread:*`)

- **Server→Client**: `mention:new` (room `user:<uid>`)
  - `{ conversationId: string, messageId: string, createdAt: string }`

- **Server→Client**: `unread:changed` (room `user:<uid>`)
  - `{ total: number, byConversation?: Record<string, number> }`

### Space room settings (замена `space_room:*`)

- **Server→Client**: `space-room:updated` (room `space-room:<slug>`)
  - `{ slug: string, patch: { chatVisibility?, accessMode?, status?, hostUserId?, roomAdminUserIds? } }`

### Room approval/mod (замена `room-mod:*` и `room-approval-watch:*`)

#### Гость просит вход

- **Client→Server**: `room:join-request`
  - `{ slug: string, requestId: string, userId?: string | null, displayName: string }`

- **Server→Client (host)**: `room:join-requested` (room `room-mod:<slug>`)
  - `{ slug: string, requestId: string, userId?: string | null, displayName: string, receivedAt: number }`

#### Хост решает

- **Client→Server (host)**: `room:join-approve` `{ slug: string, requestId: string, userId?: string | null }`
- **Client→Server (host)**: `room:join-deny` `{ slug: string, requestId: string, userId?: string | null }`

- **Server→Client (user)**: `room:join-approved` `{ slug: string, requestId: string }`
- **Server→Client (user)**: `room:join-denied` `{ slug: string, requestId: string }`

#### Перехват хоста (если сохраняем фичу)

- **Server→Client**: `room:host-transfer-claimed` `{ slug: string }` (room `room-mod:<slug>`)

## HTTP API: контракты (минимум для реализации)

Цель: заменить все текущие `rpc()`/`from()` вызовы и supabase-auth на единый HTTP API.

### Общие правила

- **Base URL**: `https://api.<domain>/` (или один домен с фронтом, если так проще)
- **Auth заголовок**: `Authorization: Bearer <accessToken>`
- **Формат**: JSON в обе стороны (`Content-Type: application/json`)
- **Idempotency** (для POST с риском дублей): заголовок `Idempotency-Key: <uuid>` (опционально, но очень полезно)

#### Ошибки (единый формат)

Ответы ошибок (4xx/5xx) возвращают:

```json
{
  "error": {
    "code": "string_machine_code",
    "message": "human readable",
    "details": { }
  }
}
```

Минимальный набор `error.code`:
- `unauthorized` (нет/невалидный токен)
- `forbidden` (нет прав)
- `not_found`
- `validation_error`
- `conflict`
- `rate_limited`
- `internal_error`

### Auth

#### POST `/auth/register`

Request:

```json
{ "email": "user@mail.com", "password": "secret", "displayName": "Name" }
```

Response 200:

```json
{
  "user": { "id": "uuid", "email": "user@mail.com", "displayName": "Name", "avatarUrl": null },
  "tokens": { "accessToken": "jwt", "refreshToken": "opaque_or_jwt", "expiresIn": 3600 }
}
```

Errors:
- 409 `conflict` (email занята)
- 400 `validation_error`

#### POST `/auth/login`

Request:

```json
{ "email": "user@mail.com", "password": "secret" }
```

Response 200: как `/auth/register`.

Errors:
- 401 `unauthorized` (неверные креды)

#### POST `/auth/refresh`

Request:

```json
{ "refreshToken": "..." }
```

Response 200:

```json
{ "tokens": { "accessToken": "jwt", "refreshToken": "new_refresh", "expiresIn": 3600 } }
```

Errors:
- 401 `unauthorized` (refresh недействителен/просрочен)

#### POST `/auth/logout`

Request:

```json
{ "refreshToken": "..." }
```

Response 200:

```json
{ "ok": true }
```

#### GET `/me`

Headers: `Authorization: Bearer ...`

Response 200:

```json
{ "user": { "id": "uuid", "email": "user@mail.com", "displayName": "Name", "avatarUrl": null } }
```

#### POST `/auth/forgot-password`

Request:

```json
{ "email": "user@mail.com" }
```

Response 200:

```json
{ "ok": true }
```

Примечание: всегда 200, чтобы не раскрывать наличие email.

#### POST `/auth/reset-password`

Request:

```json
{ "token": "reset_token", "newPassword": "new_secret" }
```

Response 200:

```json
{ "ok": true }
```

### Files (S3)

#### POST `/files/presign-upload`

Headers: `Authorization: Bearer ...`

Request:

```json
{
  "purpose": "avatar" | "messenger_media",
  "contentType": "image/jpeg",
  "sizeBytes": 12345,
  "fileName": "photo.jpg"
}
```

Response 200:

```json
{
  "file": { "id": "uuid", "purpose": "avatar", "contentType": "image/jpeg", "sizeBytes": 12345 },
  "upload": { "method": "PUT", "url": "https://s3/...", "headers": { } }
}
```

Errors:
- 400 `validation_error` (тип/размер запрещён)
- 413 `validation_error` (слишком большой)

#### POST `/files/complete-upload`

Request:

```json
{ "fileId": "uuid" }
```

Response 200:

```json
{ "ok": true }
```

#### GET `/files/:id`

Response 200:

```json
{ "url": "https://signed-download/...", "expiresIn": 3600 }
```

### DM (личные чаты)

#### GET `/dm`

Response 200:

```json
{
  "items": [
    {
      "id": "cid",
      "title": "Личный чат",
      "kind": "direct",
      "createdAt": "iso",
      "lastMessageAt": "iso_or_null",
      "lastMessagePreview": "text_or_null",
      "messageCount": 0,
      "unreadCount": 0,
      "otherUserId": "uuid_or_null",
      "avatarUrl": "url_or_null"
    }
  ]
}
```

#### POST `/dm`

Request:

```json
{ "targetUserId": "uuid", "title": null }
```

Response 200:

```json
{ "conversationId": "cid" }
```

Errors:
- 403 `forbidden` (dm_not_allowed / blocked)

#### GET `/dm/:conversationId/messages`

Query:
- `limit` (1..100)
- `beforeCreatedAt` (ISO)
- `beforeId` (string)

Response 200:

```json
{
  "items": [
    {
      "id": "mid",
      "senderUserId": "uuid_or_null",
      "senderNameSnapshot": "string",
      "kind": "text|image|audio|reaction|system",
      "body": "string",
      "meta": {},
      "createdAt": "iso",
      "editedAt": null,
      "replyToMessageId": null,
      "quoteToMessageId": null
    }
  ],
  "hasMoreOlder": false
}
```

#### POST `/dm/:conversationId/messages`

Request:

```json
{
  "clientMessageId": "local-...",
  "kind": "text",
  "body": "hi",
  "meta": null,
  "replyToMessageId": null
}
```

Response 200:

```json
{ "messageId": "mid", "createdAt": "iso" }
```

#### POST `/dm/:conversationId/read`

Request:

```json
{ "lastReadAt": "iso" }
```

Response 200:

```json
{ "ok": true }
```

#### PATCH `/dm/:conversationId/messages/:messageId`

Request:

```json
{ "newBody": "edited" }
```

Response 200:

```json
{ "ok": true }
```

#### DELETE `/dm/:conversationId/messages/:messageId`

Response 200:

```json
{ "ok": true }
```

#### POST `/dm/:conversationId/messages/:messageId/reactions`

Request:

```json
{ "emoji": "👍" }
```

Response 200:

```json
{ "action": "added" | "removed" }
```

### Groups (групповые чаты)

Покрывает текущие RPC:
- `list_my_group_chats`
- `create_group_chat`
- `join_public_group_chat`
- `leave_group_chat`
- `add_users_to_group_chat`
- `list_group_messages_page`
- `append_group_message`
- `toggle_group_message_reaction`
- `delete_group_message`
- `update_group_profile`
- `get_or_create_conversation_invite`
- `resolve_conversation_by_invite`
- `join_conversation_by_invite`
- `mark_group_read`

#### GET `/groups`

Response 200:

```json
{ "items": [ { "id": "cid", "title": "Group", "isPublic": false, "createdAt": "iso", "unreadCount": 0 } ] }
```

#### POST `/groups`

Request:

```json
{ "title": "Group", "isPublic": false }
```

Response 200:

```json
{ "groupId": "cid" }
```

#### POST `/groups/:groupId/join`

Request:

```json
{ "inviteToken": null }
```

Response 200:

```json
{ "ok": true }
```

#### POST `/groups/:groupId/leave`

Response 200:

```json
{ "ok": true }
```

#### POST `/groups/:groupId/members`

Request:

```json
{ "userIds": ["uuid"] }
```

Response 200:

```json
{ "ok": true }
```

#### GET `/groups/:groupId/messages`

Query: `limit`, `beforeCreatedAt`, `beforeId`

Response 200: как DM messages list (items + hasMoreOlder).

#### POST `/groups/:groupId/messages`

Request:

```json
{ "clientMessageId": "local-...", "kind": "text", "body": "hi", "meta": null, "replyToMessageId": null }
```

Response 200:

```json
{ "messageId": "mid", "createdAt": "iso" }
```

#### POST `/groups/:groupId/read`

Request:

```json
{ "lastReadAt": "iso" }
```

Response 200:

```json
{ "ok": true }
```

#### POST `/groups/:groupId/messages/:messageId/reactions`

Request:

```json
{ "emoji": "👍" }
```

Response 200:

```json
{ "action": "added" | "removed" }
```

#### DELETE `/groups/:groupId/messages/:messageId`

Response 200:

```json
{ "ok": true }
```

#### PATCH `/groups/:groupId/profile`

Request (patch):

```json
{ "title": "New title", "avatarFileId": null, "isPublic": true }
```

Response 200:

```json
{ "ok": true }
```

#### Invites

- `POST /invites` → создать инвайт на conversation/group/channel

Request:

```json
{ "conversationId": "cid" }
```

Response 200:

```json
{ "token": "invite_token", "url": "https://app/.../invite?token=..." }
```

- `GET /invites/:token/resolve` → превью (title/isPublic/needsApproval)
- `POST /invites/:token/join` → вступить (если можно)

> Примечание (важно для порядка работ): пока **data migration из Supabase ещё не сделан** и БД на VPS “пустая”,
> инвайты **не на что выписывать**, потому что нет существующих `conversationId`.
> Для проверки инвайтов на этом этапе нужно сначала **создать тестовую группу/канал через API** (seed),
> получить `conversationId`, и уже на него делать `POST /invites`.

### Channels (каналы/посты/комменты)

Покрывает текущие RPC:
- `list_my_channels`
- `create_channel`
- `update_channel_profile`
- `join_public_channel`
- `leave_channel`
- `mark_channel_read`
- `list_channel_posts_page`
- `append_channel_post_rich`
- `edit_channel_post_rich`
- `delete_channel_post`
- `list_channel_comments_page`
- `append_channel_comment`
- `edit_channel_comment`
- `delete_channel_comment`
- `toggle_channel_message_reaction`
- `list_channel_comment_counts`
- `list_channel_reactions_for_targets`

#### GET `/channels`

Response 200:

```json
{ "items": [ { "id": "cid", "title": "Channel", "isPublic": true, "unreadCount": 0 } ] }
```

#### POST `/channels`

Request:

```json
{ "title": "Channel", "isPublic": true }
```

Response 200:

```json
{ "channelId": "cid" }
```

#### PATCH `/channels/:channelId/profile`

Request:

```json
{ "title": "New title", "avatarFileId": null, "isPublic": true }
```

Response 200:

```json
{ "ok": true }
```

#### POST `/channels/:channelId/join` / POST `/channels/:channelId/leave`

Response 200:

```json
{ "ok": true }
```

#### POST `/channels/:channelId/read`

Request:

```json
{ "lastReadAt": "iso" }
```

Response 200:

```json
{ "ok": true }
```

#### Posts

- `GET /channels/:channelId/posts?limit=&beforeCreatedAt=&beforeId=`
- `POST /channels/:channelId/posts` (rich payload)
- `PATCH /channels/:channelId/posts/:postId`
- `DELETE /channels/:channelId/posts/:postId`

#### Comments

- `GET /channels/:channelId/posts/:postId/comments?...`
- `POST /channels/:channelId/posts/:postId/comments`
- `PATCH /channels/:channelId/posts/:postId/comments/:commentId`
- `DELETE /channels/:channelId/posts/:postId/comments/:commentId`

#### Reactions

- `POST /channels/:channelId/reactions`

Request:

```json
{ "targetKind": "post" | "comment", "targetId": "id", "emoji": "👍" }
```

Response 200:

```json
{ "action": "added" | "removed" }
```

### Social graph / Contacts

Покрывает текущие RPC:
- `list_my_contacts`
- `get_contact_statuses`
- `search_registered_users`
- `list_my_contact_aliases`
- `set_my_contact_alias`
- `set_my_contact_display_avatar`
- `set_user_favorite`
- `hide_contact_from_my_list`
- `set_user_block`

#### GET `/contacts`

Response 200:

```json
{ "items": [ { "userId": "uuid", "displayName": "Name", "avatarUrl": null, "favorite": false, "blocked": false } ] }
```

#### GET `/users/search?q=...`

Response 200:

```json
{ "items": [ { "id": "uuid", "displayName": "Name", "avatarUrl": null } ] }
```

#### PATCH `/contacts/:userId`

Request:

```json
{ "alias": "Local name", "favorite": true, "hidden": false, "blocked": false, "displayAvatarFileId": null }
```

Response 200:

```json
{ "ok": true }
```

### Push notifications

Покрывает `from('push_subscriptions').upsert(...)`.

#### PUT `/push/subscriptions`

Request:

```json
{
  "provider": "webpush",
  "endpoint": "https://...",
  "p256dh": "...",
  "auth": "...",
  "device": { "userAgent": "string", "platform": "string" }
}
```

Response 200:

```json
{ "ok": true }
```

#### DELETE `/push/subscriptions`

Request:

```json
{ "endpoint": "https://..." }
```

Response 200:

```json
{ "ok": true }
```

### Space rooms (настройки/модерация/approval)

Покрывает:
- `from('space_rooms')...` (select/insert)
- `host_leave_space_room`
- join approval flow (сейчас через broadcast + postgres_changes fallback)
- `list_conversation_join_requests` / `approve_conversation_join_request` / `deny_conversation_join_request` (если относится к public conversations)

#### POST `/space-rooms`

Request:

```json
{ "slug": "room-slug", "title": "Room", "accessMode": "open" | "approval", "chatVisibility": "all" | "members" }
```

Response 200:

```json
{ "roomId": "slug" }
```

#### GET `/space-rooms/:slug/settings`

Response 200:

```json
{
  "slug": "room",
  "hostUserId": "uuid",
  "chatVisibility": "all",
  "accessMode": "open",
  "status": "active",
  "roomAdminUserIds": ["uuid"]
}
```

#### PATCH `/space-rooms/:slug/settings`

Request:

```json
{ "chatVisibility": "members", "accessMode": "approval", "roomAdminUserIds": ["uuid"] }
```

Response 200:

```json
{ "ok": true }
```

#### POST `/space-rooms/:slug/leave-host`

Response 200:

```json
{ "ok": true }
```

#### Join approval (HTTP часть, если нужно)

- `POST /space-rooms/:slug/join-requests` → создать join-request (гость/юзер)
- `GET /space-rooms/:slug/join-requests` → список для хоста
- `POST /space-rooms/:slug/join-requests/:requestId/approve`
- `POST /space-rooms/:slug/join-requests/:requestId/deny`

В realtime‑варианте эти действия лучше делать через socket.io события из раздела выше.

### Admin

Покрывает:
- `admin_access_info`
- `admin_list_registered_users`
- `admin_set_user_global_role`
- `admin_delete_registered_user`
- `site_news` insert/delete

#### GET `/admin/access`

Response 200:

```json
{ "ok": true, "roles": { "isAdmin": true } }
```

#### GET `/admin/users?limit=&offset=`

Response 200:

```json
{ "items": [ { "id": "uuid", "email": "u@mail.com", "displayName": "Name", "role": "user" } ] }
```

#### PATCH `/admin/users/:id/role`

Request:

```json
{ "role": "user" | "admin" }
```

Response 200:

```json
{ "ok": true }
```

#### DELETE `/admin/users/:id`

Response 200:

```json
{ "ok": true }
```

#### POST `/admin/site-news` / DELETE `/admin/site-news/:id`

Request (create):

```json
{ "title": "string", "body": "string" }
```

Response 200:

```json
{ "id": "uuid" }
```

### Misc

#### GET `/app/version`

Покрывает `get_app_version`.

Response 200:

```json
{ "version": "string", "minSupported": "string", "message": null }
```

## DB schema для VPS (черновик, опирается на текущую Supabase схему)

Источник правды по текущей доменной модели:
- `docs/DATABASE_STATE.md` (актуально по `supabase/migrations/`)
- `docs/DATABASE.md` (legacy workspace: accounts/rooms/events/live_sessions…)

Идея переезда: **перенести существующие таблицы мессенджера/комнат почти 1:1**, но убрать зависимость от Supabase Auth (`auth.users`) и перенести Edge Functions поведение (webpush/link-preview) в Node.js.

### Минимальный набор таблиц (нужен для уже зафиксированных HTTP/WS контрактов)

#### Auth / sessions

В Supabase сейчас `public.users` создаётся триггером из `auth.users`. На VPS это будет наша ответственность.

- `users`
  - минимум: `id (uuid pk)`, `email (unique)`, `display_name`, `avatar_url`, `created_at`, `updated_at`
  - добавить для self-hosted auth: `password_hash` (argon2id), `email_verified_at?`, `last_login_at?`
- `refresh_sessions` (или `refresh_tokens`) — как в `docs/DATABASE.md`
  - `id uuid pk`, `user_id fk`, `refresh_token_hash`, `expires_at`, `revoked_at`, `created_at`, `last_used_at`, `user_agent`, `ip`

#### Messenger (единая модель)

В `docs/DATABASE_STATE.md` описан текущий набор:
- `chat_conversations` (kind: `room | direct | group | channel`, профиль беседы/публичность/привязка к room slug)
- `chat_conversation_members` (membership + `last_read_at` и роль)
- `chat_messages` (kind: `text/system/reaction/image/audio`, `meta jsonb`, `reply_to_message_id`, `quote_to_message_id`)
- `chat_conversation_invites` (invite tokens)
- `chat_conversation_join_requests` (заявки на вступление)
- `chat_message_mentions` (упоминания, индексы по `user_id`, `conversation_id`)
- `chat_conversation_notification_mutes` (mute на беседу)

Ключевые индексы для производительности (обязательные на VPS):
- `chat_messages(conversation_id, created_at desc, id desc)` (лента/пагинация)
- `chat_conversation_members(user_id)` + `(conversation_id, user_id)` unique/PK
- `chat_message_mentions(user_id, created_at desc)` (бейджи упоминаний)

#### Space rooms (эфир по ссылке / approval)

Из `docs/DATABASE.md` + `docs/DATABASE_STATE.md`:
- `space_rooms` (PK: `slug`)
  - `host_user_id`, `status`, `retain_instance`, `access_mode`, `chat_visibility`
  - open-duration поля: `cumulative_open_seconds`, `open_session_started_at` (если сохраняем логику)
  - поля модерации/approval (баны/одобренные) — уже есть в миграциях (см. `supabase/migrations/*space_rooms*`)

#### Contacts / соцграф

- `user_blocks`
- `user_favorites`
- `user_contact_list_hides`
- `contact_aliases`

#### Push / News

- `push_subscriptions`
- `site_news`

### Что точно НЕ переносим как есть

- Supabase RLS/политики: вместо них будут **проверки прав в backend** (и опционально DB-level constraints/roles).
- Supabase Edge Functions:
  - `send-dm-webpush`, `send-channel-webpush` → background job/worker в Node.js (или отдельный сервис), триггерится на создание сообщения
  - `link-preview` → `POST /link-preview` (backend)

## Замена Supabase Edge Functions на self-hosted backend/worker

Цель: полностью убрать Supabase webhooks/edge и перенести функциональность в нашу инфраструктуру.

### 1) Link preview (`link-preview`)

Текущая логика (`supabase/functions/link-preview/index.ts`):
- Вход: `{ url }` (только `http(s)`)
- YouTube: отдельная ветка через `https://www.youtube.com/oembed?format=json&url=...`
- Остальные сайты: fetch HTML, парсинг `og:*`, `twitter:*`, `description`, `<title>`
- Выход: `{ url, title?, description?, image?, siteName? }`

Self-hosted замена:
- HTTP endpoint: `POST /link-preview` (уже зафиксирован)
- Рекомендации по безопасности:
  - SSRF защита: запрет private IP / metadata endpoints, лимит редиректов
  - таймауты: 3–8 секунд
  - лимит размера ответа (например 1–2 МБ)
  - allowlist/denylist хостов по мере необходимости

### 2) Web Push: `send-dm-webpush` и `send-channel-webpush`

Текущее поведение:
- Триггер: **Supabase Database Webhook** на `INSERT public.chat_messages`
- Авторизация вебхука: `Authorization: Bearer WEBHOOK_PUSH_SECRET`
- Отправка: библиотека `web-push` с VAPID (`VAPID_*`)
- Источник подписок: таблица `push_subscriptions` (`subscription` хранит объект PushSubscription JSON)

Ключевые сценарии:
- Для `direct/group` (в `send-dm-webpush`):
  - пропуск `kind = reaction/system`
  - выбираются `chat_conversation_members` кроме отправителя
  - учитываются mutes (`chat_conversation_notification_mutes`)
  - упоминания (`@slug`) могут отправляться отдельным путём (в коде есть `parseMentionSlugs` и/или чтение `chat_message_mentions`)
- Для `channel` (в `send-channel-webpush`):
  - аналогично, но `conv.kind` должен быть `channel`
  - упоминания: отдельный push, игнорируя mute (по комментарию в коде)
- Иконка уведомления:
  - DM/channel: аватар отправителя (из `users.avatar_url`)
  - group/channel: если есть `chat_conversations.avatar_thumb_path|avatar_path`, берётся signed url из `messenger-media`

Self-hosted замена: **не webhook, а job после записи сообщения**

Базовая схема:
- Backend обрабатывает `POST /.../messages` (и WS `*:message:send`) и **после успешной записи** в БД публикует job:
  - `push:message_created` `{ messageId, conversationId }`
- Worker (может быть отдельный процесс/контейнер) берёт job и делает:
  - читает `chat_messages` + `chat_conversations` + `chat_conversation_members`
  - применяет mute/mentions правила
  - грузит `push_subscriptions` по recipient user ids
  - отправляет Web Push (VAPID)
  - чистит невалидные подписки (410/404) из `push_subscriptions`

Рекомендуемый транспорт между backend и worker:
- Redis (у нас он в архитектуре): BullMQ / simple list + retry

Конфиги/секреты для self-hosted:
- `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- `PUBLIC_APP_URL` (для deep links)
- (опционально) `PUSH_CONCURRENCY`, `PUSH_RETRY_ATTEMPTS`

### 3) Mentions (`chat_message_mentions`)

В Supabase уже есть миграция `20260501120000_chat_message_mentions.sql`:
- таблица `chat_message_mentions`
- триггер AFTER INSERT on `chat_messages`, который вычисляет упоминания и пишет строки

Self-hosted вариант:
- **Оставить это в Postgres** (как сейчас): удобно и быстро, тогда worker просто читает таблицу mentions по `message_id`.
- Альтернатива: вычислять mentions в Node.js при создании сообщения (хуже для консистентности, зато проще без SQL триггеров).

Мы выбираем: **оставить в Postgres** (минимум изменений и один источник правды).

## Миграция данных (Supabase → VPS Postgres + S3)

Цель: перенести “состояние продукта” (профили, беседы, сообщения, membership, mute/mentions, space_rooms, site_news, push_subscriptions) и медиа (`avatars`, `messenger-media`), но **без зависимости от Supabase Auth**.

### 1) Миграция Postgres данных

Текущая реальность:
- В Supabase есть связка `auth.users` → триггер → `public.users`.
- В self-hosted версии мы **не переносим** `auth.users`, а создаём собственный `users` + `refresh_sessions`.

Подход к переносу пользователей:
- **Профили** (`public.users`) переносим (id/email/display_name/avatar_url/profile_slug и т.п.).
- **Пароли** из Supabase Auth перенести нельзя (хэши не доступны).
- Значит, пользователи:
  - либо получают flow “Reset password” при первом входе (рекомендуется),
  - либо мы делаем временный “magic link” вход на время миграции (опционально).

Что переносим 1:1 (из текущих таблиц `public.*`):
- `chat_conversations`
- `chat_conversation_members`
- `chat_messages`
- `chat_conversation_invites`
- `chat_conversation_join_requests`
- `chat_conversation_notification_mutes`
- `chat_message_mentions`
- `space_rooms`
- `site_news`
- `push_subscriptions`
- соцграф: `user_blocks`, `user_favorites`, `user_contact_list_hides`, `contact_aliases`
- (опционально) любые “legacy workspace” таблицы, если они реально используются этим приложением

Правки/трансформации при импорте:
- В `users` добавится `password_hash` (пустой для импортированных) + флаг `needs_password_reset = true` (или `password_set_at IS NULL`).
- `refresh_sessions`/`refresh_tokens` не переносим (аннулируем все сессии).

### 2) Миграция Storage (Supabase Storage → S3)

Buckets, которые реально используются фронтом:
- `avatars` (часть объектов сейчас публичная через `getPublicUrl`, часть может быть просто URL)
- `messenger-media` (приватный, в UI используются signed URLs; внутри — фото/превью/аудио)

Стратегия:
- Переносим **объекты как есть по ключам**, чтобы не ломать ссылки/пути в `chat_messages.meta` и полях профиля (`avatar_path`, `avatar_thumb_path` и т.п.).
  - Пример ключей: `${conversationId}/${uuid}.jpg`, `${conversationId}/${uuid}_thumb.jpg`, `${conversationId}/${uuid}.webm` и т.д.
- В новой системе:
  - либо продолжаем хранить “storage path” в БД и выдавать signed URL через `GET /files/:id` / `GET /media/signed?...`,
  - либо делаем layer “file records” и маппинг path→fileId (можно позже).

Минимум для совместимости с текущей БД:
- `messenger-media`: хранить ключи и выдавать signed download URL по `path`.
- `avatars`: либо хранить public CDN URL, либо тоже signed (но UI сейчас ожидает `publicUrl`).

### 3) Миграция пушей

`push_subscriptions` можно перенести 1:1, но:
- часть endpoint’ов будет уже протухшей → worker должен уметь чистить 410/404
- после миграции рекомендуется принудительно “перерегистрировать” подписки при первом открытии приложения (UI сам перезапишет через `PUT /push/subscriptions`)

### 4) Cutover (переключение)

Порядок переключения без “двойной записи”:
- Поднять VPS окружение (Postgres/S3/Redis/backend) и прогнать миграцию в staging.
- На короткое окно:
  - “заморозить” запись в Supabase (read-only режим в UI или флагом) **или** принять небольшой возможный дрейф (если ок на тесте).
  - сделать финальный dump + перенос объектов storage + импорт
  - переключить frontend на новый API/WS

## Бэкапы (self-hosted)

Политика (из плана):
- 7 дней
- 4 недели
- 3 месяца

### Postgres

- Ежедневно: `pg_dump` (custom format) + gzip
- Хранение: S3 / Storage Box (отдельный bucket/папка)
- Обязательно:
  - шифрование at-rest (на стороне storage или через age/gpg)
  - проверка восстановления (раз в неделю — restore в тестовую БД)

### S3 объекты

Варианты:
- Versioning на bucket (если провайдер поддерживает)
- или периодический “inventory + sync” в другое хранилище

## Безопасность (self-hosted)

Минимальный baseline:
- HTTPS везде (Let's Encrypt) + HSTS
- Postgres и Redis **не доступны извне** (только docker network / localhost)
- JWT:
  - короткоживущий access (например 15–60 мин)
  - refresh rotation + revoke по logout
- Rate limiting:
  - `/auth/login`, `/auth/register`, `/auth/forgot-password`
  - `/link-preview`
  - WS connect/typing spam
- CORS: allowlist origins (prod + staging)
- Upload ограничения:
  - размер/типы/кол-во
  - presigned policy
- Логи:
  - audit событий авторизации (без чувствительных данных)
  - алерты на 5xx/latency
- (Опционально) fail2ban по nginx access log

## Тестирование (перед релизом)

### Функциональные проверки

- Auth:
  - register/login/refresh/logout
  - forgot/reset password
- Messenger:
  - список диалогов/групп/каналов
  - отправка/редактирование/удаление
  - реакции
  - read receipts
  - typing
- Storage:
  - загрузка аватара
  - отправка фото/аудио в ЛС (full+thumb)
  - получение signed URL и отображение
- Push:
  - регистрация подписки
  - отправка пуша на входящее (DM/group/channel)
- Space rooms:
  - approval flow (join request/approve/deny)
  - host transfer (если оставляем)
- Link preview: обычный сайт + YouTube

### Нефункциональные проверки

- Из РФ без VPN:
  - HTTP (API) и WSS (socket.io) стабильны
- Нагрузка:
  - 10–50 активных пользователей
  - burst сообщений (например 5–10 msg/sec в одном чате) — без деградации UI

### Что нужно уточнить перед финализацией схемы (но можно делать позже)

- Какие поля в `users` реально используются фронтом кроме `display_name/avatar_url/profile_slug` (есть RPC `get_user_public_profile_by_slug`).
- Нужна ли поддержка “guests” (в `docs/DATABASE.md` есть `guests`) в self-hosted версии или можно отложить.

## Исходный Migration Plan (зафиксировано)

Ниже сохранён исходный план переезда “как есть”, чтобы не потерять контекст и сверяться по этапам.

### Цель

Перенести приложение с Supabase на собственную инфраструктуру для:
- стабильной работы в РФ без VPN
- полного контроля над backend и данными
- независимости от внешних сервисов

### Итоговая архитектура

Frontend (React / PWA)
→ HTTPS / WSS
Nginx
→
Backend (Node.js + socket.io)
→
PostgreSQL
→
S3 Storage (Hetzner Object Storage / B2 / R2)
→
Redis

### Этапы реализации

#### Этап 0 — Подготовка и аудит
- Выписать все таблицы в Supabase
- Зафиксировать структуру БД
- Определить используемые функции: auth / storage / realtime
- Найти все места в frontend где используется supabase client

Результат: полное понимание текущей архитектуры

#### Этап 1 — Поднятие VPS
- Купить VPS (Hetzner)
- Установить Ubuntu 22.04+; Docker + Docker Compose
- Настроить SSH по ключу; firewall (ufw)
- Открыть порты: 22 / 80 / 443

Проверка: сервер доступен из РФ без VPN

#### Этап 2 — Базовая инфраструктура
- Поднять контейнеры: PostgreSQL / Redis / Backend (пустой)
- Установить Nginx
- Настроить домен: `api.domain.com`
- Подключить SSL (Let's Encrypt)

#### Этап 3 — PostgreSQL
- Настроить PostgreSQL: отдельный user, отдельная база
- Закрыть внешний доступ
- Настроить ORM (Prisma / Drizzle)
- Создать схемы: `users`, `sessions`, `refresh_tokens`, `rooms`, `room_members`, `messages`, `files`

#### Этап 4 — Авторизация
- Реализовать JWT auth: register / login / refresh token / logout
- Хеширование паролей (bcrypt/argon2)
- Middleware авторизации

API:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET  /me`

#### Этап 5 — Storage (S3)
- Подключить S3 storage: Hetzner Object Storage / B2 / R2
- Реализовать: presigned upload / download URL

API:
- `POST /files/presign-upload`
- `POST /files/complete-upload`
- `GET  /files/:id`

#### Этап 6 — Backend API (основа мессенджера)
- `GET  /rooms`
- `POST /rooms`
- `GET  /rooms/:id/messages`
- `POST /rooms/:id/messages`
- Сохранение сообщений в БД, привязка к пользователю

#### Этап 7 — Realtime (socket.io)
- Поднять socket.io
- Авторизация через JWT

События:
- Client → Server: `message:send`, `room:join`, `room:leave`, `typing:start`, `typing:stop`
- Server → Client: `message:new`, `user:online`, `user:offline`, `typing:update`

#### Этап 8 — Перенос frontend

Заменить:
- `supabase.auth`
- `supabase.from`
- `supabase.storage`
- `supabase.channel`

на:
- `fetch / axios API`
- `socket.io`

#### Этап 9 — Миграция данных
- Сделать dump Supabase PostgreSQL
- Импортировать в новый PostgreSQL
- Перенести файлы из Storage
- Перенести пользователей

#### Этап 10 — Бэкапы
- `pg_dump` ежедневно
- Хранение: S3 / Storage Box
- Политика: 7 дней / 4 недели / 3 месяца

#### Этап 11 — Безопасность
- HTTPS
- закрытый PostgreSQL
- закрытый Redis
- rate limiting
- CORS
- JWT защита
- fail2ban (опционально)

#### Этап 12 — Тестирование
- Работа без VPN из РФ
- WebSocket соединение
- Отправка сообщений
- Загрузка файлов
- Авторизация
- Нагрузка (10–50 пользователей)

### Рекомендуемый стек

- Node.js 20+
- Fastify / Express
- PostgreSQL 16+
- Redis
- socket.io
- Prisma / Drizzle
- Docker
- Nginx

### Приоритет

1) Поднять VPS  
2) Сделать backend + auth  
3) Сделать messages API  
4) Подключить socket.io  
5) Перенести frontend  
6) Перенести данные  

