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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const authKey = Deno.env.get('SUPABASE_ANON_KEY')
      ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
      ?? serviceRole;

    if (!expected || !email || !password || !supabaseUrl || !serviceRole || !authKey) {
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
      const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (updateErr) {
        console.error('updateUserById failed', updateErr);
        return new Response(JSON.stringify({ error: 'Could not refresh tester account.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
      const { error: roleErr } = await admin
        .from('user_roles')
        .upsert({ user_id: userId, role: 'tester' }, { onConflict: 'user_id,role' });
      if (roleErr) {
        console.error('tester role upsert failed', roleErr);
        return new Response(JSON.stringify({ error: 'Could not enable tester access.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Sign in inside the function and return a ready session. This removes the
    // browser-side password handoff/race that was producing intermittent
    // “Invalid login credentials” after the tester account password was rotated.
    const authClient = createClient(supabaseUrl, authKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let session: Awaited<ReturnType<typeof authClient.auth.signInWithPassword>>['data']['session'] | null = null;
    let signInError: Awaited<ReturnType<typeof authClient.auth.signInWithPassword>>['error'] | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: signInData, error: signInErr } = await authClient.auth.signInWithPassword({
        email,
        password,
      });

      if (!signInErr && signInData.session) {
        session = signInData.session;
        signInError = null;
        break;
      }

      signInError = signInErr;
      await wait(250 * (attempt + 1));
    }

    if (!session) {
      console.error('tester session creation failed', signInError);
      return new Response(JSON.stringify({ error: 'Could not start tester session.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: {
          id: session.user.id,
          email: session.user.email,
        },
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('tester-login error', err);
    return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
