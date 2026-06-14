import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const schema = z.object({
  description: z.string().min(1).max(50000),
  minimumCost: z.number().min(0).max(1_000_000).optional(),
  sorCodesContext: z.string().max(50000).optional(), // fallback only
  existingWorks: z.array(z.object({
    description: z.string().max(2000),
    code: z.string().max(64).optional(),
    qty: z.number().optional(),
    cost: z.number().optional(),
  })).max(200).optional(),
});

interface CodeEntry {
  code: string;
  description: string;
  category: string | null;
  cost: number;
  unit: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: isAdmin } = await userClient.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.errors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { description, minimumCost = 0, sorCodesContext, existingWorks } = parsed.data;

    // Load codes from approved SOR books
    const { data: codeRows } = await admin
      .from('sor_code_entries')
      .select('code,description,category,cost,unit')
      .order('code', { ascending: true })
      .limit(5000);

    const codes: CodeEntry[] = (codeRows ?? []) as CodeEntry[];
    const codeIndex = new Map<string, CodeEntry>();
    codes.forEach((c) => codeIndex.set(c.code, c));

    let sorContext: string;
    let codeSource: 'nph_books' | 'fallback';
    if (codes.length > 0) {
      sorContext = codes.map((c) => `${c.code}: ${c.description} (Category: ${c.category || 'General'}, Unit: ${c.unit || 'each'}, Cost: £${c.cost})`).join('\n');
      codeSource = 'nph_books';
    } else {
      sorContext = sorCodesContext || '';
      codeSource = 'fallback';
      if (!sorContext) {
        return new Response(JSON.stringify({ error: 'No NPH-approved SOR code books uploaded. Please upload at least one PDF rate schedule from the SOR Code Books manager.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const minCostInstruction = minimumCost > 0
      ? `\n\nMINIMUM COST TARGET: £${minimumCost.toFixed(2)}.
You MUST produce three tiered quotes where the BASELINE total is greater than or equal to £${minimumCost.toFixed(2)}.
- baseline: lean scope, total >= £${minimumCost.toFixed(2)}.
- enhanced: standard NPH scope, total approximately +20% above baseline (range +15% to +25%).
- premium: full scope with higher-grade materials/labour, total approximately +45% above baseline (range +40% to +55%).
Achieve tier scaling by adjusting QUANTITIES, adding genuinely related allied SOR codes (e.g. make-good, decoration, ancillary fittings), or selecting higher-cost variants from the catalogue — NEVER by inflating the per-unit cost of a code.`
      : `\n\nNo minimum cost specified. Produce three tiered quotes scaled by scope:
- baseline: minimum compliant scope.
- enhanced: standard NPH scope (~+20% total).
- premium: full scope with allied works (~+45% total).`;

    const systemPrompt = `You are a UK social housing pricing specialist with 25+ years of tradesmen experience, working strictly to NPH-approved Schedule of Rates.

You will be given a tenant/works description. Convert it into THREE complete tiered quotes (baseline, enhanced, premium) of itemised SOR work items.

You MUST only use SOR codes from the catalogue below. NEVER invent codes. NEVER alter the per-unit cost — quantities are the only thing you change.

CATALOGUE (code: description (Category, Unit, Cost)):
${sorContext}
${minCostInstruction}

Return STRICTLY a JSON object of this shape (no markdown, no commentary):
{
  "tiers": {
    "baseline": { "label": "Baseline", "items": [ { "description": string, "code": string, "qty": number } ], "notes": string },
    "enhanced": { "label": "Enhanced", "items": [ ... ], "notes": string },
    "premium":  { "label": "Premium",  "items": [ ... ], "notes": string }
  }
}

Each items[] entry: description = clear, professional human-readable line; code = exact SOR code from the catalogue; qty = integer >= 1.
Notes: 1-2 sentences explaining the scope rationale for that tier (e.g. "Adds tiled make-good and full redecoration").`;

    const genRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Description to convert:\n\n${description}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!genRes.ok) {
      if (genRes.status === 429) return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (genRes.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const txt = await genRes.text();
      throw new Error(`AI gateway ${genRes.status}: ${txt.slice(0, 200)}`);
    }
    const genData = await genRes.json();
    const genContent = genData.choices?.[0]?.message?.content ?? '';

    let tiersRaw: any = null;
    try { tiersRaw = JSON.parse(genContent); } catch {
      const m = genContent.match(/\{[\s\S]*\}/); if (m) { try { tiersRaw = JSON.parse(m[0]); } catch {} }
    }
    if (!tiersRaw?.tiers) throw new Error('AI returned no tiers');

    // Deterministic accuracy: resolve every code against catalogue, recompute totals
    const tierKeys = ['baseline', 'enhanced', 'premium'] as const;
    const validatedTiers: Record<string, any> = {};
    const accuracy: Record<string, { total: number; itemCount: number; invalidCodes: string[]; valid: boolean }> = {};

    for (const key of tierKeys) {
      const t = tiersRaw.tiers[key];
      if (!t) continue;
      const items: any[] = Array.isArray(t.items) ? t.items : [];
      const invalidCodes: string[] = [];
      let total = 0;
      const cleanedItems = items.map((it) => {
        const code = String(it.code || '').trim();
        const qty = Math.max(1, Math.round(Number(it.qty) || 1));
        const entry = codeIndex.get(code);
        if (!entry) {
          invalidCodes.push(code);
          return { description: String(it.description || ''), code, qty, cost: 0, unit: null, category: null, valid: false };
        }
        const cost = entry.cost * qty;
        total += cost;
        return { description: String(it.description || entry.description), code, qty, cost, unit: entry.unit, category: entry.category, valid: true };
      });
      validatedTiers[key] = {
        label: t.label || key,
        notes: String(t.notes || ''),
        items: cleanedItems,
        total: Math.round(total * 100) / 100,
      };
      accuracy[key] = {
        total: validatedTiers[key].total,
        itemCount: cleanedItems.length,
        invalidCodes,
        valid: invalidCodes.length === 0,
      };
    }

    // Second AI pass for NPH/industry alignment review
    const reviewPrompt = `You are an NPH QS reviewer. Review the three tiered quotes below against the original description.
For each tier, judge:
1. Are the SOR codes appropriate for the works described?
2. Are quantities realistic for typical UK social housing repair?
3. Is the scope progression sensible (baseline -> enhanced -> premium)?

Return STRICTLY: { "review": { "baseline": { "ok": boolean, "issues": string[], "score": number }, "enhanced": {...}, "premium": {...} }, "overall": { "ok": boolean, "summary": string } }
score: 0-100. issues: short bullet-style strings (empty array if none).`;

    const reviewPayload = {
      description,
      minimumCost,
      tiers: Object.fromEntries(Object.entries(validatedTiers).map(([k, v]: any) => [k, { total: v.total, items: v.items.map((i: any) => ({ code: i.code, description: i.description, qty: i.qty, cost: i.cost })) }])),
    };

    let review: any = null;
    try {
      const revRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: reviewPrompt },
            { role: 'user', content: JSON.stringify(reviewPayload) },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (revRes.ok) {
        const d = await revRes.json();
        const c = d.choices?.[0]?.message?.content ?? '';
        try { review = JSON.parse(c); } catch { const m = c.match(/\{[\s\S]*\}/); if (m) try { review = JSON.parse(m[0]); } catch {} }
      }
    } catch (e) {
      console.warn('Review pass failed:', e);
    }

    return new Response(JSON.stringify({
      success: true,
      tiers: validatedTiers,
      accuracy,
      review,
      codeSource,
      codeCount: codes.length,
      minimumCost,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('convert-description error', error);
    return new Response(JSON.stringify({ error: String(error?.message || 'Failed') }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
