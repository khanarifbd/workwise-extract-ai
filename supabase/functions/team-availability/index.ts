// Team-portal proxy for team_availability. The team portal authenticates
// field workers via PIN (not Supabase auth), so we route CRUD through this
// service-role function instead of granting anon direct RLS access. This is
// the single choke-point where we validate the team_id, so future tightening
// (rate limiting, audit log) only needs to happen here.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const sanitiseTeamId = (v: unknown) => {
  if (typeof v !== 'string') return null;
  if (v.length === 0 || v.length > 100) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(v)) return null;
  return v;
};

const sanitiseDate = (v: unknown) => {
  if (typeof v !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
};

const sanitiseShort = (v: unknown, max = 500) => {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  return v.slice(0, max);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const action = body.action;
  const teamId = sanitiseTeamId(body.teamId);
  if (!teamId) return json(400, { error: 'invalid_team_id' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Validate that this is a known/active team. Same gate as the prior RLS
  // policy, but enforced server-side so anon clients can no longer enumerate
  // the table directly via PostgREST.
  const { data: teamRow, error: teamErr } = await supabase
    .from('team_access_codes')
    .select('team_id, is_active')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .maybeSingle();

  if (teamErr) {
    console.error('[team-availability] team lookup failed', teamErr);
    return json(500, { error: 'lookup_failed' });
  }
  if (!teamRow) return json(403, { error: 'team_not_authorised' });

  try {
    if (action === 'list') {
      const { data, error } = await supabase
        .from('team_availability')
        .select('*')
        .eq('team_id', teamId)
        .order('unavailable_date');
      if (error) throw error;
      return json(200, { data });
    }

    if (action === 'add') {
      const unavailable_date = sanitiseDate(body.unavailableDate);
      if (!unavailable_date) return json(400, { error: 'invalid_date' });
      const reason = sanitiseShort(body.reason ?? null, 1000);
      const created_by = sanitiseShort(body.createdBy ?? null, 200);

      const { data, error } = await supabase
        .from('team_availability')
        .insert({ team_id: teamId, unavailable_date, reason, created_by })
        .select()
        .maybeSingle();
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return json(409, { error: 'duplicate' });
        }
        throw error;
      }
      return json(200, { data });
    }

    if (action === 'remove') {
      const id = sanitiseShort(body.id, 64);
      const unavailable_date = sanitiseDate(body.unavailableDate);
      let query = supabase.from('team_availability').delete().eq('team_id', teamId);
      if (id) {
        query = query.eq('id', id);
      } else if (unavailable_date) {
        query = query.eq('unavailable_date', unavailable_date);
      } else {
        return json(400, { error: 'missing_target' });
      }
      const { error } = await query;
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(400, { error: 'unknown_action' });
  } catch (err) {
    console.error('[team-availability] op failed', err);
    return json(500, { error: 'op_failed' });
  }
});
