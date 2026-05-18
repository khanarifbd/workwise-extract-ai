
-- ROADMAPS
CREATE TABLE public.roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  job_id uuid,
  start_date date NOT NULL,
  end_date date NOT NULL,
  time_unit text NOT NULL DEFAULT 'week' CHECK (time_unit IN ('week','day')),
  notes text NOT NULL DEFAULT '',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage roadmaps"
  ON public.roadmaps FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Progressors manage roadmaps"
  ON public.roadmaps FOR ALL
  TO authenticated
  USING (is_job_progressor(auth.uid()))
  WITH CHECK (is_job_progressor(auth.uid()));

CREATE POLICY "Viewers view roadmaps"
  ON public.roadmaps FOR SELECT
  USING (is_viewer(auth.uid()));

CREATE POLICY "Service role manages roadmaps"
  ON public.roadmaps FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_roadmaps_updated_at
  BEFORE UPDATE ON public.roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ROADMAP ITEMS
CREATE TABLE public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  symbol text,
  sort_order integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  assigned_team text,
  is_milestone boolean NOT NULL DEFAULT false,
  depends_on uuid REFERENCES public.roadmap_items(id) ON DELETE SET NULL,
  notify_on_start boolean NOT NULL DEFAULT false,
  notify_on_end boolean NOT NULL DEFAULT false,
  notify_lead_minutes integer NOT NULL DEFAULT 0,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_roadmap_items_roadmap ON public.roadmap_items(roadmap_id);

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage roadmap items"
  ON public.roadmap_items FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Progressors manage roadmap items"
  ON public.roadmap_items FOR ALL
  TO authenticated
  USING (is_job_progressor(auth.uid()))
  WITH CHECK (is_job_progressor(auth.uid()));

CREATE POLICY "Viewers view roadmap items"
  ON public.roadmap_items FOR SELECT
  USING (is_viewer(auth.uid()));

CREATE POLICY "Service role manages roadmap items"
  ON public.roadmap_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_roadmap_items_updated_at
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
