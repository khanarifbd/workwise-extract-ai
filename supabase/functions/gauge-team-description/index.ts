import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JobInput {
  id: string;
  jobNumber: string;
  /** All the text the AI can look at: description, private_notes, recent team updates joined. */
  text: string;
}

interface ReqBody {
  jobs: JobInput[];
}

/**
 * Heuristic pre-filter so we don't burn AI credits on obviously-empty rows.
 * Returns:
 *   - true  → definitely has team-written completion description
 *   - false → definitely doesn't
 *   - null  → unsure, ask the AI
 */
function heuristic(text: string): boolean | null {
  const t = (text || '').trim();
  if (t.length < 25) return false;

  const lower = t.toLowerCase();
  const COMPLETION_HINTS = [
    'completed', 'complete.', 'done', 'finished', 'installed', 'fitted',
    'replaced', 'repaired', 'fixed', 'painted', 'sealed', 'mounted',
    'made good', 'signed off', 'work carried out', 'works completed',
    'attended', 'cleared', 'tested', 'commissioned',
  ];
  const hits = COMPLETION_HINTS.filter(h => lower.includes(h)).length;
  if (hits >= 2 && t.length > 60) return true;
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { jobs }: ReqBody = await req.json();
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return new Response(JSON.stringify({ results: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Run heuristic first
    const results: Record<string, boolean> = {};
    const needAi: JobInput[] = [];
    for (const j of jobs) {
      const h = heuristic(j.text);
      if (h === null) needAi.push(j);
      else results[j.id] = h;
    }

    if (needAi.length === 0) {
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Batch into chunks of 25 for the AI
    const chunks: JobInput[][] = [];
    for (let i = 0; i < needAi.length; i += 25) chunks.push(needAi.slice(i, i + 25));

    for (const chunk of chunks) {
      const payload = chunk.map(c => ({ id: c.id, text: (c.text || '').slice(0, 1200) }));
      const system = `You inspect free-text notes attached to property maintenance jobs.
For EACH job decide: has a tradesperson/team actually written notes describing WORK THEY HAVE CARRIED OUT on this job?
- true  = the text contains a description of works COMPLETED or carried out by a team on site (past-tense work notes, what was done, materials used, sign-off comments, etc.)
- false = the text is only the original brief / scope of works, instructions, customer details, blank, or admin notes. No team completion description present.
Return ONLY compact JSON: {"r":[{"id":"...","done":true|false}, ...]}`;

      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(payload) },
          ],
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        const errTxt = await res.text();
        console.error('AI gateway error', res.status, errTxt);
        // Conservative fallback: mark as false (unticked) so progressor still gets a list
        for (const c of chunk) results[c.id] = false;
        continue;
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content ?? '';
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        const arr = parsed.r || parsed.results || [];
        for (const item of arr) {
          if (item && typeof item.id === 'string') {
            results[item.id] = !!item.done;
          }
        }
        // Anything the AI dropped → false
        for (const c of chunk) if (!(c.id in results)) results[c.id] = false;
      } catch (e) {
        console.error('Parse AI output failed', e, raw);
        for (const c of chunk) results[c.id] = false;
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('gauge-team-description error', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
