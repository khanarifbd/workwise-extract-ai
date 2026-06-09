-- Restrict category_guidelines read access to authenticated roles only.
-- Previously the "Anyone can read" policy allowed anonymous internet users to
-- read internal operational documents (key personnel, contact info, procedures).
-- Authenticated admins/viewers/progressors retain access via their own policies.
DROP POLICY IF EXISTS "Anyone can read category guidelines" ON public.category_guidelines;

CREATE POLICY "Authenticated users can read category guidelines"
ON public.category_guidelines
FOR SELECT
TO authenticated
USING (true);