// One-off credential rotation: admin-only. Sets a new password on every Genie
// account and revokes all existing sessions (global sign-out).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
  if (!isAdmin) return json({ error: 'forbidden' }, 403);

  const { password } = await req.json();
  if (!password || String(password).length < 12) return json({ error: 'weak password' }, 400);

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const results: Record<string, string> = {};
  for (const user of list?.users ?? []) {
    const { error: upErr } = await admin.auth.admin.updateUserById(user.id, { password });
    if (upErr) { results[user.email ?? user.id] = 'update failed: ' + upErr.message; continue; }
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { data: s, error: sErr } = await c.auth.signInWithPassword({ email: user.email!, password });
    if (sErr || !s.session) { results[user.email!] = 'password set; revoke sign-in failed'; continue; }
    const { error: outErr } = await admin.auth.admin.signOut(s.session.access_token, 'global');
    results[user.email!] = outErr ? 'password set; revoke failed: ' + outErr.message : 'rotated + all sessions revoked';
  }
  return json({ ok: true, results });
});
