-- Create team availability table to track unavailable days
CREATE TABLE public.team_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  unavailable_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT,
  UNIQUE(team_id, unavailable_date)
);

-- Enable Row Level Security
ALTER TABLE public.team_availability ENABLE ROW LEVEL SECURITY;

-- Admins can manage all availability
CREATE POLICY "Admins can manage team availability" 
ON public.team_availability 
FOR ALL 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Viewers can view availability
CREATE POLICY "Viewers can view team availability" 
ON public.team_availability 
FOR SELECT 
USING (is_viewer(auth.uid()));

-- Anyone can insert availability (for team portal)
CREATE POLICY "Anyone can insert team availability" 
ON public.team_availability 
FOR INSERT 
WITH CHECK (true);

-- Anyone can delete their own team's availability
CREATE POLICY "Anyone can delete team availability" 
ON public.team_availability 
FOR DELETE 
USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_availability;

-- Create index for faster lookups
CREATE INDEX idx_team_availability_team_date ON public.team_availability(team_id, unavailable_date);
CREATE INDEX idx_team_availability_date ON public.team_availability(unavailable_date);