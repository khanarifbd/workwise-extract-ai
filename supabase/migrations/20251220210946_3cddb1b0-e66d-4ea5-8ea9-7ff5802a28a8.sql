-- Add push subscriptions table for browser push notifications
CREATE TABLE public.team_push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, endpoint)
);

-- Enable RLS
ALTER TABLE public.team_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies for push subscriptions
CREATE POLICY "Anyone can manage push subscriptions"
ON public.team_push_subscriptions
FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_team_push_subscriptions_updated_at
  BEFORE UPDATE ON public.team_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add RLS policy for admin to manage team_access_codes
CREATE POLICY "Anyone can manage access codes"
ON public.team_access_codes
FOR ALL
USING (true)
WITH CHECK (true);

-- Drop restrictive policy
DROP POLICY IF EXISTS "Anyone can verify access codes" ON public.team_access_codes;