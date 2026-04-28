// Daily EOD reminder trigger - invoked by pg_cron at 18:00 GMT
// Finds all active DM teams that have jobs assigned (today or overdue) and:
// 1. Inserts an "eod_reminder" message into team_messages
// 2. Sends FCM push notification with type=eod_reminder so the mobile app
//    triggers the loud banner + alarm
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD GMT

  try {
    // 1. Find DM team_ids
    const { data: dmSettings, error: settingsErr } = await supabase
      .from("team_notification_settings")
      .select("team_id, team_name")
      .eq("team_type", "dm")
      .eq("is_paused", false);

    if (settingsErr) throw settingsErr;

    // Filter by active access codes
    const { data: activeCodes } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name")
      .eq("is_active", true)
      .eq("is_ops_manager", false);

    const activeIds = new Set((activeCodes || []).map((c) => c.team_id));
    const dmTeams = (dmSettings || []).filter((t) => activeIds.has(t.team_id));

    const results: Array<{ team_id: string; status: string }> = [];

    for (const team of dmTeams) {
      // Skip if team already submitted today's EOD
      const { data: existing } = await supabase
        .from("eod_reports")
        .select("id")
        .eq("team_id", team.team_id)
        .eq("report_date", today)
        .maybeSingle();

      if (existing) {
        results.push({ team_id: team.team_id, status: "already_submitted" });
        continue;
      }

      // Insert reminder message (mobile app picks this up via realtime)
      await supabase.from("team_messages").insert({
        team_id: team.team_id,
        team_name: team.team_name,
        sender_name: "Genie - EOD",
        message_type: "eod_reminder",
        message_text:
          "🔔 END OF DAY REPORT REQUIRED — Please submit today's EOD: jobs visited, completed, and reasons any are still open.",
      });

      // Push notification (FCM)
      const FIREBASE_SERVICE_ACCOUNT = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (FIREBASE_SERVICE_ACCOUNT) {
        try {
          await supabase.functions.invoke("send-fcm-notification", {
            body: {
              teamId: team.team_id,
              title: "📋 EOD REPORT REQUIRED",
              body:
                "Please submit your End-of-Day report — jobs visited, completed and reasons open jobs are still open.",
              data: {
                type: "eod_reminder",
                deepLink: "/team?eod=1",
              },
            },
          });
        } catch (e) {
          console.error("FCM invoke failed for", team.team_id, e);
        }
      }

      results.push({ team_id: team.team_id, status: "reminded" });
    }

    return new Response(
      JSON.stringify({ success: true, date: today, count: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("trigger-eod-reminder error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
