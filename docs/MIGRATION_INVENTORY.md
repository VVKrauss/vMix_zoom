# Инвентаризация: Supabase → self-hosted (VPS)

Собрано по коду `src/` и конфигу [`supabase/config.toml`](../supabase/config.toml). Используется для cutover и проверки «ничего не забыли».

## Клиент

- Единый клиент: [`src/lib/supabase.ts`](../src/lib/supabase.ts) — `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`.
- Опционально прокси: `VITE_SUPABASE_PROXY_ORIGIN`, `VITE_SUPABASE_PROXY_DEFAULT` (те же пути, что у `*.supabase.co`).
- На VPS после миграции достаточно сменить `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (и при необходимости прокси) на новый API Gateway self-hosted stack.

## Storage (бакеты)

| Bucket | Где в коде | Назначение |
|--------|------------|------------|
| `avatars` | `src/hooks/useProfileData.ts` | upload / `getPublicUrl` / remove |
| `messenger-media` | `src/lib/messenger.ts`, `src/lib/messengerConversations.ts`, `src/components/messenger/StorageOrHttpAvatarImg.tsx`, `src/lib/mediaCache.ts` | изображения/голос/превью, signed URL |

## Edge Functions

| Имя | Вызов | Конфиг |
|-----|--------|--------|
| `link-preview` | `src/lib/linkPreview.ts` — `supabase.functions.invoke('link-preview', …)` | JWT по умолчанию (как в проде Supabase) |
| `send-dm-webpush` | только из БД (webhook), не из браузера | [`verify_jwt = false`](../supabase/config.toml) |
| `send-channel-webpush` | только из БД (webhook) | [`verify_jwt = false`](../supabase/config.toml) |

Секреты пушей: см. [`docs/MIGRATION_FUNCTIONS_WEBHOOKS.md`](./MIGRATION_FUNCTIONS_WEBHOOKS.md) и `.env.example` (`VITE_VAPID_PUBLIC_KEY`, Edge secrets).

## Realtime (каналы)

Подписки через `supabase.channel(...).subscribe()`:

| Канал / паттерн | Файл |
|-----------------|------|
| `messenger-unread:${userId}` | `src/lib/messengerUnreadRealtime.ts` |
| `space_room:${slug}` | `src/hooks/useSpaceRoomSettings.ts` |
| `presence-mirror:…` | `src/hooks/useOnlinePresenceMirror.ts` (таблица `user_presence_public`) |
| `messenger-member-self-delete:${uid}` | `src/hooks/useMessengerSelfMembershipDeleteRealtime.ts` |
| `dm-thread:${convId}` | `src/hooks/useMessengerDirectThreadRealtime.ts` |
| `group-thread:${cid}` | `src/components/messenger/GroupThreadPane.tsx` |
| `channel-thread:${cid}` | `src/components/messenger/ChannelThreadPane.tsx` |
| `room-mod:${slug}` | `src/components/RoomPage.tsx`, `RoomJoinApprovalWaiting.tsx`, `RoomHostClaimModal.tsx` |
| `room-approval-watch:${slug}:${userId}` | `src/components/RoomJoinApprovalWaiting.tsx` |
| `mentions-${uid}`, `dm-peer-read:${cid}`, `messenger-my-reads:${uid}` | `src/components/DashboardMessengerPage.tsx` |

На self-hosted Supabase Realtime должен остаться совместимым при том же протоколе API (Kong).

## Таблицы `public` — прямые `.from()` в клиенте

(неполный список по grep; остальные сущности доступны через RPC.)

| Таблица | Файлы (примеры) |
|---------|-----------------|
| `space_rooms` | `src/lib/spaceRoom.ts`, `useSpaceRoomSettings.ts`, `useSpaceRoomHost.ts` |
| `site_news` | `src/lib/siteNews.ts` |
| `users` | `profileSlugAvailability.ts`, `messenger.ts`, `useProfileData.ts`, `useRoomUiSync.ts`, `DashboardPage.tsx` |
| `push_subscriptions` | `src/lib/messengerWebPush.ts` |
| `chat_conversation_members` | `messenger.ts`, `useMessengerActiveThreadMembership.ts`, `GroupThreadPane.tsx`, `ChannelThreadPane.tsx`, `DashboardMessengerPage.tsx`, `chatArchive.ts` |
| `chat_messages` | `messenger.ts`, `chatArchive.ts` |
| `chat_conversations` | `chatArchive.ts`, `useMessengerActiveConversationPublic.ts` |
| `user_global_roles` | `useProfileData.ts` |
| `account_subscriptions` | `useProfileData.ts` |
| `user_presence_public` | `useOnlinePresenceMirror.ts` |

## RPC (`supabase.rpc`) — критичные для smoke после миграции

Список имён (для регрессии; полная сигнатура в миграциях `supabase/migrations/`):

`get_user_profile_for_peek`, `host_leave_space_room`, `list_my_contact_aliases`, `set_my_contact_display_avatar`, `set_my_contact_alias`, `list_my_contacts`, `get_contact_statuses`, `set_user_favorite`, `hide_contact_from_my_list`, `set_user_block`, `search_registered_users`, `get_public_conversation_guest_preview`, `list_conversation_members_for_mentions`, `mark_my_mentions_read`, `search_open_public_conversations`, `leave_direct_conversation`, `delete_direct_conversation_for_all`, `delete_owned_group_or_channel`, `get_direct_peer_read_receipt_context`, `ensure_self_direct_conversation`, `list_my_direct_conversations`, `ensure_direct_conversation_with_user`, `mark_direct_conversation_read`, `append_direct_message`, `toggle_direct_message_reaction`, `edit_direct_message`, `delete_direct_message`, `create_group_chat`, `join_public_group_chat`, `leave_group_chat`, `add_users_to_group_chat`, `list_my_group_chats`, `update_group_profile`, `resolve_conversation_by_invite`, `join_conversation_by_invite`, `get_or_create_conversation_invite`, `mark_group_read`, `list_group_messages_page`, `append_group_message`, `toggle_group_message_reaction`, `delete_group_message`, `list_conversation_staff_members`, `set_conversation_member_staff_role`, `dashboard_room_stats_for_host`, `list_room_chat_guest_senders_dashboard`, `list_room_chat_registered_members_dashboard`, `set_conversation_notifications_muted`, `get_my_conversation_notification_mutes`, `list_conversation_members_for_management`, `remove_conversation_member_by_staff`, `has_pending_conversation_join_request`, `request_conversation_join`, `list_conversation_join_requests`, `approve_conversation_join_request`, `deny_conversation_join_request`, `leave_room_chat_archive_entry`, `admin_purge_stale_room_chats`, `list_my_channels`, `mark_channel_read`, `create_channel`, `update_channel_profile`, `join_public_channel`, `leave_channel`, `list_channel_posts_page`, `list_channel_comments_page`, `list_channel_reactions_for_targets`, `list_channel_comment_counts`, `append_channel_post_rich`, `append_channel_feed_message`, `append_channel_comment`, `edit_channel_comment`, `delete_channel_comment`, `edit_channel_post_rich`, `delete_channel_post`, `toggle_channel_message_reaction`, `get_app_version`, `delete_my_account`, `presence_mark_background`, `admin_access_info`, `admin_set_user_global_role`, `admin_delete_registered_user`, `admin_list_registered_users`, `get_user_public_profile_by_slug`.

## Auth

- `supabase.auth` используется везде через контекст (`AuthContext` и вызовы `getUser()` в lib/hooks).
- После cutover ожидается **разовый релогин** (JWT нового проекта / новые ключи GoTrue).

## Внешние URL (не Supabase)

- `VITE_SIGNALING_URL` — mediasoup / Socket.IO; на миграцию БД не влияет, но в smoke после релиза проверить целостность комнаты.
