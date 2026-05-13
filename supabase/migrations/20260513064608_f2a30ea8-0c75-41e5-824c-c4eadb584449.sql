-- Enable RLS on realtime.messages and scope channel subscriptions to authorized staff only.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authorized staff can broadcast realtime messages" ON realtime.messages;

CREATE POLICY "Authorized staff can read realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_viewer(auth.uid())
  OR public.is_job_progressor(auth.uid())
);

CREATE POLICY "Authorized staff can broadcast realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_viewer(auth.uid())
  OR public.is_job_progressor(auth.uid())
);