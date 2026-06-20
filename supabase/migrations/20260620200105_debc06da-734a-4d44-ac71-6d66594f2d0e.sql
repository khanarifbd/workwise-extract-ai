
-- Lock down sensitive code tables with explicit RESTRICTIVE denies for non-admin authenticated users.
-- Service role bypasses RLS, admins keep access via existing permissive policies.

CREATE POLICY "Deny non-admin authenticated access to progressor codes"
ON public.progressor_access_codes
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Deny anon access to progressor team codes"
ON public.progressor_team_codes
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny non-admin authenticated access to progressor team codes"
ON public.progressor_team_codes
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Deny anon access to team access codes"
ON public.team_access_codes
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny non-admin authenticated access to team access codes"
ON public.team_access_codes
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
