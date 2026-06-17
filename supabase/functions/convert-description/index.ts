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
    const { description: rawDescription, minimumCost = 0, sorCodesContext, existingWorks: rawExistingWorks } = parsed.data;

    // FILLER PHRASE FILTER — generic statements that contain no costable scope.
    // These describe intent (investigate / make safe / attend) rather than identifiable works,
    // so they MUST NOT trigger SOR-code generation. Stripped from description and existing works
    // before any matching, prompting, or remapping happens.
    const FILLER_PATTERNS: RegExp[] = [
      /\blocate\s+(the\s+)?(issue|fault|problem|leak|defect)s?\b[^.\n]*?\b(and|then|to)\b[^.\n]*?\b(carry\s+out|complete|undertake|perform|do)\b[^.\n]*?\b(remedial|necessary|required|appropriate|repair|making\s+good)\b[^.\n]*\.?/gi,
      /\b(carry\s+out|complete|undertake|perform)\s+(any\s+)?(remedial|necessary|required|appropriate)\s+works?\b[^.\n]*\.?/gi,
      /\binvestigate\s+and\s+(repair|rectify|resolve|make\s+good)\b[^.\n]*\.?/gi,
      /\battend\s+(and\s+)?(make\s+safe|rectify|repair)\b[^.\n]*\.?/gi,
      /\bmake\s+safe\s+and\s+(repair|rectify|make\s+good)\b[^.\n]*\.?/gi,
      /\bcomplete\s+all\s+(associated|related|necessary)\s+works?\b[^.\n]*\.?/gi,
    ];
    const stripFiller = (s: string): string => {
      let out = s || '';
      for (const re of FILLER_PATTERNS) out = out.replace(re, ' ');
      // Collapse whitespace and empty bullet lines left behind
      return out.replace(/^[\s\-•*]+$/gm, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    };
    const description = stripFiller(rawDescription);
    const existingWorks = (rawExistingWorks ?? [])
      .map((w: any) => ({ ...w, description: stripFiller(String(w.description || '')) }))
      .filter((w: any) => w.description.length > 0 || (w.code && w.code.trim().length > 0));

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
    // Bigrams capture multi-word trade nouns ("fan unit", "wc pan", "skirting board", "fire door")
    // that single-token overlap misses — material differences here are what make a match strong vs weak.
    const bigrams = (toks: string[]): string[] => {
      const out: string[] = [];
      for (let i = 0; i < toks.length - 1; i++) out.push(`${toks[i]} ${toks[i + 1]}`);
      return out;
    };
    // Trade/component anchor words — when present in BOTH the line and the catalogue entry,
    // they are strong evidence of a correct semantic pairing. Used to boost the score.
    const ANCHOR_TOKENS = new Set([
      'fan','humidistat','extractor','ventilation','duct',
      'plaster','plasterboard','skim','render',
      'paint','gloss','emulsion','undercoat','primer','decoration',
      'mould','wash','bactdet','fungicidal',
      'tile','tiling','grout','silicone',
      'roof','slate','tile','flashing','gutter','downpipe','fascia','soffit',
      'door','frame','firedoor','fire','intumescent','closer','hinge','lock',
      'window','glazing','sash','sill','cill',
      'floor','flooring','vinyl','carpet','laminate','underlay','screed',
      'wc','toilet','cistern','basin','tap','sink','shower','bath','waste','trap','isolator',
      'socket','switch','consumer','rcd','spur','pendant','cable','circuit','earth','bonding',
      'boiler','radiator','valve','trv','pipe','copper','plastic',
      'insulation','loft','cavity','board','rockwool','pir',
      'skirting','architrave','frame','joist','stud','batten',
    ]);

    const queryTokens = new Set<string>([
      ...tokenize(description),
      ...((existingWorks ?? []).flatMap((w: any) => tokenize(w.description || ''))),
    ]);
    const queryBigrams = new Set<string>(bigrams(Array.from(queryTokens)));

    const scoreEntry = (c: CodeEntry): number => {
      const hay = `${c.description} ${c.category || ''}`.toLowerCase();
      let s = 0;
      for (const t of queryTokens) {
        if (hay.includes(t)) {
          s += t.length >= 5 ? 2 : 1;
          if (ANCHOR_TOKENS.has(t)) s += 3; // trade/component anchors weigh heavily
        }
      }
      // Bigram bonus: contiguous two-word phrases are strong semantic evidence.
      for (const bg of queryBigrams) if (hay.includes(bg)) s += 4;
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

    // TRAINING SIGNAL — pull recent user feedback (including free-text refinement notes)
    // and feed it into the prompt. Notes from the surveyor are weighted highest because
    // they tell the model EXACTLY why a prior pairing was right or wrong.
    let feedbackBlock = '';
    try {
      const { data: fb } = await admin
        .from('sor_match_feedback')
        .select('sor_code,line_description,source_description,rating,note')
        .order('created_at', { ascending: false })
        .limit(500);
      if (fb && fb.length > 0) {
        const withNote = (fb as any[]).filter((r) => r.note && String(r.note).trim().length > 0);
        const good = (fb as any[]).filter((r) => r.rating === 'good').slice(0, 30);
        const bad = (fb as any[]).filter((r) => r.rating === 'bad').slice(0, 30);
        const notesGood = withNote.filter((r) => r.rating === 'good').slice(0, 25);
        const notesBad = withNote.filter((r) => r.rating === 'bad' || r.rating === 'fair').slice(0, 30);
        const fmt = (r: any) => `  • ${r.sor_code} for "${String(r.line_description).slice(0, 80)}" (job: "${String(r.source_description).slice(0, 80)}")`;
        const fmtNote = (r: any) => `  • [${r.rating.toUpperCase()}] code ${r.sor_code} on "${String(r.line_description).slice(0, 70)}" — surveyor said: "${String(r.note).slice(0, 240)}"`;
        const parts: string[] = [];
        if (notesGood.length || notesBad.length) {
          const noteLines = [...notesBad, ...notesGood].map(fmtNote).join('\n');
          parts.push(`SURVEYOR REFINEMENT NOTES (HIGHEST-WEIGHT TRAINING — obey these corrections; they tell you exactly why prior pairings were right or wrong):\n${noteLines}`);
        }
        if (good.length) parts.push(`PRIOR GOOD MATCHES (reinforce these patterns — same code/task pairings should score high confidence):\n${good.map(fmt).join('\n')}`);
        if (bad.length) parts.push(`PRIOR BAD MATCHES (AVOID re-emitting these code/task pairings — the senior surveyor rejected them):\n${bad.map(fmt).join('\n')}`);
        if (parts.length) feedbackBlock = `\n\nUSER-RATED MATCH HISTORY (training signal — weight matching toward GOOD notes, away from BAD/FAIR notes and rejected pairings):\n${parts.join('\n\n')}`;
      }
    } catch (e) {
      console.warn('feedback load failed', (e as any)?.message);
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

    const systemPrompt = `You are a UK social housing pricing specialist with 25+ years on the tools and in NPH/Schedule-of-Rates estimating. You think like a senior surveyor: you read the description, mentally walk the property, and break the works into the smallest defensible discrete tasks before pricing.

GOAL: Produce a realistic, accurate, NPH-ALIGNED SOR-code breakdown of the works ACTUALLY CARRIED OUT on this job. Every line must pair a valid SOR code with a clear, specific, professional description of that line of work — ready to be typed straight into the NPH portal.

SEMANTIC PRE-PROCESSING (DO THIS FIRST, SILENTLY):
1. Read the combined context (description + existing works). De-duplicate: if the same task is stated twice in different words, treat it as ONE task.
2. Reconstruct a single cohesive, professional job summary in your head — what trade, what location, what fault, what fix, what materials, what extent.
3. IGNORE filler/intent phrases that describe no costable work: "locate and rectify", "carry out remedial works", "make good as necessary", "investigate and repair", "attend and make safe", "complete all associated works". A line that ONLY contains this kind of generic statement and no specific scope MUST NOT produce any SOR code — drop it entirely.
4. Only after this clean-up do you enumerate the discrete tasks that DO have specific scope, and match each one to a code.

SOR MATCHING RULES (ACCURACY IS CRITICAL — this is graded line-by-line):
- For each discrete task, pick the SINGLE catalogue line whose description most closely matches the task semantically — same trade, same component, same action (repair vs replace vs install vs clear vs service), same material where stated.
- Prefer SPECIFIC codes over generic ones (e.g. "Replace WC pan and cistern" over a generic plumbing line when the job is a WC swap).
- "Repair" tasks must use repair codes; "replace/new" tasks must use replace codes. Never swap these.
- If two codes look close, choose the one whose catalogue description shares the most concrete nouns with the task (the fixture, the material, the location).
- If no catalogue line is a defensible semantic match for a task, OMIT that task. Never force a weak match just to add a line.
- After drafting, re-read every line and ask: "would a senior surveyor accept this code for this exact task?" If no, swap or drop.

EXPLAINABILITY (REQUIRED — every line MUST carry its own evidence):
- For EACH line you emit, you must output:
  • "confidence" — integer 0-100 reflecting how strongly the catalogue entry matches the task semantically. 90+ = exact-trade/component/action match; 70-89 = strong match, minor wording difference; 50-69 = plausible but generic; <50 = DO NOT EMIT (drop the line instead).
  • "rationale" — one sentence (<=160 chars) explaining WHY this SOR code was chosen for this task. Reference trade, component, action and matching keywords.

HARD RULES:
- ONLY use SOR codes from the catalogue below. NEVER invent codes.
- NEVER alter the per-unit cost — only quantities scale.
- Cost each task at the BASE / MINIMUM catalogue rate. Do not pad per-unit cost.
- Every line description must be SPECIFIC (what was done, where, with what material/finish where implied) — not generic.
- Use whichever source has the MORE SPECIFIC data for each line: prefer the existing Works List where it names a precise code/scope; prefer the free-text description where it adds location, dimensions, material, fault detail, or extent.
- Do NOT fabricate. If the data doesn't imply a code, don't add it.

TASK ENCAPSULATION (MANDATORY):
1. After the semantic clean-up above, enumerate EVERY remaining discrete task with specific scope.
2. For EACH enumerated task, emit at least one SOR line that covers it — at base rate.
3. Where one SOR code naturally covers several mentioned sub-actions, state that consolidation in the line description.
4. If a task is mentioned but no catalogue code fits, omit the line silently — never emit a placeholder/invented code.

CATALOGUE — these are the ONLY codes you may emit (pipe-separated: code | description | category | unit | cost):
${sorContext}

REMINDER: a code that is NOT in the list above does not exist. Do not invent codes — only emit codes printed in the list above. If no listed code fits, omit the line.${feedbackBlock}
${minCostInstruction}

Return STRICTLY a JSON object of this shape (no markdown, no commentary):
{
  "tiers": {
    "baseline": { "label": "Baseline", "items": [ { "description": string, "code": string, "qty": number, "confidence": number, "rationale": string } ], "notes": string },
    "enhanced": { "label": "Enhanced", "items": [ ... ], "notes": string },
    "premium":  { "label": "Premium",  "items": [ ... ], "notes": string }
  }
}

Each items[] entry: description = clear, professional, NPH-portal-ready human-readable line; code = exact SOR code from the catalogue; qty = integer >= 1; confidence = integer 0-100; rationale = <=160 char justification.
Notes: 1-2 sentences explaining the scope rationale for that tier. FINAL CHECK before returning: re-verify every code semantically matches its line description against the catalogue.`;

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
      // Require a strong semantic overlap (>=4) — weak matches are dropped, not force-fit.
      return best && best.s >= 4 ? best.c : null;
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
        // Confidence: prefer AI-supplied; otherwise derive from semantic token overlap.
        let confidence = Math.round(Number(it.confidence));
        if (!Number.isFinite(confidence) || confidence <= 0) {
          const lineToks = tokenize(desc);
          const hay = `${entry.description} ${entry.category || ''}`.toLowerCase();
          let hits = 0;
          for (const t of lineToks) if (hay.includes(t)) hits += 1;
          confidence = lineToks.length > 0
            ? Math.min(95, Math.round((hits / lineToks.length) * 100))
            : 60;
        }
        if (remapped) confidence = Math.min(confidence, 55); // remapped = lower trust
        confidence = Math.max(0, Math.min(100, confidence));
        const rationale = String(it.rationale || '').slice(0, 200) ||
          `Matched on ${entry.category || 'catalogue'} entry "${entry.description.slice(0, 70)}" (${entry.unit || 'each'} @ £${entry.cost}).`;
        return {
          description: desc || entry.description,
          code: codeUsed,
          qty,
          cost,
          unit: entry.unit,
          category: entry.category,
          entryCost: entry.cost,
          valid: true,
          confidence,
          rationale,
          ...(remapped ? { remappedFrom: originalCode } : {}),
        };
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
