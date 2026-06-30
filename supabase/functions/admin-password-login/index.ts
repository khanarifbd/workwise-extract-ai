import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const normalizePasswordVariants = (password: string) => {
  const raw = password.normalize('NFC');
  const withoutZeroWidth = raw.replace(/[\u200B-\u200D\uFEFF]/g, '');
  const nfkc = raw.normalize('NFKC');
  return Array.from(new Set([
    raw,
    raw.trim(),
    withoutZeroWidth,
    withoutZeroWidth.trim(),
    nfkc,
    nfkc.trim(),
  ].filter(Boolean)));
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!email || email.length > 320 || !email.includes('@') || !password || password.length > 512) {
      return json({ error: 'Enter a valid email and password.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const authKey = Deno.env.get('SUPABASE_ANON_KEY')
      ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
      ?? '';

    if (!supabaseUrl || !authKey) {
      return json({ error: 'Login service is not configured.' }, 500);
    }

    const authClient = createClient(supabaseUrl, authKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'X-Client-Info': 'genie-admin-password-login' } },
    });

    let lastError: Awaited<ReturnType<typeof authClient.auth.signInWithPassword>>['error'] | null = null;

    for (const attemptPassword of normalizePasswordVariants(password)) {
      const { data, error } = await authClient.auth.signInWithPassword({ email, password: attemptPassword });

      if (!error && data.session) {
        return json({
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
            user: {
              id: data.session.user.id,
              email: data.session.user.email,
            },
          },
        });
      }

      lastError = error;
      if ((error as { code?: string } | null)?.code !== 'invalid_credentials') break;
    }

    const code = (lastError as { code?: string } | null)?.code;
    return json({
      error: code === 'invalid_credentials'
        ? 'Login details were rejected by the authentication service. Please reselect the saved login or reset the password.'
        : lastError?.message ?? 'Login could not be completed.',
      code: code ?? null,
    }, code === 'invalid_credentials' ? 401 : 400);
  } catch (err) {
    console.error('admin-password-login error', err);
    return json({ error: 'Unexpected login error.' }, 500);
  }
});