// Allows a team (using their access code) to submit/update their EOD report
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface JobLine {
  jobId: string;
  jobNumber: string;
  address?: string;
  reason?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      teamId,
      teamName,
      submittedBy,
      jobsVisited,
      jobsCompleted,
      jobsOpen,
      openReasons,
      generalNotes,
    }: {
      teamId: string;
      teamName: string;
      submittedBy?: string;
      jobsVisited: JobLine[];
      jobsCompleted: JobLine[];
      jobsOpen: JobLine[];
      openReasons?: string;
      generalNotes?: string;
    } = body;

    if (!teamId || !teamName) {
      return new Response(JSON.stringify({ error: "Missing team info" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate team
    const { data: code } = await supabase
      .from("team_access_codes")
      .select("team_id")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .maybeSingle();

    if (!code) {
      return new Response(JSON.stringify({ error: "Invalid team" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Upsert (one report per team per date)
    const { data, error } = await supabase
      .from("eod_reports")
      .upsert(
        {
          team_id: teamId,
          team_name: teamName,
          report_date: today,
          jobs_visited: jobsVisited || [],
          jobs_completed: jobsCompleted || [],
          jobs_open: jobsOpen || [],
          open_reasons: openReasons || "",
          general_notes: generalNotes || "",
          submitted_by: submittedBy || null,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "team_id,report_date" },
      )
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, report: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("submit-eod-report error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
