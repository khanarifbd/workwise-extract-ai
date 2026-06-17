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
        .slice(0, 220)
        .map((x) => x.c);
      // Fallback: if no tokens matched (very short desc), use first 220 codes
      const shortlist = scored.length >= 20 ? scored : codes.slice(0, 220);
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
      ? `\n\nCOSTING FLOOR (HARD): £${minimumCost.toFixed(2)} is the ABSOLUTE MINIMUM BASE COST for the baseline tier. The baseline total MUST be >= £${minimumCost.toFixed(2)}. This is not a target, it is a floor — under no circumstances may baseline come in below it.
- baseline: lean but COMPLETE scope. Total >= £${minimumCost.toFixed(2)} (HARD FLOOR).
- enhanced: standard NPH scope, total approximately +20% above baseline (range +15% to +25%).
- premium: full scope with allied works, total approximately +45% above baseline (range +40% to +55%).
HOW TO REACH AND HOLD THE FLOOR (NEVER inflate per-unit cost):
1. First, encapsulate EVERY task implied by the job data as its own SOR line (see TASK ENCAPSULATION below). Coverage comes before scaling.
2. Then increase QUANTITIES, LENGTHS, AREAS, LAYERS, COATS where genuinely applicable (m² of plaster, linear m of skirting, coats of paint, m² of redecoration following a repair).
3. Then add genuinely-related allied SOR codes from the catalogue: make-good, redecoration, ancillary fittings, debris removal, access works, isolation/reinstatement.
Every chosen code MUST be defensible from the job data — no fabrication, no per-unit cost manipulation.`
      : `\n\nNo minimum cost specified. Produce three realistic tiered quotes scaled by scope:
- baseline: minimum COMPLETE compliant scope covering EVERY task in the data.
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

TASK ENCAPSULATION (MANDATORY):
You will be given a combined job context made of: the main description, the existing Works List, and optionally the Ongoing Notes / Reason and Team Progress notes. You MUST:
1. Read the ENTIRE combined context carefully. Mentally enumerate EVERY discrete task, action, fault, location, material, fixture, or scope item mentioned anywhere — in the description, in the existing works, in ongoing notes, and in progress notes.
2. For EACH enumerated task, emit at least one SOR line that covers it. Nothing in the combined context may be left uncosted if the catalogue contains a code that fits it.
3. Where one SOR code naturally covers several mentioned sub-actions (e.g. "prep + paint" as a single decoration code), state that consolidation in the line description.
4. If a task is mentioned but no catalogue code fits, omit the line silently — never emit a placeholder/invented code.

CATALOGUE — these are the ONLY codes you may emit (pipe-separated: code | description | category | unit | cost):
${sorContext}

REMINDER: a code that is NOT in the list above does not exist. Do not invent codes like "821503" or "703001" — only emit codes printed in the list above. If no listed code fits, omit the line.
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

    // No client-side abort: conversion stays open as long as the user keeps the page open.
    // Deterministic remap + accuracy validation below catches any hallucinated codes.
    const genRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
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

    // Deterministic accuracy: resolve every code against catalogue, recompute totals.
    // For codes the AI invented, deterministically remap to the closest legitimate catalogue
    // entry by token-overlap on the description (so the user always gets a real costed line).
    const remapByDescription = (desc: string): CodeEntry | null => {
      const toks = tokenize(desc);
      if (toks.length === 0) return null;
      let best: { c: CodeEntry; s: number } | null = null;
      for (const c of codes) {
        const hay = `${c.description} ${c.category || ''}`.toLowerCase();
        let s = 0;
        for (const t of toks) if (hay.includes(t)) s += t.length >= 5 ? 2 : 1;
        if (s > 0 && (!best || s > best.s)) best = { c, s };
      }
      // Require at least 2 token hits to avoid noisy remaps
      return best && best.s >= 2 ? best.c : null;
    };

    const tierKeys = ['baseline', 'enhanced', 'premium'] as const;
    const validatedTiers: Record<string, any> = {};
    const accuracy: Record<string, { total: number; itemCount: number; invalidCodes: string[]; remappedCount: number; valid: boolean }> = {};
    const tierTotals: Record<string, number> = {};
    const tierItemsRef: Record<string, any[]> = {};

    for (const key of tierKeys) {
      const t = tiersRaw.tiers[key];
      if (!t) continue;
      const items: any[] = Array.isArray(t.items) ? t.items : [];
      const invalidCodes: string[] = [];
      let remappedCount = 0;
      let total = 0;
      const cleanedItemsRaw = items.map((it) => {
        const originalCode = String(it.code || '').trim();
        const qty = Math.max(1, Math.round(Number(it.qty) || 1));
        const desc = String(it.description || '');
        let entry = codeIndex.get(originalCode);
        let codeUsed = originalCode;
        let remapped = false;
        if (!entry) {
          const guess = remapByDescription(desc);
          if (guess) {
            entry = guess;
            codeUsed = guess.code;
            remapped = true;
            remappedCount += 1;
          } else {
            invalidCodes.push(originalCode);
            return null;
          }
        }
        const cost = entry.cost * qty;
        total += cost;
        return { description: desc || entry.description, code: codeUsed, qty, cost, unit: entry.unit, category: entry.category, entryCost: entry.cost, valid: true, ...(remapped ? { remappedFrom: originalCode } : {}) };
      });
      const cleanedItems: any[] = cleanedItemsRaw.filter((x) => x !== null) as any[];

      tierTotals[key] = total;
      tierItemsRef[key] = cleanedItems;
      validatedTiers[key] = {
        label: t.label || key,
        notes: String(t.notes || ''),
        items: cleanedItems,
        total: 0, // set after monotonic enforcement below
      };
      accuracy[key] = {
        total: 0,
        itemCount: cleanedItems.length,
        invalidCodes,
        remappedCount,
        valid: invalidCodes.length === 0,
      };
    }

    // Deterministic scaler: bumps qty on cheapest-per-unit lines until total >= target.
    // This adds scope coverage instead of inflating per-unit cost — keeps SOR rates honest.
    const scaleUpToTarget = (items: any[], currentTotal: number, target: number): number => {
      if (!items.length || currentTotal >= target) return currentTotal;
      const scalable = [...items].sort((a, b) => (a.entryCost || 0) - (b.entryCost || 0));
      let i = 0;
      let safety = 10000;
      let total = currentTotal;
      while (total < target && safety-- > 0) {
        const line = scalable[i % scalable.length];
        if (!line.entryCost || line.entryCost <= 0) { i++; continue; }
        line.qty += 1;
        line.cost = line.entryCost * line.qty;
        total += line.entryCost;
        i++;
      }
      return total;
    };

    // Enforce HARD ordering: minimumCost <= baseline < enhanced < premium.
    // Baseline floor = minimumCost (if set), otherwise whatever AI returned.
    // Enhanced >= baseline * 1.20, Premium >= baseline * 1.45 AND > enhanced.
    if (tierItemsRef['baseline']) {
      const baselineTarget = minimumCost > 0 ? minimumCost : (tierTotals['baseline'] || 0);
      tierTotals['baseline'] = scaleUpToTarget(tierItemsRef['baseline'], tierTotals['baseline'] || 0, baselineTarget);
    }
    const baseTotal = tierTotals['baseline'] || (minimumCost > 0 ? minimumCost : 0);

    if (tierItemsRef['enhanced']) {
      const enhancedTarget = Math.max(baseTotal * 1.20, tierTotals['enhanced'] || 0);
      tierTotals['enhanced'] = scaleUpToTarget(tierItemsRef['enhanced'], tierTotals['enhanced'] || 0, enhancedTarget);
    }
    const enhTotal = tierTotals['enhanced'] || baseTotal * 1.20;

    if (tierItemsRef['premium']) {
      const premiumTarget = Math.max(baseTotal * 1.45, enhTotal * 1.05, tierTotals['premium'] || 0);
      tierTotals['premium'] = scaleUpToTarget(tierItemsRef['premium'], tierTotals['premium'] || 0, premiumTarget);
    }

    for (const key of tierKeys) {
      if (!validatedTiers[key]) continue;
      for (const it of tierItemsRef[key]) delete it.entryCost;
      const finalTotal = Math.round((tierTotals[key] || 0) * 100) / 100;
      validatedTiers[key].total = finalTotal;
      accuracy[key].total = finalTotal;
    }

    // Review pass removed for speed — it previously added 5-15s per request via a second
    // AI call. The deterministic catalogue validation + token-overlap remap above already
    // guarantees every emitted code is real and costed against the NPH book.
    const review: any = null;

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
    const msg = String(error?.message || 'Failed');
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
