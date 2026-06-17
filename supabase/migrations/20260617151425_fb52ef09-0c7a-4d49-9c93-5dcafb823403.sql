
CREATE TABLE public.sor_match_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_description TEXT NOT NULL,
  line_description TEXT NOT NULL,
  sor_code TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('good','fair','bad')),
  tier TEXT,
  confidence INTEGER,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sor_match_feedback_code ON public.sor_match_feedback(sor_code);
CREATE INDEX idx_sor_match_feedback_created ON public.sor_match_feedback(created_at DESC);

GRANT SELECT, INSERT ON public.sor_match_feedback TO authenticated;
GRANT ALL ON public.sor_match_feedback TO service_role;

ALTER TABLE public.sor_match_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert their own feedback"
  ON public.sor_match_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all feedback"
  ON public.sor_match_feedback FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
