import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `You are a roadmap editor assistant. The user will give a plain-English instruction to modify a Gantt-style roadmap.

You are given:
- roadmap: { start_date, end_date }
- items: an array of tasks with { id, label, start_date, end_date, sort_order, parent_id, notes, progress, color, is_milestone }

Return ONLY valid JSON with this exact shape (no markdown, no prose):
{
  "operations": [
    { "op": "update", "id": "<id>", "patch": { "start_date"?: "YYYY-MM-DD", "end_date"?: "YYYY-MM-DD", "label"?: string, "notes"?: string, "progress"?: number, "color"?: string } },
    { "op": "reorder", "id": "<id>", "after_id"?: "<id>", "before_id"?: "<id>" },
    { "op": "delete", "id": "<id>" },
    { "op": "create", "label": string, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "after_id"?: "<id>", "notes"?: string, "color"?: string }
  ],
  "summary": "short human-readable description of changes"
}

Rules:
- Match tasks the user references by fuzzy label (case-insensitive, partial). Use the resolved id in operations.
- Interpret loose dates like "3rd aug" using the year from the roadmap window. Assume current roadmap year.
- Keep dates within roadmap.start_date and roadmap.end_date.
- For "move X under Y" or "move X below Y" use a reorder op with after_id = Y's id.
- For "add note to X: ..." use an update op setting notes.
- If unclear, still produce your best-guess operations; never return prose.
- If no changes are possible, return { "operations": [], "summary": "no changes" }.`;

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
        model: 'google/gemini-3-flash-preview',
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
