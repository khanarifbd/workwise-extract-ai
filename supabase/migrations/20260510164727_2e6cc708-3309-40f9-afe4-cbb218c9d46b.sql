
CREATE TABLE IF NOT EXISTS public.category_guidelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.category_guidelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage category guidelines"
  ON public.category_guidelines FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Viewers view category guidelines"
  ON public.category_guidelines FOR SELECT
  USING (public.is_viewer(auth.uid()));

CREATE POLICY "Progressors view category guidelines"
  ON public.category_guidelines FOR SELECT
  USING (public.is_job_progressor(auth.uid()));

CREATE POLICY "Anyone can read category guidelines"
  ON public.category_guidelines FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER trg_category_guidelines_updated_at
  BEFORE UPDATE ON public.category_guidelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
