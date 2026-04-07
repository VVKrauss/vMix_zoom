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
| `retain_instance` | boolean | Заготовка под платный тариф: не удалять строку при выходе хоста (пока везде `false`) |
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
