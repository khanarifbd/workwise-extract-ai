-- Create table for Operations Manager voice notes
CREATE TABLE public.ops_manager_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by TEXT NOT NULL, -- Team ID of the ops manager
  created_by_name TEXT NOT NULL, -- Team name of the ops manager
  original_audio_url TEXT, -- Optional: URL to the original audio file
  transcribed_text TEXT NOT NULL, -- The raw transcribed text
  enhanced_text TEXT NOT NULL, -- AI-enhanced/cleaned text
  title TEXT NOT NULL, -- AI-generated title
  urgency TEXT NOT NULL DEFAULT 'normal', -- 'immediate', 'high', 'normal', 'low'
  team_association TEXT, -- Which team this note relates to (if any)
  job_number TEXT, -- Which job this note relates to (if any)
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'general', -- 'issue', 'instruction', 'reminder', 'feedback', 'general'
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ops_manager_notes ENABLE ROW LEVEL SECURITY;

-- Admins can manage all notes
CREATE POLICY "Admins can manage ops notes" 
ON public.ops_manager_notes 
FOR ALL 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Viewers can view ops notes
CREATE POLICY "Viewers can view ops notes" 
ON public.ops_manager_notes 
FOR SELECT 
USING (is_viewer(auth.uid()));

-- Service role can manage ops notes (for edge functions)
CREATE POLICY "Service role can manage ops notes" 
ON public.ops_manager_notes 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE TRIGGER update_ops_manager_notes_updated_at
  BEFORE UPDATE ON public.ops_manager_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_ops_manager_notes_created_by ON public.ops_manager_notes(created_by);
CREATE INDEX idx_ops_manager_notes_urgency ON public.ops_manager_notes(urgency);
CREATE INDEX idx_ops_manager_notes_created_at ON public.ops_manager_notes(created_at DESC);
CREATE INDEX idx_ops_manager_notes_is_resolved ON public.ops_manager_notes(is_resolved);