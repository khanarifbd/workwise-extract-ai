-- Fix team_fcm_tokens RLS - remove overly permissive policy and restrict to proper team access
DROP POLICY IF EXISTS "Teams can manage their own FCM tokens" ON public.team_fcm_tokens;

-- Create proper policies that only allow teams to manage their OWN tokens
CREATE POLICY "Teams can view their own FCM tokens"
ON public.team_fcm_tokens
FOR SELECT
USING (public.is_valid_team_id(team_id));

CREATE POLICY "Teams can insert their own FCM tokens"
ON public.team_fcm_tokens
FOR INSERT
WITH CHECK (public.is_valid_team_id(team_id));

CREATE POLICY "Teams can update their own FCM tokens"
ON public.team_fcm_tokens
FOR UPDATE
USING (public.is_valid_team_id(team_id));

CREATE POLICY "Teams can delete their own FCM tokens"
ON public.team_fcm_tokens
FOR DELETE
USING (public.is_valid_team_id(team_id));

-- Fix team_availability RLS - remove "Anyone can view" and replace with proper admin/authenticated access
DROP POLICY IF EXISTS "Anyone can view team availability" ON public.team_availability;

-- Create proper policies for team_availability
-- Admins can view all team availability (for booking purposes)
CREATE POLICY "Admins can view all team availability"
ON public.team_availability
FOR SELECT
USING (public.has_admin_access(auth.uid()));

-- Teams can view their own availability
CREATE POLICY "Teams can view own availability"
ON public.team_availability
FOR SELECT
USING (public.is_valid_team_id(team_id));