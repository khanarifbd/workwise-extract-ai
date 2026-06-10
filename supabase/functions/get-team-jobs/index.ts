import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GetJobsRequest {
  teamId: string;
  teamName: string;
  // Optional: return only jobs updated after this timestamp (ISO string)
  since?: string;
}

// Rate limiting configuration
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX_REQUESTS = 2000; // 2000 requests per team per hour (supports delta polling)
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(teamId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(teamId);
  
  // Clean up old entries
  for (const [key, e] of rateLimitStore.entries()) {
    if (e.resetAt < now) rateLimitStore.delete(key);
  }
  
  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(teamId, entry);
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: entry.resetAt };
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
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

    // Parse request body
    let body: GetJobsRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { teamId, teamName, since } = body;

    // Validate input
    if (!teamId) {
      return new Response(
        JSON.stringify({ error: "Team ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate teamId format (should be a reasonable string)
    if (typeof teamId !== "string" || teamId.length > 100) {
      return new Response(
        JSON.stringify({ error: "Invalid team ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting check (per team)
    const rateLimit = checkRateLimit(teamId);
    
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      console.log(`Rate limit exceeded for team: ${teamId}`);
      return new Response(
        JSON.stringify({ 
          error: "Too many requests. Please try again later.",
          retryAfterSeconds: retryAfter 
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter)
          } 
        }
      );
    }

    // Create Supabase client with service role key
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

    // First verify the team exists and is active
    const { data: teamData, error: teamError } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name, is_active, is_ops_manager")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .maybeSingle();

    if (teamError || !teamData) {
      console.error("Team validation failed:", teamError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid team session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const canonicalTeamName = teamData.team_name;

    if (teamName && teamName !== canonicalTeamName) {
      console.warn(`Team name mismatch: provided "${teamName}", using canonical "${canonicalTeamName}"`);
    }

    const isOpsManager = teamData.is_ops_manager === true;

    // Optional delta mode
    let sinceDate: Date | null = null;
    if (since) {
      const d = new Date(since);
      if (!Number.isNaN(d.getTime())) sinceDate = d;
    }

    // Fetch jobs
    // - Ops Managers: ONLY jobs that are BOOKED (have booked_date) AND assigned to a team
    //   EXCEPT for delta polls (since): return ALL recently-updated jobs so client
    //   can detect when a job no longer qualifies and remove it from the list.
    // - Regular Teams: jobs where they are team OR team2
    let jobs = [];

    if (isOpsManager) {
      if (sinceDate) {
        // DELTA POLL: return ALL recently-updated jobs (no booked_date/team filter)
        // so the client can detect removals (unbooked, unassigned, soft-deleted).
        const { data, error } = await supabase
          .from("jobs")
          .select("*")
          .is("deleted_at", null)
          .gt("updated_at", sinceDate.toISOString())
          .order("updated_at", { ascending: false })
          .limit(5000);

        if (error) {
          console.error("Failed to fetch delta jobs:", error.message);
          return new Response(
            JSON.stringify({ error: "Failed to fetch jobs" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        jobs = data || [];
      } else {
        // FULL LOAD: only booked + assigned jobs
        const { data, error } = await supabase
          .from("jobs")
          .select("*")
          .is("deleted_at", null)
          .not("booked_date", "is", null)
          .or("team.not.is.null,team2.not.is.null")
          .order("booked_date", { ascending: true })
          .limit(5000);

        if (error) {
          console.error("Failed to fetch jobs:", error.message);
          return new Response(
            JSON.stringify({ error: "Failed to fetch jobs" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Post-filter empty strings
        jobs = (data || []).filter((j: any) => (j?.team && String(j.team).trim() !== "") || (j?.team2 && String(j.team2).trim() !== ""));
      }
    } else {
      let query = supabase
        .from("jobs")
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(5000);

      if (sinceDate) {
        // DELTA POLL for regular teams: return all recently-updated jobs
        // so the client can detect unassignment
        query = query.gt("updated_at", sinceDate.toISOString());
      } else {
        // FULL LOAD: only jobs assigned to this team
        // Quote values to prevent PostgREST filter injection if teamName ever
        // contains commas/dots/operators (defence-in-depth on top of the
        // earlier exact-match validation against team_access_codes).
        const safe = canonicalTeamName.replace(/"/g, '\\"');
        query = query.or(`team.eq."${safe}",team2.eq."${safe}"`);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Failed to fetch jobs:", error.message);
        return new Response(
          JSON.stringify({ error: "Failed to fetch jobs" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      jobs = data || [];
    }

    console.log(
      `Fetched ${jobs?.length || 0} ${sinceDate ? 'delta' : 'full'} jobs for ${isOpsManager ? 'ops manager' : 'team'}: ${canonicalTeamName}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        jobs: jobs || [],
        teamName: canonicalTeamName,
        serverTime: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
