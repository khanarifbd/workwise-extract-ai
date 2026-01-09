import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JobUpdatePayload {
  type: "INSERT" | "UPDATE";
  table: string;
  record: {
    id: string;
    job_number: string;
    name: string;
    team: string | null;
    status: string | null;
    address: string | null;
    booked_date: string | null;
  };
  old_record?: {
    id: string;
    job_number: string;
    name: string;
    team: string | null;
    status: string | null;
    address: string | null;
    booked_date: string | null;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: JobUpdatePayload = await req.json();
    console.log("Job notification trigger received:", JSON.stringify(payload, null, 2));

    const { record, old_record, type } = payload;

    // Determine what changed
    const teamChanged = type === "UPDATE" && record.team !== old_record?.team;
    const statusChanged = type === "UPDATE" && record.status !== old_record?.status;
    const newJobAssigned = type === "INSERT" && record.team;

    // If no relevant change, skip
    if (!teamChanged && !statusChanged && !newJobAssigned) {
      console.log("No relevant changes detected, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "No notification needed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build notification message
    let title = "";
    let body = "";

    if (newJobAssigned || (teamChanged && record.team)) {
      title = "🆕 নতুন জব অ্যাসাইন হয়েছে";
      body = `জব #${record.job_number}: ${record.name}`;
      if (record.address) {
        body += `\n📍 ${record.address}`;
      }
    } else if (statusChanged) {
      const statusLabels: Record<string, string> = {
        pending: "পেন্ডিং",
        scheduled: "সিডিউল করা হয়েছে",
        in_progress: "কাজ চলছে",
        completed: "সম্পন্ন",
        on_hold: "হোল্ডে আছে",
        cancelled: "বাতিল",
      };
      const statusLabel = statusLabels[record.status || ""] || record.status;
      title = "📋 জব স্ট্যাটাস আপডেট";
      body = `জব #${record.job_number}: ${statusLabel}`;
    }

    if (!title || !body) {
      console.log("No notification message generated");
      return new Response(
        JSON.stringify({ success: true, message: "No notification generated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect all team IDs to notify
    const teamsToNotify: Array<{ teamId: string; teamName: string }> = [];

    // Get team ID from team_notification_settings for the assigned team
    const teamName = record.team;
    if (teamName) {
      const { data: teamSettings, error: teamError } = await supabase
        .from("team_notification_settings")
        .select("team_id, is_paused")
        .eq("team_name", teamName)
        .maybeSingle();

      if (teamError) {
        console.error("Error fetching team settings:", teamError);
      } else if (teamSettings && !teamSettings.is_paused) {
        teamsToNotify.push({ teamId: teamSettings.team_id, teamName });
      }
    }

    // ALWAYS notify Operations Manager(s) - they receive ALL notifications
    const { data: opsManagers, error: opsError } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name")
      .eq("is_ops_manager", true)
      .eq("is_active", true);

    if (opsError) {
      console.error("Error fetching ops managers:", opsError);
    } else if (opsManagers && opsManagers.length > 0) {
      for (const opsMgr of opsManagers) {
        // Avoid duplicate if ops manager is also the assigned team
        if (!teamsToNotify.some(t => t.teamId === opsMgr.team_id)) {
          teamsToNotify.push({ teamId: opsMgr.team_id, teamName: opsMgr.team_name });
        }
      }
    }

    if (teamsToNotify.length === 0) {
      console.log("No teams to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No teams to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending notifications to ${teamsToNotify.length} teams: ${title} - ${body}`);

    // Send notifications to all teams
    const FIREBASE_SERVER_KEY = Deno.env.get("FIREBASE_SERVER_KEY");
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

    for (const { teamId, teamName: notifyTeamName } of teamsToNotify) {
      console.log(`Sending notification to team ${teamId} (${notifyTeamName})`);

      // Send FCM notification (for native apps)
      if (FIREBASE_SERVER_KEY) {
        const { data: fcmTokens, error: fcmError } = await supabase
          .from("team_fcm_tokens")
          .select("fcm_token, platform")
          .eq("team_id", teamId);

        if (fcmError) {
          console.error("Error fetching FCM tokens:", fcmError);
        } else if (fcmTokens && fcmTokens.length > 0) {
          console.log(`Sending FCM to ${fcmTokens.length} devices for team ${teamId}`);
          
          const invalidTokens: string[] = [];
          
          for (const { fcm_token, platform } of fcmTokens) {
            try {
              const message = {
                to: fcm_token,
                notification: {
                  title,
                  body,
                  sound: "default",
                  badge: 1,
                  click_action: "OPEN_JOB_ACTIVITY",
                },
                data: {
                  jobId: record.id,
                  jobNumber: record.job_number,
                  teamId: teamId,
                  type: statusChanged ? "status_change" : "job_assigned",
                  click_action: "OPEN_JOB_ACTIVITY",
                  deepLink: `/team?job=${record.id}&action=submit`,
                },
                priority: "high",
                content_available: true,
              };

              const response = await fetch("https://fcm.googleapis.com/fcm/send", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `key=${FIREBASE_SERVER_KEY}`,
                },
                body: JSON.stringify(message),
              });

              const result = await response.json();
              console.log(`FCM response for ${platform}:`, result);

              if (result.failure === 1) {
                if (result.results?.[0]?.error === "NotRegistered" || 
                    result.results?.[0]?.error === "InvalidRegistration") {
                  invalidTokens.push(fcm_token);
                }
              }
            } catch (error) {
              console.error(`Error sending FCM to token:`, error);
            }
          }

          // Clean up invalid tokens
          if (invalidTokens.length > 0) {
            console.log(`Removing ${invalidTokens.length} invalid FCM tokens`);
            await supabase
              .from("team_fcm_tokens")
              .delete()
              .in("fcm_token", invalidTokens);
          }
        }
      }

      // Send Web Push notification (for PWA)
      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        const { data: pushSubs, error: pushError } = await supabase
          .from("team_push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("team_id", teamId);

        if (pushError) {
          console.error("Error fetching push subscriptions:", pushError);
        } else if (pushSubs && pushSubs.length > 0) {
          console.log(`Found ${pushSubs.length} web push subscriptions for team ${teamId}`);
        }
      }

      // Log notification to history
      await supabase
        .from("notification_history")
        .insert({
          job_id: record.id,
          job_number: record.job_number,
          team_name: notifyTeamName,
          message: `${title}: ${body}`,
          sent_via: "push",
          status: "sent",
        });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notifications sent" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in job-notification-trigger:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
