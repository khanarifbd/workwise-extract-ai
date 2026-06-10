// Returns the full edit history for a single job that this team signed off.
// Includes original sign-off + every archive edit (notes & photos).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { teamId?: string; jobId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const teamId = body.teamId;
  const jobId = body.jobId;
  if (!teamId || !jobId || !UUID_RE.test(jobId)) {
    return new Response(JSON.stringify({ error: "teamId and valid jobId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validate team
  const { data: teamRow } = await supabase
    .from("team_access_codes")
    .select("team_id, team_name, is_active")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .maybeSingle();
  if (!teamRow) {
    return new Response(JSON.stringify({ error: "Invalid team" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const teamName = teamRow.team_name as string;

  // Authorize: team is assigned by NAME on the job (team or team2),
  // OR this team has a sign-off record for the job.
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("id, team, team2, is_completed, status")
    .eq("id", jobId)
    .maybeSingle();

  let authorized = !!jobRow && (jobRow.team === teamName || jobRow.team2 === teamName);
  if (!authorized) {
    const { data: anySignOff } = await supabase
      .from("team_sign_offs")
      .select("id")
      .eq("job_id", jobId)
      .eq("team_id", teamId)
      .limit(1)
      .maybeSingle();
    authorized = !!anySignOff;
  }
  if (!jobRow || !authorized) {
    return new Response(JSON.stringify({ error: "Not authorized for this job" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sign-off is optional — fetch if present
  const { data: signOff } = await supabase
    .from("team_sign_offs")
    .select("id, signed_off_at, progress_notes, photos_count, videos_count, documents_count, work_items_modified, work_items_total, team_name")
    .eq("job_id", jobId)
    .eq("team_id", teamId)
    .maybeSingle();

  const { data: updates } = await supabase
    .from("team_job_updates")
    .select("id, created_at, updated_by, notes, photos, status")
    .eq("job_id", jobId)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(200);

  return new Response(
    JSON.stringify({ success: true, signOff, updates: updates || [] }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
