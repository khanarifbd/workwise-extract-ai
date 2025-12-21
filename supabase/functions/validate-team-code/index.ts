import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidateRequest {
  accessCode: string;
}

interface TeamSession {
  teamId: string;
  teamName: string;
  validatedAt: string;
  expiresAt: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    let body: ValidateRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { accessCode } = body;

    // Validate input
    if (!accessCode || typeof accessCode !== "string") {
      return new Response(
        JSON.stringify({ error: "Access code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize input - only alphanumeric, max 20 chars
    const sanitizedCode = accessCode.toUpperCase().trim().slice(0, 20);
    if (!/^[A-Z0-9]+$/.test(sanitizedCode)) {
      return new Response(
        JSON.stringify({ error: "Invalid access code format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query team_access_codes table (uses service role, bypasses RLS)
    const { data, error } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name, is_active")
      .eq("access_code", sanitizedCode)
      .maybeSingle();

    if (error) {
      console.error("Database query error:", error.message);
      return new Response(
        JSON.stringify({ error: "Failed to validate access code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data || !data.is_active) {
      // Don't reveal whether code exists but is inactive
      return new Response(
        JSON.stringify({ error: "Invalid access code" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create session with expiry
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const session: TeamSession = {
      teamId: data.team_id,
      teamName: data.team_name,
      validatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    console.log(`Team validated: ${data.team_name} (${data.team_id})`);

    return new Response(
      JSON.stringify({ success: true, session }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
