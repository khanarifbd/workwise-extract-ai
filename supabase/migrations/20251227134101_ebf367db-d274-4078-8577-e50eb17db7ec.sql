-- Create helper function to check if user is a viewer
CREATE OR REPLACE FUNCTION public.is_viewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'viewer')
$$;

-- Create helper function to check if user has any admin-level access (admin or viewer)
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'viewer')
  )
$$;

-- Update RLS policies to allow viewers SELECT access

-- Jobs: viewers can view
CREATE POLICY "Viewers can view all jobs"
ON public.jobs
FOR SELECT
USING (is_viewer(auth.uid()));

-- Contact history: viewers can view
CREATE POLICY "Viewers can view contact history"
ON public.contact_history
FOR SELECT
USING (is_viewer(auth.uid()));

-- Notification history: viewers can view
CREATE POLICY "Viewers can view notification history"
ON public.notification_history
FOR SELECT
USING (is_viewer(auth.uid()));

-- Team notification settings: viewers can view
CREATE POLICY "Viewers can view notification settings"
ON public.team_notification_settings
FOR SELECT
USING (is_viewer(auth.uid()));

-- Team access codes: viewers can view
CREATE POLICY "Viewers can view access codes"
ON public.team_access_codes
FOR SELECT
USING (is_viewer(auth.uid()));

-- Geocode cache: viewers can view
CREATE POLICY "Viewers can view geocode cache"
ON public.geocode_cache
FOR SELECT
USING (is_viewer(auth.uid()));

-- Team job updates: viewers can view
CREATE POLICY "Viewers can view team job updates"
ON public.team_job_updates
FOR SELECT
USING (is_viewer(auth.uid()));