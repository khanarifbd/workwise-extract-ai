// Auto-assign jobs to teams using Lovable AI
// Analyses team skillsets (from job history), workload, availability,
// geo proximity AND past-completed-job similarity (last 60 days).
// Now returns reasoning + confidence for EVERY job (assigned or not).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  teamIds: string[];
  jobIds: string[];
  targetDate: string;
  stream?: string;
}

const STOP = new Set([
  "the","and","for","with","from","this","that","have","has","was","will","are",
  "any","all","not","but","can","use","one","two","three","please","need","required",
  "installation","install","works","work","job","jobs","new","old","please","also",
  "their","our","you","your","they","them","into","out","off","over","under","per",
  "tenant","property","address","flat","house","room","ltd","building","builders",
]);

const tokenize = (s: string): Set<string> => {
  const out = new Set<string>();
  (s || "").toLowerCase().split(/[^a-z0-9]+/).forEach(t => {
    if (t.length >= 4 && !STOP.has(t)) out.add(t);
  });
  return out;
};

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

    // 1. Selected teams
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

    // 2. Availability for targetDate
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

    // 3. Skill profiles
    const { data: skillRows } = await supabase
      .from("team_skills")
      .select("team_id, skills, strengths, weaknesses, proficiency_level, max_daily_jobs, notes")
      .in("team_id", availableTeams.map(t => t.team_id));
    const skillsByTeam = new Map((skillRows || []).map((s: any) => [s.team_id, s]));

    // 4. Past 60-day completed jobs per team (for similarity-based confidence)
    const sixtyAgoIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const teamProfiles = await Promise.all(availableTeams.map(async (t) => {
      const [{ data: completed }, { count: openCount }, { data: dayJobs }] = await Promise.all([
        supabase.from("jobs")
          .select("description, summary_of_works, work_items, completion_date")
          .eq("team", t.team_name)
          .eq("is_completed", true)
          .gte("completion_date", sixtyAgoIso)
          .order("completion_date", { ascending: false })
          .limit(200),
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

      const completedJobs = (completed || []).map((c: any) => {
        const wi = Array.isArray(c.work_items)
          ? c.work_items.map((w: any) => w?.description || "").join(" ")
          : "";
        return tokenize(`${c.summary_of_works || ""} ${c.description || ""} ${wi}`);
      });

      const historySnippet = (completed || [])
        .slice(0, 30)
        .map((c: any) => `${c.summary_of_works || ""} ${c.description || ""}`.slice(0, 200))
        .filter(Boolean).join(" | ").slice(0, 2000);

      const profile: any = skillsByTeam.get(t.team_id) || {};
      return {
        teamId: t.team_id,
        teamName: t.team_name,
        completedTokenSets: completedJobs,
        completedCount: completedJobs.length,
        historySnippet,
        currentOpenJobs: openCount || 0,
        dayAddresses: (dayJobs || []).map((j: any) => j.address).filter(Boolean),
        manualSkills: profile.skills || [],
        strengths: profile.strengths || "",
        weaknesses: profile.weaknesses || "",
        proficiency: profile.proficiency_level || "experienced",
        maxDailyJobs: profile.max_daily_jobs ?? 3,
        dispatcherNotes: profile.notes || "",
      };
    }));

    // 5. Jobs to analyse (ALL visible — assigned or not)
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, job_number, name, address, description, summary_of_works, work_items, booked_date, team")
      .in("id", body.jobIds);

    if (!jobs?.length) {
      return new Response(JSON.stringify({ error: "No jobs found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Geocode lookup
    const addresses = [...new Set(jobs.map(j => j.address).filter(Boolean))];
    const geoMap = new Map<string, { lat: number; lng: number }>();
    if (addresses.length) {
      const { data: geo } = await supabase
        .from("geocode_cache").select("address, lat, lng")
        .in("address", addresses);
      (geo || []).forEach((g: any) => { if (g.lat && g.lng) geoMap.set(g.address, { lat: g.lat, lng: g.lng }); });
    }

    // 7. Per-job × per-team similarity to past 60-day completed jobs
    //    similarCount = number of completed jobs sharing >= 3 distinctive tokens
    const jobSummary = jobs.map(j => {
      const workItems = Array.isArray(j.work_items)
        ? (j.work_items as any[]).map(w => w?.description || "").join("; ").slice(0, 300)
        : "";
      const fullDesc = `${j.summary_of_works || ""} ${j.description || ""} ${workItems}`;
      const jobTokens = tokenize(fullDesc);

      const teamFamiliarity: Record<string, { similarCount: number; completedCount: number }> = {};
      for (const t of teamProfiles) {
        let n = 0;
        for (const set of t.completedTokenSets) {
          let overlap = 0;
          for (const tk of jobTokens) {
            if (set.has(tk)) { overlap++; if (overlap >= 3) break; }
          }
          if (overlap >= 3) n++;
        }
        teamFamiliarity[t.teamName] = { similarCount: n, completedCount: t.completedCount };
      }

      return {
        jobId: j.id,
        jobNumber: j.job_number,
        address: j.address || "",
        geo: geoMap.get(j.address || "") || null,
        currentTeam: j.team || null,
        description: fullDesc.slice(0, 600),
        teamFamiliarityLast60Days: teamFamiliarity,
      };
    });

    // 8. Strip heavy token-sets from team summary (already used above)
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
      completedJobsLast60Days: t.completedCount,
      pastWorkSample: t.historySnippet || "(no history yet)",
    }));

    const systemPrompt = `You are an expert dispatcher for a UK building/repair company.

For EVERY job in the list (whether already assigned or not) produce an analysis. Use these signals in priority order:
1) SKILL FIT — use the team's "declaredSkills" + "strengths" (manually curated, HIGHEST authority). NEVER recommend work listed in a team's "weaknesses". "pastWorkSample" is supporting evidence only.
2) PROVEN EXPERIENCE — the "teamFamiliarityLast60Days[teamName].similarCount" tells you how many similar jobs that team has actually completed and signed off in the last 60 days. Higher = more proven. This is your main confidence anchor.
3) PROFICIENCY — expert > experienced > apprentice for complex work.
4) DISPATCHER NOTES — strictly follow.
5) WORKLOAD BALANCE — prefer lower currentWorkload + fewer jobsAlreadyOnThisDay; respect maxDailyJobs as a soft cap.
6) GEOGRAPHIC CLUSTERING — group nearby addresses to the same team.

For each job return:
- suggestedTeamName: the BEST team from the provided list (even if a team is already assigned — recommend the optimum).
- confidence (0–100): anchor it to similarCount for the suggested team:
    similarCount >= 5 → 85–100
    similarCount 3–4  → 70–85
    similarCount 1–2  → 55–70
    similarCount 0    → 35–55 (rely on declaredSkills/strengths)
  Reduce if you had to override a soft constraint.
- reasoning (1–2 short sentences): cite the driver, e.g. "Strong fit: Team X has completed 7 similar fan-replacement jobs in the last 60 days and lists fans in declaredSkills."
- currentTeamAssessment: if the job already has a currentTeam, evaluate that team specifically:
    { teamName, fitScore (0–100), reasoning }
    State plainly whether the currently-assigned team is well-suited, and why (or why not), referencing similarCount, skills, weaknesses, workload. If currentTeam is null, omit this field.

Every job MUST be analysed exactly once.`;

    const userPrompt = JSON.stringify({ teams: teamSummary, jobs: jobSummary });

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_assignments",
            description: "Return analysis for every job.",
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
                      similarJobsLast60Days: { type: "number" },
                      currentTeamAssessment: {
                        type: "object",
                        properties: {
                          teamName: { type: "string" },
                          fitScore: { type: "number" },
                          reasoning: { type: "string" },
                        },
                      },
                    },
                    required: ["jobId", "teamName", "confidence", "reasoning"],
                  },
                },
              },
              required: ["assignments"],
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
    const assignments: any[] = parsed.assignments || [];

    // Enrich + validate team names
    const validNames = new Set(availableTeams.map(t => t.team_name));
    const jobById = new Map(jobs.map(j => [j.id, j]));
    const cleaned = assignments.map(a => {
      const job = jobById.get(a.jobId);
      const fallback = availableTeams[0].team_name;
      const teamName = validNames.has(a.teamName) ? a.teamName : fallback;
      const fam = jobSummary.find(j => j.jobId === a.jobId)?.teamFamiliarityLast60Days?.[teamName];
      return {
        ...a,
        teamName,
        currentTeam: job?.team || null,
        similarJobsLast60Days: fam?.similarCount ?? a.similarJobsLast60Days ?? 0,
      };
    });

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
