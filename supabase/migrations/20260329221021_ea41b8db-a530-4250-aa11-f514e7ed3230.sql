
-- Add blocker tracking columns to jobs table
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS blocker_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blocker_notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS blocker_set_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blocker_chase_date timestamptz DEFAULT NULL;

-- blocker_type values: 'awaiting_photos', 'awaiting_trade', 'awaiting_nph', 'rework_required', 'no_access', 'awaiting_description'
