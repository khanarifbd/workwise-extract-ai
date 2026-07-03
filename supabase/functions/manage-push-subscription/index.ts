// Manages web push subscriptions for a PIN-validated team.
// Client cannot write/read team_push_subscriptions directly; RLS blocks anon access.
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

  let body: {
    action?: "subscribe" | "unsubscribe";
    teamId?: string;
    endpoint?: string;
    p256dh?: string;
    auth?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const teamId = String(body.teamId || "").trim();
  const endpoint = String(body.endpoint || "").trim();
  const action = body.action || "subscribe";

  if (!teamId || teamId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    return json({ error: "Invalid teamId" }, 400);
  }
  if (!endpoint || endpoint.length > 2000 || !endpoint.startsWith("http")) {
    return json({ error: "Invalid endpoint" }, 400);
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

  if (action === "unsubscribe") {
    const { error } = await supabase
      .from("team_push_subscriptions")
      .delete()
      .eq("team_id", teamId)
      .eq("endpoint", endpoint);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  const p256dh = String(body.p256dh || "").trim();
  const auth = String(body.auth || "").trim();
  if (!p256dh || !auth || p256dh.length > 500 || auth.length > 500) {
    return json({ error: "Invalid subscription keys" }, 400);
  }

  const { error } = await supabase
    .from("team_push_subscriptions")
    .upsert(
      { team_id: teamId, endpoint, p256dh, auth },
      { onConflict: "team_id,endpoint" },
    );
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
});
