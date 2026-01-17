import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RemoveJobRequest {
  teamId: string;
  teamName: string;
  jobId: string;
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
    let body: RemoveJobRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { teamId, teamName, jobId } = body;

    console.log(`[remove-team-job] Request to remove job ${jobId} from team ${teamName}`);

    // Validate input
    if (!teamId || !teamName || !jobId) {
      return new Response(
        JSON.stringify({ error: "Team ID, team name, and job ID are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format for jobId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return new Response(
        JSON.stringify({ error: "Invalid job ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Verify the team exists and is active
    const { data: teamData, error: teamError } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name, is_active")
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

    // Fetch the job and check if this team is assigned
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team, team2, job_number, name")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      console.error("Job not found:", jobError?.message);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which team field to clear
    const isTeam1 = job.team === teamName;
    const isTeam2 = job.team2 === teamName;

    if (!isTeam1 && !isTeam2) {
      return new Response(
        JSON.stringify({ error: "You are not assigned to this job" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build update - clear the appropriate team field
    const updateData: { team?: string | null; team2?: string | null } = {};
    
    if (isTeam1) {
      updateData.team = null;
    }
    if (isTeam2) {
      updateData.team2 = null;
    }

    // Update the job
    const { error: updateError } = await supabase
      .from("jobs")
      .update(updateData)
      .eq("id", jobId);

    if (updateError) {
      console.error("Failed to remove team from job:", updateError.message);
      return new Response(
        JSON.stringify({ error: "Failed to remove job from team" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[remove-team-job] Successfully removed team ${teamName} from job ${job.job_number}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Job ${job.job_number} removed from your list`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});