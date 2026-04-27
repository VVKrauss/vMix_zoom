-- Password reset tokens (email-based reset flow)

create table if not exists public.password_reset_tokens (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists password_reset_tokens_user_idx
  on public.password_reset_tokens(user_id, created_at desc);

create index if not exists password_reset_tokens_expires_idx
  on public.password_reset_tokens(expires_at)
  where used_at is null;

