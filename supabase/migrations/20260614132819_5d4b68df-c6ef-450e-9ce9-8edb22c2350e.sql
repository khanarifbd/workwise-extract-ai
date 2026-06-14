
-- notification_history: remove viewer SELECT (admins still have ALL)
DROP POLICY IF EXISTS "Viewers can view notification history" ON public.notification_history;

-- subcontractors: restrict SELECT to admins only
DROP POLICY IF EXISTS "Viewers read subcontractors" ON public.subcontractors;
CREATE POLICY "Admins read subcontractors"
ON public.subcontractors
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- trade_companies: drop viewer SELECT (admins + progressors retain access)
DROP POLICY IF EXISTS "Viewers can view trade companies" ON public.trade_companies;

-- progressor_access_codes: defensive restrictive deny for anon role
CREATE POLICY "Deny anon access to progressor codes"
ON public.progressor_access_codes
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
