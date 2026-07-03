// Returns whether the given team has submitted an EOD report for today (GMT).
// Client cannot read eod_reports directly; RLS restricts to admin/viewer/service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let teamId = "";
  try {
    const body = await req.json();
    teamId = String(body?.teamId || "").trim();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!teamId || teamId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    return json({ error: "Invalid teamId" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: teamRow } = await supabase
    .from("team_access_codes")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .maybeSingle();
  if (!teamRow) return json({ error: "Invalid team" }, 403);

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("eod_reports")
    .select("id")
    .eq("team_id", teamId)
    .eq("report_date", today)
    .maybeSingle();

  return json({ submitted: !!data });
});
