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

// Function to get OAuth2 access token from service account for FCM
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1 hour

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const claimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: expiry,
  };

  const encoder = new TextEncoder();
  const base64url = (data: string) => {
    return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const headerB64 = base64url(JSON.stringify(header));
  const claimSetB64 = base64url(JSON.stringify(claimSet));
  const signatureInput = `${headerB64}.${claimSetB64}`;

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${signatureInput}.${signatureB64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Token exchange error:", errorText);
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { teamId, title, body, data }: SendFCMRequest = await req.json();

    if (!teamId || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: teamId, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FIREBASE_SERVICE_ACCOUNT = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!FIREBASE_SERVICE_ACCOUNT) {
      console.error("FIREBASE_SERVICE_ACCOUNT not configured");
      return new Response(
        JSON.stringify({ error: "Push notification service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    const projectId = serviceAccount.project_id;

    // Get access token for FCM v1 API
    const accessToken = await getAccessToken(serviceAccount);

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch tokens for the team
    const { data: tokens, error: fetchError } = await supabase
      .from("team_fcm_tokens")
      .select("fcm_token, platform")
      .eq("team_id", teamId);

    if (fetchError) {
      console.error("Error fetching tokens:", fetchError);
      throw new Error("Failed to fetch tokens");
    }

    if (!tokens || tokens.length === 0) {
      console.log(`No tokens found for team ${teamId}`);
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No tokens found for team" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending notification to ${tokens.length} devices for team ${teamId}`);

    let successCount = 0;
    let failCount = 0;
    const invalidTokens: string[] = [];

    // Send notification to each token using FCM v1 API
    for (const { fcm_token, platform } of tokens) {
      try {
        const message = {
          message: {
            token: fcm_token,
            notification: {
              title,
              body,
            },
            android: {
              priority: "high",
              notification: {
                sound: "default",
                channel_id: "job_notifications",
              },
            },
            apns: {
              headers: {
                "apns-priority": "10",
              },
              payload: {
                aps: {
                  sound: "default",
                  badge: 1,
                },
              },
            },
            data: data || {},
          },
        };

        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
            },
            body: JSON.stringify(message),
          }
        );

        if (response.ok) {
          const result = await response.json();
          console.log(`FCM success for ${platform}:`, result.name);
          successCount++;
        } else {
          const errorText = await response.text();
          console.error(`FCM error for ${platform}:`, errorText);
          failCount++;
          
          // Check if token is invalid and should be removed
          if (errorText.includes("UNREGISTERED") || errorText.includes("INVALID_ARGUMENT")) {
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

    console.log(`Notification complete: ${successCount} sent, ${failCount} failed`);

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