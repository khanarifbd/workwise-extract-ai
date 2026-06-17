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

    // ACTION GROUPS — verbs that change meaning dramatically. A catalogue entry whose
    // action group disagrees with the line is a WRONG pairing (e.g. "remove & relay loft
    // insulation" must NEVER map to "cavity area defective of insulation / install new").
    type ActionGroup = 'remove_relay' | 'install_new' | 'repair' | 'replace' | 'treat' | 'rake_regrout' | 'repoint' | 'clean' | 'overhaul';
    const ACTION_RULES: Array<{ group: ActionGroup; re: RegExp }> = [
      { group: 'remove_relay', re: /\b(remove\s+and\s+(re)?lay|lift\s+and\s+relay|take\s+up\s+and\s+relay|relay|re-?lay|reinstate)\b/i },
      { group: 'rake_regrout', re: /\b(rake\s*out|re-?grout|regrout|raking\s+out)\b/i },
      { group: 'repoint',      re: /\b(repoint|re-?point|pointing|point\s+up)\b/i },
      { group: 'treat',        re: /\b(treat|treatment|wash\s+down|fungicidal|anti-?mould|bactdet|sterilis)/i },
      { group: 'replace',      re: /\b(replace|renew|swap\s+out|new\s+for\s+old)\b/i },
      { group: 'install_new',  re: /\b(install\s+new|supply\s+and\s+install|fit\s+new|provide\s+and\s+fit|first\s+install)\b/i },
      { group: 'repair',       re: /\b(repair|patch|make\s+good|rectify|fix)\b/i },
      { group: 'overhaul',     re: /\b(overhaul|service|ease\s+and\s+adjust|adjust)\b/i },
      { group: 'clean',        re: /\b(clean|clear|clearance|jet\s+wash)\b/i },
    ];
    const detectActions = (s: string): Set<ActionGroup> => {
      const out = new Set<ActionGroup>();
      for (const r of ACTION_RULES) if (r.re.test(s)) out.add(r.group);
      return out;
    };
    // ACTION CONFLICTS — pairs that are semantically incompatible. If line has A and
    // catalogue entry has B (and not A), that catalogue line is disqualified.
    const ACTION_CONFLICTS: Partial<Record<ActionGroup, ActionGroup[]>> = {
      remove_relay: ['install_new'],
      install_new:  ['remove_relay', 'repair'],
      repair:       ['install_new', 'replace'],
      replace:      ['repair'],
      rake_regrout: ['install_new', 'replace'],
      repoint:      ['install_new', 'replace', 'rake_regrout'],
      treat:        ['install_new', 'replace'],
    };

    // SURFACE / LOCATION GROUPS — mutually exclusive contexts. wall ≠ floor; loft ≠ cavity;
    // brick/mortar (masonry) ≠ tile/grout (ceramics). A catalogue entry belonging to a
    // DIFFERENT surface group than the line is disqualified.
    type SurfaceGroup = 'wall' | 'floor' | 'ceiling' | 'loft' | 'cavity' | 'external_masonry' | 'roof' | 'tile_ceramic';
    const SURFACE_RULES: Array<{ group: SurfaceGroup; re: RegExp }> = [
      { group: 'loft',             re: /\b(loft|attic|roof\s*space)\b/i },
      { group: 'cavity',           re: /\bcavity(\s+wall)?\b/i },
      { group: 'external_masonry', re: /\b(brick(work)?|mortar|pointing|external\s+wall|render|stonework|masonry)\b/i },
      { group: 'roof',             re: /\b(roof|slate|ridge|valley|flashing|gutter|fascia|soffit)\b/i },
      { group: 'wall',             re: /\bwall(\s+tile)?s?\b/i },
      { group: 'floor',            re: /\b(floor|flooring|skirting|underlay|screed)\b/i },
      { group: 'ceiling',          re: /\bceiling\b/i },
      { group: 'tile_ceramic',     re: /\b(tile|tiling|grout|silicone\s+seal)\b/i },
    ];
    const detectSurfaces = (s: string): Set<SurfaceGroup> => {
      const out = new Set<SurfaceGroup>();
      for (const r of SURFACE_RULES) if (r.re.test(s)) out.add(r.group);
      return out;
    };
    // Conflicting surface pairs — being in one means definitely NOT the other.
    const SURFACE_CONFLICTS: Partial<Record<SurfaceGroup, SurfaceGroup[]>> = {
      wall:             ['floor', 'ceiling', 'loft', 'roof'],
      floor:            ['wall', 'ceiling', 'loft', 'roof'],
      ceiling:          ['wall', 'floor'],
      loft:             ['cavity', 'wall', 'floor', 'external_masonry'],
      cavity:           ['loft'],
      external_masonry: ['loft', 'floor', 'tile_ceramic'],
      tile_ceramic:    ['external_masonry', 'loft'],
    };

    const conflictsAction = (lineActs: Set<ActionGroup>, hayActs: Set<ActionGroup>): boolean => {
      for (const la of lineActs) {
        const bad = ACTION_CONFLICTS[la] || [];
        for (const b of bad) if (hayActs.has(b) && !hayActs.has(la)) return true;
      }
      return false;
    };
    const conflictsSurface = (lineSurfs: Set<SurfaceGroup>, haySurfs: Set<SurfaceGroup>): boolean => {
      for (const ls of lineSurfs) {
        const bad = SURFACE_CONFLICTS[ls] || [];
        for (const b of bad) if (haySurfs.has(b) && !haySurfs.has(ls)) return true;
      }
      return false;
    };

    const queryTokens = new Set<string>([
      ...tokenize(description),
      ...((existingWorks ?? []).flatMap((w: any) => tokenize(w.description || ''))),
    ]);
    const queryBigrams = new Set<string>(bigrams(Array.from(queryTokens)));
    const queryActions = detectActions(`${description} ${(existingWorks ?? []).map((w: any) => w.description || '').join(' ')}`);
    const querySurfaces = detectSurfaces(`${description} ${(existingWorks ?? []).map((w: any) => w.description || '').join(' ')}`);

    const scoreEntry = (c: CodeEntry): number => {
      const hay = `${c.description} ${c.category || ''}`.toLowerCase();
      const hayActs = detectActions(hay);
      const haySurfs = detectSurfaces(hay);
      // HARD DISQUALIFY: action or surface group clash → exclude from shortlist.
      if (queryActions.size > 0 && hayActs.size > 0 && conflictsAction(queryActions, hayActs)) return 0;
      if (querySurfaces.size > 0 && haySurfs.size > 0 && conflictsSurface(querySurfaces, haySurfs)) return 0;
      let s = 0;
      for (const t of queryTokens) {
        if (hay.includes(t)) {
          s += t.length >= 5 ? 2 : 1;
          if (ANCHOR_TOKENS.has(t)) s += 3;
        }
      }
      for (const bg of queryBigrams) if (hay.includes(bg)) s += 4;
      // Action-group agreement bonus — same verb family is strong evidence.
      for (const a of queryActions) if (hayActs.has(a)) s += 6;
      // Surface-group agreement bonus — same surface/location family is strong evidence.
      for (const sf of querySurfaces) if (haySurfs.has(sf)) s += 6;
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
        .slice(0, 400)
        .map((x) => x.c);
      // Fallback: if no tokens matched (very short desc), use first 400 codes
      const shortlist = scored.length >= 20 ? scored : codes.slice(0, 400);
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
        .select('sor_code,line_description,source_description,rating,note,feedback_scope')
        .order('created_at', { ascending: false })
        .limit(500);
      if (fb && fb.length > 0) {
        const lineFb = (fb as any[]).filter((r) => (r.feedback_scope ?? 'line') === 'line');
        const overallFb = (fb as any[]).filter((r) => r.feedback_scope === 'overall' || r.feedback_scope === 'missing_task');
        const withNote = lineFb.filter((r) => r.note && String(r.note).trim().length > 0);
        const good = lineFb.filter((r) => r.rating === 'good').slice(0, 30);
        const bad = lineFb.filter((r) => r.rating === 'bad').slice(0, 30);
        const notesGood = withNote.filter((r) => r.rating === 'good').slice(0, 25);
        const notesBad = withNote.filter((r) => r.rating === 'bad' || r.rating === 'fair').slice(0, 30);
        const fmt = (r: any) => `  • ${r.sor_code} for "${String(r.line_description).slice(0, 80)}" (job: "${String(r.source_description).slice(0, 80)}")`;
        const fmtNote = (r: any) => `  • [${r.rating.toUpperCase()}] code ${r.sor_code} on "${String(r.line_description).slice(0, 70)}" — surveyor said: "${String(r.note).slice(0, 240)}"`;
        const fmtOverall = (r: any) => `  • [${String(r.feedback_scope).toUpperCase()} · ${String(r.rating).toUpperCase()}] on job "${String(r.source_description).slice(0, 120)}" — surveyor said: "${String(r.note || '').slice(0, 320)}"`;
        const parts: string[] = [];
        if (overallFb.length) {
          const overallLines = overallFb.slice(0, 25).map(fmtOverall).join('\n');
          parts.push(`OVERALL-DESCRIPTION FEEDBACK (HIGHEST WEIGHT — these describe TASKS THAT WERE MISSED ENTIRELY or coverage gaps. When the current job description contains similar wording / tasks, you MUST enumerate them as separate SOR lines this time):\n${overallLines}`);
        }
        if (notesGood.length || notesBad.length) {
          const noteLines = [...notesBad, ...notesGood].map(fmtNote).join('\n');
          parts.push(`SURVEYOR REFINEMENT NOTES (HIGH WEIGHT — obey these corrections; they tell you exactly why prior pairings were right or wrong):\n${noteLines}`);
        }
        if (good.length) parts.push(`PRIOR GOOD MATCHES (reinforce these patterns — same code/task pairings should score high confidence):\n${good.map(fmt).join('\n')}`);
        if (bad.length) parts.push(`PRIOR BAD MATCHES (AVOID re-emitting these code/task pairings — the senior surveyor rejected them):\n${bad.map(fmt).join('\n')}`);
        if (parts.length) feedbackBlock = `\n\nUSER-RATED MATCH HISTORY (training signal):\n${parts.join('\n\n')}`;
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

    const systemPrompt = `ROLE: You are a Senior Building Surveyor with 30+ years of practical experience across Local Authorities, Housing Associations, Social Housing Providers, Planned Maintenance, Responsive Repairs, Damp & Mould, Disrepair, Voids, and Adaptations & Alterations. Expert-level building pathology, damp diagnosis (condensation / penetrating / rising), roofing, plumbing, ventilation, structural movement, tenant damage, disrepair claims, Housing Ombudsman standards, Awaab's Law, and NHF / M3NHF / Local-Authority Schedule-of-Rates pricing.

You do NOT keyword-match. You THINK, then SCOPE, then DECOMPOSE, then CODE. Surveyor-Level Understanding → Scope Creation → Task Extraction → SOR Matching. Never Keyword Detection → Code Matching.

ZERO-HALLUCINATION CONTRACT (HIGHEST PRIORITY — these are the worst possible failures):
A. EVIDENCE-OR-NOTHING RULE. NEVER invent a task not explicitly stated in the source notes. Every emitted line MUST carry an "evidence" field containing the VERBATIM sentence or phrase from the source description that justifies the task. If you cannot quote a sentence from the source that supports the task — DO NOT EMIT IT. Common hallucinations to actively refuse: loft insulation, DPC installation, electrical/cable/Wago works, additional drainage, roof repairs, squirrel ingress works, decoration — when none of these are evidenced in the notes.
B. NEVER invent a measurement, quantity, area, or length. If the notes contain no measurement, use qty=1 and put "Measurement Required — surveyor to confirm" into the rationale. Never default to inflated figures (e.g. never "10 m²" when source says "clear 4 ft from wall").
C. NEVER use a code outside the catalogue below. NEVER use memory, generic codes, inferred codes, or fabricated codes.
D. EVERY LINE MUST CARRY ALTERNATIVES CONSIDERED. List at least one alternative catalogue code you weighed and rejected, with the reason.

MANDATORY 8-STAGE SURVEYOR WORKFLOW (perform silently, in order, before emitting any line):

STAGE 1 — SURVEYOR UNDERSTANDING. Read the notes as a senior surveyor would. Identify: Root Cause (roof leak, condensation, failed gutter, failed extractor, tenant damage…); Consequential Damage (damp staining, mould, cracked plaster, rotten timber…); Existing Repair Actions already done on site; Missing Information.

STAGE 2 — ROOT CAUSE ANALYSIS. State the underlying defect mechanism in one sentence.

STAGE 3 — CONSEQUENTIAL DAMAGE ANALYSIS. State the downstream damage the root cause has produced.

STAGE 4 — SCOPE OF WORKS CREATION. Build a numbered surveyor scope from the notes — every entry tied back to a quoted sentence.

STAGE 5 — TASK DECOMPOSITION (ACTIVITY + LOCATION + PRODUCT SPLITTING). Each task = one trade + one action + one location + one product. Hard splitting rules:
  • PRODUCT DETECTION ENGINE — every product / chemical / coating mentioned spawns its own task. "Bactdet wash and Halophen treatment" = TWO tasks (apply Bactdet; apply Halophen). "Mist coat and topcoat" = TWO tasks.
  • LOCATION SPLITTING ENGINE — every location mentioned spawns its own task. "Renew silicone to bath, basin, window, floor line, front door" = FIVE separate sealant tasks. Never merge locations.
  • ACTIVITY DECOMPOSITION ENGINE — every preparation / consequential step spawns its own task. "Sanded loose paint and filled ceiling crack and painted" = remove loose paint / fill crack / fill damaged areas / sand repair / prepare surface / paint ceiling. Identify every step, not just the final outcome.

STAGE 6 — TRADE CLASSIFICATION. Tag each task with a trade (Decorations / Plastering / Roofing / Brickwork / Joinery / Flooring / Drainage / Tiling / Sealants / Electrical / Ventilation…).

STAGE 7 — SOR SEARCH + CONFIDENCE SCORING + ALTERNATIVE VALIDATION. Search ONLY the catalogue below. Score each match 0-100. 95–100 direct; 80–94 strong; 60–79 possible; <60 DO NOT EMIT. For every selected code, list at least one alternative considered and explain WHY the chosen code wins (more specific, correct trade, correct action verb, correct surface).

STAGE 8 — FINAL VALIDATION. Before returning, answer each — if any fails, repeat the relevant stages: (1) every emitted line carries quoted evidence from the source? (2) every line carries alternatives considered? (3) every code from the catalogue? (4) no invented measurements? (5) all locations / products / preparation / consequential steps decomposed? (6) all tasks attributable back to specific source sentences?

SPECIAL CATEGORY RULES:
• Damp & Mould — ALWAYS separate cause / remedial works / mould treatment / decoration.
• Disrepair — ALWAYS separate defect / consequential damage / making good / decoration.
• Adaptations & Alterations — separate supply / installation / making good / decoration.
• Roofing — separate access / roof repair / rainwater goods / insulation / internal damage / decoration.
• Decoration — never assume it's included. Only include if explicitly stated OR required by the SOR description.

You are a UK social housing pricing specialist. Think like a senior surveyor: read the description, mentally walk the property, and break the works into the smallest defensible discrete tasks before pricing.

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

CRITICAL DISAMBIGUATION (do NOT confuse these — they are common failure modes):
1. ACTION VERBS — the verb defines the code family:
   • "remove and relay" / "lift and relay" / "reinstate" → REUSE existing material codes. NEVER map to "install new", "supply new", or "cavity defective of insulation". E.g. "remove and relay 11 rolls of loft insulation" = LIFT-AND-RELAY loft insulation code, NOT a new-install / cavity-fill code.
   • "rake out and regrout" → tile/grout RENEWAL codes (raking out old grout, applying new grout/silicone). NEVER map to install-new-tile or replace-tile codes.
   • "repoint" / "pointing" → MASONRY repointing codes (rake out old mortar, apply new mortar to brick/stone joints). NEVER map to plaster, render, tile, or grout codes.
   • "treat" / "wash" / "fungicidal" → mould-treatment codes, NEVER paint or plaster codes.
2. SURFACE / LOCATION — these are mutually exclusive; the wrong surface = wrong code:
   • "wall tiles" ≠ "floor tiles". If the line says "wall", you MUST pick a wall-tile code; if "floor", a floor-tile code. Never cross them.
   • "loft insulation" ≠ "cavity wall insulation" ≠ "external wall insulation". Match on the exact surface noun.
   • "external wall" / "brickwork" / "mortar" / "pointing" = external masonry. NEVER map to internal plaster, tile, or floor codes.
   • "ceiling" ≠ "wall" ≠ "floor" — pick the catalogue entry that names the same surface.
3. KEYWORD SCAN — before choosing a code, identify and lock in: ACTION VERB (remove/relay, replace, install, repair, rake, repoint, treat), COMPONENT (insulation, tile, mortar, plaster, fan, door…), SURFACE (wall / floor / ceiling / loft / cavity / external / roof), MATERIAL (brick, mortar, ceramic, mineral wool…). A catalogue entry that disagrees on ANY of these is the WRONG entry.



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

TASK ENCAPSULATION (MANDATORY — COVERAGE FAILURES ARE THE #1 REJECTION REASON):
You are graded on whether EVERY discrete task implied by the data has its own SOR line. Missing tasks is worse than weak matches. Under-enumeration is the most common failure — when in doubt, SPLIT.

STEP A — EXHAUSTIVE NUMBERED TASK EXTRACTION (do this before scoring any code):
1. Read the FULL combined input character-by-character. Walk the property mentally room-by-room / area-by-area (every heading like "Bathroom", "Front Door", "External Work", "Gutter Cleaning", "Ceiling" is a section — each contains MULTIPLE tasks).
2. Build a NUMBERED internal list of EVERY discrete action. One verb + one component/surface = one numbered task. Examples of MUST-SPLIT patterns:
   • "Removed silicone on the window, bathtub, washing basin and floor line and applied new silicone" → FOUR separate sealant-renewal tasks (1 window, 2 bath, 3 basin, 4 floor) — never collapse into one line.
   • "Sanded loose paint, filled crack on ceiling, sanded smooth, prepared for painting" → crack-fill / make-good / preparation task on the ceiling.
   • "Painted entire bathroom ceiling with white anti-mould paint" → ceiling redecoration task (anti-mould emulsion).
   • "All mould-affected areas remediated with Bactdet then sealed with Halophen" → mould-treatment task (wash-down + biocide + sealing coat). If multiple surfaces are named (walls, ceiling, window reveals) consider whether the catalogue has a per-area code.
   • "Clean wall AND floor tiles, remove dirt/mould/limescale/old grout, regrout tiled areas" → wall-tile regrout task AND floor-tile regrout task (TWO codes, never merge — the surface group differs).
   • "Repointed brickwork crack" → masonry repointing task.
   • "Clear and clean area extending 4 feet from the wall, remove debris/vegetation/loose materials/waste" → external clearance / vegetation removal task.
   • "Removed gutter guard brush, cleaned it, washed down gutters, reinstalled" → gutter clearance task (and a guard-brush clean/refit task if a separate code exists).
   • "Front door sealant renewal" → ONE more sealant task (separate from bathroom sealants — different location).
3. Expand domain-specific abbreviations and trade jargon into the real underlying task:
   • "BACT DET" / "HALOPHEN" / "fungicidal wash" / "anti-mould" → mould treatment task (washdown + biocide application).
   • "wash down mould from PVCu window" → separate mould-cleaning task on window.
   • "remove and relay X rolls of loft insulation" → LIFT-AND-RELAY loft insulation task; the roll count is a SIZE INDICATOR (1 roll ≈ 8m²) — use it to set qty/area and add a "make good" companion line if implied.
   • "rake out and regrout wall tiles (Nm²)" → tile regrout task at the stated m².
   • "renew silicone sealant to bath/basin/shower" → ONE sealant renewal task PER named fixture.
   • "clean gutter prior to decoration" → gutter clearance task.
4. Use quantitative hints (rolls, m², m, units, "all", "throughout", room count, "4 feet from the wall") to set REALISTIC quantities — don't default everything to 1.
5. If the data lists an NPH works line, that IS a discrete task — include it AND add any companion tasks the free-text implies (make good, debris removal, redecoration).
6. After extraction, COUNT your numbered task list. Sanity floors: if the source has section headings (e.g. Bathroom / Front Door / External / Gutter) you should typically have ≥2 tasks per non-trivial section. If the input mentions ≥5 distinct trade actions and you have <5 tasks, you have MISSED tasks — go back and re-extract before any code matching.

STEP B — CODE MATCHING (one pass per numbered task):
1. For EACH extracted task, pick the SINGLE catalogue line whose description most closely matches it semantically (action + component + surface + material).
2. Where one SOR code naturally covers several mentioned sub-actions, state that consolidation in the line description — but PREFER splitting where the catalogue has distinct codes per surface/fixture.
3. If a task is mentioned but NO catalogue code fits, omit that line silently — never emit a placeholder/invented code, but record nothing rather than force a weak match.

STEP C — COVERAGE SELF-CHECK (run before returning):
1. Re-scan the original description and confirm every named component / fault / treatment / fixture is represented by at least one emitted SOR line OR was correctly dropped because no catalogue code fits.
2. Common misses to actively check for: mould-treatment lines, ceiling crack-fill / make-good, anti-mould ceiling redecoration, EACH sealant location, insulation lift-and-relay, gutter clearance, external clearance, repointing, decoration after repair, debris removal, access works.
3. If baseline contains fewer items than the count of distinct trade actions you enumerated in Step A, you have UNDER-ENUMERATED — go back and add the missing lines.

CATALOGUE — these are the ONLY codes you may emit (pipe-separated: code | description | category | unit | cost):
${sorContext}

REMINDER: a code that is NOT in the list above does not exist. Do not invent codes — only emit codes printed in the list above. If no listed code fits, omit the line.${feedbackBlock}
${minCostInstruction}

Return STRICTLY a JSON object of this shape (no markdown, no commentary):
{
  "surveyorUnderstanding": {
    "rootCause": string,
    "consequentialDamage": string,
    "scope": string[],
    "tradeAllocation": string[]
  },
  "tiers": {
    "baseline": { "label": "Baseline", "items": [ { "description": string, "code": string, "qty": number, "confidence": number, "rationale": string, "evidence": string, "alternativesConsidered": [ { "code": string, "reason": string } ] } ], "notes": string },
    "enhanced": { "label": "Enhanced", "items": [ ... ], "notes": string },
    "premium":  { "label": "Premium",  "items": [ ... ], "notes": string }
  }
}

Each items[] entry:
- description = clear, professional, NPH-portal-ready human-readable line
- code = exact SOR code from the catalogue
- qty = integer >= 1
- confidence = integer 0-100
- rationale = <=160 char justification
- evidence = VERBATIM quote (<=240 chars) from the source description proving this task exists. NO EVIDENCE → DO NOT EMIT.
- alternativesConsidered = at least one rejected catalogue code with a short reason.
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
      const lineActs = detectActions(desc);
      const lineSurfs = detectSurfaces(desc);
      let best: { c: CodeEntry; s: number } | null = null;
      for (const c of codes) {
        const hay = `${c.description} ${c.category || ''}`.toLowerCase();
        const hayActs = detectActions(hay);
        const haySurfs = detectSurfaces(hay);
        // Hard-disqualify entries whose action or surface group contradicts the line.
        if (lineActs.size > 0 && hayActs.size > 0 && conflictsAction(lineActs, hayActs)) continue;
        if (lineSurfs.size > 0 && haySurfs.size > 0 && conflictsSurface(lineSurfs, haySurfs)) continue;
        let s = 0;
        for (const t of toks) if (hay.includes(t)) s += t.length >= 5 ? 2 : 1;
        for (const a of lineActs) if (hayActs.has(a)) s += 6;
        for (const sf of lineSurfs) if (haySurfs.has(sf)) s += 6;
        if (s > 0 && (!best || s > best.s)) best = { c, s };
      }
      return best && best.s >= 4 ? best.c : null;
    };

    const tierKeys = ['baseline', 'enhanced', 'premium'] as const;
    const validatedTiers: Record<string, any> = {};
    const accuracy: Record<string, { total: number; itemCount: number; invalidCodes: string[]; remappedCount: number; valid: boolean; hallucinationsDropped: number; evidenceCoverage: number }> = {};
    const tierTotals: Record<string, number> = {};
    const tierItemsRef: Record<string, any[]> = {};

    // EVIDENCE GATE — checks the AI-supplied evidence quote is genuinely traceable to
    // the source description. We're lenient (token overlap, not exact substring) because
    // line wrapping/paraphrasing is normal, but require strong overlap. Empty/missing
    // evidence is treated as a hallucination and the line is dropped.
    const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const descNorm = normalize(rawDescription);
    const descTokenSet = new Set(descNorm.split(' ').filter((w) => w.length >= 3));
    const evidenceTraceable = (evidence: string): boolean => {
      const norm = normalize(evidence);
      if (!norm || norm.length < 6) return false;
      if (descNorm.includes(norm)) return true; // exact substring hit
      // fallback: meaningful token overlap with the source
      const toks = norm.split(' ').filter((w) => w.length >= 4 && !STOP.has(w));
      if (toks.length === 0) return false;
      let hits = 0; for (const t of toks) if (descTokenSet.has(t)) hits++;
      return hits / toks.length >= 0.6;
    };


    for (const key of tierKeys) {
      const t = tiersRaw.tiers[key];
      if (!t) continue;
      const items: any[] = Array.isArray(t.items) ? t.items : [];
      const invalidCodes: string[] = [];
      let remappedCount = 0;
      let hallucinationsDropped = 0;
      let evidenceTracedCount = 0;
      let total = 0;
      const cleanedItemsRaw = items.map((it) => {
        const originalCode = String(it.code || '').trim();
        const qty = Math.max(1, Math.round(Number(it.qty) || 1));
        const desc = String(it.description || '');
        const rawEvidence = String(it.evidence || '').slice(0, 400);
        // EVIDENCE-OR-NOTHING — drop any line without a traceable evidence quote.
        if (!evidenceTraceable(rawEvidence)) {
          hallucinationsDropped += 1;
          return null;
        }
        evidenceTracedCount += 1;
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
        // Confidence: prefer AI-supplied; otherwise derive from deep semantic overlap
        // (single tokens + bigrams + trade/component anchors) against the catalogue entry.
        let confidence = Math.round(Number(it.confidence));
        const lineToks = tokenize(desc);
        const lineBigrams = bigrams(lineToks);
        const hay = `${entry.description} ${entry.category || ''}`.toLowerCase();
        let tokHits = 0; let anchorHits = 0; let bgHits = 0;
        for (const t of lineToks) {
          if (hay.includes(t)) {
            tokHits += 1;
            if (ANCHOR_TOKENS.has(t)) anchorHits += 1;
          }
        }
        for (const bg of lineBigrams) if (hay.includes(bg)) bgHits += 1;
        if (!Number.isFinite(confidence) || confidence <= 0) {
          const tokRatio = lineToks.length > 0 ? tokHits / lineToks.length : 0;
          confidence = Math.min(95, Math.round(tokRatio * 70 + Math.min(anchorHits, 3) * 8 + Math.min(bgHits, 3) * 4));
          if (lineToks.length === 0) confidence = 60;
        }
        if (remapped) confidence = Math.min(confidence, 55); // remapped = lower trust
        confidence = Math.max(0, Math.min(100, confidence));
        // STRICT semantic guard: drop pairings where the catalogue entry contradicts the
        // line's action verb (e.g. "remove & relay" mapped to "install new") or surface
        // (e.g. "wall tile" mapped to "floor tile"; "loft insulation" to "cavity insulation";
        // "repoint brickwork" to a tile/grout code). Also drop weak no-anchor matches.
        const isPinned = (rawExistingWorks ?? []).some((w: any) => String(w.code || '').trim() === codeUsed);
        const lineActs = detectActions(desc);
        const lineSurfs = detectSurfaces(desc);
        const hayActs = detectActions(hay);
        const haySurfs = detectSurfaces(hay);
        if (!isPinned) {
          if (lineActs.size > 0 && hayActs.size > 0 && conflictsAction(lineActs, hayActs)) return null;
          if (lineSurfs.size > 0 && haySurfs.size > 0 && conflictsSurface(lineSurfs, haySurfs)) return null;
          // Only drop weak matches when the AI itself signalled low confidence (<70).
          // Trust strong AI confidence — it has the full catalogue context the regex doesn't.
          const aiConf = Math.round(Number(it.confidence)) || 0;
          if (aiConf < 70 && lineToks.length >= 3 && anchorHits === 0 && bgHits === 0 && tokHits < 2) return null;
        }
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
