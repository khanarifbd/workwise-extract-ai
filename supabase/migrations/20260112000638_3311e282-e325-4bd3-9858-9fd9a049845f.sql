-- Create table to track individual team sign-offs per job
CREATE TABLE public.team_sign_offs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id text NOT NULL,
  team_name text NOT NULL,
  signed_off_at timestamp with time zone NOT NULL DEFAULT now(),
  photos_count integer NOT NULL DEFAULT 0,
  videos_count integer NOT NULL DEFAULT 0,
  documents_count integer NOT NULL DEFAULT 0,
  work_items_modified integer NOT NULL DEFAULT 0,
  work_items_total integer NOT NULL DEFAULT 0,
  progress_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(job_id, team_id) -- Each team can only sign off once per job
);

-- Enable RLS
ALTER TABLE public.team_sign_offs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage sign-offs"
ON public.team_sign_offs
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Viewers can view sign-offs"
ON public.team_sign_offs
FOR SELECT
USING (is_viewer(auth.uid()));

CREATE POLICY "Service role can manage sign-offs"
ON public.team_sign_offs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_sign_offs;