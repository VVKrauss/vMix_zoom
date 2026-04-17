-- App version stored in DB (guaranteed on deploy regardless of client cache).

CREATE TABLE IF NOT EXISTS public.app_version (
  id boolean PRIMARY KEY DEFAULT true,
  major int NOT NULL DEFAULT 0,
  minor int NOT NULL DEFAULT 1,
  patch int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_version_singleton CHECK (id = true),
  CONSTRAINT app_version_nonnegative CHECK (major >= 0 AND minor >= 0 AND patch >= 0)
);

INSERT INTO public.app_version (id, major, minor, patch)
VALUES (true, 0, 1, 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_version ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_version_select" ON public.app_version;
CREATE POLICY "app_version_select"
ON public.app_version
FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.get_app_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    'v ' ||
    av.major::text ||
    '.' ||
    lpad(av.minor::text, 2, '0') ||
    '.' ||
    lpad(av.patch::text, 3, '0')
  FROM public.app_version av
  WHERE av.id = true;
$$;

COMMENT ON FUNCTION public.get_app_version() IS 'Returns current app version string (v M.mm.ppp).';

CREATE OR REPLACE FUNCTION public.bump_app_version(p_kind text DEFAULT 'patch')
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_kind text := lower(coalesce(p_kind, 'patch'));
  v_major int;
  v_minor int;
  v_patch int;
BEGIN
  -- Only service_role should be allowed to bump in automation.
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT major, minor, patch INTO v_major, v_minor, v_patch
  FROM public.app_version
  WHERE id = true
  FOR UPDATE;

  IF v_kind = 'major' THEN
    v_major := v_major + 1;
    v_minor := 0;
    v_patch := 0;
  ELSIF v_kind = 'minor' THEN
    v_minor := v_minor + 1;
    v_patch := 0;
  ELSE
    v_patch := v_patch + 1;
  END IF;

  UPDATE public.app_version
  SET major = v_major,
      minor = v_minor,
      patch = v_patch,
      updated_at = now()
  WHERE id = true;

  RETURN public.get_app_version();
END;
$$;

COMMENT ON FUNCTION public.bump_app_version(text) IS 'Service-role only: increments major/minor/patch and returns updated version string.';

GRANT EXECUTE ON FUNCTION public.get_app_version() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_app_version(text) TO service_role;

