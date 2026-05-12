import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JobRow {
  id: string;
  job_number: string;
  name: string | null;
  address: string | null;
  description: string | null;
  summary_of_works: string | null;
  work_items: any;
  additional_works: any;
  date_issued: string | null;
  booked_date: string | null;
  status: string | null;
  is_completed: boolean | null;
  category_id: string | null;
}

type Urgency = "critical" | "high" | "medium" | "low";

function computeUrgency(job: JobRow): { urgency: Urgency; reason: string } {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const issued = job.date_issued ? new Date(job.date_issued).getTime() : null;
  const booked = job.booked_date ? new Date(job.booked_date).getTime() : null;
  const daysLogged = issued ? Math.floor((now - issued) / DAY) : 0;
  const daysToBooking = booked ? Math.floor((booked - now) / DAY) : null;

  if (daysToBooking !== null && daysToBooking <= 7) {
    return { urgency: "critical", reason: `Booked in ${daysToBooking} days` };
  }
  if (!booked && daysLogged >= 30) {
    return { urgency: "critical", reason: `Logged ${daysLogged}d ago, unbooked` };
  }
  if (daysToBooking !== null && daysToBooking <= 14) {
    return { urgency: "high", reason: `Booked in ${daysToBooking} days` };
  }
  if (!booked && daysLogged >= 21) {
    return { urgency: "high", reason: `Logged ${daysLogged}d ago, unbooked` };
  }
  if (daysToBooking !== null && daysToBooking <= 30) {
    return { urgency: "medium", reason: `Booked in ${daysToBooking} days` };
  }
  if (daysLogged >= 14) {
    return { urgency: "medium", reason: `Logged ${daysLogged}d ago` };
  }
  return { urgency: "low", reason: "No imminent deadline" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { jobIds, title, filters } = await req.json();
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return new Response(JSON.stringify({ error: "jobIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (jobIds.length > 500) {
      return new Response(JSON.stringify({ error: "Maximum 500 jobs per report" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch jobs in chunks of 100
    const allJobs: JobRow[] = [];
    for (let i = 0; i < jobIds.length; i += 100) {
      const chunk = jobIds.slice(i, i + 100);
      const { data, error } = await supabase
        .from("jobs")
        .select("id,job_number,name,address,description,summary_of_works,work_items,additional_works,date_issued,booked_date,status,is_completed,category_id")
        .in("id", chunk);
      if (error) throw error;
      allJobs.push(...((data ?? []) as JobRow[]));
    }

    if (allJobs.length === 0) {
      return new Response(JSON.stringify({ error: "No jobs found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build compact corpus with urgency
    const corpus = allJobs.map((j) => {
      const { urgency, reason } = computeUrgency(j);
      const works = Array.isArray(j.work_items) ? j.work_items : [];
      const addl = Array.isArray(j.additional_works) ? j.additional_works : [];
      const itemsText = [...works, ...addl]
        .map((w: any) => `- ${w.description || ""}${w.qty ? ` (qty ${w.qty})` : ""}${w.sorCode ? ` [${w.sorCode}]` : ""}`)
        .join("\n");
      return [
        `JOB ${j.job_number} | URGENCY: ${urgency.toUpperCase()} (${reason})`,
        `Address: ${j.address ?? ""}`,
        `Booked: ${j.booked_date ?? "UNBOOKED"} | Logged: ${j.date_issued ?? ""}`,
        `Description: ${(j.description || j.summary_of_works || "").slice(0, 1500)}`,
        itemsText ? `Work items:\n${itemsText}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n---\n\n");

    const systemPrompt = `You are a procurement analyst for a UK construction firm. Read the supplied jobs and produce a single accurate procurement report. Rules:
- Group materials by sensible categories (Bathroom, Plumbing, Electrical, Joinery, Flooring, Tiling, Grab Rails & Accessibility, Decorating, Disposal, Sundries, etc.).
- For every material item: give a short clear name, total quantity across all jobs (integer), unit, the highest urgency among the jobs that need it, and the list of job numbers requiring it.
- Group required trades and tally how many jobs each trade is needed on.
- Produce a short ordered action list focused on: critical orders to place today, trade assignments to make first, and any items needing site confirmation (qty TBC).
- Be 100% accurate to the source. Never invent items. If a quantity is not stated, write qty 0 and add to TBC notes.
- Keep names concise and procurement-friendly (e.g. "600mm grab rail", not full SOR text).`;

    const userPrompt = `Here are ${allJobs.length} jobs. Generate the structured procurement report.\n\n${corpus}`;

    const tool = {
      type: "function",
      function: {
        name: "build_report",
        description: "Return the structured procurement report",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "1-2 sentence executive summary" },
            materialGroups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        qty: { type: "integer" },
                        unit: { type: "string" },
                        urgency: { type: "string", enum: ["critical", "high", "medium", "low"] },
                        jobNumbers: { type: "array", items: { type: "string" } },
                      },
                      required: ["name", "qty", "unit", "urgency", "jobNumbers"],
                    },
                  },
                },
                required: ["category", "items"],
              },
            },
            tradeGroups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  trade: { type: "string" },
                  jobCount: { type: "integer" },
                  jobNumbers: { type: "array", items: { type: "string" } },
                  topUrgency: { type: "string", enum: ["critical", "high", "medium", "low"] },
                },
                required: ["trade", "jobCount", "jobNumbers", "topUrgency"],
              },
            },
            actionList: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                  action: { type: "string" },
                },
                required: ["priority", "action"],
              },
            },
            tbcNotes: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "materialGroups", "tradeGroups", "actionList", "tbcNotes"],
        },
      },
    };

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
        tools: [tool],
        tool_choice: { type: "function", function: { name: "build_report" } },
      }),
    });

    if (!aiResp.ok) {
      const body = await aiResp.text();
      console.error("AI gateway error", aiResp.status, body);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit reached. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call returned", JSON.stringify(aiData).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return structured output" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let report: any;
    try {
      report = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per-job urgency map for the UI
    const jobUrgencies = allJobs.map((j) => {
      const u = computeUrgency(j);
      return {
        id: j.id,
        jobNumber: j.job_number,
        name: j.name,
        address: j.address,
        urgency: u.urgency,
        reason: u.reason,
        bookedDate: j.booked_date,
        dateIssued: j.date_issued,
      };
    });

    const reportData = {
      ...report,
      generatedAt: new Date().toISOString(),
      jobCount: allJobs.length,
      jobs: jobUrgencies,
    };

    // Persist
    const { data: saved, error: saveErr } = await supabase
      .from("materials_reports")
      .insert({
        title: title || `Materials Report ${new Date().toLocaleDateString("en-GB")}`,
        job_ids: jobIds,
        filters: filters || {},
        report_data: reportData,
        job_count: allJobs.length,
      })
      .select()
      .single();

    if (saveErr) {
      console.error("Save error", saveErr);
    }

    return new Response(JSON.stringify({ report: reportData, savedId: saved?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-materials-report error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
