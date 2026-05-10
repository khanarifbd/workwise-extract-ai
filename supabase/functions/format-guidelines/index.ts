import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { rawText, categoryName, mode } = await req.json();
    if (!rawText || typeof rawText !== "string") {
      return new Response(JSON.stringify({ error: "rawText required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const isMobile = mode === "mobile";

    const prompt = isMobile
      ? `You are formatting a MOBILE-OPTIMISED quick-reference of NPH (housing association) guidelines for field teams in the "${
          categoryName || "category"
        }" category.

Field workers will read this on a phone between jobs. Make it BRUTALLY short and scannable.

Rules:
- Keep ONLY the most operationally critical rules, timescales, contacts and escalation steps
- Strip background, rationale and admin context
- Use short bullet points (- ...) — max ~10 words per bullet
- Group under at most 3-4 short ## headings (e.g. "Timescales", "Must do", "Escalate")
- Use **bold** for hard numbers, deadlines and phone numbers
- No paragraphs, no fluff, no introductions
- Aim for under 25 lines total

Return ONLY the formatted markdown, no preamble, no code fences.

RAW NOTES:
"""${rawText}"""`
      : `You are a senior technical editor formatting NPH (housing association) operational guidelines for the "${
          categoryName || "category"
        }" category.

Convert the raw notes below into clean, scannable Markdown for site/ops staff. Preserve EVERY rule, number, timescale, contact and detail — never summarise away content.

Use:
- # / ## / ### for clear hierarchy
- **bold** for key terms, deadlines, KPIs, role names
- *italic* for emphasis on cautions
- - bullet lists for rules / checklists
- 1. numbered lists for sequential steps
- > blockquotes for warnings or critical notes
- Tables only if the source clearly tabulates data

Group related points under sensible headings (e.g. "Timescales", "Responsibilities", "Documentation", "Compliance", "Escalation"). Keep wording faithful to the source — fix grammar/spelling silently, but do not invent rules.

Return ONLY the formatted markdown, no preamble, no code fences.

RAW NOTES:
"""${rawText}"""`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("AI error", r.status, t);
      if (r.status === 429)
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (r.status === 402)
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      throw new Error("AI gateway failed");
    }
    const data = await r.json();
    let formatted = data.choices?.[0]?.message?.content?.trim() || rawText;
    formatted = formatted.replace(/^```(?:markdown)?\n?/i, "").replace(/```$/i, "").trim();
    return new Response(JSON.stringify({ formatted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
