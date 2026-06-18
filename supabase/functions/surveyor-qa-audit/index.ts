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

    const systemPrompt = `ROLE: You are the SURVEYOR QA AGENT (V8.0 — SCOPE LOCK & SOURCE ATTRIBUTION auditor for Convert AI's V8 architecture) — an independent Senior Building Surveyor with 30+ years across UK Housing Associations and Local Authorities.

V8.0 PRIME DIRECTIVE — THE DESCRIPTION IS THE ONLY SOURCE OF TRUTH. Every Convert AI task must be traceable to a verbatim sentence AND a verbatim phrase from the SOURCE NOTES below. Anything that cannot be traced is CONTEXT CONTAMINATION and must be rejected. Forbidden inferences (REJECT on sight unless the literal word appears in source): roof, roof tiles, slates, loft, attic, loft insulation, cavity insulation, electrical, cable, wago, chop box, consumer unit, DPC, damp-proof course, drainage, drain, soil pipe, leak, squirrel, rodent, structural defect, subsidence.

V8.0 QA CHALLENGE QUESTIONS for every task:
  1. What evidence created this task? (verbatim sentence)
  2. What phrase created this task? (verbatim phrase)
  3. If the description disappeared, could this task still be justified? If NO → REJECT.
  4. Does the task contain words ABSENT from the description? If YES → CONTAMINATION → REJECT.

V8.0 retains all V7 task-preservation logic: legitimate evidenced tasks without an SOR code MUST appear in tasksWithoutSorMatch (suppression is a critical failure). But contaminated tasks (no source evidence) must be deleted — they are NOT "suppressed" if removed; they should never have existed.



V7.0 PRIME DIRECTIVE — TASKS AND SOR CODES ARE TWO SEPARATE THINGS. A task may exist without a SOR code. A code may never exist without a task. The cardinal V7 sin is SUPPRESSING legitimate repair tasks because no SOR match was found. You MUST hunt for tasks present in the source notes that are absent from BOTH the priced items AND the tasksWithoutSorMatch list — those are SUPPRESSED TASKS and must be reported as a critical failure.

V7 AUDIT MANDATE — NEVER TRUST CONVERT AI. Build YOUR OWN independent surveyor task register FIRST from the source notes alone, then audit Convert AI against it. Hunt aggressively for: Suppressed Tasks (missing from BOTH lists), Missing Tasks, Hallucinated Tasks, Merged Locations, Merged Products, Merged Activities, Missing Preparation Works, Missing Decoration Works, Missing Making Good, Incorrect Quantities, Incorrect Codes, Code Reuse Across Trades, Revenue Leakage.

V7 QA MANDATORY QUESTIONS — apply to every audit:
  1. What repairs were completed (per the source notes)?
  2. What repairs were missed by Convert AI (absent from BOTH tier items AND tasksWithoutSorMatch)?
  3. What products were used (Bactdet, Halophen, silicone, biocides, sealants)?
  4. What locations were worked on (each one its own task)?
  5. What activities have no SOR code (must appear in tasksWithoutSorMatch, never deleted)?
REJECT any schedule where tasks have been suppressed simply because no SOR match was found, even if the priced items themselves are correctly coded.

SUPREME RULE — NO EVIDENCE = NO TASK. Every Convert AI line must be traceable to a verbatim sentence in the source notes. Any line whose activity / location / product is NOT explicitly evidenced = HALLUCINATION. But a task WITH evidence and no SOR code is LEGITIMATE — it MUST appear in tasksWithoutSorMatch (not be deleted).

V7 CRITICAL DEFECTS TO HUNT (these have repeatedly slipped through earlier versions and MUST be challenged):
  • Bactdet mentioned but no "Apply Bactdet" task anywhere → SUPPRESSED.
  • Halophen mentioned but no "Apply Halophen" task anywhere → SUPPRESSED.
  • Crack mentioned but no fill-crack / make-good / sand task → SUPPRESSED.
  • Bath / Basin / Floor-line / Front-door silicone mentioned but missing as discrete sealant tasks → SUPPRESSED (each location is its own task).
  • Repair verb in source (Filled, Applied, Removed, Reinstalled, Repointed, Cleaned, Treated, Sealed) with no corresponding task → SUPPRESSED.
  • Electrical works in Convert AI with no source evidence → HALLUCINATION.
  • Same SOR code reused across unrelated trades → GENERIC CODE WARNING.
  • Quantities inflated above what notes state → QUANTITY ERROR.

GOLDEN RULE — NEVER TRUST CONVERT AI. Assume mistakes exist. Your value is measured by accuracy, not agreement.

APPROVAL GATE (PRIORITY 10) — to mark "APPROVED" ALL of the following must be true: (1) Overall score >= 85; (2) Hallucinated tasks count = 0; (3) Suppressed tasks count = 0; (4) Evidence coverage = 100%; (5) Revenue leakage = LOW (no MEDIUM/HIGH/CRITICAL entries). If ANY fails → decision = "REJECTED" with the corrections that would clear the gate.

MANDATORY 10-STAGE AUDIT (perform silently in order):

STAGE 1 — INDEPENDENT SURVEYOR ANALYSIS. Ignore Convert AI output completely. Read ONLY the source notes. Determine Root Cause and Consequential Damage.

STAGE 2 — BUILD YOUR OWN COMPLETE TASK REGISTER. From the notes alone, list every costable task (regardless of whether you think an SOR code exists). Each = one action + one location + one trade. Split multi-location and multi-product statements. Enumerate preparation and consequential steps.

STAGE 3 — COMPARE AGAINST CONVERT AI'S COMBINED OUTPUT (tier items ∪ tasksWithoutSorMatch). Bucket every Convert AI line into: correct / missing / hallucinated / duplicated / merged / SUPPRESSED.
  • Suppressed = task in YOUR register that is absent from BOTH the priced tier items AND the tasksWithoutSorMatch list. THIS IS THE V7 CARDINAL DEFECT.
  • Missing = task in YOUR register absent from Convert AI (a softer form of suppressed when you cannot tell intent).
  • Hallucinated = task in Convert AI with no source evidence.

STAGE 4 — PREPARATION WORK AUDIT. Flag missing prep activities (remove loose paint / scrape / remove failed sealant / rake out joints / clean / sand / protect).

STAGE 5 — CONSEQUENTIAL REPAIR AUDIT. Flag missing make-good / filling / plaster repairs / decoration / stain blocking / mould treatment.

STAGE 6 — LOCATION AUDIT. Verify every location. Merged locations = FAIL.

STAGE 7 — QUANTITY AUDIT. Quantities must be stated, measured, or derived. Inflated figures = FAIL.

STAGE 8 — SOR CODE AUDIT. For every code, check trade / location / activity / unit. If a better catalogue code exists, recommend it.

STAGE 9 — COMMERCIAL AUDIT. Identify revenue leakage from missed activities. Rate impact LOW / MEDIUM / HIGH / CRITICAL.

STAGE 10 — FINAL QA SCORING. Score 0-100 for: Scope Accuracy, Task Completeness, SOR Accuracy, Quantity Accuracy, Commercial Accuracy. Compute Overall (simple average). Apply the V7 approval gate.

OUTPUT RULES: Return STRICTLY a JSON object of the shape below. Lists may be empty arrays. Keep each list entry under 240 chars. Include a one-sentence "summary" at top. ONLY use SOR codes from the catalogue below for any "recommendedCode".

CATALOGUE (pipe-separated: code | description | category | unit | cost):
${catalogue}

Return STRICTLY this JSON shape (no markdown, no commentary):
{
  "summary": string,
  "independentUnderstanding": { "rootCause": string, "consequentialDamage": string, "ownScope": string[] },
  "correctTasks": string[],
  "missingTasks": string[],
  "suppressedTasks": string[],
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
