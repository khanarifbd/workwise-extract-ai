-- 1) Store webhook secret in Vault (idempotent)
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'webhook_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret('1969allsaints', 'webhook_secret', 'Shared secret for job-notification-trigger edge function');
  ELSE
    PERFORM vault.update_secret(v_id, '1969allsaints', 'webhook_secret', 'Shared secret for job-notification-trigger edge function');
  END IF;
END $$;

-- 2) Replace trigger function to actually POST to the edge function
CREATE OR REPLACE FUNCTION public.notify_job_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
  v_secret text;
  v_request_id bigint;
BEGIN
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );

  -- Read webhook secret from Vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'webhook_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE LOG 'webhook_secret not found in vault; skipping notification';
    RETURN NEW;
  END IF;

  -- Fire-and-forget POST via pg_net
  SELECT net.http_post(
    url := 'https://rluhsstejgkghgheebgt.supabase.co/functions/v1/job-notification-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := payload,
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  RAISE LOG 'job-notification-trigger dispatched, net request id: %', v_request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the underlying UPDATE/INSERT because of a notification failure
  RAISE LOG 'notify_job_changes error: %', SQLERRM;
  RETURN NEW;
END;
$function$;