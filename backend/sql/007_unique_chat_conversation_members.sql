-- Fix duplicate membership rows and enforce uniqueness.
-- This must be safe to run on existing VPS data dumps.

-- 1) Remove duplicates (keep the newest row by joined_at/last_read_at, tie-break by ctid).
with ranked as (
  select
    ctid,
    conversation_id,
    user_id,
    row_number() over (
      partition by conversation_id, user_id
      order by
        joined_at desc nulls last,
        last_read_at desc nulls last,
        ctid desc
    ) as rn
  from public.chat_conversation_members
)
delete from public.chat_conversation_members m
using ranked r
where m.ctid = r.ctid
  and r.rn > 1;

-- 2) Enforce uniqueness for (conversation_id, user_id).
do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.chat_conversation_members'::regclass
       and contype in ('p','u')
       and conkey is not null
  ) then
    -- Already has a PK/unique constraint; nothing to do.
    null;
  else
    alter table public.chat_conversation_members
      add constraint chat_conversation_members_pk primary key (conversation_id, user_id);
  end if;
end $$;

-- 3) Helpful index for user lookups (idempotent).
create index if not exists chat_conversation_members_user_idx
  on public.chat_conversation_members(user_id);

