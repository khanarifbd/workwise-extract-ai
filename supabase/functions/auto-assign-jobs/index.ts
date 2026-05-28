// Auto-assign jobs to teams using Lovable AI
// Analyses team skillsets, workload, availability, geo proximity AND past-completed-job similarity (last 60 days).
// Returns reasoning + confidence for EVERY job (assigned or not).
// NEW: can recommend MULTIPLE teams on the same job when trades differ (e.g. damp + roofing)
//      or when the job is sized too large to finish in one day with a single team.
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

    const { data: skillRows } = await supabase
      .from("team_skills")
      .select("team_id, skills, strengths, weaknesses, proficiency_level, max_daily_jobs, notes")
      .in("team_id", availableTeams.map(t => t.team_id));
    const skillsByTeam = new Map((skillRows || []).map((s: any) => [s.team_id, s]));

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

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, job_number, name, address, description, summary_of_works, work_items, booked_date, team, team2")
      .in("id", body.jobIds);

    if (!jobs?.length) {
      return new Response(JSON.stringify({ error: "No jobs found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const addresses = [...new Set(jobs.map(j => j.address).filter(Boolean))];
    const geoMap = new Map<string, { lat: number; lng: number }>();
    if (addresses.length) {
      const { data: geo } = await supabase
        .from("geocode_cache").select("address, lat, lng")
        .in("address", addresses);
      (geo || []).forEach((g: any) => { if (g.lat && g.lng) geoMap.set(g.address, { lat: g.lat, lng: g.lng }); });
    }

    const jobSummary = jobs.map(j => {
      const workItems = Array.isArray(j.work_items)
        ? (j.work_items as any[]).map(w => w?.description || "").join("; ").slice(0, 400)
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
        currentTeam2: (j as any).team2 || null,
        description: fullDesc.slice(0, 800),
        teamFamiliarityLast60Days: teamFamiliarity,
      };
    });

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

    const systemPrompt = `You are an expert UK building/repair dispatcher with deep trade knowledge.

GOAL: Every job must be FULLY COMPLETED on its booked date. To do that, decide if a job needs ONE team or MULTIPLE teams working the same day.

For EVERY job produce an analysis. Use these signals in priority order:
1) TRADE COVERAGE — Read the description carefully and list EVERY distinct trade/skill the job requires (e.g. "damp & mould treatment", "roofing", "plastering", "carpentry", "electrical", "tiling", "plumbing"). Use real construction-industry knowledge: damp jobs often need roofing if leak source is the roof; bathroom refurbs need plumbing + tiling + sometimes electrical; ceiling collapses need plastering + sometimes electrical. If two or more clearly distinct trades are needed and no single team in the list covers them all, you MUST recommend MULTIPLE teams.
2) JOB SIZE & TIMING — Estimate realistic duration using industry norms: plaster drying ~24h before paint, screed/concrete set times, silicone cure, two-coat paint with drying between, scaffolding erection time. If the work scope clearly cannot be finished by one team in one working day, recommend a second team to parallelise so it still completes on the booked day. If even multiple teams can't finish in one day (e.g. needs material drying overnight), say so in jobSizeAssessment and still recommend the best same-day split.
3) SKILL FIT — match teams using their "declaredSkills" + "strengths" (HIGHEST authority). NEVER assign work listed in a team's "weaknesses". "pastWorkSample" is supporting evidence only.
4) PROVEN EXPERIENCE — "teamFamiliarityLast60Days[teamName].similarCount" = how many similar jobs that team has actually completed and signed off in the last 60 days. Higher = more proven. This is the main confidence anchor.
5) PROFICIENCY — expert > experienced > apprentice for complex work.
6) DISPATCHER NOTES — strictly follow.
7) WORKLOAD BALANCE — prefer lower currentWorkload + fewer jobsAlreadyOnThisDay; respect maxDailyJobs as a soft cap.
8) GEOGRAPHIC CLUSTERING — group nearby addresses to the same team.

For each job return:
- teamNames: ARRAY of 1–3 team names (in order: primary, secondary, tertiary). Each team must be a DIFFERENT team from the provided list. ONLY include more than one team when distinct trades or sheer size genuinely require it — do NOT pad. Most jobs will be a single team.
- requiresMultipleTeams: boolean. True ONLY when teamNames.length >= 2 because of trade coverage or size, not just preference.
- jobSizeAssessment: one short sentence stating whether the job is small / medium / large and whether it is realistically completable on the booked day (and with how many teams). Mention material drying/set times if relevant.
- tradesRequired: array of trade strings you identified from the description (e.g. ["damp & mould", "roofing"]).
- confidence (0–100) for the PRIMARY team: anchor to similarCount for that team:
    similarCount >= 5 → 85–100
    similarCount 3–4  → 70–85
    similarCount 1–2  → 55–70
    similarCount 0    → 35–55 (rely on declaredSkills/strengths)
  Reduce slightly if you had to override a soft constraint.
- reasoning (1–3 short sentences): cite the drivers. If multiple teams, say WHY ("Damp work for Team A + roof leak source needs Team B's roofing crew same day").
- currentTeamAssessment: if currentTeam is set, evaluate that team specifically: { teamName, fitScore (0–100), reasoning } — say plainly whether they are well-suited and why (or why not). Omit if currentTeam is null.

Every job MUST be analysed exactly once. teamNames must never be empty.`;

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
                      teamNames: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
                      requiresMultipleTeams: { type: "boolean" },
                      jobSizeAssessment: { type: "string" },
                      tradesRequired: { type: "array", items: { type: "string" } },
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
                    required: ["jobId", "teamNames", "confidence", "reasoning", "jobSizeAssessment"],
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

    const validNames = new Set(availableTeams.map(t => t.team_name));
    const jobById = new Map(jobs.map(j => [j.id, j]));
    const cleaned = assignments.map(a => {
      const job = jobById.get(a.jobId);
      const fallback = availableTeams[0].team_name;
      let teamNames: string[] = Array.isArray(a.teamNames) ? a.teamNames.filter((n: string) => validNames.has(n)) : [];
      if (!teamNames.length) teamNames = [fallback];
      // de-dupe while preserving order
      teamNames = Array.from(new Set(teamNames)).slice(0, 3);
      const primary = teamNames[0];
      const fam = jobSummary.find(j => j.jobId === a.jobId)?.teamFamiliarityLast60Days?.[primary];
      return {
        ...a,
        teamNames,
        teamName: primary, // backwards compat
        requiresMultipleTeams: teamNames.length >= 2,
        currentTeam: job?.team || null,
        currentTeam2: (job as any)?.team2 || null,
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
