-- Our own migration history table for self-hosted Postgres.
-- Supabase internal schemas maintain their own migrations tables; this one tracks app/public DDL we apply.

create schema if not exists app_migrations;

create table if not exists app_migrations.schema_migrations (
  version text primary key,
  name text not null default '',
  checksum_sha256 text null,
  applied_at timestamptz not null default now()
);

comment on schema app_migrations is 'Application-managed migration history (self-hosted) for public/app DDL.';
comment on table app_migrations.schema_migrations is 'Applied migration versions for app-managed SQL changes.';

-- Convenience view for humans.
create or replace view app_migrations.schema_migrations_latest as
select *
from app_migrations.schema_migrations
order by applied_at desc;

