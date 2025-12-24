-- Create contact_history table to track all tenant contact attempts
CREATE TABLE public.contact_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  contact_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL,
  notes TEXT,
  next_action TEXT,
  next_action_date TIMESTAMP WITH TIME ZONE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;

-- Create policy for admins
CREATE POLICY "Admins can manage contact history"
ON public.contact_history
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Create index for faster job lookups
CREATE INDEX idx_contact_history_job_id ON public.contact_history(job_id);
CREATE INDEX idx_contact_history_contact_date ON public.contact_history(contact_date DESC);

-- Enable realtime for contact_history
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_history;