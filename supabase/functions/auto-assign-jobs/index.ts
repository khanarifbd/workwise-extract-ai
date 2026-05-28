// Auto-assign jobs to teams using Lovable AI
// Analyses team skillsets (from job history), workload, availability and geo proximity
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  teamIds: string[];        // team_access_codes.team_id values to include
  jobIds: string[];         // jobs to assign (must be unassigned)
  targetDate: string;       // YYYY-MM-DD (used for availability + workload)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const body: Body = await req.json();
    if (!body.teamIds?.length || !body.jobIds?.length || !body.targetDate) {
      return new Response(JSON.stringify({ error: "teamIds, jobIds, targetDate required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Fetch selected teams
    const { data: teams } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name")
      .in("team_id", body.teamIds)
      .eq("is_active", true);

    if (!teams?.length) {
      return new Response(JSON.stringify({ error: "No active teams found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Availability for targetDate -> drop unavailable teams
    const { data: unavail } = await supabase
      .from("team_availability")
      .select("team_id, reason")
      .eq("unavailable_date", body.targetDate)
      .in("team_id", body.teamIds);
    const unavailMap = new Map((unavail || []).map(u => [u.team_id, u.reason || "Unavailable"]));
    const availableTeams = teams.filter(t => !unavailMap.has(t.team_id));

    if (!availableTeams.length) {
      return new Response(JSON.stringify({ error: "All selected teams are unavailable on that date" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. For each team: skillset from last 30 completed jobs + current workload + manual skill profile
    const { data: skillRows } = await supabase
      .from("team_skills")
      .select("team_id, skills, strengths, weaknesses, proficiency_level, max_daily_jobs, notes")
      .in("team_id", availableTeams.map(t => t.team_id));
    const skillsByTeam = new Map((skillRows || []).map((s: any) => [s.team_id, s]));

    const teamProfiles = await Promise.all(availableTeams.map(async (t) => {
      const [{ data: completed }, { count: openCount }, { data: dayJobs }] = await Promise.all([
        supabase.from("jobs")
          .select("description, summary_of_works")
          .eq("team", t.team_name)
          .eq("is_completed", true)
          .order("completion_date", { ascending: false })
          .limit(30),
        supabase.from("jobs")
          .select("*", { count: "exact", head: true })
          .eq("team", t.team_name)
          .eq("is_completed", false),
        supabase.from("jobs")
          .select("address")
          .eq("team", t.team_name)
          .gte("booked_date", `${body.targetDate}T00:00:00Z`)
          .lt("booked_date", `${body.targetDate}T23:59:59Z`),
      ]);
      const history = (completed || [])
        .map(c => `${c.summary_of_works || ""} ${c.description || ""}`.slice(0, 200))
        .filter(Boolean).join(" | ");
      const profile: any = skillsByTeam.get(t.team_id) || {};
      return {
        teamId: t.team_id,
        teamName: t.team_name,
        historySnippet: history.slice(0, 2000),
        currentOpenJobs: openCount || 0,
        dayAddresses: (dayJobs || []).map(j => j.address).filter(Boolean),
        manualSkills: profile.skills || [],
        strengths: profile.strengths || "",
        weaknesses: profile.weaknesses || "",
        proficiency: profile.proficiency_level || "experienced",
        maxDailyJobs: profile.max_daily_jobs ?? 3,
        dispatcherNotes: profile.notes || "",
      };
    }));

    // 4. Fetch jobs to assign
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, job_number, name, address, description, summary_of_works, work_items, booked_date, team")
      .in("id", body.jobIds);

    const unassignedJobs = (jobs || []).filter(j => !j.team);
    if (!unassignedJobs.length) {
      return new Response(JSON.stringify({ error: "No unassigned jobs in selection" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Geocode lookup for clustering (best-effort)
    const addresses = [...new Set(unassignedJobs.map(j => j.address).filter(Boolean))];
    const geoMap = new Map<string, { lat: number; lng: number }>();
    if (addresses.length) {
      const { data: geo } = await supabase
        .from("geocode_cache").select("address, lat, lng")
        .in("address", addresses);
      (geo || []).forEach(g => { if (g.lat && g.lng) geoMap.set(g.address, { lat: g.lat, lng: g.lng }); });
    }

    // 6. Build AI prompt with structured output
    const teamSummary = teamProfiles.map(t => ({
      teamName: t.teamName,
      currentWorkload: t.currentOpenJobs,
      jobsAlreadyOnThisDay: t.dayAddresses.length,
      maxDailyJobs: t.maxDailyJobs,
      proficiency: t.proficiency,
      declaredSkills: t.manualSkills,
      strengths: t.strengths,
      weaknesses: t.weaknesses,
      dispatcherNotes: t.dispatcherNotes,
      pastWorkSample: t.historySnippet || "(no history yet)",
    }));

    const jobSummary = unassignedJobs.map(j => {
      const workItems = Array.isArray(j.work_items)
        ? (j.work_items as any[]).map(w => w.description).join("; ").slice(0, 300)
        : "";
      return {
        jobId: j.id,
        jobNumber: j.job_number,
        address: j.address || "",
        geo: geoMap.get(j.address || "") || null,
        description: `${j.summary_of_works || ""} ${j.description || ""} ${workItems}`.slice(0, 600),
      };
    });

    const systemPrompt = `You are an expert dispatcher for a UK building/repair company.
Assign each job to the best-suited team using these signals, in priority order:
1) SKILL FIT — first use the team's "declaredSkills" + "strengths" (manually curated by the dispatcher, HIGHEST authority). NEVER assign work listed in a team's "weaknesses". Use "pastWorkSample" only as supporting evidence when declaredSkills is empty.
2) PROFICIENCY — prefer "expert" over "experienced" over "apprentice" for complex jobs.
3) DISPATCHER NOTES — strictly follow any guidance in "dispatcherNotes".
4) WORKLOAD BALANCE — spread work evenly; prefer teams with lower currentWorkload + fewer jobsAlreadyOnThisDay. Respect "maxDailyJobs" as a soft cap.
5) GEOGRAPHIC CLUSTERING — if jobs share nearby postcodes/areas, group them to the same team to reduce travel.
Provide a confidence 0-100 (lower it if you had to override a soft constraint) and a 1-line reasoning referencing which signal drove the pick (e.g. "Skill match: declaredSkills includes plumbing").
Every job MUST be assigned to exactly one team from the provided list.`;

    const userPrompt = JSON.stringify({ teams: teamSummary, jobs: jobSummary });

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_assignments",
            description: "Return the team assignment for every job.",
            parameters: {
              type: "object",
              properties: {
                assignments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      jobId: { type: "string" },
                      teamName: { type: "string" },
                      confidence: { type: "number" },
                      reasoning: { type: "string" },
                    },
                    required: ["jobId", "teamName", "confidence", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["assignments"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_assignments" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway: ${aiResp.status}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI returned no tool call");
    const parsed = JSON.parse(toolCall.function.arguments);
    const assignments: { jobId: string; teamName: string; confidence: number; reasoning: string }[] = parsed.assignments || [];

    // Validate team names map to our available teams
    const validNames = new Set(availableTeams.map(t => t.team_name));
    const cleaned = assignments.map(a => ({
      ...a,
      teamName: validNames.has(a.teamName) ? a.teamName : availableTeams[0].team_name,
    }));

    return new Response(JSON.stringify({
      assignments: cleaned,
      droppedTeams: Array.from(unavailMap.entries()).map(([id, reason]) => ({ teamId: id, reason })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("auto-assign-jobs error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
