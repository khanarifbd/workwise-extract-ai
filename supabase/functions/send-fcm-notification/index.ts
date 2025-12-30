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

// Function to create APNs JWT token
async function createApnsJwt(keyId: string, teamId: string, privateKey: string): Promise<string> {
  const header = {
    alg: "ES256",
    kid: keyId,
  };

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: teamId,
    iat: now,
  };

  const base64url = (data: string) => {
    return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const headerB64 = base64url(JSON.stringify(header));
  const claimsB64 = base64url(JSON.stringify(claims));
  const signatureInput = `${headerB64}.${claimsB64}`;

  // Parse the private key
  const pemContents = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    cryptoKey,
    encoder.encode(signatureInput)
  );

  // Convert DER signature to raw format (r || s)
  const signatureArray = new Uint8Array(signature);
  const signatureB64 = base64url(String.fromCharCode(...signatureArray));
  
  return `${signatureInput}.${signatureB64}`;
}

// Send APNs notification directly
async function sendApnsNotification(
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
  apnsKeyId: string,
  apnsTeamId: string,
  apnsPrivateKey: string,
  bundleId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const jwt = await createApnsJwt(apnsKeyId, apnsTeamId, apnsPrivateKey);
    
    const payload = {
      aps: {
        alert: {
          title,
          body,
        },
        sound: "default",
        badge: 1,
        "mutable-content": 1,
      },
      ...data,
    };

    // Use production APNs server
    const apnsUrl = `https://api.push.apple.com/3/device/${deviceToken}`;

    const response = await fetch(apnsUrl, {
      method: "POST",
      headers: {
        "Authorization": `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": "0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log("APNs notification sent successfully");
      return { success: true };
    } else {
      const errorText = await response.text();
      console.error("APNs error:", response.status, errorText);
      return { success: false, error: `${response.status}: ${errorText}` };
    }
  } catch (error) {
    console.error("APNs send error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
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

    // APNs configuration
    const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID");
    const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID");
    const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY");
    const BUNDLE_ID = "app.workwish.com";

    // FCM configuration
    const FIREBASE_SERVICE_ACCOUNT = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    let fcmAccessToken: string | null = null;
    let fcmProjectId: string | null = null;

    // Prepare FCM if configured
    if (FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
        fcmProjectId = serviceAccount.project_id;
        fcmAccessToken = await getAccessToken(serviceAccount);
        console.log("FCM access token obtained");
      } catch (e) {
        console.error("Failed to initialize FCM:", e);
      }
    }

    // Check if APNs is configured
    const apnsConfigured = APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY;
    if (apnsConfigured) {
      console.log("APNs is configured, will use direct APNs for iOS");
    } else {
      console.log("APNs not configured, will use FCM for all platforms");
    }

    // Send notification to each token
    for (const { fcm_token, platform } of tokens) {
      try {
        // For iOS with APNs configured, use APNs directly
        if (platform === "ios" && apnsConfigured) {
          console.log("Sending APNs notification to iOS device");
          const result = await sendApnsNotification(
            fcm_token,
            title,
            body,
            data || {},
            APNS_KEY_ID!,
            APNS_TEAM_ID!,
            APNS_PRIVATE_KEY!,
            BUNDLE_ID
          );
          
          if (result.success) {
            successCount++;
          } else {
            console.error("APNs failed:", result.error);
            failCount++;
            // Check for invalid token errors
            if (result.error?.includes("BadDeviceToken") || result.error?.includes("Unregistered")) {
              invalidTokens.push(fcm_token);
            }
          }
        } 
        // For Android or iOS without APNs, use FCM
        else if (fcmAccessToken && fcmProjectId) {
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
              data: data || {},
            },
          };

          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${fcmAccessToken}`,
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
            
            if (errorText.includes("UNREGISTERED") || errorText.includes("INVALID_ARGUMENT")) {
              invalidTokens.push(fcm_token);
            }
          }
        } else {
          console.log(`No push service configured for platform: ${platform}`);
          failCount++;
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
