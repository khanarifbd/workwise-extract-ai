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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const path = normalisePath(body.path ?? body.url);
    if (!path) return json({ error: 'Valid attachment path is required.' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Signing service is not configured.' }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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