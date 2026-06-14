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

    // Token-based shortlist: pre-filter the catalogue to entries that share meaningful tokens
    // with the description + existing works. This drastically improves grounding vs dumping all 2000+ codes.
    const STOP = new Set(['the','a','an','and','or','of','to','in','on','at','for','with','by','is','are','be','it','as','this','that','from','was','were','has','have','had','will','any','all','new','old','one','two','per','use','using','make','please','need','required','works','work','job','area','room']);
    const tokenize = (s: string): string[] =>
      (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

    const queryTokens = new Set<string>([
      ...tokenize(description),
      ...((existingWorks ?? []).flatMap((w: any) => tokenize(w.description || ''))),
    ]);

    const scoreEntry = (c: CodeEntry): number => {
      const hay = `${c.description} ${c.category || ''}`.toLowerCase();
      let s = 0;
      for (const t of queryTokens) if (hay.includes(t)) s += t.length >= 5 ? 2 : 1;
      return s;
    };

    let sorContext: string;
    let codeSource: 'nph_books' | 'fallback';
    if (codes.length > 0) {
      // Always include codes referenced by existing works
      const forcedCodes = new Set<string>(
        (existingWorks ?? []).map((w: any) => String(w.code || '').trim()).filter(Boolean)
      );
      const scored = codes
        .map((c) => ({ c, s: scoreEntry(c) + (forcedCodes.has(c.code) ? 999 : 0) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 300)
        .map((x) => x.c);
      // Fallback: if no tokens matched (very short desc), use first 300 codes
      const shortlist = scored.length >= 20 ? scored : codes.slice(0, 300);
      sorContext = shortlist.map((c) => `${c.code} | ${c.description} | ${c.category || 'General'} | ${c.unit || 'each'} | £${c.cost}`).join('\n');
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
      ? `\n\nCOSTING TARGET: £${minimumCost.toFixed(2)} (baseline minimum).
You MUST scale the three tiers to hit realistic NPH cost coverage for a fully-completed job of this type:
- baseline: lean but COMPLETE scope, total >= £${minimumCost.toFixed(2)}.
- enhanced: standard NPH scope, total approximately +20% above baseline (range +15% to +25%).
- premium: full scope with allied works, total approximately +45% above baseline (range +40% to +55%).
HOW TO REACH THE TARGET (NEVER inflate per-unit cost):
1. Increase QUANTITIES, LENGTHS, AREAS, LAYERS, COATS where genuinely applicable (e.g. m² of plaster, linear m of skirting, number of coats of paint, m² of decoration following a repair).
2. Add genuinely-related allied SOR codes from the catalogue: make-good, redecoration, ancillary fittings, debris removal, access works, isolation/reinstatement.
3. Select higher-cost catalogue variants only when the works data genuinely justifies them.
Every chosen code MUST be defensible from the job data — no fabrication.`
      : `\n\nNo minimum cost specified. Produce three realistic tiered quotes scaled by scope:
- baseline: minimum COMPLETE compliant scope.
- enhanced: standard NPH scope (~+20% total).
- premium: full scope with allied works (~+45% total).
Scale by increasing QUANTITIES / LENGTHS / AREAS / LAYERS / COATS and adding allied SOR codes — never by altering per-unit cost.`;

    const systemPrompt = `You are a UK social housing pricing specialist with 25+ years of tradesmen experience, working strictly to NPH-approved Schedule of Rates.

GOAL: Produce a realistic, accurate, NPH-ALIGNED SOR-code breakdown of the works ACTUALLY CARRIED OUT on this job. The output is what an admin will type, line-by-line, into NPH's portal — every line must pair a valid SOR code with a clear, specific, professional description of that line of work.

You will be given a tenant/works description (and, optionally, an existing NPH-allocated Works List). Convert this into THREE complete tiered quotes (baseline, enhanced, premium) of itemised SOR work items.

HARD RULES:
- ONLY use SOR codes from the catalogue below. NEVER invent codes.
- NEVER alter the per-unit cost — only quantities scale.
- Every line description must be SPECIFIC (what was done, where, with what material/finish where implied) — not generic.
- Use whichever source has the MORE SPECIFIC data for each line: prefer the existing Works List where it names a precise code/scope; prefer the free-text description where it adds location, dimensions, material, fault detail, or extent.
- Do NOT fabricate. If the data doesn't imply a code, don't add it.

CATALOGUE — these are the ONLY codes you may emit (pipe-separated: code | description | category | unit | cost):
${sorContext}

REMINDER: a code that is NOT in the list above does not exist. Do not invent codes like "821503" or "0508AA" — only emit codes printed in the list above. If no listed code fits, omit the line.
${minCostInstruction}

Return STRICTLY a JSON object of this shape (no markdown, no commentary):
{
  "tiers": {
    "baseline": { "label": "Baseline", "items": [ { "description": string, "code": string, "qty": number } ], "notes": string },
    "enhanced": { "label": "Enhanced", "items": [ ... ], "notes": string },
    "premium":  { "label": "Premium",  "items": [ ... ], "notes": string }
  }
}

Each items[] entry: description = clear, professional, NPH-portal-ready human-readable line (mention location/material/extent where the data supports it); code = exact SOR code from the catalogue; qty = integer >= 1.
Notes: 1-2 sentences explaining the scope rationale for that tier (e.g. "Adds tiled make-good and full redecoration").`;

    const existingWorksBlock = (existingWorks && existingWorks.length > 0)
      ? `\n\nEXISTING NPH WORKS LIST (already on the job — provided by NPH).
These are the works ALREADY ALLOCATED to this job. Many descriptions are short, vague, or missing a SOR code.
Your task:
1. KEEP every existing item — re-emit each one in every tier. Preserve the original code where present. If an existing item has NO SOR code (or an unknown/invalid one), FIND the most appropriate SOR code from the catalogue that matches its description and use that. Never drop an existing item.
2. Compare each existing item against the new description — adopt the MORE SPECIFIC wording / location / material / extent for the final line description (whichever source carries the better detail).
3. From the combined data, INFER and ADD the realistic full breakdown of works actually carried out on site (allied works, make-good, redecoration, ancillary fittings, debris removal, access). Add ONLY codes that the combined data genuinely implies.
4. To reach the cost target, MAXIMISE quantities/lengths/areas/layers/coats where genuinely justified by the works — never inflate per-unit cost, never fabricate scope.
5. Result must be NPH-aligned: each line ready to enter into the NPH portal as a complete, specific record of work done.

Existing items (JSON):
${JSON.stringify(existingWorks.map((w: any) => ({ description: w.description, code: w.code || null, qty: w.qty || 1 })))}`
      : '';

    const genRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt + existingWorksBlock },
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
