-- Allow Team Portal (non-auth) clients to read team availability
-- This fixes mobile not showing unavailable days even though inserts succeed.

ALTER TABLE public.team_availability REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- Enable realtime for this table (safe if already added)
  ALTER PUBLICATION supabase_realtime ADD TABLE public.team_availability;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- RLS policy: allow anyone (including anon) to read team availability
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_availability'
      AND policyname = 'Anyone can view team availability'
  ) THEN
    CREATE POLICY "Anyone can view team availability"
    ON public.team_availability
    FOR SELECT
    USING (true);
  END IF;
END $$;