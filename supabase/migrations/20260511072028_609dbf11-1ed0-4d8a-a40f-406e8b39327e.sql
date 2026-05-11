-- Fix 1: Remove viewer access to team_access_codes (contains auth credentials)
DROP POLICY IF EXISTS "Viewers can view access codes" ON public.team_access_codes;

-- Fix 2: Tighten has_admin_access — was returning true for viewer/progressor too,
-- which exposed admin_personal_notes and admin-avatars to non-admins.
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  )
$function$;

-- Fix 3: Restrict audit_log INSERT to service_role only (was allowing any authenticated user
-- to fabricate audit entries).
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_log;