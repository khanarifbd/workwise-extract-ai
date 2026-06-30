CREATE OR REPLACE FUNCTION public.is_tester(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'tester'::app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.is_tester(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_tester(uuid) TO authenticated;