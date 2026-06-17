ALTER TABLE public.sor_match_feedback ADD COLUMN IF NOT EXISTS feedback_scope text NOT NULL DEFAULT 'line' CHECK (feedback_scope IN ('line','overall','missing_task'));
ALTER TABLE public.sor_match_feedback ALTER COLUMN line_description DROP NOT NULL;
ALTER TABLE public.sor_match_feedback ALTER COLUMN sor_code DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sor_match_feedback_scope ON public.sor_match_feedback(feedback_scope, created_at DESC);