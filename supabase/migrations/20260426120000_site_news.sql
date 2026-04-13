-- Публичные новости сайта + редактирование staff через admin_is_staff()

CREATE TABLE public.site_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  published_at date NOT NULL DEFAULT ((timezone('utc', now()))::date),
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_news_published_at_desc ON public.site_news (published_at DESC, created_at DESC);

COMMENT ON TABLE public.site_news IS 'Новости для публичной страницы /news; правка только staff';

ALTER TABLE public.site_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_news_select_public
  ON public.site_news FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY site_news_staff_insert
  ON public.site_news FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.admin_is_staff()));

CREATE POLICY site_news_staff_update
  ON public.site_news FOR UPDATE
  TO authenticated
  USING ((SELECT public.admin_is_staff()))
  WITH CHECK ((SELECT public.admin_is_staff()));

CREATE POLICY site_news_staff_delete
  ON public.site_news FOR DELETE
  TO authenticated
  USING ((SELECT public.admin_is_staff()));

CREATE OR REPLACE FUNCTION public.site_news_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_news_updated_at
  BEFORE UPDATE ON public.site_news
  FOR EACH ROW
  EXECUTE FUNCTION public.site_news_set_updated_at();

INSERT INTO public.site_news (published_at, title, body)
VALUES (
  (timezone('utc', now()))::date,
  'Статус проекта',
  'Идёт строительство и тестирование проекта.'
);
