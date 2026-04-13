import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Simple hash function for address normalization
function hashAddress(address: string): string {
  const normalized = address.toLowerCase().trim().replace(/\s+/g, ' ');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + normalized.length;
}

interface GeocodingRequest {
  addresses: string[];
}

interface CachedGeocode {
  address: string;
  lat: number | null;
  lng: number | null;
  geocode_error: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create client with user's auth token for verification
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin role
    const { data: isAdmin, error: roleError } = await supabaseClient.rpc('is_admin', { _user_id: user.id });
    if (roleError || !isAdmin) {
      console.error('Admin check failed:', roleError?.message || 'Not an admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Geocode request from admin user: ${user.id}`);

    const { addresses }: GeocodingRequest = await req.json();

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return new Response(
        JSON.stringify({ error: 'addresses array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit batch size to prevent abuse
    if (addresses.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Maximum 100 addresses per request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, CachedGeocode> = {};
    const toGeocode: { address: string; hash: string }[] = [];

    // Check cache first
    const hashes = addresses.map(addr => ({ address: addr, hash: hashAddress(addr) }));
    const hashList = hashes.map(h => h.hash);

    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('address_hash, address, lat, lng, geocode_error')
      .in('address_hash', hashList);

    const cacheMap = new Map(cached?.map(c => [c.address_hash, c]) || []);

    for (const { address, hash } of hashes) {
      const cachedResult = cacheMap.get(hash);
      if (cachedResult) {
        results[address] = {
          address: cachedResult.address,
          lat: cachedResult.lat,
          lng: cachedResult.lng,
          geocode_error: cachedResult.geocode_error,
        };
      } else {
        toGeocode.push({ address, hash });
      }
    }

    console.log(`Cache hit: ${Object.keys(results).length}, to geocode: ${toGeocode.length}`);

    // Geocode uncached addresses
    for (let i = 0; i < toGeocode.length; i++) {
      const { address, hash } = toGeocode[i];

      try {
        const searchAddress = address.includes('UK') ? address : `${address}, UK`;
        
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1`,
          { headers: { 'User-Agent': 'AllsaintsJobTracker/1.0' } }
        );

        if (!response.ok) {
          throw new Error(`Geocoding failed: ${response.status}`);
        }

        const data = await response.json();
        
        let lat: number | null = null;
        let lng: number | null = null;
        let geocodeError = false;

        if (data.length > 0) {
          lat = parseFloat(data[0].lat);
          lng = parseFloat(data[0].lon);
        } else {
          geocodeError = true;
        }

        // Cache the result
        await supabase
          .from('geocode_cache')
          .upsert({
            address_hash: hash,
            address,
            lat,
            lng,
            geocode_error: geocodeError,
          }, { onConflict: 'address_hash' });

        results[address] = { address, lat, lng, geocode_error: geocodeError };

        // Rate limit: 1 request per second for Nominatim
        if (i < toGeocode.length - 1) {
          await new Promise(r => setTimeout(r, 1100));
        }
      } catch (error) {
        console.error('Geocoding error for:', address, error);
        
        // Cache the error
        await supabase
          .from('geocode_cache')
          .upsert({
            address_hash: hash,
            address,
            lat: null,
            lng: null,
            geocode_error: true,
          }, { onConflict: 'address_hash' });

        results[address] = { address, lat: null, lng: null, geocode_error: true };
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in geocode-addresses function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing the request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
