-- 1) Keep parent links clean whenever a linked trade job is soft-deleted
CREATE OR REPLACE FUNCTION public.clear_parent_links_on_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.jobs SET linked_fan_job_id = NULL WHERE linked_fan_job_id = NEW.id;
    UPDATE public.jobs SET linked_roofing_job_id = NULL WHERE linked_roofing_job_id = NEW.id;
    UPDATE public.jobs SET linked_flooring_job_id = NULL WHERE linked_flooring_job_id = NEW.id;
    UPDATE public.jobs SET linked_fire_door_job_id = NULL WHERE linked_fire_door_job_id = NEW.id;
    UPDATE public.jobs SET linked_insulation_job_id = NULL WHERE linked_insulation_job_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_parent_links_on_soft_delete ON public.jobs;
CREATE TRIGGER trg_clear_parent_links_on_soft_delete
AFTER UPDATE OF deleted_at ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.clear_parent_links_on_soft_delete();

-- 2) Relink parents to their live "<job>-FAN" job when the link is missing or points at a deleted job
UPDATE public.jobs p
SET linked_fan_job_id = f.id
FROM public.jobs f
WHERE p.deleted_at IS NULL
  AND f.deleted_at IS NULL
  AND lower(f.job_number) = lower(p.job_number) || '-fan'
  AND (p.linked_fan_job_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.jobs x WHERE x.id = p.linked_fan_job_id AND x.deleted_at IS NULL));

-- 3) Clear any remaining links that point at deleted fan jobs
UPDATE public.jobs p
SET linked_fan_job_id = NULL
WHERE p.linked_fan_job_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.jobs x WHERE x.id = p.linked_fan_job_id AND x.deleted_at IS NULL);