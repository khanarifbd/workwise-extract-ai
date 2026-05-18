import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { pdfText, roadmapStart, roadmapEnd } = await req.json();
    if (!pdfText || typeof pdfText !== 'string') {
      return new Response(JSON.stringify({ error: 'pdfText required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const systemPrompt = `You extract project roadmap data from documents (schedules of work, refurbishment briefs, job sheets, work orders).

Return STRICT JSON only, no prose, no markdown fences:
{
  "customer_name": "string or empty",
  "address": "string or empty",
  "project_start": "YYYY-MM-DD or empty",
  "project_end": "YYYY-MM-DD or empty",
  "items": [
    {
      "label": "short task/trade name (max 60 chars)",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "duration_days": 0,
      "trade": "plumbing|electrical|carpentry|roofing|flooring|painting|plastering|kitchen|bathroom|general or empty",
      "notes": "short detail"
    }
  ]
}

Rules:
- Extract every distinct task, job, or trade as one item.
- If a duration is given without dates, use duration_days and leave dates empty.
- If only one date is given, use it for both start_date and end_date.
- Keep dates within ${roadmapStart || 'any'} to ${roadmapEnd || 'any'} when the document specifies a range.
- De-duplicate identical entries.
- Never invent dates that aren't supported by the text — leave empty instead.`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Roadmap window: ${roadmapStart} → ${roadmapEnd}\n\nDocument text:\n\n${pdfText.slice(0, 80000)}` },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error('AI error', resp.status, t);
      if (resp.status === 429) return new Response(JSON.stringify({ error: 'Rate limit – try again shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI ${resp.status}`);
    }

    const data = await resp.json();
    let content: string = data.choices?.[0]?.message?.content || '';
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) content = fence[1].trim();
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON in AI response');
    const parsed = JSON.parse(content.substring(start, end + 1));

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('extract-roadmap-items error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
