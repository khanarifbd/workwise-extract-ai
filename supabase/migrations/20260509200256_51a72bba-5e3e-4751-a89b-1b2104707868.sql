-- 1. Remove publicly-readable FCM token policy
DROP POLICY IF EXISTS "Teams can view their own FCM tokens" ON public.team_fcm_tokens;

-- 2. Harden is_valid_team_id with strict input validation
CREATE OR REPLACE FUNCTION public.is_valid_team_id(_team_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _team_id IS NULL
     OR length(_team_id) > 100
     OR _team_id !~ '^[a-zA-Z0-9_-]+$' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.team_access_codes
    WHERE team_id = _team_id AND is_active = true
  );
END;
$$;

-- 3. Drop overly-permissive insert policy (service role bypasses RLS)
DROP POLICY IF EXISTS "Service role can insert sign-off notifications" ON public.team_sign_off_notifications;