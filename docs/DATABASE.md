# База данных (self-hosted PostgreSQL на VPS)

Этот репозиторий переходит с Supabase на **собственный PostgreSQL** на VPS.

Источник фактического состояния схемы на момент перехода: `dump.sql` (pg_dump).

**Практический перенос «как у Supabase», но на VPS:** официальный self-hosted Docker stack + пошаговые runbook’и в [MIGRATION_README.md](./MIGRATION_README.md).

## TL;DR

- Дамп **не “просто” разворачивается** на чистом PostgreSQL, потому что он содержит Supabase-специфичные схемы/расширения/роли и RLS-политики, завязанные на `auth.uid()` и ролях `anon`/`authenticated`.
- **Данные приложения** в основном лежат в таблицах схемы `public` и **переносимы**.
- Supabase-специфичные вещи (`auth`, `storage`, `realtime`, `supabase_*`, `graphql*`, `vault`/`supabase_vault`) **не переносимы “как есть”** без поднятия аналога Supabase-стека или серьёзной переработки.

---

## Снимок схемы с VPS (текущая “истина”)

В репозитории держим schema-only снимок **реально работающей** БД на VPS:

- файл: `docs/db-schema.vps.sql`
- формат: `pg_dump --schema-only` (без данных, без owner/privileges)

Сгенерировать/обновить снимок на VPS (создаём файл на VPS, затем скачиваем в репозиторий):

```bash
cd /opt/redflow/current/deploy
docker compose -f docker-compose.vps.yml --env-file /opt/redflow/shared/stack.env exec -T postgres \
  sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U redflow -d redflow \
    --schema-only --no-owner --no-privileges --if-exists --clean \
    --quote-all-identifiers --exclude-schema=information_schema --exclude-schema=pg_catalog' \
  > /tmp/db-schema.vps.actual.sql
```

Скачать на локальную машину и положить в репозиторий:

```bash
scp root@204.168.146.200:/tmp/db-schema.vps.actual.sql "C:\Code\vMix replacer\docs\db-schema.vps.sql"
```

## 1) Что именно есть в `dump.sql`

### 1.1. Supabase-специфичные схемы/объекты

В дампе присутствуют (неполный смысловой список):

- схемы: `auth`, `storage`, `realtime`, `supabase_functions`, `supabase_migrations`, `graphql`, `graphql_public`, `vault`, `pgbouncer`, `extensions`
- расширения: `pg_net`, `pg_graphql`, `supabase_vault`, а также обычные `pgcrypto`, `"uuid-ossp"`, `pg_stat_statements`
- политики RLS и проверки доступа через `auth.uid()` и роли `anon`/`authenticated`

### 1.2. Таблицы приложения (схема `public`)

Эти таблицы — доменная модель приложения и основной кандидат на перенос:

- `access_invites`
- `account_entitlement_overrides`
- `account_members`
- `account_role_assignments`
- `account_subscriptions`
- `account_usage_counters`
- `accounts`
- `app_version`
- `audit_logs`
- `auth_identities`
- `chat_conversation_invites`
- `chat_conversation_join_requests`
- `chat_conversation_members`
- `chat_conversation_notification_mutes`
- `chat_conversations`
- `chat_message_mentions`
- `chat_messages`
- `chat_messages_live_session`
- `contact_aliases`
- `event_registrations`
- `events`
- `guests`
- `join_tokens`
- `live_session_participants`
- `live_sessions`
- `moderation_actions`
- `permissions`
- `plan_entitlements`
- `push_subscriptions`
- `refresh_sessions`
- `role_permissions`
- `roles`
- `room_members`
- `room_role_assignments`
- `rooms`
- `site_news`
- `space_rooms`
- `subscription_plans`
- `user_blocks`
- `user_contact_list_hides`
- `user_favorites`
- `user_global_roles`
- `user_presence_public`
- `users`

---

## 2) Что можно перенести на VPS “впрямую”

### 2.1. Переносимые таблицы (как данные приложения)

Практически **все таблицы `public.*`** можно перенести как данные, **если** на целевой БД вы обеспечите совместимую схему (см. раздел 4).

### 2.2. Что переносится вместе со схемой без Supabase-зависимостей

Как минимум переносимы/воспроизводимы в обычном PostgreSQL:

- таблицы и индексы схемы `public`
- обычные расширения: `pgcrypto`, `"uuid-ossp"`, `pg_stat_statements` (по желанию)

---

## 3) Что НЕ получится перенести “как есть” (и почему)

### 3.1. Supabase Auth (`auth.*`)

Таблицы `auth.*` — это внутренности Supabase Auth (Gotrue) и они связаны:

- с их моделью токенов/сессий
- с ролями и политиками доступа
- с функциями типа `auth.uid()`

Если мы уходим с Supabase Auth, то `auth.*` **не являются целевой схемой**.

### 3.2. Supabase Storage (`storage.*`)

`storage.buckets`, `storage.objects`, multipart-таблицы и политики — часть Supabase Storage, плюс вне БД есть реальное blob-хранилище.
Без поднятого аналога Storage-сервиса “как у Supabase” это **не переносится напрямую**.

### 3.3. Supabase Realtime (`realtime.*`)

`realtime.*` (включая партиции `realtime.messages_YYYY_MM_DD`) относится к инфраструктуре Supabase Realtime.
При уходе с Supabase это **нецелевые данные**.

### 3.4. Supabase migrations / hooks / vault / graphql / net

- `supabase_migrations.*`, `supabase_functions.*` — инфраструктура Supabase.
- `supabase_vault`/`vault` — Supabase Vault Extension (обычно отсутствует на vanilla Postgres).
- `pg_net`, `pg_graphql` — расширения, которые на VPS могут отсутствовать; даже если поставить, логика Supabase вокруг них не появляется автоматически.

### 3.5. RLS/права (`CREATE POLICY ... auth.uid()`)

В дампе много политик вида `... USING (user_id = auth.uid()) ...`.
На vanilla Postgres нет `auth.uid()` и нет ролей `authenticated/anon` “из коробки”.
Значит, политики **не применимы как есть** — их нужно либо переписать под вашу систему аутентификации, либо временно отключить RLS на период миграции/переноса.

---

## 4) Важная зависимость: ссылки на `auth.users`

В `dump.sql` есть внешние ключи из `public` на `auth.users`, например:

- `public.users(id) -> auth.users(id)`
- `public.push_subscriptions(user_id) -> auth.users(id)`
- `public.chat_conversation_invites(created_by) -> auth.users(id)`
- `public.chat_conversation_notification_mutes(user_id) -> auth.users(id)`

При уходе с Supabase Auth это нужно **развязать**:

- либо заменить ссылки на `public.users(id)` (и обеспечить, что `public.users` становится “истинной” таблицей идентичности),
- либо завести собственную таблицу `auth.users` (не Supabase), но тогда придётся обеспечить совместимость всей схемы/политик/функций, что обычно хуже.

---

## 5) Можно ли “просто развернуть весь дамп” на VPS?

**В текущем виде — нет, не “просто”.** Причины:

- в дампе есть `CREATE EXTENSION` для `pg_net`, `pg_graphql`, `supabase_vault` (на VPS их, скорее всего, нет);
- множество `ALTER ... OWNER TO supabase_*` — а в дампе нет `CREATE ROLE supabase_*`, значит восстановление будет падать на владельцах, если роли не создать заранее;
- политики RLS используют `auth.uid()` и роли `authenticated/anon`, которых на чистом Postgres нет.

### 5.1. Какие есть реалистичные варианты

- **Вариант A (не рекомендуется):** попытаться воспроизвести Supabase-окружение на VPS (роли, расширения, схемы, совместимые функции). Это фактически “почти Supabase”.
- **Вариант B (рекомендуется):** сделать “application-only restore”:
  - переносим только `public` (таблицы/данные/индексы/функции, которые не завязаны на Supabase),
  - переписываем зависимости `auth.users` на новую модель,
  - переносим/заменяем функциональность Storage/Realtime/Edge Functions на свои сервисы.

---

## 6) Новая “правильная история” после отказа от Supabase

С этого момента источником правды считается **self-hosted Postgres на VPS** и наши собственные миграции.

- **Снимок “как было в Supabase”**: `dump.sql` (зафиксирован в репозитории как артефакт миграции).
- **Дальше**: добавляем миграции уже под self-hosted окружение (без supabase-схем), и документируем изменения здесь.

Следующая миграция (план):

- удалить/заменить зависимости от Supabase Auth (`auth.users`, `auth.uid()`, роли `authenticated/anon`)
- определить новую auth-модель (таблица/токены/сессии) и обновить FK/RLS
- вынести storage в отдельный сервис (например S3/MinIO) и заменить `storage.objects` на свою таблицу метаданных

# DATABASE.md — Структура БД (Supabase / RedFlow)

Проект: `dbhrmaabotdaagmiuzum` · регион: `eu-west-1` · Postgres 17

---

## Миграции

| # | Название | Содержимое |
|---|----------|------------|
| 1 | `users_auth_guests` | users, auth_identities, refresh_sessions, guests, триггер |
| 2 | `accounts` | accounts, account_members |
| 3 | `roles_and_permissions` | roles, permissions, role_permissions, user_global_roles, account_role_assignments |
| 4 | `rooms` | rooms, room_members, room_role_assignments |
| 5 | `events_and_sessions` | events, event_registrations, live_sessions, live_session_participants |
| 6 | `access_invites_and_join_tokens` | access_invites, join_tokens |
| 7 | `chat_moderation_audit` | chat_messages, moderation_actions, audit_logs |
| 8 | `subscription_layer` | subscription_plans, plan_entitlements, account_subscriptions, account_entitlement_overrides, account_usage_counters |
| 9 | `seed_roles_and_permissions` | 18 ролей, 50 пермишенов, 170 связей |
| 10 | `room_ui_prefs_and_space_rooms` | `users.room_ui_preferences`, таблица `space_rooms`, RLS, `host_leave_space_room()` |

Дополнительно в репозитории: `supabase/migrations/20260410120000_space_rooms_lifecycle.sql` (`access_mode`, `retain_instance`), `20260416120000_space_room_chat_invite.sql` (`chat_visibility`), `20260417110000_space_rooms_consolidate_columns.sql` (удалены дубли `is_persistent`, `invite_valid_until`).

---

## Таблицы

### 1. users
Зарегистрированные пользователи. `id` ссылается на `auth.users(id)` — создаётся триггером при регистрации через Supabase Auth.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | = auth.users.id |
| `email` | text unique | Email |
| `phone` | text unique | Телефон |
| `password_hash` | text | Не используется (Supabase Auth хранит сам) |
| `display_name` | text | Отображаемое имя |
| `avatar_url` | text | Аватар |
| `status` | text | `active` / `blocked` / `pending` / `deleted` |
| `is_email_verified` | boolean | Подтверждён ли email |
| `is_phone_verified` | boolean | Подтверждён ли телефон |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `last_login_at` | timestamptz | |
| `room_ui_preferences` | jsonb | Глобальные настройки отображения комнаты на **десктопе**: `layout_mode` (`grid` / `pip` / `speaker` / `meet`), `pip` (`{ pos, size }`), `show_layout_toggle` (bool). На мобильных не используются. |

---

### 1b. space_rooms

Эфемерные комнаты по **slug из URL** (короткий id из приложения). Пока не связаны с тяжёлой таблицей `rooms` (workspace).

| Поле | Тип | Описание |
|------|-----|----------|
| `slug` | text PK | Id комнаты в ссылке |
| `host_user_id` | uuid FK → users | Создатель (хост) |
| `status` | text | `open` / `closed` |
| `retain_instance` | boolean | `true` — постоянная комната: при выходе хоста строка остаётся (`status = closed`); `false` — временная, строка удаляется при выходе хоста (free) |
| `access_mode` | text | `link` — вход по ссылке (для временных — только первые ~2 мин после `created_at`, дальше клиент/миграции переводят в `approval`); `approval` / `invite_only` — холодный вход по ссылке без хоста закрыт |
| `chat_visibility` | text | `everyone` / `authenticated_only` / `staff_only` / `closed` — политика чата комнаты |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

RLS: чтение всех строк (проверка «комната закрыта» при входе); insert/update/delete — только аутентифицированный хост по `host_user_id`.

Функция `host_leave_space_room(p_slug)` (SECURITY DEFINER): при выходе хоста — если `retain_instance` то `status = closed`, иначе `DELETE` строки (не копить пустые инстансы на free).

---

### 2. auth_identities
Способы входа пользователя (провайдеры).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `provider` | text | `password` / `google` / `apple` / `magic_link` |
| `provider_user_id` | text | ID у провайдера |
| `provider_email` | text | Email у провайдера |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | |

---

### 3. refresh_sessions
Серверные сессии (refresh token хранится только в hashed виде).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `refresh_token_hash` | text | Hash токена |
| `user_agent` | text | |
| `ip` | inet | |
| `device_label` | text | |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz | |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | |

---

### 4. guests
Незарегистрированные пользователи (вход по ссылке без аккаунта).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `guest_name` | text | Имя гостя |
| `access_code` | text | Код доступа (опционально) |
| `created_by_user_id` | uuid FK → users | Кто создал гостевую сессию |
| `expires_at` | timestamptz | |
| `created_at` | timestamptz | |

---

### 5. accounts
Workspace / организация. Комнаты принадлежат account, а не отдельному user.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `name` | text | Название |
| `slug` | text unique | URL-идентификатор |
| `account_type` | text | `personal` / `team` / `studio` / `tutor` |
| `status` | text | `active` / `suspended` / `closed` |
| `owner_user_id` | uuid FK → users | Владелец |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### 6. account_members
Участники workspace.

| Поле | Тип | Описание |
|------|-----|----------|
| `account_id` | uuid FK → accounts | |
| `user_id` | uuid FK → users | |
| `membership_status` | text | `active` / `invited` / `removed` |
| `joined_at` | timestamptz | |
| `invited_by_user_id` | uuid FK → users | |

PK: `(account_id, user_id)`

---

### 7. roles
Справочник ролей по scope.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `code` | text unique | Уникальный код роли |
| `scope_type` | text | `global` / `account` / `room` / `session` |
| `title` | text | Название |
| `description` | text | |

**Засеянные роли:**

| Scope | Коды |
|-------|------|
| global | `superadmin`, `platform_admin`, `support_admin`, `registered_user` |
| account | `account_owner`, `account_admin`, `billing_admin`, `account_member` |
| room | `room_owner`, `room_admin`, `producer`, `moderator` |
| session | `host`, `co_host`, `speaker`, `participant`, `registered_listener`, `anonymous_listener` |

---

### 8. permissions
Справочник пермишенов.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `code` | text unique | |
| `description` | text | |

**50 пермишенов** по группам: `platform.*`, `account.*`, `room.*`, `event.*`, `session.*`, `media.*`, `chat.*`, `participant.*`

---

### 9. role_permissions
Связь роль → пермишен (170 записей после seed).

| Поле | Тип |
|------|-----|
| `role_id` | uuid FK → roles |
| `permission_id` | uuid FK → permissions |

PK: `(role_id, permission_id)`

---

### 10. user_global_roles
Глобальные роли пользователей (например `superadmin`, `registered_user`).

| Поле | Тип |
|------|-----|
| `user_id` | uuid FK → users |
| `role_id` | uuid FK → roles |
| `assigned_by_user_id` | uuid FK → users |
| `created_at` | timestamptz |

PK: `(user_id, role_id)`

---

### 11. account_role_assignments
Роли пользователей в рамках конкретного account.

| Поле | Тип |
|------|-----|
| `id` | uuid PK |
| `account_id` | uuid FK → accounts |
| `user_id` | uuid FK → users |
| `role_id` | uuid FK → roles |
| `assigned_by_user_id` | uuid FK → users |
| `created_at` | timestamptz |

Unique: `(account_id, user_id, role_id)`

---

### 12. rooms
Постоянные комнаты (не путать с live_session — конкретным запуском).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `account_id` | uuid FK → accounts | Владелец-workspace |
| `slug` | text unique | URL-идентификатор |
| `title` | text | |
| `description` | text | |
| `owner_user_id` | uuid FK → users | |
| `room_type` | text | `call` / `team` / `tutor` / `stream` |
| `visibility` | text | `private` / `unlisted` / `public` |
| `access_mode` | text | `open` / `invite_only` / `request_only` / `password` |
| `password_hash` | text | Если access_mode = password |
| `status` | text | `active` / `archived` / `deleted` |
| `settings` | jsonb | Дополнительные настройки |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### 13. room_members / 14. room_role_assignments
Участники комнаты и их роли — аналогично account_members / account_role_assignments.

---

### 15. events
Запланированные события в комнате (встреча, стрим, занятие).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `room_id` | uuid FK → rooms | |
| `title` | text | |
| `event_type` | text | `meeting` / `rehearsal` / `lesson` / `livestream` |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | |
| `visibility` | text | `private` / `unlisted` / `public` |
| `access_mode` | text | `open` / `invite_only` / `request_only` / `password` |
| `status` | text | `draft` / `scheduled` / `live` / `ended` / `canceled` |
| `settings` | jsonb | |
| `created_by_user_id` | uuid FK → users | |

---

### 16. event_registrations
Регистрации пользователей / гостей на событие.

Constraint: хотя бы одно из `user_id` / `guest_id` должно быть заполнено.

`registration_type`: `audience` / `speaker` / `backstage`
`status`: `pending` / `approved` / `rejected` / `canceled`

---

### 17. live_sessions
Конкретный запуск комнаты (одна комната = много сессий со временем).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `room_id` | uuid FK → rooms | |
| `event_id` | uuid FK → events | Опционально |
| `session_type` | text | `call` / `team` / `tutor` / `stream` |
| `status` | text | `preparing` / `live` / `paused` / `ended` |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | |
| `created_by_user_id` | uuid FK → users | |
| `settings` | jsonb | |

---

### 18. live_session_participants
Участники конкретной live-сессии.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `live_session_id` | uuid FK → live_sessions | |
| `user_id` | uuid FK → users | null если гость |
| `guest_id` | uuid FK → guests | null если user |
| `identity_type` | text | `user` / `guest` / `service` |
| `access_role` | text | `host` / `co_host` / `speaker` / `participant` / `registered_listener` / `anonymous_listener` |
| `chat_policy` | text | `enabled` / `read_only` / `disabled` |
| `media_publish_policy` | text | `allowed` / `on_request` / `disabled` |
| `backstage_access` | boolean | |
| `participant_name` | text | Имя в сессии |
| `joined_at` | timestamptz | |
| `left_at` | timestamptz | |
| `connection_status` | text | `connecting` / `active` / `dropped` / `left` |
| `metadata` | jsonb | |

---

### 19. access_invites
Инвайт-ссылки на комнату или событие.

`invite_type`: `guest` / `member` / `speaker` / `backstage` / `listener`

Поля: `invite_code` (unique), `max_uses`, `used_count`, `expires_at`

---

### 20. join_tokens
Одноразовые токены для входа в live_session.

`scope`: `join` / `publish` / `subscribe` / `backstage`

---

### 21. chat_messages
Сообщения чата в рамках live_session.

`message_type`: `text` / `system` / `reaction`

---

### 22. moderation_actions
Действия модератора (mute, kick, ban и т.д.) — хранятся для аудита.

`action_type`: `mute` / `unmute` / `kick` / `ban` / `warning`

---

### 23. audit_logs
Общий лог действий пользователей. Хранит `entity_type`, `entity_id`, `action`, `old_data`, `new_data`, `ip`.

---

## Subscription layer (структура готова, бизнес-логика не активна)

### 24. subscription_plans
Тарифные планы. `product_family`: `meetings` / `tutor` / `stream`

### 25. plan_entitlements
Конкретные значения возможностей плана (boolean/integer/string/json).

Примеры `code`: `participants.active.max`, `chat.enabled`, `stream.srt_in`, `recording.enabled`

### 26. account_subscriptions
Подписка account на план. Поля: статус, период, trial, external provider.

### 27. account_entitlement_overrides
Ручные переопределения лимитов для конкретного account.

### 28. account_usage_counters
Счётчики использования по account и периоду.

Примеры `metric_code`: `participant_hours.total`, `sessions.concurrent_peak`, `recording.storage_bytes`

---

## Связи (кратко)

```
auth.users
    └── public.users (триггер при создании)
            ├── auth_identities (1:many)
            ├── refresh_sessions (1:many)
            ├── accounts (owner_user_id)
            │       ├── account_members (many:many ↔ users)
            │       ├── account_role_assignments
            │       ├── account_subscriptions → subscription_plans
            │       └── rooms
            │               ├── room_members
            │               ├── room_role_assignments
            │               ├── events
            │               │       └── event_registrations (user | guest)
            │               └── live_sessions
            │                       ├── live_session_participants (user | guest)
            │                       ├── chat_messages
            │                       └── join_tokens
            └── guests (created_by_user_id)
```

---

## Триггер: auto-create public.users

При регистрации через Supabase Auth автоматически создаётся запись в `public.users`:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
```

`display_name` берётся из `raw_user_meta_data->>'display_name'` (передаётся при `signUp`).

---

## Что не реализовано (out of scope на этом этапе)

- RLS (Row Level Security) политики
- Billing flow / checkout
- Hard enforcement тарифных ограничений
- SSO / enterprise integrations
- Tutor module (следующий этап)
- Stream module (после tutor)
