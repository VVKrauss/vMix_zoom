-- Web Push: явное намерение пользователя + разовая очистка мёртвых подписок.
-- Клиент при messenger_web_push_enabled = false не восстанавливает подписку из браузера
-- и снимает локальную PushSubscription.

delete from public.push_subscriptions;

alter table public.users
  add column if not exists messenger_web_push_enabled boolean not null default false;

comment on column public.users.messenger_web_push_enabled is
  'Пользователь включил push в мессенджере; при false строки push_subscriptions для него не используются и клиент снимает подписку.';
