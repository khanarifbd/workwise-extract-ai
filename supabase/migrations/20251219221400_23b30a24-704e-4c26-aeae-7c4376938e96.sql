-- Create jobs table
CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_number TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone_number TEXT,
  summary_of_works TEXT,
  description TEXT,
  work_items JSONB DEFAULT '[]'::jsonb,
  additional_works JSONB DEFAULT '[]'::jsonb,
  team TEXT,
  progress INTEGER DEFAULT 0,
  progress_notes TEXT,
  is_completed BOOLEAN DEFAULT false,
  date_issued TIMESTAMP WITH TIME ZONE DEFAULT now(),
  start_date TIMESTAMP WITH TIME ZONE,
  completion_date TIMESTAMP WITH TIME ZONE,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no auth required for this app)
CREATE POLICY "Allow public read access" 
ON public.jobs 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert access" 
ON public.jobs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update access" 
ON public.jobs 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete access" 
ON public.jobs 
FOR DELETE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for jobs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;