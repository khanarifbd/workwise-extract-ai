// Single-code tester login.
// Nav enters the access code on /welcome -> this function validates it,
// ensures the tester user exists with the right role, and returns the
// email+password the browser uses to sign in.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { code } = await req.json().catch(() => ({ code: '' }));
    const submitted = String(code ?? '').trim();

    const expected = Deno.env.get('TESTER_ACCESS_CODE') ?? '';
    const email = Deno.env.get('TESTER_USER_EMAIL') ?? '';
    const password = Deno.env.get('TESTER_USER_PASSWORD') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!expected || !email || !password || !serviceRole) {
      return new Response(JSON.stringify({ error: 'Tester login not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!submitted || submitted.length > 100 || !timingSafeEqual(submitted, expected)) {
      return new Response(JSON.stringify({ error: 'Invalid access code.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find or create the tester user
    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find(
      (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
    );

    if (existing) {
      userId = existing.id;
      // Make sure the password matches what we hand back to the browser
      await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: 'Nav (Tester)' },
      });
      if (createErr || !created.user) {
        console.error('createUser failed', createErr);
        return new Response(JSON.stringify({ error: 'Could not provision tester account.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = created.user.id;
    }

    // Ensure the tester role is assigned
    if (userId) {
      await admin
        .from('user_roles')
        .upsert({ user_id: userId, role: 'tester' }, { onConflict: 'user_id,role' });
    }

    return new Response(JSON.stringify({ email, password }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('tester-login error', err);
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
