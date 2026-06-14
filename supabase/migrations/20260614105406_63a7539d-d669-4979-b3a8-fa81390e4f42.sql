
-- 1. Remove duplicates: keep oldest entry per normalised code
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY upper(trim(code)) ORDER BY created_at ASC, id ASC) AS rn
  FROM public.sor_code_entries
)
DELETE FROM public.sor_code_entries e
USING ranked r
WHERE e.id = r.id AND r.rn > 1;

-- 2. Insert missing SOR codes harvested from jobs
WITH job_items AS (
  SELECT
    upper(trim(wi->>'sorCode')) AS code_norm,
    trim(wi->>'sorCode') AS code_raw,
    NULLIF(trim(wi->>'description'), '') AS description,
    NULLIF((wi->>'cost')::text, '')::numeric AS cost
  FROM public.jobs,
       jsonb_array_elements(
         COALESCE(work_items, '[]'::jsonb) || COALESCE(additional_works, '[]'::jsonb)
       ) AS wi
  WHERE deleted_at IS NULL
    AND wi->>'sorCode' IS NOT NULL
    AND length(trim(wi->>'sorCode')) > 0
),
existing AS (
  SELECT DISTINCT upper(trim(code)) AS code_norm FROM public.sor_code_entries
),
missing AS (
  SELECT DISTINCT ON (code_norm)
    code_raw,
    code_norm,
    COALESCE(description, code_raw) AS description,
    COALESCE(cost, 0) AS cost
  FROM job_items
  WHERE code_norm NOT IN (SELECT code_norm FROM existing)
  ORDER BY code_norm, length(COALESCE(description, '')) DESC
)
INSERT INTO public.sor_code_entries (book_id, code, description, category, cost, unit, keywords)
SELECT
  '11111111-1111-1111-1111-111111111111'::uuid,
  substring(code_raw for 64),
  substring(description for 1000),
  'From Jobs',
  cost,
  NULL,
  '{}'::text[]
FROM missing;

-- 3. Refresh book code_count
UPDATE public.sor_code_books b
SET code_count = (SELECT COUNT(*) FROM public.sor_code_entries e WHERE e.book_id = b.id),
    status = 'ready'
WHERE b.id = '11111111-1111-1111-1111-111111111111';
