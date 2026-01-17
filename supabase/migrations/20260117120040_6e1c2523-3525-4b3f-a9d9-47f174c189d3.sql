-- Drop the permissive photo_folders policy that still exists
DROP POLICY IF EXISTS "Valid teams can manage photo folders" ON public.photo_folders;