import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  
  // Clean old entries
  for (const [key, e] of rateLimitStore.entries()) {
    if (e.resetAt < now) rateLimitStore.delete(key);
  }
  
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP)) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { accessCode } = await req.json();

    if (!accessCode || typeof accessCode !== "string") {
      return new Response(
        JSON.stringify({ error: "Access code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitizedCode = accessCode.toUpperCase().trim().slice(0, 20);
    if (!/^[A-Z0-9]+$/.test(sanitizedCode)) {
      return new Response(
        JSON.stringify({ error: "Invalid access code format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check progressor_team_codes table
    const { data, error } = await supabase
      .from("progressor_team_codes")
      .select("team_name, is_active")
      .eq("access_code", sanitizedCode)
      .maybeSingle();

    if (error) {
      console.error("DB error:", error.message);
      return new Response(
        JSON.stringify({ error: "Validation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data || !data.is_active) {
      return new Response(
        JSON.stringify({ error: "Invalid access code" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return team info — session managed client-side
    const session = {
      teamName: data.team_name,
      validatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    console.log(`Progressor team validated: ${data.team_name} from IP: ${clientIP}`);

    return new Response(
      JSON.stringify({ success: true, session }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
