import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const normalisePath = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 1000) return null;

  let path = raw;
  const match = raw.match(/\/job-attachments\/(.+?)(?:\?|$)/);
  if (match?.[1]) path = match[1];
  path = path.replace(/^job-attachments\//, '');

  try {
    path = decodeURIComponent(path);
  } catch {
    // keep original path if it is not URI encoded
  }

  if (path.includes('..') || path.startsWith('/') || path.includes('\\')) return null;
  return path;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const textOrNull = (value: unknown, maxLength = 120): string | null => {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength) return null;
  return text;
};

const pathLooksScopedToJob = (path: string, jobId: string): boolean => {
  const parts = path.split('/').filter(Boolean);
  return parts.includes(jobId);
};

const isAuthorizedAuthUser = async (
  supabase: ReturnType<typeof createClient>,
  req: Request,
): Promise<boolean> => {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return false;

  const { data: roleRows, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'viewer', 'tester', 'job_progressor']);

  if (error) {
    console.error('Role check failed while signing attachment', error);
    return false;
  }

  return (roleRows ?? []).length > 0;
};

const isAuthorizedTeam = async (
  supabase: ReturnType<typeof createClient>,
  path: string,
  teamId: string | null,
  jobId: string | null,
): Promise<boolean> => {
  if (!teamId || !jobId || !UUID_RE.test(jobId)) return false;
  if (!pathLooksScopedToJob(path, jobId)) return false;

  const { data: teamRow, error: teamError } = await supabase
    .from('team_access_codes')
    .select('team_id, team_name, is_active')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .maybeSingle();

  if (teamError || !teamRow) return false;
  const teamName = String(teamRow.team_name ?? '');

  const { data: jobRow } = await supabase
    .from('jobs')
    .select('id, team, team2')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle();

  if (jobRow && (jobRow.team === teamName || jobRow.team2 === teamName)) return true;

  const { data: signOffRow } = await supabase
    .from('team_sign_offs')
    .select('id')
    .eq('job_id', jobId)
    .eq('team_id', teamId)
    .limit(1)
    .maybeSingle();

  return !!signOffRow;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const path = normalisePath(body.path ?? body.url);
    if (!path) return json({ error: 'Valid attachment path is required.' }, 400);
    const teamId = textOrNull(body.teamId);
    const jobId = textOrNull(body.jobId, 80);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Signing service is not configured.' }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authorized = await isAuthorizedAuthUser(supabase, req)
      || await isAuthorizedTeam(supabase, path, teamId, jobId);

    if (!authorized) {
      return json({ error: 'Not authorized to open this attachment.' }, 403);
    }

    const { data, error } = await supabase.storage
      .from('job-attachments')
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      console.error('Could not sign job attachment', { path, error });
      return json({ error: 'Attachment could not be opened.' }, 404);
    }

    return json({ signedUrl: data.signedUrl, expiresIn: 3600 });
  } catch (err) {
    console.error('sign-job-attachment-url error', err);
    return json({ error: 'Unexpected signing error.' }, 500);
  }
});