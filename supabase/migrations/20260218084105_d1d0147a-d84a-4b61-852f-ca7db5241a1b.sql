
CREATE TABLE public.progressor_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  email text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.progressor_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.progressor_access_codes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can manage progressor codes" ON public.progressor_access_codes
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

INSERT INTO public.progressor_access_codes (code, display_name, email)
VALUES ('DANIELLA0001', 'Daniella', 'daniella.progressor@workwish.app');
