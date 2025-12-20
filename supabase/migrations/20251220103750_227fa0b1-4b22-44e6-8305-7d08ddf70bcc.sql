-- Team notification settings
CREATE TABLE IF NOT EXISTS public.team_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text NOT NULL UNIQUE,
  team_name text NOT NULL,
  whatsapp_group text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_notification_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'team_notification_settings' 
      AND policyname = 'Allow public read access'
  ) THEN
    CREATE POLICY "Allow public read access"
    ON public.team_notification_settings
    FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'team_notification_settings' 
      AND policyname = 'Allow public insert access'
  ) THEN
    CREATE POLICY "Allow public insert access"
    ON public.team_notification_settings
    FOR INSERT
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'team_notification_settings' 
      AND policyname = 'Allow public update access'
  ) THEN
    CREATE POLICY "Allow public update access"
    ON public.team_notification_settings
    FOR UPDATE
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'team_notification_settings' 
      AND policyname = 'Allow public delete access'
  ) THEN
    CREATE POLICY "Allow public delete access"
    ON public.team_notification_settings
    FOR DELETE
    USING (true);
  END IF;
END $$;

-- keep updated_at fresh
DROP TRIGGER IF EXISTS update_team_notification_settings_updated_at ON public.team_notification_settings;
CREATE TRIGGER update_team_notification_settings_updated_at
BEFORE UPDATE ON public.team_notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- seed defaults (no whatsapp_group by default)
INSERT INTO public.team_notification_settings (team_id, team_name, whatsapp_group)
VALUES
  ('1', 'Indika', NULL),
  ('2', 'Bartek', NULL),
  ('3', 'Shakhti', NULL),
  ('4', 'Abraham', NULL),
  ('5', 'Jess', NULL),
  ('6', 'Alindo', NULL)
ON CONFLICT (team_id) DO NOTHING;