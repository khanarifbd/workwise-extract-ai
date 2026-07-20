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

const addDaysISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const daysInclusive = (start: string, end: string): number => {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const s = Date.UTC(sy, (sm || 1) - 1, sd || 1);
  const e = Date.UTC(ey, (em || 1) - 1, ed || 1);
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
};

const buildContractorPlan = (roadmapStart: string, roadmapEnd: string) => {
  const total = daysInclusive(roadmapStart, roadmapEnd);
  const max = Math.max(0, total - 1);
  const task = (label: string, startPct: number, endPct: number, trade: string, notes: string) => {
    const s = Math.min(max, Math.max(0, Math.round(max * startPct)));
    const e = Math.min(max, Math.max(s, Math.round(max * endPct)));
    return {
      label,
      start_date: addDaysISO(roadmapStart, s),
      end_date: addDaysISO(roadmapStart, e),
      duration_days: e - s + 1,
      trade,
      notes,
    };
  };
  return {
    customer_name: '',
    address: '',
    project_start: roadmapStart,
    project_end: roadmapEnd,
    items: [
      task('Site setup, survey & procurement', 0, 0.05, 'general', 'protect areas and order long-lead materials'),
      task('Strip-out and protection works', 0, 0.12, 'general', 'first operation before structure and first fix'),
      task('Roofing / external watertight works', 0, 0.17, 'roofing', 'front-loaded weather-sensitive work'),
      task('Structural openings and repairs', 0.08, 0.22, 'carpentry', 'must finish before boarding and plaster'),
      task('Damp proofing / tanking', 0.16, 0.25, 'general', 'early curing before finishes'),
      task('1st fix plumbing', 0.22, 0.34, 'plumbing', 'parallel first fix after strip-out'),
      task('1st fix electrics', 0.22, 0.34, 'electrical', 'parallel first fix before close-up'),
      task('1st fix carpentry / studwork', 0.25, 0.38, 'carpentry', 'frames and grounds before boarding'),
      task('Insulation and boarding', 0.36, 0.45, 'general', 'close-up after first fix inspection'),
      task('Plastering / making good', 0.43, 0.55, 'plastering', 'after boarding and first fix'),
      task('Plaster drying hold point', 0.56, 0.62, 'general', 'protected drying window'),
      task('2nd fix plumbing', 0.62, 0.72, 'plumbing', 'parallel second fix'),
      task('2nd fix electrics', 0.62, 0.72, 'electrical', 'parallel second fix'),
      task('2nd fix carpentry / doors', 0.62, 0.75, 'carpentry', 'doors and trim after plaster'),
      task('Kitchen installation', 0.66, 0.8, 'kitchen', 'overlap with bathroom where separate rooms'),
      task('Bathroom installation', 0.66, 0.82, 'bathroom', 'fit-out after first fix and plaster'),
      task('Tiling, grout and silicone', 0.75, 0.86, 'bathroom', 'after fit-out surfaces are ready'),
      task('Decoration preparation / mist coat', 0.8, 0.88, 'painting', 'after plaster dry'),
      task('Final painting and decoration', 0.86, 0.96, 'painting', 'late-stage finish before flooring'),
      task('Flooring preparation and install', 0.92, 0.99, 'flooring', 'kept late to avoid damage'),
      task('Snagging, clean and handover', 0.96, 1, 'general', 'final checks before deadline'),
    ],
  };
};

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

    const systemPrompt = `You are a Chartered Building & Refurbishment Contractor and Operations Planner with 25+ years hands-on experience delivering domestic and mixed-use refurbishments on tight deadlines and tight budgets. You have personally run strip-outs, first-fix, second-fix and finishes on hundreds of projects, so you know — from experience, not guesswork — how long each trade actually takes, which trades MUST finish before others can start, and which trades can safely run in parallel to compress the programme.

You are planning the "Melbourne" refurbishment. The project window is a HARD deadline:
Project window: ${roadmapStart} → ${roadmapEnd}
Time unit: ${timeUnit || 'week'} (fallback block duration when unknown: ${defaultDur} days)

Your job is to read the source document, extract every legitimate task/trade, and produce a realistic, buildable programme that finishes on or before ${roadmapEnd}.

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
      "notes": "short detail — include dependency reason if sequenced (e.g. 'after 1st fix electrics')"
    }
  ]
}

CONTRACTOR REASONING RULES — apply BEFORE emitting JSON:

A. REALISTIC DURATIONS (domestic refurb, typical crew size):
   - Strip-out / soft demolition: 2–4 days
   - Structural / steels / openings: 3–5 days
   - Roofing (re-cover / patch): 3–7 days (weather-sensitive, schedule early)
   - Damp proofing / tanking: 2–4 days + drying
   - 1st fix plumbing: 3–5 days   • 1st fix electrics: 3–5 days   • 1st fix carpentry: 2–4 days
   - Plastering: 3–5 days + 3–5 days drying BEFORE decoration
   - 2nd fix plumbing / electrics / carpentry: 2–4 days each
   - Kitchen install: 3–5 days    • Bathroom install: 4–6 days    • Tiling: 2–4 days per room
   - Flooring: 2–4 days (must be after decoration where possible)
   - Decoration / painting: 4–7 days
   - Snagging & clean: 2–3 days at the very end
   Adjust up/down based on scope evidenced in the document, but never invent durations that make the project miss ${roadmapEnd}.

B. CORRECT SEQUENCING (dependencies that CANNOT be broken):
   Strip-out → Structural → Roof watertight → 1st fix (M&E + carpentry, run IN PARALLEL) → Plastering → Plaster drying → 2nd fix (M&E + carpentry, IN PARALLEL) → Kitchen/Bathroom install → Tiling → Decoration → Flooring → Snagging & handover.

C. PARALLEL WORKING (use aggressively to hit the 6-week deadline):
   - 1st fix plumbing, electrics and carpentry run in parallel once strip-out is complete.
   - 2nd fix trades run in parallel.
   - Roofing / external works run in parallel with internal strip-out where safe.
   - Kitchen and bathroom fit-out can overlap if different rooms.

D. DEADLINE DISCIPLINE:
   - The last task MUST end on or before ${roadmapEnd}.
   - If evidenced scope cannot realistically fit, compress by running MORE trades in parallel (not by shortening realistic durations below the minimums in section A).
   - Front-load weather-dependent and long-lead items (roofing, structural, plaster drying).
   - Leave 2–3 days at the end for snagging & clean.

E. EXTRACTION DISCIPLINE:
   - Extract every distinct task/trade evidenced in the document as one entry.
   - Preserve tasks even when no SOR/cost is given (Task Completeness).
   - EVERY item MUST have BOTH start_date AND end_date in YYYY-MM-DD, never empty.
   - If explicit dates are given in the document, use them exactly.
   - Otherwise assign dates using rules A–D above, starting from ${roadmapStart}.
   - Clamp every date inside ${roadmapStart} → ${roadmapEnd}.
   - end_date must be >= start_date.
   - De-duplicate identical entries.
   - Notes field: briefly justify sequencing when not explicit (e.g. "after plaster dry", "parallel with 1st fix elec").`;


    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract roadmap items from this document:\n\n${pdfText.slice(0, 80000)}` },
        ],
        response_format: { type: 'json_object' },
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
    if (!Array.isArray(parsedJson.items) || parsedJson.items.length === 0) {
      return new Response(JSON.stringify({ success: true, data: buildContractorPlan(roadmapStart, roadmapEnd), warning: 'AI returned no roadmap items; contractor plan used.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
