CREATE TABLE IF NOT EXISTS public.admin_secure_access (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  code_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT ALL ON public.admin_secure_access TO service_role;

ALTER TABLE public.admin_secure_access ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admin_secure_access (id, code_hash)
VALUES (true, '972f66266a40641d058ff86dbf8d2491acc95df103a77e1c78c922917efaa226')
ON CONFLICT (id) DO UPDATE SET code_hash = EXCLUDED.code_hash, updated_at = now();