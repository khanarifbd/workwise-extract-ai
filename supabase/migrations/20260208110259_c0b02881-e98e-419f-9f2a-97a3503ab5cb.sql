-- Add ongoing_reason field for "WHY JOB IS ONGOING" input
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS ongoing_reason TEXT DEFAULT '';

-- Add scheduled_trades JSONB array field for tracking trades and dates for ongoing job completion
-- Format: [{ "id": "uuid", "trade": "Electrician", "tradesman": "John Smith", "date": "2026-02-15" }]
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS scheduled_trades JSONB DEFAULT '[]'::jsonb;