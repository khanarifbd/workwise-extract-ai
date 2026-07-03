
DROP POLICY IF EXISTS "Valid teams insert their EOD" ON public.eod_reports;
DROP POLICY IF EXISTS "Valid teams update their EOD" ON public.eod_reports;
DROP POLICY IF EXISTS "Valid teams view their EOD" ON public.eod_reports;

DROP POLICY IF EXISTS "Teams can insert their own FCM tokens" ON public.team_fcm_tokens;
DROP POLICY IF EXISTS "Teams can update their own FCM tokens" ON public.team_fcm_tokens;
DROP POLICY IF EXISTS "Teams can delete their own FCM tokens" ON public.team_fcm_tokens;

DROP POLICY IF EXISTS "Valid teams can insert job updates" ON public.team_job_updates;

DROP POLICY IF EXISTS "Teams can view their own push subscriptions" ON public.team_push_subscriptions;
DROP POLICY IF EXISTS "Valid teams can insert push subscriptions" ON public.team_push_subscriptions;

DROP POLICY IF EXISTS "Authenticated users can view attachments" ON storage.objects;
