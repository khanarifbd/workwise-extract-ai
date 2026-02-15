
-- Create team messages table for admin-to-team communication
CREATE TABLE public.team_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT 'Genie',
  message_type TEXT NOT NULL DEFAULT 'text', -- 'text' or 'audio'
  message_text TEXT,
  audio_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Admins can manage all messages
CREATE POLICY "Admins can manage team messages"
ON public.team_messages
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Service role can manage (for edge functions)
CREATE POLICY "Service role can manage team messages"
ON public.team_messages
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Viewers can view
CREATE POLICY "Viewers can view team messages"
ON public.team_messages
FOR SELECT
USING (is_viewer(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;

-- Trigger for updated_at
CREATE TRIGGER update_team_messages_updated_at
BEFORE UPDATE ON public.team_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
