import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendFCMRequest {
  teamId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIREBASE_SERVER_KEY = Deno.env.get("FIREBASE_SERVER_KEY");
    
    if (!FIREBASE_SERVER_KEY) {
      throw new Error("FIREBASE_SERVER_KEY not configured");
    }

    const { teamId, title, body, data }: SendFCMRequest = await req.json();

    if (!teamId || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: teamId, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch FCM tokens for the team
    const { data: tokens, error: fetchError } = await supabase
      .from("team_fcm_tokens")
      .select("fcm_token, platform")
      .eq("team_id", teamId);

    if (fetchError) {
      console.error("Error fetching FCM tokens:", fetchError);
      throw new Error("Failed to fetch FCM tokens");
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No tokens found for team" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending FCM notification to ${tokens.length} devices for team ${teamId}`);

    let successCount = 0;
    let failCount = 0;
    const invalidTokens: string[] = [];

    // Send notification to each token
    for (const { fcm_token, platform } of tokens) {
      try {
        const message = {
          to: fcm_token,
          notification: {
            title,
            body,
            sound: "default",
            badge: 1,
          },
          data: {
            ...data,
            click_action: "FLUTTER_NOTIFICATION_CLICK",
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

        if (result.success === 1) {
          successCount++;
        } else if (result.failure === 1) {
          failCount++;
          // Check if token is invalid and should be removed
          if (result.results?.[0]?.error === "NotRegistered" || 
              result.results?.[0]?.error === "InvalidRegistration") {
            invalidTokens.push(fcm_token);
          }
        }
      } catch (error) {
        console.error(`Error sending to token:`, error);
        failCount++;
      }
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      console.log(`Removing ${invalidTokens.length} invalid tokens`);
      await supabase
        .from("team_fcm_tokens")
        .delete()
        .in("fcm_token", invalidTokens);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failCount,
        removed: invalidTokens.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-fcm-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
