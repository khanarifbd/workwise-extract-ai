import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateJobRequest {
  teamId: string;
  teamName: string;
  jobId: string;
  updates: {
    status?: string;
    progress?: number;
    notes?: string;
    photos?: string[];
  };
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
    let body: UpdateJobRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { teamId, teamName, jobId, updates } = body;

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

    // Validate updates object
    if (!updates || typeof updates !== "object") {
      return new Response(
        JSON.stringify({ error: "Updates object is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate individual update fields
    if (updates.status && typeof updates.status !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid status format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (updates.progress !== undefined && (typeof updates.progress !== "number" || updates.progress < 0 || updates.progress > 100)) {
      return new Response(
        JSON.stringify({ error: "Progress must be a number between 0 and 100" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (updates.notes && typeof updates.notes !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid notes format" }),
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

    // Verify the job belongs to this team
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      console.error("Job not found:", jobError?.message);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job.team !== teamName) {
      console.error("Team mismatch: job belongs to", job.team, "but request from", teamName);
      return new Response(
        JSON.stringify({ error: "You don't have permission to update this job" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build update object for jobs table
    const jobUpdates: Record<string, unknown> = {};
    if (updates.status) jobUpdates.status = updates.status;
    if (updates.progress !== undefined) jobUpdates.progress = updates.progress;
    if (updates.notes) jobUpdates.progress_notes = updates.notes;

    // Update the job
    if (Object.keys(jobUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from("jobs")
        .update(jobUpdates)
        .eq("id", jobId);

      if (updateError) {
        console.error("Failed to update job:", updateError.message);
        return new Response(
          JSON.stringify({ error: "Failed to update job" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Record the update in team_job_updates
    const { error: recordError } = await supabase
      .from("team_job_updates")
      .insert({
        team_id: teamId,
        job_id: jobId,
        status: updates.status || null,
        progress: updates.progress || null,
        notes: updates.notes || null,
        photos: updates.photos || null,
        updated_by: teamName,
      });

    if (recordError) {
      console.error("Failed to record update:", recordError.message);
      // Don't fail the request, just log the error
    }

    console.log(`Job ${jobId} updated by team ${teamName}`);

    return new Response(
      JSON.stringify({ success: true }),
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
