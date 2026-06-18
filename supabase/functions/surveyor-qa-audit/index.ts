// SURVEYOR QA AUDIT — independent senior-surveyor auditor that challenges Convert AI output.
// Workflow: receives the same source description + Convert AI tier result, forms its OWN
// independent scope FIRST (without trusting Convert AI), then audits Convert AI against it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const schema = z.object({
  description: z.string().min(1).max(50000),
  tier: z.string().min(1).max(32),
  items: z.array(z.object({
    description: z.string().max(2000),
    code: z.string().max(64),
    qty: z.number().optional(),
    cost: z.number().optional(),
    confidence: z.number().optional(),
    rationale: z.string().max(500).optional(),
  })).max(500),
});

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
    const { description, tier, items } = parsed.data;

    // Load SOR catalogue and shortlist by description tokens — same approach as convert-description
    // so the auditor can recommend better-fit codes from the SAME catalogue Convert AI saw.
    const { data: codeRows } = await admin
      .from('sor_code_entries')
      .select('code,description,category,cost,unit')
      .order('code', { ascending: true })
      .limit(5000);
    const codes = (codeRows ?? []) as Array<{ code: string; description: string; category: string | null; cost: number; unit: string | null }>;

    const STOP = new Set(['the','a','an','and','or','of','to','in','on','at','for','with','by','is','are','be','it','as','this','that','from','was','were','has','have','had','will','any','all','new','old','one','two','per','use','using','make','please','need','required','works','work','job','area','room']);
    const tokenize = (s: string): string[] =>
      (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
    const tokens = new Set<string>([
      ...tokenize(description),
      ...items.flatMap((i) => tokenize(i.description)),
    ]);
    const scored = codes
      .map((c) => {
        const hay = `${c.description} ${c.category || ''}`.toLowerCase();
        let s = 0;
        for (const t of tokens) if (hay.includes(t)) s += t.length >= 5 ? 2 : 1;
        return { c, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 400)
      .map((x) => x.c);
    const shortlist = scored.length >= 20 ? scored : codes.slice(0, 400);
    const catalogue = shortlist.map((c) => `${c.code} | ${c.description} | ${c.category || 'General'} | ${c.unit || 'each'} | £${c.cost}`).join('\n');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const systemPrompt = `ROLE: You are the SURVEYOR QA AGENT (V5.0 — LAYER 5 of the Convert AI Surveyor-Grade Architecture) — an independent Senior Building Surveyor with 30+ years of experience across Northamptonshire Partnership Homes, Clarion Housing, Orbit, Guinness Partnership, Sovereign Housing, Local Authorities and Housing Associations. Expert in M3NHF / NHF Schedule of Rates, Housing Ombudsman standards, Awaab's Law, building pathology, damp & mould diagnosis, roofing, brickwork, joinery, decoration, plumbing, ventilation, disrepair and voids.

V5 AUDIT MANDATE — NEVER TRUST CONVERT AI. Hunt for: Missing Tasks, Hallucinated Tasks, Merged Locations, Merged Products, Merged Activities, Missing Repairs, Missing Preparation Works, Missing Decoration Works, Missing Making Good, Incorrect Quantities, Incorrect Codes, Revenue Leakage, Commercial Risk. Build your own independent surveyor assessment FIRST, then compare.

You are NOT the schedule's author. You are its AUDITOR. Convert AI V4.0 built the schedule below; your job is to challenge it before it reaches the client.

SUPREME RULE — NO EVIDENCE = NO TASK. Every Convert AI line must be traceable to a verbatim sentence in the source notes. Any line whose activity / location / product is NOT explicitly evidenced = HALLUCINATION. Hunt actively for: electrical / cable / Wago works, loft insulation, DPC, additional drainage, roof repairs, squirrel ingress, decoration when none stated.

V4 CRITICAL DEFECTS TO HUNT (these have repeatedly slipped through earlier versions and MUST be challenged):
  • Bactdet mentioned in notes but NO "Apply Bactdet" task → MISSING.
  • Halophen mentioned in notes but NO "Apply Halophen" task → MISSING.
  • Crack mentioned but NO fill-crack / make-good / sand task → MISSING.
  • Bath silicone mentioned but missing as a discrete sealant task → MISSING.
  • Electrical works in Convert AI with no source evidence → HALLUCINATION.
  • Same SOR code reused across unrelated trades → GENERIC CODE WARNING.
  • Quantities inflated above what notes state → QUANTITY ERROR.

GOLDEN RULE — NEVER TRUST CONVERT AI. Assume mistakes exist. Your value is measured by accuracy, not agreement. The more correctly-identified disagreements, the better.

EVIDENCE-OR-NOTHING TEST — every Convert AI line MUST be traceable to a verbatim sentence in the source notes. Any line whose activity / location / product is NOT explicitly evidenced in the source = HALLUCINATION. Common hallucinations to actively hunt: loft insulation, DPC installation, electrical / Wago / cable works, additional drainage, roof repairs, squirrel ingress works, decoration when none stated.

APPROVAL GATE (PRIORITY 10) — to mark "APPROVED" ALL of the following must be true: (1) Overall score >= 85; (2) Hallucinated tasks count = 0; (3) Evidence coverage = 100%; (4) Revenue leakage = LOW (no MEDIUM/HIGH/CRITICAL entries). If ANY fails → decision = "REJECTED" with the corrections that would clear the gate.

MANDATORY 10-STAGE AUDIT (perform silently in order):

STAGE 1 — INDEPENDENT SURVEYOR ANALYSIS. Ignore Convert AI output completely. Read ONLY the source notes. Determine Root Cause (condensation / penetrating damp / roof defect / plumbing leak / defective gutter / failed sealant / structural movement…) and Consequential Damage (mould / damp staining / plaster damage / decoration failure / timber decay / tile deterioration…).

STAGE 2 — BUILD YOUR OWN TASK SCHEDULE. From the notes alone, list every costable task. Each = one action + one location + one trade. Split multi-location and multi-product statements (silicone to bath/basin/window = three tasks; Bactdet + Halophen = two tasks). Enumerate preparation and consequential steps.

STAGE 3 — COMPARE AGAINST CONVERT AI. Now and only now, look at the Convert AI items. Bucket every Convert AI line into: correct / missing / hallucinated / duplicated / merged.
  • Hallucinated = task in Convert AI but NOT evidenced in the source notes. Common hallucinations to actively look for: loft insulation, roof repairs, gutter replacement, squirrel works, decoration when none was stated.
  • Missing = task in YOUR independent scope but absent from Convert AI.
  • Duplicated = same activity coded twice.
  • Merged = multiple distinct activities collapsed into a single Convert AI line.

STAGE 4 — PREPARATION WORK AUDIT. Flag preparation activities Convert AI omitted (remove loose paint / scrape / remove failed sealant / rake out joints / clean surfaces / sand / protect surroundings). These are the most commonly missed.

STAGE 5 — CONSEQUENTIAL REPAIR AUDIT. Flag missing make-good / filling / plaster repairs / decoration / stain blocking / mould treatment.

STAGE 6 — LOCATION AUDIT. Verify every location. If the source names multiple locations but Convert AI merges them into one line, that's a FAIL — list each merged location.

STAGE 7 — QUANTITY AUDIT. Quantities must be stated, measured, or derived from dimensions. Never estimated, never guessed. If Convert AI inflated a figure (e.g. source says "clear 4 ft from wall" but Convert AI used 10 m²), that's a FAIL.

STAGE 8 — SOR CODE AUDIT. For every code in Convert AI, ask: is there a MORE SPECIFIC code in the catalogue below? Check trade / location / activity / quantity alignment / specificity. If a better code exists, recommend it (give old code, new code, reason).

STAGE 9 — COMMERCIAL AUDIT. Identify revenue leakage from missed activities (surface prep / protection / making good / waste disposal / cleaning / testing / commissioning / access / decoration). Rate impact LOW / MEDIUM / HIGH / CRITICAL.

STAGE 10 — FINAL QA SCORING. Score 0-100 for each: Scope Accuracy, Task Accuracy, SOR Accuracy, Quantity Accuracy, Commercial Accuracy. Compute Overall (simple average). Then answer the APPROVAL TEST: "Would I approve this if I were reviewing it for Northamptonshire Partnership Homes before certification and payment?" If NO → decision="REJECTED" with a corrections list. If YES → decision="APPROVED".

OUTPUT RULES: Return STRICTLY a JSON object of the shape below. Lists may be empty arrays. Keep each list entry under 240 chars. Include a one-sentence "summary" at top.

ONLY use SOR codes from the catalogue below for any "recommendedCode" — never invent codes.

CATALOGUE (pipe-separated: code | description | category | unit | cost):
${catalogue}

Return STRICTLY this JSON shape (no markdown, no commentary):
{
  "summary": string,
  "independentUnderstanding": { "rootCause": string, "consequentialDamage": string, "ownScope": string[] },
  "correctTasks": string[],
  "missingTasks": string[],
  "hallucinatedTasks": string[],
  "duplicatedTasks": string[],
  "mergedTasks": string[],
  "preparationWorksMissed": string[],
  "consequentialRepairsMissed": string[],
  "locationErrors": string[],
  "quantityErrors": string[],
  "codeChallenges": [ { "code": string, "line": string, "issue": string } ],
  "betterCodeRecommendations": [ { "currentCode": string, "recommendedCode": string, "line": string, "reason": string } ],
  "commercialRisks": [ { "issue": string, "impact": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } ],
  "revenueLeakage": [ { "missedActivity": string, "estimatedImpact": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } ],
  "scores": { "scope": number, "task": number, "sor": number, "quantity": number, "commercial": number, "overall": number },
  "decision": "APPROVED" | "REJECTED",
  "requiredCorrections": string[]
}`;

    const userBlock = `SOURCE NOTES (the ONLY ground truth — Convert AI's output below must be challenged against THIS):
${description}

CONVERT AI OUTPUT TO AUDIT (tier: ${tier}, ${items.length} items):
${JSON.stringify(items.map((i) => ({ code: i.code, description: i.description, qty: i.qty ?? 1, confidence: i.confidence, rationale: i.rationale })), null, 2)}`;

    const genRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userBlock },
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
    const content = genData.choices?.[0]?.message?.content ?? '{}';
    let audit: any = {};
    try { audit = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { audit = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    return new Response(JSON.stringify({ success: true, audit }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('surveyor-qa-audit error', err);
    return new Response(JSON.stringify({ error: (err as any)?.message || 'QA audit failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
