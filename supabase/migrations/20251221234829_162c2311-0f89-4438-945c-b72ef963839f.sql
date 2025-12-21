-- Fix 1: Require authentication for profiles table SELECT
-- Drop existing policy and recreate with auth requirement
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Fix 2: Jobs table - already has admin-only policy, which is correct
-- The current policy "Admins can manage all jobs" restricts to admins only
-- This is the intended behavior - no changes needed for jobs

-- Fix 3: Remove public read access from geocode_cache
DROP POLICY IF EXISTS "Geocode cache is publicly readable" ON public.geocode_cache;

-- Only allow authenticated users to read geocode cache
CREATE POLICY "Authenticated users can read geocode cache" 
ON public.geocode_cache 
FOR SELECT 
USING (auth.uid() IS NOT NULL);