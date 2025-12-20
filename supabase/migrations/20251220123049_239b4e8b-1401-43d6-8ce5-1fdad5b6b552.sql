-- Add status and booked_date columns to jobs table
ALTER TABLE public.jobs 
ADD COLUMN status text DEFAULT 'pending',
ADD COLUMN booked_date timestamp with time zone;

-- Create notification_history table
CREATE TABLE public.notification_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_number TEXT NOT NULL,
  team_name TEXT NOT NULL,
  whatsapp_number TEXT,
  message TEXT NOT NULL,
  sent_via TEXT NOT NULL DEFAULT 'link',
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on notification_history
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;

-- Create policies for notification_history
CREATE POLICY "Allow public read access" ON public.notification_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.notification_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete access" ON public.notification_history FOR DELETE USING (true);