DO $$
DECLARE r record; nq text; nc text; stmt text;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname='public' LOOP
    nq := r.qual; nc := r.with_check;
    IF nq IS NOT NULL THEN
      nq := regexp_replace(nq, '(?<!SELECT public\.)\m(is_admin|is_viewer|is_tester|is_job_progressor|has_admin_access)\(auth\.uid\(\)\)', '(SELECT public.\1(auth.uid()))', 'g');
      nq := regexp_replace(nq, '\(auth\.role\(\) = ''service_role''::text\)', '((SELECT auth.role()) = ''service_role''::text)', 'g');
    END IF;
    IF nc IS NOT NULL THEN
      nc := regexp_replace(nc, '(?<!SELECT public\.)\m(is_admin|is_viewer|is_tester|is_job_progressor|has_admin_access)\(auth\.uid\(\)\)', '(SELECT public.\1(auth.uid()))', 'g');
      nc := regexp_replace(nc, '\(auth\.role\(\) = ''service_role''::text\)', '((SELECT auth.role()) = ''service_role''::text)', 'g');
    END IF;
    IF nq IS DISTINCT FROM r.qual OR nc IS DISTINCT FROM r.with_check THEN
      stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      IF nq IS NOT NULL AND nq IS DISTINCT FROM r.qual THEN stmt := stmt || ' USING (' || nq || ')'; END IF;
      IF nc IS NOT NULL AND nc IS DISTINCT FROM r.with_check THEN stmt := stmt || ' WITH CHECK (' || nc || ')'; END IF;
      EXECUTE stmt;
    END IF;
  END LOOP;
END $$;