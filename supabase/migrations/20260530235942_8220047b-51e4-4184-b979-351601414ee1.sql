ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS tenant_signature_url text,
  ADD COLUMN IF NOT EXISTS tenant_signature_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tenant_signature_name text;