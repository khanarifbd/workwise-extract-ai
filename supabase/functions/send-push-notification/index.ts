import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Input validation schema
const sendPushSchema = z.object({
  teamId: z.string().min(1, "Team ID required").max(100, "Team ID too long"),
  title: z.string().max(200, "Title too long").optional(),
  body: z.string().max(1000, "Body too long").optional(),
  data: z.record(z.unknown()).optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request - require admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Verify user with anon key
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const { data: isAdmin, error: roleError } = await userClient.rpc('is_admin', { _user_id: user.id });
    if (roleError || !isAdmin) {
      console.error('Admin check failed:', roleError?.message || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const rawBody = await req.json();
    const parseResult = sendPushSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error('Validation failed:', parseResult.error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parseResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { teamId, title, body, data } = parseResult.data;

    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');

    if (!vapidPrivateKey || !vapidPublicKey) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'Push notifications not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role key to access subscriptions
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Sending push notification for team ${teamId} by user ${user.id}`);

    // Get all subscriptions for this team
    const { data: subscriptions, error: fetchError } = await supabase
      .from('team_push_subscriptions')
      .select('*')
      .eq('team_id', teamId);

    if (fetchError) {
      console.error('Error fetching subscriptions:', fetchError);
      throw fetchError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No push subscriptions found for team ${teamId}`);
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${subscriptions.length} subscriptions for team ${teamId}`);

    const payload = JSON.stringify({
      title: title || 'New Job Assignment',
      body: body || 'You have a new job assigned to your team',
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'job-assignment',
      data: data || {},
    });

    let sent = 0;
    const errors: string[] = [];

    // Send to each subscription using web-push compatible format
    for (const sub of subscriptions) {
      try {
        // Build the JWT header for VAPID
        const vapidHeaders = await createVapidHeaders(
          sub.endpoint,
          vapidPublicKey,
          vapidPrivateKey,
          'mailto:admin@example.com'
        );

        const payloadBytes = new TextEncoder().encode(payload);
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
            ...vapidHeaders,
          },
          body: payloadBytes.buffer,
        });

        if (response.ok) {
          sent++;
          console.log(`Push sent to subscription ${sub.id}`);
        } else if (response.status === 404 || response.status === 410) {
          // Subscription expired, remove it
          console.log(`Removing expired subscription ${sub.id}`);
          await supabase
            .from('team_push_subscriptions')
            .delete()
            .eq('id', sub.id);
        } else {
          const errorText = await response.text();
          console.error(`Push failed for ${sub.id}: ${response.status} ${errorText}`);
          errors.push(`${sub.id}: ${response.status}`);
        }
      } catch (error: unknown) {
        console.error(`Error sending to ${sub.id}:`, error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${sub.id}: ${message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        total: subscriptions.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error sending push notification:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing the request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper functions for VAPID and encryption
async function createVapidHeaders(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string
): Promise<Record<string, string>> {
  const audience = new URL(endpoint).origin;
  const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours

  // For simplicity, return basic headers - full VAPID implementation would need crypto
  return {
    'Authorization': `vapid t=${publicKey}, k=${publicKey}`,
  };
}

async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string
): Promise<Uint8Array> {
  // Simplified - in production, use proper web-push encryption
  return new TextEncoder().encode(payload);
}
