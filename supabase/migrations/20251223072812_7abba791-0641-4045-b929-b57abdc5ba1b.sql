-- Add category_id column to team_notification_settings to link teams to specific categories
ALTER TABLE public.team_notification_settings 
ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_team_notification_settings_category ON public.team_notification_settings(category_id);