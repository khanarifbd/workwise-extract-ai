-- Create table for team sign-off notifications visible to admin
CREATE TABLE public.team_sign_off_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_number TEXT NOT NULL,
  job_name TEXT NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  photos_count INTEGER NOT NULL DEFAULT 0,
  videos_count INTEGER NOT NULL DEFAULT 0,
  documents_count INTEGER NOT NULL DEFAULT 0,
  work_items_modified INTEGER NOT NULL DEFAULT 0,
  work_items_total INTEGER NOT NULL DEFAULT 0,
  progress_notes TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_sign_off_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all notifications
CREATE POLICY "Admins can manage sign-off notifications"
ON public.team_sign_off_notifications
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Viewers can view notifications
CREATE POLICY "Viewers can view sign-off notifications"
ON public.team_sign_off_notifications
FOR SELECT
USING (is_viewer(auth.uid()));

-- Service role can insert (for edge functions)
CREATE POLICY "Service role can insert sign-off notifications"
ON public.team_sign_off_notifications
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_sign_off_notifications_unread ON public.team_sign_off_notifications(is_read, created_at DESC);
CREATE INDEX idx_sign_off_notifications_job ON public.team_sign_off_notifications(job_id);