
-- 1. Job attachments: drop overly permissive authenticated DELETE/UPDATE policies.
DROP POLICY IF EXISTS "Authenticated can delete job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update job attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete job attachments" ON storage.objects;

-- 2. Team availability: drop broad PUBLIC (anon-reachable) policies.
DROP POLICY IF EXISTS "Teams can view own availability" ON public.team_availability;
DROP POLICY IF EXISTS "Valid teams can insert availability" ON public.team_availability;
DROP POLICY IF EXISTS "Valid teams can delete their availability" ON public.team_availability;

-- Explicitly deny anon direct access (defence in depth).
CREATE POLICY "Deny anon access to team availability"
ON public.team_availability
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
