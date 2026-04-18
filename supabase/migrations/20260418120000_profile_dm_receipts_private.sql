-- Приватность статусов ЛС: при true собеседники не видят «доставлено/прочитано» для ваших исходящих.
alter table public.users
  add column if not exists profile_dm_receipts_private boolean not null default false;

comment on column public.users.profile_dm_receipts_private is
  'Не показывать собеседникам детальные статусы доставки/прочтения исходящих личных сообщений';
