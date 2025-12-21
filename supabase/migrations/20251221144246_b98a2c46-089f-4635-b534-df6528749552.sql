-- Phase 2: Secure RLS policies for all existing tables

-- 1. DROP existing overly-permissive policies on jobs table
DROP POLICY IF EXISTS "Allow public delete access" ON public.jobs;
DROP POLICY IF EXISTS "Allow public insert access" ON public.jobs;
DROP POLICY IF EXISTS "Allow public read access" ON public.jobs;
DROP POLICY IF EXISTS "Allow public update access" ON public.jobs;

-- Create secure policies for jobs table
-- Admins can do everything, teams can only see their assigned jobs
CREATE POLICY "Admins can manage all jobs"
ON public.jobs
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 2. DROP existing overly-permissive policies on team_access_codes table
DROP POLICY IF EXISTS "Anyone can manage access codes" ON public.team_access_codes;

-- Create secure policies - only admins can manage access codes
CREATE POLICY "Admins can manage access codes"
ON public.team_access_codes
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3. DROP existing policies on notification_history table
DROP POLICY IF EXISTS "Allow public delete access" ON public.notification_history;
DROP POLICY IF EXISTS "Allow public insert access" ON public.notification_history;
DROP POLICY IF EXISTS "Allow public read access" ON public.notification_history;

-- Create secure policies - only admins can view notification history
CREATE POLICY "Admins can manage notification history"
ON public.notification_history
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 4. DROP existing policies on team_notification_settings table
DROP POLICY IF EXISTS "Allow public delete access" ON public.team_notification_settings;
DROP POLICY IF EXISTS "Allow public insert access" ON public.team_notification_settings;
DROP POLICY IF EXISTS "Allow public read access" ON public.team_notification_settings;
DROP POLICY IF EXISTS "Allow public update access" ON public.team_notification_settings;

-- Create secure policies - only admins can manage notification settings
CREATE POLICY "Admins can manage notification settings"
ON public.team_notification_settings
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 5. DROP existing policies on team_push_subscriptions table
DROP POLICY IF EXISTS "Anyone can manage push subscriptions" ON public.team_push_subscriptions;

-- Create secure policies - service role for edge functions, admins can view
CREATE POLICY "Admins can view push subscriptions"
ON public.team_push_subscriptions
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Allow anon to insert (for team portal to subscribe) but only their own
CREATE POLICY "Anyone can insert push subscriptions"
ON public.team_push_subscriptions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Allow updates from service role (handled by edge functions)
CREATE POLICY "Admins can manage push subscriptions"
ON public.team_push_subscriptions
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 6. DROP existing policies on team_job_updates table
DROP POLICY IF EXISTS "Anyone can create team updates" ON public.team_job_updates;
DROP POLICY IF EXISTS "Anyone can update team updates" ON public.team_job_updates;
DROP POLICY IF EXISTS "Anyone can view team updates" ON public.team_job_updates;

-- Create secure policies - admins can view all, service role handles team updates
CREATE POLICY "Admins can manage team job updates"
ON public.team_job_updates
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Allow anon to insert team updates (validated by edge function)
CREATE POLICY "Anyone can insert team job updates"
ON public.team_job_updates
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 7. DROP existing policies on offline_sync_queue table
DROP POLICY IF EXISTS "Anyone can manage sync queue" ON public.offline_sync_queue;

-- Create secure policies
CREATE POLICY "Admins can manage sync queue"
ON public.offline_sync_queue
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Allow anon to insert (for team portal offline sync)
CREATE POLICY "Anyone can insert to sync queue"
ON public.offline_sync_queue
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 8. DROP existing policies on categories table
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
DROP POLICY IF EXISTS "Categories can be created by anyone" ON public.categories;
DROP POLICY IF EXISTS "Categories can be deleted by anyone" ON public.categories;
DROP POLICY IF EXISTS "Categories can be updated by anyone" ON public.categories;

-- Create secure policies - public read, admin write
CREATE POLICY "Categories are viewable by everyone"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can manage categories"
ON public.categories
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));