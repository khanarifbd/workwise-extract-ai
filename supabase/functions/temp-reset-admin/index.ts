import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const email = 'info@allsaintsbuilders.com';
  const newPassword = 'Genie-Nav-2026!';

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) return new Response(JSON.stringify({ error: listErr.message }), { status: 500 });
  const user = list.users.find((u) => (u.email ?? '').toLowerCase() === email);
  if (!user) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
    email_confirm: true,
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true, email, newPassword }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
