-- Create table for team access codes (PIN-based access)
CREATE TABLE public.team_access_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  access_code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_access_codes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to verify access codes (needed for login)
CREATE POLICY "Anyone can verify access codes"
ON public.team_access_codes
FOR SELECT
USING (is_active = true);

-- Create table for team job progress updates
CREATE TABLE public.team_job_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  notes TEXT,
  photos TEXT[] DEFAULT '{}',
  status TEXT,
  updated_by TEXT,
  synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_job_updates ENABLE ROW LEVEL SECURITY;

-- Allow read/write for all (PIN-based auth, not user-based)
CREATE POLICY "Anyone can view team updates"
ON public.team_job_updates
FOR SELECT
USING (true);

CREATE POLICY "Anyone can create team updates"
ON public.team_job_updates
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update team updates"
ON public.team_job_updates
FOR UPDATE
USING (true);

-- Create table for offline sync queue
CREATE TABLE public.offline_sync_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  synced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  synced_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY;

-- Allow read/write for all (PIN-based auth)
CREATE POLICY "Anyone can manage sync queue"
ON public.offline_sync_queue
FOR ALL
USING (true);

-- Add triggers for updated_at
CREATE TRIGGER update_team_access_codes_updated_at
BEFORE UPDATE ON public.team_access_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_job_updates_updated_at
BEFORE UPDATE ON public.team_job_updates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for team_job_updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_job_updates;