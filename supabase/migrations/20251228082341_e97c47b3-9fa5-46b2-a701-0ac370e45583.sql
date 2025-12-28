-- Create table for storing FCM tokens for mobile push notifications
CREATE TABLE public.team_fcm_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  platform TEXT DEFAULT 'android',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, fcm_token)
);

-- Enable RLS
ALTER TABLE public.team_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert/update/delete their own tokens (for team portal)
CREATE POLICY "Anyone can manage FCM tokens"
ON public.team_fcm_tokens
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_team_fcm_tokens_team_id ON public.team_fcm_tokens(team_id);

-- Create trigger for updating updated_at
CREATE TRIGGER update_team_fcm_tokens_updated_at
BEFORE UPDATE ON public.team_fcm_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();