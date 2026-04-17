# Состояние и структура БД (актуально по репозиторию)

Документ собран по **`supabase/migrations/`**, **`supabase/functions/`** и **`supabase/config.toml`**.  
Проект Supabase: **`dbhrmaabotdaagmiuzum`** (см. `config.toml`). Целевая СУБД: **PostgreSQL 17** (локальный `major_version` в конфиге). Актуальная сверка с удалённой БД и Edge — **[раздел 7](#7-сверка-с-удалённым-проектом-mcp-supabase)** (инструменты MCP `user-supabase`: `execute_sql`, `list_tables`, `list_edge_functions`).

> **Важно.** Реальная удалённая БД может содержать дополнительные правки вне репозитория; при расхождении источником правды для схемы остаются миграции в git. Подробное описание «классической» доменной модели (accounts, rooms, events, live_sessions и т.д.) по-прежнему в [`DATABASE.md`](./DATABASE.md).

---

## 1. Как устроены данные приложения (высокий уровень)

| Область | Таблицы / объекты | Назначение |
|--------|-------------------|------------|
| **Auth / профиль** | `users` (+ поля приватности, поиска из поздних миграций), связь с `auth.users` | Пользователи и настройки кабинета |
| **Мессенджер (единая модель)** | `chat_conversations`, `chat_conversation_members`, `chat_messages`, `chat_conversation_invites`, `chat_conversation_join_requests` | ЛС, группы, каналы, чат комнаты (`kind`), инвайты и заявки на вступление |
| **Эфир по ссылке** | `space_rooms` | Комнаты по slug из URL; политика входа, чат, длительность «открытости», модерация |
| **Контакты и соцграф** | `user_favorites`, `user_blocks`, `user_contact_list_hides` | Контакты, блокировки, скрытие из списка |
| **Пуш** | `push_subscriptions` | Web Push подписки (связка с Edge Functions) |
| **Новости сайта** | `site_news` | Лента / changelog (триггер `site_news_set_updated_at`) |
| **Legacy workspace (редко трогается фронтом vMix replacer)** | `accounts`, `rooms`, `events`, `live_sessions`, … | Описаны в [`DATABASE.md`](./DATABASE.md) |

---

## 2. Ключевые таблицы мессенджера и комнат

### 2.1. `chat_conversations`

- **kind** (после миграций): `room` \| `direct` \| `group` \| `channel`.
- Уникальность «одна беседа на комнату»: `(kind, space_room_slug)` для привязки к эфиру.
- Поля профиля групп/каналов (в т.ч. `public_nick`, `avatar_path`, флаги публичности и т.д.) наращиваются в миграциях `20260415223000_*` и следующих.

### 2.2. `chat_conversation_members`

- **role**: `member` \| `owner` \| `moderator` (и расширения для staff в отдельных RPC).

### 2.3. `chat_messages`

- **kind** сообщений: в разных RPC допускаются `text`, `system`, `reaction`, `image` (ограничения ужесточались по миграциям).

### 2.4. `space_rooms`

Кроме базовых полей из [`DATABASE.md`](./DATABASE.md) (slug, host, status, `retain_instance`, `access_mode`, `chat_visibility`, баны/одобрения и т.д.), в миграции **`20260430280000_space_rooms_open_duration.sql`** добавлены:

| Поле | Описание |
|------|----------|
| `cumulative_open_seconds` | Накопленное время в статусе `open` (секунды) |
| `open_session_started_at` | Начало текущей открытой сессии |

Триггер **`space_rooms_track_open_duration`** (BEFORE INSERT OR UPDATE) обновляет накопление при смене `status`.

### 2.5. Прочие таблицы из миграций

- **`chat_conversation_invites`** — токены приглашений в группу/канал.
- **`chat_conversation_join_requests`** — заявки на вступление в закрытые группы/каналы.
- **`user_blocks`**, **`user_favorites`**, **`user_contact_list_hides`**
- **`push_subscriptions`** — endpoint + JSON подписки Web Push.
- **`site_news`** — материалы новостей/чейнджлога.

---

## 3. RPC (PostgreSQL functions), вызываемые с клиента

Ниже — **имена функций в схеме `public`**, которые создаются/переопределяются в миграциях. Несколько ранних функций многократно расширялись новыми миграциями; **эффективная сигнатура и тело — в последней по цепочке миграции**.

### 3.1. Админ и аккаунт

| Функция | Назначение (кратко) |
|---------|---------------------|
| `admin_access_info` | Служебная информация для админ-UI (есть на связанном проекте) |
| `admin_is_staff` | Проверка, что текущий пользователь staff |
| `admin_list_registered_users` | Постраничный список пользователей (staff) |
| `admin_set_user_global_role` | Назначение глобальной роли пользователю |
| `admin_delete_registered_user` | Удаление пользователя (staff) |
| `admin_purge_stale_room_chats` | Чистка пустых room-чатов (см. [§7](#7-сверка-с-удалённым-проектом-mcp-supabase): на проекте может отсутствовать) |
| `delete_my_account` | Самоудаление аккаунта |
| `handle_new_auth_user` | Обычно вызывается из триггера на `auth.users` при регистрации |

### 3.2. Профиль, поиск, контакты, блокировки

| Функция | Назначение |
|---------|------------|
| `get_user_public_profile_by_slug` | Публичная карточка по slug |
| `get_user_profile_for_peek` | Данные для «peek» в мессенджере |
| `search_registered_users` | Поиск пользователей (несколько версий — см. миграции) |
| `list_my_contacts` | Список контактов |
| `get_contact_statuses` | Статусы контактов |
| `set_user_favorite` | Закреп / контакт |
| `users_blocked` | Проверка блокировки |
| `set_user_block` | Установка блока |
| `users_are_mutual_contacts` | Взаимные контакты |
| `hide_contact_from_my_list` | Скрыть из своего списка |
| `ensure_direct_conversation_with_user` | Создать/получить ЛС с пользователем |

### 3.3. Прямые сообщения (direct)

| Функция | Назначение |
|---------|------------|
| `ensure_self_direct_conversation` | Служебная беседа «с собой» |
| `list_my_direct_conversations` | Список ЛС с превью и peer-профилем |
| `mark_direct_conversation_read` | Отметить прочитанным |
| `list_direct_messages_page` | Страница сообщений ЛС |
| `append_direct_message` | Отправка (много итераций — reply, image, …) |
| `edit_direct_message` | Редактирование |
| `delete_direct_message` | Мягкое удаление |
| `toggle_direct_message_reaction` | Реакции |

### 3.4. Группы и каналы (conversations kind group / channel)

| Функция | Назначение |
|---------|------------|
| `create_group_chat` | Создание группы |
| `add_users_to_group_chat` | Добавление участников |
| `join_public_group_chat` | Вход в публичную группу |
| `leave_group_chat` | Выход из группы |
| `is_group_admin` | Проверка прав в группе |
| `update_group_profile` | Обновление профиля группы |
| `create_channel` | Создание канала |
| `join_public_channel` | Вход в публичный канал |
| `leave_channel` | Выход из канала |
| `is_channel_admin` | Проверка прав в канале |
| `update_channel_profile` | Обновление профиля канала |
| `list_my_group_chats` | Мои группы |
| `list_my_channels` | Мои каналы |
| `mark_group_read` / `mark_channel_read` | Прочитанное |
| `list_group_messages_page` | Лента группы |
| `append_group_message` | Сообщение в группу |
| `delete_group_message` | Удаление сообщения группы |
| `toggle_group_message_reaction` | Реакции в группе |
| `list_channel_posts_page` | Посты канала (листинг, несколько версий) |
| `append_channel_post` / `append_channel_post_rich` | Создание поста |
| `edit_channel_post` / `edit_channel_post_rich` | Редактирование поста |
| `delete_channel_post` | Удаление поста |
| `list_channel_comments_page` | Комментарии к посту |
| `append_channel_comment` | Комментарий |
| `edit_channel_comment` / `delete_channel_comment` | Редактирование / удаление комментария |
| `list_channel_comment_counts` | Счётчики комментариев |
| `toggle_channel_message_reaction` | Реакции (посты/комменты) |

### 3.5. Инвайты и заявки на вступление

| Функция | Назначение |
|---------|------------|
| `get_or_create_conversation_invite` | Инвайт-токен (в т.ч. без pgcrypto в поздней миграции) |
| `resolve_conversation_by_invite` | Разбор токена |
| `join_conversation_by_invite` | Вход по инвайту |
| `has_pending_conversation_join_request` | Есть ли заявка |
| `request_conversation_join` | Подать заявку |
| `list_conversation_join_requests` | Список заявок (для админов) |
| `approve_conversation_join_request` / `deny_conversation_join_request` | Принять / отклонить |
| `list_conversation_members_for_management` | Участники для UI заявок |

### 3.6. Роли staff в беседе (group/channel)

| Функция | Назначение |
|---------|------------|
| `can_assign_conversation_staff_roles` | Может ли назначать роли |
| `list_conversation_staff_members` | Список staff |
| `set_conversation_member_staff_role` | Назначение роли |
| `remove_conversation_member_by_staff` | Исключение участника staff |

### 3.7. Чат комнаты эфира (`kind = room`, `space_rooms`)

| Функция | Назначение |
|---------|------------|
| `ensure_room_chat_conversation` | Создать/обновить привязку чата к slug |
| `record_room_chat_membership` | Участник чата комнаты |
| `append_room_chat_message` | Сообщение в чат комнаты |
| `close_room_chat_conversation` | Закрытие беседы чата |
| `leave_room_chat_archive_entry` | Убрать архивную запись у пользователя (см. [§7](#7-сверка-с-удалённым-проектом-mcp-supabase): на проекте может отсутствовать) |
| `close_space_room` | Закрыть комнату (хост/staff) |
| `host_leave_space_room` | Выход хоста (закрытие или удаление строки) |
| `can_access_room_chat_dashboard` | Доступ к сводке чата в кабинете (участник или хост) |
| `dashboard_room_stats_for_host` | Статистика комнаты для хоста |
| `list_room_chat_guest_senders_dashboard` | Гости по сообщениям (без user id) |
| `list_room_chat_registered_members_dashboard` | Участники с аккаунтом |

Триггерная функция (не RPC с клиента): **`space_rooms_track_open_duration`** — поддержка учёта времени «открытости».

### 3.8. Прочее

| Функция | Назначение |
|---------|------------|
| `list_group_messages_page` / `list_channel_posts_page` | Публичная лента (открытые чаты) — отдельная миграция feed |
| `site_news_set_updated_at` | Триггер обновления `updated_at` для `site_news` |

---

## 4. Edge Functions (Supabase)

Расположение: **`supabase/functions/<name>/index.ts`**.  
Регион и деплой — через Supabase CLI / Dashboard.

| Имя | Назначение | Особенности |
|-----|------------|--------------|
| **`send-dm-webpush`** | Web Push при **INSERT** в `chat_messages` (ЛС и прочие сценарии, разбор в коде) | В **`config.toml`**: `verify_jwt = false` — вызов с **Database Webhook** с заголовком `Authorization: Bearer WEBHOOK_PUSH_SECRET`. Секреты: `WEBHOOK_PUSH_SECRET`, VAPID-ключи, `PUBLIC_APP_URL`. |
| **`send-channel-webpush`** | Web Push для сообщений канала | Аналогично: `verify_jwt = false`, те же секреты. |
| **`link-preview`** | HTTP: по URL вернуть OpenGraph (title, description, image) | Код в репозитории; **может быть не задеплоена** на проекте — см. [§7](#7-сверка-с-удалённым-проектом-mcp-supabase). |

Цепочка для пушей: **БД → Webhook на URL функции → Edge Function → `push_subscriptions` + web-push**.

---

## 5. Связь с клиентом (Supabase JS)

- Типичный вызов: `supabase.rpc('имя_функции', { ... })` для перечисленных RPC.
- Прямые `insert`/`update`/`select` по таблицам — в рамках RLS (политики создаются в тех же или соседних миграциях).

---

## 6. Что смотреть при обновлении документации

1. Новые файлы в **`supabase/migrations/`** — добавить таблицы/RPC в этот файл.
2. Новые папки в **`supabase/functions/`** — раздел Edge Functions.
3. При необходимости детального описания полей legacy-таблиц — **[`DATABASE.md`](./DATABASE.md)**.
4. После деплоя DDL/Edge — повторить **`execute_sql`** / **`list_edge_functions`** и обновить **§7**.

---

## 7. Сверка с удалённым проектом (MCP Supabase)

Проверка: **`project_id` = `dbhrmaabotdaagmiuzum`**, инструменты **`list_tables`**, **`execute_sql`** (список `public` функций из `pg_proc`), **`list_edge_functions`**.

### 7.1. Таблицы и колонки

- Таблицы мессенджера и вспомогательные (`chat_*`, `space_rooms`, `user_*`, `push_subscriptions`, `site_news`) на проекте **присутствуют** и согласованы с ожиданиями из миграций.
- У `space_rooms` на проекте есть **`cumulative_open_seconds`** и **`open_session_started_at`** (типы `bigint` и `timestamptz`).
- Триггер на `space_rooms`: **`space_rooms_track_open_duration_biur`** вызывает функцию **`space_rooms_track_open_duration`**.

### 7.2. RPC: есть на проекте, но не были перечислены в ранней версии §3

На удалённой БД дополнительно обнаружены (staff / регистрация):

`admin_access_info`, `admin_is_staff`, `admin_list_registered_users`, `admin_set_user_global_role`, **`handle_new_auth_user`**.

Они добавлены в **§3.1** и **§3.8**.

### 7.3. RPC: есть в репозитории (миграция), но **нет** в `public` на связанном проекте

По запросу к `pg_proc` на проекте **отсутствуют**:

| Функция | Миграция в git |
|---------|----------------|
| `leave_room_chat_archive_entry(uuid)` | `20260422180000_room_chat_leave_and_admin_purge.sql` |
| `admin_purge_stale_room_chats()` | то же файл |

**Действие:** применить соответствующую миграцию к проекту (`apply_migration` / `db query --linked -f` и т.п.), если эти RPC нужны в проде.

### 7.4. Edge Functions

На проекте через **`list_edge_functions`** задеплоены только:

- **`send-dm-webpush`** (`verify_jwt`: false)
- **`send-channel-webpush`** (`verify_jwt`: false)

Папка **`link-preview`** в **`supabase/functions/`** на этом проекте **не отображается** в списке Edge Functions — при необходимости выполнить **`supabase functions deploy link-preview`** (или аналог через MCP `deploy_edge_function`).

---

*Файл сгенерирован для обзора архитектуры; при изменении схемы обновляйте разделы 2–4 и §7.*
