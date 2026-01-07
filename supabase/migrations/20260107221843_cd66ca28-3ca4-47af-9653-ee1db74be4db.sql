-- Drop the old overly permissive policy that was missed
DROP POLICY IF EXISTS "Anyone can insert to sync queue" ON public.offline_sync_queue;

-- Drop and recreate the service role policy 
DROP POLICY IF EXISTS "Service role can manage sync queue" ON public.offline_sync_queue;
CREATE POLICY "Service role can manage sync queue" ON public.offline_sync_queue
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');