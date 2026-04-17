-- Закреплённые чаты в списке мессенджера: синхронизация между устройствами (jsonb-массив uuid, порядок = порядок закрепа).

alter table public.users
  add column if not exists messenger_pinned_conversation_ids jsonb not null default '[]'::jsonb;

comment on column public.users.messenger_pinned_conversation_ids is
  'Порядок id бесед (max 3), закреплённых в дереве мессенджера; синхронизируется между клиентами.';
