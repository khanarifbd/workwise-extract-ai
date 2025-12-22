-- Add new columns to team_notification_settings for custom team members
ALTER TABLE public.team_notification_settings 
ADD COLUMN IF NOT EXISTS color text DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS team_type text DEFAULT 'dm',
ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false;