-- Add language preference column to team_access_codes
ALTER TABLE public.team_access_codes 
ADD COLUMN language_preference TEXT DEFAULT 'en';

-- Add comment explaining the column
COMMENT ON COLUMN public.team_access_codes.language_preference IS 'ISO 639-1 language code for team member translation preference (e.g., en, es, pl, ro, pt)';