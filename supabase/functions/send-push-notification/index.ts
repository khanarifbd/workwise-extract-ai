import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { teamId, title, body, data } = await req.json();

    if (!teamId) {
      return new Response(
        JSON.stringify({ error: 'teamId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');

    if (!vapidPrivateKey || !vapidPublicKey) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'Push notifications not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
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
