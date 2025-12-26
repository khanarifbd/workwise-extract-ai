import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SHA-1 hash function using Web Crypto API
async function sha1Hash(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password } = await req.json();

    if (!password || typeof password !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Password is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash the password using SHA-1
    const hash = await sha1Hash(password);
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    console.log(`Checking HIBP for hash prefix: ${prefix}`);

    // Query HIBP API with k-anonymity (only send first 5 chars of hash)
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'User-Agent': 'Lovable-Password-Check',
        'Add-Padding': 'true', // Adds padding to prevent response length analysis
      },
    });

    if (!response.ok) {
      console.error(`HIBP API error: ${response.status}`);
      // Don't block signup if HIBP is unavailable
      return new Response(
        JSON.stringify({ breached: false, error: 'Unable to check password breach status' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = await response.text();
    const lines = text.split('\n');

    // Check if our hash suffix appears in the response
    let breachCount = 0;
    for (const line of lines) {
      const [hashSuffix, count] = line.split(':');
      if (hashSuffix.trim() === suffix) {
        breachCount = parseInt(count.trim(), 10);
        break;
      }
    }

    const breached = breachCount > 0;

    if (breached) {
      console.log(`Password found in ${breachCount} breaches`);
    }

    return new Response(
      JSON.stringify({ 
        breached, 
        count: breachCount,
        message: breached 
          ? `This password has appeared in ${breachCount.toLocaleString()} data breaches. Please choose a different password.`
          : null
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking password breach:', error);
    // Don't block signup on errors - fail open but log
    return new Response(
      JSON.stringify({ breached: false, error: 'An error occurred while checking password' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
