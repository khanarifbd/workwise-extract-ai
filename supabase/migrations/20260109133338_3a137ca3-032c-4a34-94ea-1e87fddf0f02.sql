-- Add is_ops_manager flag to team_access_codes table
ALTER TABLE public.team_access_codes 
ADD COLUMN is_ops_manager boolean NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.team_access_codes.is_ops_manager IS 'When true, this team member receives ALL job notifications and can see ALL jobs';