import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const schema = z.object({
  pdfText: z.string().min(1).max(120000),
  roadmapStart: z.string().min(1),
  roadmapEnd: z.string().min(1),
  timeUnit: z.enum(['week', 'day']).optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth check (mirrors extract-pdf)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized - invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isAdmin } = await supabaseClient.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden - admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const raw = await req.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.errors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { pdfText, roadmapStart, roadmapEnd, timeUnit } = parsed.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const defaultDur = timeUnit === 'day' ? 2 : 7;

    const systemPrompt = `You extract a project roadmap from refurbishment briefs, schedules of work, job sheets and quotes.

Project window: ${roadmapStart} → ${roadmapEnd}
Time unit: ${timeUnit || 'week'} (default block duration when unknown: ${defaultDur} days)

Return STRICT JSON only — no prose, no markdown fences:
{
  "customer_name": "string or empty",
  "address": "string or empty",
  "project_start": "YYYY-MM-DD or empty",
  "project_end": "YYYY-MM-DD or empty",
  "items": [
    {
      "label": "short task / trade name (max 60 chars)",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "duration_days": 0,
      "trade": "plumbing|electrical|carpentry|roofing|flooring|painting|plastering|kitchen|bathroom|general or empty",
      "notes": "short detail"
    }
  ]
}

CRITICAL RULES:
1. Extract every distinct task, trade or work item as one entry.
2. EVERY item MUST have BOTH start_date AND end_date in YYYY-MM-DD format, never empty.
3. If the document gives explicit dates, use them exactly.
4. If only a duration is given, sequence items consecutively starting from ${roadmapStart}, using each item's duration.
5. If neither dates nor duration are given, give every item a default duration of ${defaultDur} days and sequence them consecutively from ${roadmapStart}, distributing them evenly across the project window so the last item ends on or near ${roadmapEnd}.
6. Group trades logically (e.g. strip-out → first-fix → second-fix → finishes) when sequencing without explicit dates.
7. Clamp every date to the window ${roadmapStart} → ${roadmapEnd}.
8. De-duplicate identical entries.
9. end_date must be >= start_date.`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract roadmap items from this document:\n\n${pdfText.slice(0, 80000)}` },
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
    if (!content) throw new Error('No content in AI response');

    // Strip fences
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) content = fence[1].trim();

    // Balanced-brace extraction (like extract-pdf)
    const start = content.indexOf('{');
    if (start === -1) throw new Error('No JSON object in AI response');
    let depth = 0, end = -1;
    for (let i = start; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error('Unbalanced JSON in AI response');
    const parsedJson = JSON.parse(content.substring(start, end + 1));

    return new Response(JSON.stringify({ success: true, data: parsedJson }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('extract-roadmap-items error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
