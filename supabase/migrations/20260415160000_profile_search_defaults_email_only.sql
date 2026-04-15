-- Registration defaults: allow search by email only (name/slug off), search enabled.

alter table public.users
  alter column profile_search_closed set default false;

alter table public.users
  alter column profile_search_allow_by_email set default true;

alter table public.users
  alter column profile_search_allow_by_name set default false;

alter table public.users
  alter column profile_search_allow_by_slug set default false;

