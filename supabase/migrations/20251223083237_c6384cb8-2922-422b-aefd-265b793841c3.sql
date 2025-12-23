-- Add is_paused column to team_notification_settings
ALTER TABLE public.team_notification_settings
ADD COLUMN is_paused boolean NOT NULL DEFAULT false;