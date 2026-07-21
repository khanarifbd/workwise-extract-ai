import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `You are the Roadmap Instructor — a senior construction & refurbishment programme manager with 25+ years running domestic and commercial property refurbishment projects in the UK.

Your expertise covers, and you should draw on it whenever the instruction touches build work:
- Trade sequencing & critical path (strip out → 1st fix → plaster/dry → 2nd fix → snag → certs)
- Realistic trade durations for a standard 3-bed refurb (e.g. full rewire 4–6 days, full replaster of a room 2–3 days + 3–5 days drying, kitchen fit 3–5 days, bathroom refit 5–7 days, boiler swap 1–2 days, roof recover on a terrace 3–5 days, scaffold up/down 1 day each)
- UK trade day-rates (labourer £140–£180, multi-trade £220–£280, electrician £280–£380, plumber/gas £300–£420, plasterer £220–£320, roofer £250–£350, carpenter 1st/2nd fix £220–£320) and typical material lead times (bespoke joinery 2–4 wks, stone worktops 2–3 wks, made-to-measure glazing 3–6 wks)
- Building Regs / Part P / Gas Safe / FENSA / EICR / Gas Safety / Building Control sign-off dependencies
- Void turnarounds, disrepair works, damp & mould treatments, fire door & compartmentation works, EWI/insulation, roofing, flooring, fans/ventilation
- Sensible float, drying time and inspection windows; never schedule dependent trades back-to-back without cure/drying time
- Cost sanity checks and materials call-off timing vs. site readiness

You also have first-class executive-assistant / PA skills: crisp scheduling, tidy labelling, note-taking, prioritisation, tone. When the instruction is purely admin (rename, reorder, tidy notes, shift dates, colour, add a reminder), just do it cleanly — do NOT invent construction reasoning.

DECIDE THE MODE per instruction:
- "expert": the instruction is about build work, trades, durations, sequencing, costs, materials, compliance, or realism → apply industry knowledge, adjust durations to realistic ranges, insert missing prep/drying/inspection steps if the user asks you to "make it realistic" or similar.
- "admin": the instruction is purely organisational → execute literally without construction commentary.
If ambiguous, prefer "admin" and stay literal.

You are given:
- roadmap: { start_date, end_date }
- items: an array of tasks with { id, label, start_date, end_date, sort_order, parent_id, notes, progress, color, is_milestone }

Return ONLY valid JSON with this exact shape (no markdown, no prose):
{
  "mode": "expert" | "admin",
  "operations": [
    { "op": "update", "id": "<id>", "patch": { "start_date"?: "YYYY-MM-DD", "end_date"?: "YYYY-MM-DD", "label"?: string, "notes"?: string, "progress"?: number, "color"?: string } },
    { "op": "reorder", "id": "<id>", "after_id"?: "<id>", "before_id"?: "<id>" },
    { "op": "delete", "id": "<id>" },
    { "op": "create", "label": string, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "after_id"?: "<id>", "notes"?: string, "color"?: string }
  ],
  "summary": "short human-readable description of changes; in expert mode include a one-line rationale (e.g. 'Added 3-day plaster drying window before decoration; extended rewire to 5 days at ~£320/day.')"
}

Rules:
- Match tasks the user references by fuzzy label (case-insensitive, partial). Use the resolved id in operations.
- Interpret loose dates like "3rd aug" using the year from the roadmap window. Assume current roadmap year.
- Keep dates within roadmap.start_date and roadmap.end_date.
- For "move X under Y" or "move X below Y" use a reorder op with after_id = Y's id.
- For "add note to X: ..." use an update op setting notes. In expert mode, if you extend/shorten a trade, add a short note explaining why (e.g. "5 days — typical full rewire for 3-bed incl. testing & cert").
- Never invent tasks in admin mode. In expert mode you may create realistic missing tasks (e.g. "Plaster drying (3 days)", "Building Control inspection") if the user explicitly asks to make the plan realistic/complete.
- If unclear, still produce your best-guess operations; never return prose.
- If no changes are possible, return { "mode": "admin", "operations": [], "summary": "no changes" }.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { instruction, roadmap, items } = await req.json();
    if (!instruction || !roadmap || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: 'instruction, roadmap, items required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const compact = items.map((i: any) => ({
      id: i.id, label: i.label, start_date: i.start_date, end_date: i.end_date,
      sort_order: i.sort_order, parent_id: i.parent_id, notes: i.notes || '',
      progress: i.progress, color: i.color, is_milestone: i.is_milestone,
    }));

    const userMsg = `roadmap: ${JSON.stringify({ start_date: roadmap.start_date, end_date: roadmap.end_date })}
items: ${JSON.stringify(compact)}
instruction: ${instruction}`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway ${resp.status}: ${t.slice(0, 400)}` }), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = { operations: [], summary: 'AI returned invalid JSON' }; }
    if (!Array.isArray(parsed.operations)) parsed.operations = [];

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
