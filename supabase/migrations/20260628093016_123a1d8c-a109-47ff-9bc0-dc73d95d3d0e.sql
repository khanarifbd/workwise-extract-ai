
CREATE TABLE public.command_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NULL,
  job_number text NULL,
  team text NULL,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'note',
  category text NOT NULL DEFAULT 'other',
  title text NULL,
  body text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT command_events_kind_check CHECK (kind IN ('flag','note','call','training','pattern','signoff','schedule')),
  CONSTRAINT command_events_severity_check CHECK (severity IN ('urgent','warning','note')),
  CONSTRAINT command_events_category_check CHECK (category IN ('dm','aa','other'))
);

CREATE INDEX command_events_created_at_idx ON public.command_events (created_at DESC);
CREATE INDEX command_events_job_id_idx ON public.command_events (job_id);
CREATE INDEX command_events_kind_idx ON public.command_events (kind);
CREATE INDEX command_events_category_idx ON public.command_events (category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.command_events TO authenticated;
GRANT ALL ON public.command_events TO service_role;

ALTER TABLE public.command_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read command_events"
  ON public.command_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert command_events"
  ON public.command_events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update command_events"
  ON public.command_events FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete command_events"
  ON public.command_events FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_command_events_updated_at
  BEFORE UPDATE ON public.command_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.command_events;
