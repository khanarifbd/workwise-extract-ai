// Registers, updates, or deletes an FCM push token for a PIN-validated team.
// Client cannot write team_fcm_tokens directly; RLS blocks anon writes.
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
    action?: "upsert" | "delete";
    teamId?: string;
    fcmToken?: string;
    platform?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = body.action || "upsert";
  const teamId = String(body.teamId || "").trim();
  const fcmToken = String(body.fcmToken || "").trim();
  const platform = String(body.platform || "").trim().slice(0, 40) || null;

  if (!teamId || teamId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    return json({ error: "Invalid teamId" }, 400);
  }
  if (!fcmToken || fcmToken.length > 500) {
    return json({ error: "Invalid fcmToken" }, 400);
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

  if (action === "delete") {
    const { error } = await supabase
      .from("team_fcm_tokens")
      .delete()
      .eq("team_id", teamId)
      .eq("fcm_token", fcmToken);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  const { data: existing } = await supabase
    .from("team_fcm_tokens")
    .select("id")
    .eq("team_id", teamId)
    .eq("fcm_token", fcmToken)
    .maybeSingle();

  if (existing) return json({ success: true, existed: true });

  const { error } = await supabase
    .from("team_fcm_tokens")
    .insert({ team_id: teamId, fcm_token: fcmToken, platform });
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
});
