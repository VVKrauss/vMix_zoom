-- Self-hosted: API pool uses DB role "redflow" (see deploy/docker-compose.vps.yml DATABASE_URL).
-- On databases migrated from Supabase, RLS on public.user_presence_public may only allow
-- role "authenticated" (auth.uid()). In that case the API sees zero rows and UI never shows peers online.
-- This policy allows the API role to read the mirror table (API still enforces auth at HTTP layer).

DO $$
DECLARE
  rls_on boolean;
BEGIN
  SELECT c.relrowsecurity
    INTO rls_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'user_presence_public';

  IF rls_on IS NULL OR rls_on = false THEN
    RAISE NOTICE 'user_presence_public: RLS not enabled, skip policy';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'user_presence_public'
       AND policyname = 'user_presence_public_redflow_select'
  ) THEN
    CREATE POLICY user_presence_public_redflow_select ON public.user_presence_public
      FOR SELECT
      TO redflow
      USING (true);
  END IF;
END;
$$;
