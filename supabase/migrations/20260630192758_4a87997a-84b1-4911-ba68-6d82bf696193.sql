
CREATE TABLE public.tester_section_permissions (
  section_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

GRANT SELECT ON public.tester_section_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tester_section_permissions TO authenticated;
GRANT ALL ON public.tester_section_permissions TO service_role;

ALTER TABLE public.tester_section_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tester permissions"
  ON public.tester_section_permissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert tester permissions"
  ON public.tester_section_permissions FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tester permissions"
  ON public.tester_section_permissions FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tester permissions"
  ON public.tester_section_permissions FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed defaults: all sections enabled for testers initially
INSERT INTO public.tester_section_permissions (section_key, enabled) VALUES
  ('genie', true),
  ('command', true),
  ('command-dm', true),
  ('command-aa', true),
  ('command-log', true),
  ('command-reports', true),
  ('command-owners', true),
  ('roadmaps', true),
  ('auto-assign', true),
  ('archive', true)
ON CONFLICT (section_key) DO NOTHING;
