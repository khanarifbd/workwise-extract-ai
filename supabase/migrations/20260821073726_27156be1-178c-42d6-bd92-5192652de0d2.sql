CREATE TABLE public.job_field_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_number text,
  field_name text NOT NULL,
  version integer NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_email text,
  changed_by_label text,
  change_kind text NOT NULL DEFAULT 'edit',
  chars_removed integer NOT NULL DEFAULT 0,
  chars_added integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_field_versions_job ON public.job_field_versions(job_id, field_name, version DESC);
CREATE INDEX idx_job_field_versions_created ON public.job_field_versions(created_at DESC);

GRANT SELECT ON public.job_field_versions TO authenticated;
GRANT ALL ON public.job_field_versions TO service_role;

ALTER TABLE public.job_field_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and viewers can read job field versions"
ON public.job_field_versions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'viewer'::public.app_role)
  OR public.has_role(auth.uid(), 'tester'::public.app_role)
  OR public.has_role(auth.uid(), 'job_progressor'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.record_job_field_versions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  f text;
  fields text[] := ARRAY[
    'description','summary_of_works','progress_notes','private_notes',
    'booking_notes','ongoing_reason','blocker_notes','refer_back_reason','name','address'
  ];
  old_v text;
  new_v text;
  next_version integer;
  actor uuid;
  actor_email text;
  kind text;
BEGIN
  actor := auth.uid();
  IF actor IS NOT NULL THEN
    SELECT email INTO actor_email FROM public.profiles WHERE user_id = actor LIMIT 1;
  END IF;

  FOREACH f IN ARRAY fields LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f)
      INTO old_v, new_v
      USING OLD, NEW;

    IF old_v IS DISTINCT FROM new_v THEN
      SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
      FROM public.job_field_versions
      WHERE job_id = NEW.id AND field_name = f;

      IF COALESCE(new_v, '') = '' THEN
        kind := 'cleared';
      ELSIF COALESCE(old_v, '') = '' THEN
        kind := 'created';
      ELSIF length(new_v) < length(old_v) THEN
        kind := 'shortened';
      ELSE
        kind := 'edit';
      END IF;

      INSERT INTO public.job_field_versions (
        job_id, job_number, field_name, version, old_value, new_value,
        changed_by, changed_by_email, changed_by_label, change_kind,
        chars_removed, chars_added
      ) VALUES (
        NEW.id, NEW.job_number, f, next_version, old_v, new_v,
        actor, actor_email, COALESCE(actor_email, 'system/portal'), kind,
        GREATEST(length(COALESCE(old_v, '')) - length(COALESCE(new_v, '')), 0),
        GREATEST(length(COALESCE(new_v, '')) - length(COALESCE(old_v, '')), 0)
      );
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'record_job_field_versions error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_record_job_field_versions
AFTER UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.record_job_field_versions();

INSERT INTO public.job_field_versions (job_id, job_number, field_name, version, old_value, new_value, changed_by_label, change_kind, chars_added)
SELECT j.id, j.job_number, v.field_name, 1, NULL, v.val, 'baseline (pre-history)', 'baseline', length(v.val)
FROM public.jobs j
CROSS JOIN LATERAL (VALUES
  ('description', j.description),
  ('summary_of_works', j.summary_of_works),
  ('progress_notes', j.progress_notes),
  ('private_notes', j.private_notes),
  ('booking_notes', j.booking_notes),
  ('ongoing_reason', j.ongoing_reason),
  ('blocker_notes', j.blocker_notes),
  ('refer_back_reason', j.refer_back_reason),
  ('name', j.name),
  ('address', j.address)
) AS v(field_name, val)
WHERE COALESCE(v.val, '') <> '';