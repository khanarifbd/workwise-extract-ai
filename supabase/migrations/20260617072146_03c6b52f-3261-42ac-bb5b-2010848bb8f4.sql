-- Remove broad SELECT/ALL on progressor_team_codes for job_progressor role.
-- Edge function validate-progressor-team-code uses service role, so client never needs progressor read access.
DROP POLICY IF EXISTS "Job progressors can manage progressor team codes" ON public.progressor_team_codes;