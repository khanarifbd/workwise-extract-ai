-- First create the is_valid_team_id function that accepts TEXT (matches team_id column type)
CREATE OR REPLACE FUNCTION public.is_valid_team_id(_team_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_access_codes
    WHERE team_id = _team_id AND is_active = true
  )
$$;

-- Fix 1: team_fcm_tokens - Replace permissive "Anyone can manage" with proper team validation
DROP POLICY IF EXISTS "Anyone can manage FCM tokens" ON public.team_fcm_tokens;

CREATE POLICY "Teams can manage their own FCM tokens" ON public.team_fcm_tokens
FOR ALL
USING (is_valid_team_id(team_id))
WITH CHECK (is_valid_team_id(team_id));

-- Fix 2: team_availability - Replace permissive INSERT/DELETE policies
DROP POLICY IF EXISTS "Anyone can insert team availability" ON public.team_availability;
DROP POLICY IF EXISTS "Anyone can delete team availability" ON public.team_availability;

CREATE POLICY "Valid teams can insert availability" ON public.team_availability
FOR INSERT
WITH CHECK (is_valid_team_id(team_id));

CREATE POLICY "Valid teams can delete their availability" ON public.team_availability
FOR DELETE
USING (is_valid_team_id(team_id));

-- Fix 3: team_job_updates - Replace permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can insert team job updates" ON public.team_job_updates;

CREATE POLICY "Valid teams can insert job updates" ON public.team_job_updates
FOR INSERT
WITH CHECK (is_valid_team_id(team_id));

-- Fix 4: team_push_subscriptions - Replace permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can insert push subscriptions" ON public.team_push_subscriptions;

CREATE POLICY "Valid teams can insert push subscriptions" ON public.team_push_subscriptions
FOR INSERT
WITH CHECK (is_valid_team_id(team_id));