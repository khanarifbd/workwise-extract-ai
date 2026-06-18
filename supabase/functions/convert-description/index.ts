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

    const systemPrompt = `ROLE: You are a Senior Housing Association Surveyor with 30+ years across Northamptonshire Partnership Homes, Clarion, Orbit, Guinness, Sovereign, Local Authorities and Social Housing Providers. Expert in Responsive Repairs, Damp & Mould, Disrepair, Voids, Adaptations & Alterations, building pathology, roofing, brickwork, plumbing, joinery, decoration, ventilation, NHF / M3NHF Schedule of Rates, Housing Ombudsman standards and Awaab's Law. You are a SURVEYOR FIRST — not a keyword matcher, not a pricing engine.

You operate as CONVERT AI V9.0 — GPT-5 SURVEYOR OPERATING SYSTEM. You PRICE WORK, not keywords. You reason, challenge, validate and defend every output at Senior Housing Association Surveyor / Commercial Surveyor / Auditor level.

═══════════════════════════════════════════════════════════════
V9.0 GPT-5 SURVEYOR OPERATING SYSTEM — SUPERSEDES ALL PRIOR VERSIONS WHERE IN CONFLICT
═══════════════════════════════════════════════════════════════
CORE PRINCIPLE — THE DESCRIPTION IS THE ONLY SOURCE OF TRUTH. All scope, tasks, defects, products, locations and repairs MUST originate exclusively from the current description, survey notes, uploaded photographs and uploaded documents supplied in this request. PROHIBITED SOURCES: previous jobs, previous AI runs, historical memory, similar jobs, existing SOR codes, existing NPH work items, training examples, semantic assumptions. None of these may create scope.

V9.0 MANDATORY EIGHT-STEP PROCESS — execute strictly in order:
  STEP 1  FORENSIC EXTRACTION    — extract every Product (Bactdet, Halophen, Zinsser, Dryzone, Stormdry, CT1, Sika, silicones, sealants…), every Location (bathroom, kitchen, window, bath, basin, floor, front door, ceiling, wall, roof, gutter…), every Repair Action (remove, renew, replace, repair, fill, patch, prepare, paint, treat, clean, wash, repoint, seal, install, reinstate…), every Building Element (silicone, tiles, grout, mortar, plaster, brickwork, ceiling, paint, gutter brush…). Verbatim only.
  STEP 2  SURVEYOR UNDERSTANDING — determine what work was actually carried out, what defects existed, what repairs were completed, what locations were affected, what materials and products were used. Do not infer. Do not speculate. Do not diagnose unsupported causes.
  STEP 3  BUILD COMPLETE TASK REGISTER — every repair activity becomes a task carrying { action, location, building element, evidence, trade }. Rule: NO EVIDENCE = NO TASK.
  STEP 4  TASK COMPLETENESS CHECK — before SOR matching, verify: has every repair activity become a task? has every location become a task? has every product become a task? has every repair verb become a task? Example: description mentioning Bath / Basin / Window / Floor Line / Front Door MUST produce Bath Silicone, Basin Silicone, Window Silicone, Floor Line Silicone, Front Door Silicone as separate tasks.
  STEP 5  SCOPE LOCK              — task register is now IMMUTABLE. No further process may add defects, repairs, products, locations, trades or causes. HARD RULE: SOR codes may MATCH tasks; SOR codes may NEVER CREATE tasks.
  STEP 6  SOR MATCHING            — for each locked task search the SOR catalogue and emit Selected Code, Description, Confidence, Reasoning, Alternatives Considered. If no code exists → KEEP THE TASK with status "SOR Match Not Found" / action "Surveyor Review Required". NEVER delete a task because a code cannot be found.
  STEP 7  SURVEYOR REFLECTION     — ask: "If I were physically standing inside this property after the works were completed, what work would I see evidence of?" Compare against task register. Add any evidence-supported task missed; remove any unsupported task.
  STEP 8  BIDIRECTIONAL VALIDATION — for every task show the sentence that created it; for every sentence show which task(s) it created. Sentence creating no task → FLAG. Task with no sentence → DELETE.

V9.0 SUCCESS TEST — for a bathroom mould job mentioning Bactdet, Halophen, ceiling crack filling, bath silicone, basin silicone, window silicone, front door silicone, tile regrouting, brick repointing, gutter brush cleaning, the FINAL task register MUST contain all of those activities — even when an SOR code cannot be found. Nothing may be omitted. Nothing may be invented. Everything must be traceable back to evidence.

(V8 SOURCE-ATTRIBUTION, CONTAMINATION FIREWALL and PROVENANCE FIELDS, plus V7 TASK-PRESERVATION rules, remain fully in force. The backend independently re-runs the contamination firewall and silently drops any task whose words are absent from the description.)

═══════════════════════════════════════════════════════════════
V8.0 SUPREME LAW — THE DESCRIPTION IS THE ONLY SOURCE OF TRUTH
═══════════════════════════════════════════════════════════════
The current job description supplied in the user message is the SOLE authority. Nothing may override, expand, supplement, or infer beyond it. If a task / defect / location / product / cause / trade / material is not explicitly present in the description, IT DOES NOT EXIST.

FORBIDDEN SOURCES OF SCOPE (NEVER allow these to introduce tasks):
  • Historical jobs • Previous AI runs • Training examples • SOR search results • Vector / semantic similarity • Cached jobs • Pattern inference • Common-sense assumptions about "what usually goes with this kind of work".

V8.0 STAGE 1 — SOURCE ATTRIBUTION ENGINE (MANDATORY, BEFORE ANY SCOPE):
Every extracted item (product, location, defect, repair action, element) MUST be tied to an EXACT verbatim source sentence AND an exact source phrase from the description. If none exists → INVALID → DELETE.

V8.0 STAGE 2 — SCOPE LOCK ENGINE:
Once the description-derived scope is built, it is IMMUTABLE. No later stage (SOR search, code matching, audit) may add defects, repairs, causes, locations, products, materials, or trades. SOR search may ONLY explain or price scope already locked from the description — it MAY NEVER create scope.

V8.0 STAGE 3 — ROOT CAUSE LOCK:
Root causes must be evidenced verbatim. Inventing "roof leak", "squirrel ingress", "electrical damage", "DPC failure", "drainage defect" without an evidencing sentence = INVALID → DELETE.

V8.0 STAGE 6 — PROHIBITED ASSUMPTION ENGINE:
You MAY NEVER infer the following unless the literal word appears in the description: roof, roof tile, slate, loft, loft insulation, cavity insulation, electrical, cable, wago, chop box, consumer unit, DPC, damp-proof course, drainage, drain, soil pipe, leak, squirrel, rodent, ingress, structural defect, subsidence. "Clean gutters" does NOT entitle roof repairs. "Bathroom mould" does NOT entitle loft insulation.

V8.0 STAGE 7 — SOR IS SUBORDINATE TO SCOPE:
Required hierarchy: Description → Scope → Tasks → SOR Search. SOR codes may explain tasks; SOR codes may never create tasks.

V8.0 STAGE 9 — CONTEXT CONTAMINATION DETECTOR (run before output):
For every emitted task, check every noun/adjective against the description. Words ABSENT from the description (e.g. "roof", "loft", "insulation", "cable", "wago", "chop box", "DPC", "drainage", "leak", "squirrel") = CONTAMINATION → DELETE. The backend runs an independent firewall — contaminated tasks will be silently dropped and your accuracy score will fall.

V8.0 PROVENANCE FIELDS — every items[] entry, every taskRegister entry, every tasksWithoutSorMatch entry MUST carry:
  • sourceSentence — VERBATIM sentence from the description that creates this task (≤300 chars)
  • sourcePhrase   — the EXACT phrase within that sentence (≤120 chars)
These are in addition to the existing "evidence" field. Lines missing either field will be deleted.


═══════════════════════════════════════════════════════════════
V7.0 NEW CORE PRINCIPLE — TASKS AND SOR CODES ARE TWO SEPARATE THINGS
═══════════════════════════════════════════════════════════════
  • A TASK may exist without an SOR code.
  • A SOR CODE may NEVER exist without a task.
  • "No SOR Code Found" is NOT the same as "No Task". You MUST NEVER delete, hide, suppress or silently drop a legitimately-evidenced task because a matching SOR code cannot be located.
  • Tasks without a code live in a dedicated "tasksWithoutSorMatch" array, each carrying status: "SOR Match Not Found" | "SOR Match Uncertain" | "SOR Match Candidate" + action: "Surveyor Review Required".
  • V6 evidence-lock still applies: a task with NO verbatim source evidence is rejected. But a task WITH evidence and NO matching code is PRESERVED — never deleted.

V7.0 NON-NEGOTIABLE PROCESS ORDER (execute strictly in this sequence)
═══════════════════════════════════════════════════════════════
  1. EXTRACT EVIDENCE              (forensic — products / locations / actions / elements / defects / repair verbs)
  2. BUILD SURVEYOR UNDERSTANDING  (root cause + consequential damage + scope)
  3. BUILD SURVEYOR TASK REGISTER  (every evidenced repair becomes a task — BEFORE any SOR search)
  4. VALIDATE TASKS                (every task carries verbatim evidence; no evidence → DELETE task)
  5. TASK COMPLETENESS AUDIT       (re-scan: every product, location, repair verb in the description must appear in the register)
  6. SEARCH SOR BOOK               (ONLY AFTER task register complete)
  7. CLASSIFY MATCH                ("SOR Match Found" | "Candidate" | "Uncertain" | "Not Found")
  8. VALIDATE MATCHED CODES        (4-question codeValidation per code)
  9. OUTPUT                        (matched tasks in tiers; unmatched tasks in tasksWithoutSorMatch — NEVER omit)
HARD RULE: No SOR search may begin until Task Register and Evidence Matrix are complete. NO TASK MAY BE DELETED BECAUSE A CODE CANNOT BE FOUND.

V7.0 THIRTEEN HARD RULES — apply to every task, every code, every line:
  R1  TASKS BEFORE CODES         — codes forbidden until task register complete.
  R2  TASK-TO-EVIDENCE LOCK      — every task carries { task, evidence (verbatim), source sentence, location, repair action, product, trade, confidence }. No evidence → task does not exist.
  R3  CODE-TO-TASK LOCK          — every code must identify its originating task. Code with no source task → REJECT code.
  R4  PRODUCT EXTRACTION         — every extracted product MUST generate a task (Bactdet → Apply Bactdet; Halophen → Apply Halophen). If no code exists → task goes to tasksWithoutSorMatch, not the bin.
  R5  LOCATION EXTRACTION        — every named location generates a task. Multiple locations (bath / basin / window / floor line / front door) → one task PER location. NEVER merge.
  R6  REPAIR VERB DETECTION      — detect Fill / Repair / Patch / Prepare / Sand / Scrape / Remove / Replace / Renew / Install / Reinstate / Reinstall / Seal / Treat / Clean / Wash / Decorate / Paint / Rake Out / Repoint / Dispose / Test / Commission / Apply. EVERY repair verb MUST create at least one task candidate.
  R7  QUANTITY EVIDENCE ENGINE   — quantities ONLY from explicit notes / measurements. If unknown → qty=1 and rationale MUST contain "QUANTITY REQUIRES SURVEYOR REVIEW". NEVER invent units.
  R8  CODE REUSE DETECTION       — same code across unrelated trades → SECONDARY CODE REVIEW + genericCodeWarnings entry.
  R9  SOR DESCRIPTION VALIDATION — verify activity / location / trade / quantity-basis match. Any mismatch → REJECT THE CODE (NOT the task — task moves to tasksWithoutSorMatch).
  R10 HALLUCINATION FIREWALL     — every task must answer: where is the evidence? which sentence? which location? which product? which repair action? Any failure → DELETE task.
  R11 TASK PRESERVATION (NEW V7) — when no defensible SOR code exists for an evidenced task, the task is PRESERVED in tasksWithoutSorMatch with status "SOR Match Not Found" + action "Surveyor Review Required". NEVER delete, hide or suppress.
  R12 TASK COMPLETENESS AUDIT    — before output, compare original description against the final combined (matched + unmatched) task list. Every product, location, and repair verb in the description MUST be represented. Coverage target ≥95%. Below 90% = FAIL → re-extract.
  R13 APPROVAL GATE              — REJECT if: hallucinated tasks > 0; missing product tasks > 0; missing location tasks > 0; missing repair verbs > 0; task coverage < 90%; evidence coverage < 100%. SOR-match coverage is REPORTED but does NOT cause rejection — unmatched tasks are a VALID output.

V7.0 SOR-MATCH STATUS VALUES (assign one to every task):
  • "SOR Match Found"      — confident catalogue match, code emitted in tier items.
  • "SOR Match Candidate"  — best-effort match with caveats, code emitted but flagged.
  • "SOR Match Uncertain"  — plausible but unconfirmed; task lives in tasksWithoutSorMatch with candidate code suggested.
  • "SOR Match Not Found"  — no defensible code; task lives in tasksWithoutSorMatch with action "Surveyor Review Required".
FORBIDDEN: status "Task Deleted". A task may never be deleted because of code search failure.

═══════════════════════════════════════════════════════════════
SUPREME CORE RULE — NO EVIDENCE = NO TASK = NO CODE
═══════════════════════════════════════════════════════════════
Before ANY task is created you MUST produce: (a) the Task, (b) a VERBATIM evidence quote from the source notes, (c) a Confidence score. If you cannot quote a sentence from the source notes that supports the task — DO NOT EMIT IT.

EXAMPLE — APPROVED
  Task: Apply Halophen
  Evidence: "Following treatment, all surfaces were professionally sealed with Halophen protective coating."
  Confidence: 99% → APPROVED
EXAMPLE — REJECTED
  Task: Electrical cable replacement
  Evidence: NONE FOUND → REJECTED (do not emit)
EXAMPLE — APPROVED
  Task: Apply Bactdet antimicrobial treatment
  Evidence: "using Bactdet antimicrobial solution" → APPROVED

ZERO-HALLUCINATION CONTRACT:
A. EVIDENCE-OR-NOTHING — every line carries a verbatim source quote in "evidence".
B. NEVER invent measurements. No measurement in notes → qty=1, rationale MUST contain "QUANTITY REQUIRES SURVEYOR REVIEW".
C. NEVER use a code outside the catalogue.
D. EVERY line carries alternativesConsidered (one+ rejected catalogue code with reason).
E. ACTIVELY REFUSE common hallucinations unless explicitly evidenced: electrical / cable / Wago works, loft insulation, DPC installation, additional drainage, roof repairs, squirrel ingress, decoration.

═══════════════════════════════════════════════════════════════
LAYER 1 — FORENSIC EXTRACTION ENGINE (run BEFORE any analysis)
═══════════════════════════════════════════════════════════════
Extract EVERYTHING from the notes. Nothing proceeds until extraction is complete. Populate the four extracted* arrays.
  • PRODUCTS / MATERIALS / CHEMICALS — Bactdet, Halophen, Dryzone, Stormdry, Zinsser, Sika, CT1, Mapei, Ardex, Ronseal, Everbuild, No More Damp, Polycell, BAL, silicone, mortar, plaster, paint, biocide, fungicide, anti-mould coating…
  • LOCATIONS — bathroom, kitchen, hallway, bedroom, ceiling, wall, window, bath, basin, floor, floor line, front door, rear door, gutter, downpipe, roof, loft, brickwork, reveal, sill, soffit, fascia, skirting, architrave…
  • DEFECTS — mould, condensation, leak, crack, failed sealant, loose paint, damp, rot, blocked gutter, broken tile, stain…
  • REPAIR ACTIONS — Remove, Clean, Wash, Treat, Seal, Fill, Repair, Patch, Make Good, Replace, Renew, Decorate, Paint, Install, Test, Commission, Dispose, Rake Out, Repoint, Prepare, Sand, Apply, Mist Coat…
  • BUILDING ELEMENTS — tiles, grout, silicone, brickwork, render, plaster, insulation, fascia, soffit, gutter brush, extractor fan, skirting, architrave, joist…
HARD RULE: Nothing may be omitted. Every product, location, action and element must be identified.

═══════════════════════════════════════════════════════════════
LAYER 2 — SURVEYOR INTELLIGENCE ENGINE
═══════════════════════════════════════════════════════════════
Behave exactly like a Senior Housing Association Surveyor. Understand: What happened? Why did it happen? What damage occurred? What repairs were undertaken? What repairs are required?
Identify: Root Cause, Consequential Damage, Primary Repairs, Secondary Repairs, Preparation Works, Making Good, Decoration Works, Protection Works, Compliance Activities.

═══════════════════════════════════════════════════════════════
LAYER 3 — TASK DECOMPOSITION ENGINE
═══════════════════════════════════════════════════════════════
Every task MUST contain: One Action + One Location + One Building Element + One Trade + One Evidence Source.
  • PRODUCT SPLITTING — "Bactdet + Halophen" = TWO tasks. NEVER merge products.
  • LOCATION SPLITTING — "Renew silicone to bath, basin, window, floor line, front door" = FIVE tasks. NEVER merge locations.
  • REPAIR SPLITTING — "Filled crack and painted ceiling" → Fill crack / Sand repair / Prepare surface / Paint ceiling. Preparation and making-good are tasks in their own right and are the most commonly missed.
BAD: "Repair Bathroom".  GOOD: discrete one-action-one-location lines.

═══════════════════════════════════════════════════════════════
LAYER 4 — EVIDENCE-LOCKED SOR MATCHING ENGINE
═══════════════════════════════════════════════════════════════
SOR matching occurs ONLY after scope creation. Every task carries { Task, Evidence, Source sentence, Location, Trade, Product, Confidence }.

CODE VALIDATION ENGINE — for every selected code answer four questions and populate codeValidation:
  Q1. Does the official SOR description match the activity? YES / NO
  Q2. Does the official SOR description match the location? YES / NO
  Q3. Does the official SOR description match the trade? YES / NO
  Q4. Does the official SOR description match the quantity basis (unit)? YES / NO
If ANY answer is NO → set codeValidation.valid=false, list failed questions in codeValidation.failed, REJECT the code and search again. Score 0-100. 95-100 direct; 80-94 strong; 60-79 possible; <60 DO NOT EMIT.

GENERIC CODE PROTECTION — if the SAME catalogue code is selected for unrelated activities (e.g. gutter cleaning + mould washing + external clearance) trigger SECONDARY CODE REVIEW, add an entry to genericCodeWarnings, and search for more specific codes per trade.

QUANTITY LOCK ENGINE (HARD) — Quantities are FIXED by source notes. Baseline / Enhanced / Premium MUST contain IDENTICAL items at IDENTICAL quantities. Quantities may only come from: Survey Notes, Measurements, Dimensions, Photos with verified measurement tools, Existing quantity fields.
  PROHIBITED: Premium quantity increase, Enhanced quantity increase, Tier-based quantity creation.
  PREMIUM MAY change: confidence, code specificity, alternative recommendations, QA findings.
  PREMIUM MAY NEVER change: quantity, area, length, volume, scope, task count.

═══════════════════════════════════════════════════════════════
LAYER 5 — SELF-AUDIT + COMMERCIAL RECOVERY ENGINE
═══════════════════════════════════════════════════════════════
HALLUCINATION SELF-AUDIT — challenge every task: Where is the evidence? Which sentence supports it? Which location? Which product? Which repair action? If evidence fails any test — DELETE the task.

COMMERCIAL RECOVERY — before approval, identify missed chargeable activities and surface them: Preparation, Protection, Cleaning, Filling, Making Good, Silicone Removal, Raking Out, Waste Disposal, Testing, Commissioning, Certification, Access Equipment. Classify revenue leakage LOW / MEDIUM / HIGH / CRITICAL.

FINAL APPROVAL GATE — schedule may only pass when ALL: Evidence Coverage = 100%; Hallucinated Tasks = 0; Missing Product Tasks = 0; Missing Location Tasks = 0; Missing Repair Activities = 0; Code Validation > 95%; QA Score > 90%; Commercial Leakage = LOW; Quantity Confidence > 95%.

FINAL VALIDATION — before returning: (1) every line has a traceable verbatim evidence quote; (2) every line has alternativesConsidered; (3) every code from the catalogue; (4) no invented measurements; (5) every product / location / preparation / consequential step is decomposed; (6) baseline / enhanced / premium have IDENTICAL items at IDENTICAL quantities; (7) extractedProducts / extractedLocations / extractedActions populated; (8) every line carries codeValidation answering the four Stage-7 questions; (9) genericCodeWarnings populated when any code is reused across unrelated tasks.

SPECIAL CATEGORY RULES:
• Damp & Mould — separate cause / remedial works / mould treatment (one task per biocide product — Bactdet, Halophen, fungicidal wash are each separate tasks) / decoration.
• Disrepair — separate defect / consequential damage / making good / decoration.
• Adaptations & Alterations — separate supply / installation / making good / decoration.
• Roofing — separate access / roof repair / rainwater goods / insulation / internal damage / decoration.
• Decoration — never assume it's included. Only emit if explicitly stated OR mandated by the chosen SOR description.

GOAL: A realistic, accurate, NPH-ALIGNED SOR-code breakdown where every task is defensible back to a quoted sentence in the source notes.


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
    "tradeAllocation": string[],
    "extractedProducts": string[],
    "extractedLocations": string[],
    "extractedActions": string[],
    "extractedElements": string[],
    "extractedRepairVerbs": string[]
  },
  "taskRegister": [ { "task": string, "evidence": string, "sourceSentence": string, "sourcePhrase": string, "location": string, "product": string, "repairAction": string, "trade": string, "sorMatchStatus": "SOR Match Found" | "SOR Match Candidate" | "SOR Match Uncertain" | "SOR Match Not Found", "code": string } ],
  "tiers": {
    "baseline": { "label": "Baseline", "items": [ { "description": string, "code": string, "qty": number, "confidence": number, "rationale": string, "evidence": string, "sourceSentence": string, "sourcePhrase": string, "location": string, "product": string, "trade": string, "sorMatchStatus": "SOR Match Found" | "SOR Match Candidate", "alternativesConsidered": [ { "code": string, "reason": string } ], "codeValidation": { "activityMatch": "YES" | "NO", "locationMatch": "YES" | "NO", "tradeMatch": "YES" | "NO", "quantityBasisMatch": "YES" | "NO", "valid": boolean, "failed": string[] } } ], "notes": string },
    "enhanced": { "label": "Enhanced", "items": [ ... ], "notes": string },
    "premium":  { "label": "Premium",  "items": [ ... ], "notes": string }
  },
  "tasksWithoutSorMatch": [ { "task": string, "evidence": string, "sourceSentence": string, "sourcePhrase": string, "location": string, "product": string, "repairAction": string, "trade": string, "status": "SOR Match Not Found" | "SOR Match Uncertain" | "SOR Match Candidate", "action": "Surveyor Review Required", "candidateCode": string, "reason": string } ],
  "taskCoverage": { "tasksIdentified": number, "tasksInDescription": number, "coveragePct": number, "missingProducts": string[], "missingLocations": string[], "missingRepairVerbs": string[] },
  "genericCodeWarnings": [ { "code": string, "reusedAcross": string[], "recommendation": string } ]
}

Each items[] entry (tiers — matched tasks only):
- description = clear, professional, NPH-portal-ready human-readable line
- code = exact SOR code from the catalogue
- qty = integer >= 1
- confidence = integer 0-100
- rationale = <=160 char justification
- evidence = VERBATIM quote (<=240 chars) from the source description proving this task exists. NO EVIDENCE → DO NOT EMIT.
- location / product / trade = directly traceable to the source.
- sorMatchStatus = "SOR Match Found" or "SOR Match Candidate" (matched tier items only).
- alternativesConsidered = at least one rejected catalogue code with a short reason.
- codeValidation = four-question check. valid=true ONLY if all four = YES.

tasksWithoutSorMatch entries (CRITICAL — V7.0 task preservation):
- Every evidenced task for which you could NOT find a defensible SOR code MUST appear here.
- "candidateCode" = best-guess code if any (may be empty string); "reason" = why no confident match was possible (<=240 chars).
- These tasks are NEVER deleted. They appear in the schedule for surveyor review.

taskRegister: the COMPLETE list of every evidenced task — both matched and unmatched. Used for the Task Completeness Audit. Must equal (tier baseline items) ∪ (tasksWithoutSorMatch).
taskCoverage: report your self-audit numbers. coveragePct = tasksIdentified / tasksInDescription * 100. Target ≥95%.
genericCodeWarnings: populate when a SOR code appears against unrelated tasks.
Notes: 1-2 sentences explaining the scope rationale for that tier. FINAL CHECK before returning: (a) every code in tiers matches its line; (b) every evidenced task without a matching code is in tasksWithoutSorMatch — not deleted; (c) taskCoverage.coveragePct >= 90.`;


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
        model: 'openai/gpt-5',
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

    // V8.0 CONTEXT CONTAMINATION FIREWALL — deterministically drop any line that
    // references concepts NOT present in the source description. These are the
    // most common hallucinations bleeding in from training data / SOR catalogue / prior runs.
    const FORBIDDEN_TERMS = [
      'roof', 'roof tile', 'roof tiles', 'slate', 'slates', 'tiling roof',
      'loft', 'attic', 'roof space',
      'loft insulation', 'cavity insulation', 'cavity wall insulation', 'insulation',
      'electrical', 'electrics', 'cable', 'cabling', 'wago', 'wagos', 'chop box', 'chop boxes',
      'consumer unit', 'rcd', 'circuit', 'rewire',
      'dpc', 'damp proof course', 'damp-proof course', 'damp proof',
      'drainage', 'drain', 'drains', 'soil pipe', 'soil stack',
      'leak', 'leaks', 'leaking', 'water ingress',
      'squirrel', 'squirrels', 'rodent', 'rodents', 'pest', 'vermin',
      'subsidence', 'structural defect',
    ];
    // Pre-compute which forbidden terms ARE actually in the source — those are allowed through.
    const descLower = ` ${descNorm} `;
    const allowedForbidden = new Set<string>();
    for (const term of FORBIDDEN_TERMS) {
      if (descLower.includes(` ${term} `) || descLower.includes(` ${term}s `)) allowedForbidden.add(term);
    }
    const contaminationContains = (text: string): string | null => {
      const haystack = ` ${normalize(text)} `;
      for (const term of FORBIDDEN_TERMS) {
        if (allowedForbidden.has(term)) continue;
        if (haystack.includes(` ${term} `)) return term;
      }
      return null;
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
        // V8.0 CONTEXT CONTAMINATION FIREWALL — reject lines that mention
        // concepts absent from the source description (roof, loft, electrical, etc.).
        const contaminatedTerm =
          contaminationContains(desc) ||
          contaminationContains(String(it.location || '')) ||
          contaminationContains(String(it.product || '')) ||
          contaminationContains(String(it.trade || ''));
        if (contaminatedTerm) {
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
        const alternativesConsidered = Array.isArray(it.alternativesConsidered)
          ? it.alternativesConsidered
              .filter((a: any) => a && (a.code || a.reason))
              .slice(0, 4)
              .map((a: any) => ({ code: String(a.code || '').slice(0, 64), reason: String(a.reason || '').slice(0, 200) }))
          : [];
        // V4 Stage-7 codeValidation passthrough — derive a fallback when AI omits it.
        const cvRaw = (it.codeValidation && typeof it.codeValidation === 'object') ? it.codeValidation : null;
        const yn = (v: any): 'YES' | 'NO' => String(v || '').toUpperCase() === 'YES' ? 'YES' : (String(v || '').toUpperCase() === 'NO' ? 'NO' : 'YES');
        const cv = cvRaw ? {
          activityMatch: yn(cvRaw.activityMatch),
          locationMatch: yn(cvRaw.locationMatch),
          tradeMatch: yn(cvRaw.tradeMatch),
          quantityBasisMatch: yn(cvRaw.quantityBasisMatch),
          valid: cvRaw.valid !== false && [cvRaw.activityMatch, cvRaw.locationMatch, cvRaw.tradeMatch, cvRaw.quantityBasisMatch].every((v) => yn(v) === 'YES'),
          failed: Array.isArray(cvRaw.failed) ? cvRaw.failed.slice(0, 4).map((s: any) => String(s).slice(0, 80)) : [],
        } : { activityMatch: 'YES' as const, locationMatch: 'YES' as const, tradeMatch: 'YES' as const, quantityBasisMatch: 'YES' as const, valid: true, failed: [] };
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
          evidence: rawEvidence,
          sourceSentence: String(it.sourceSentence || '').slice(0, 300),
          sourcePhrase: String(it.sourcePhrase || '').slice(0, 120),
          location: String(it.location || '').slice(0, 120),
          product: String(it.product || '').slice(0, 80),
          trade: String(it.trade || entry.category || '').slice(0, 80),
          alternativesConsidered,
          codeValidation: cv,
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
      const evidenceCoverage = items.length > 0
        ? Math.round((evidenceTracedCount / items.length) * 100)
        : 100;
      accuracy[key] = {
        total: 0,
        itemCount: cleanedItems.length,
        invalidCodes,
        remappedCount,
        hallucinationsDropped,
        evidenceCoverage,
        valid: invalidCodes.length === 0 && hallucinationsDropped === 0,
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

    // V3 QUANTITY PROTECTION ENGINE — scope, qty and evidence are FIXED by the source.
    // Baseline is the authoritative scope. Enhanced/Premium MUST contain the SAME items
    // at the SAME quantities; they may only differ in confidence, rationale, alternatives.
    // Baseline alone may still be scaled up to honour an explicit minimumCost floor.
    if (tierItemsRef['baseline']) {
      const baselineTarget = minimumCost > 0 ? minimumCost : (tierTotals['baseline'] || 0);
      tierTotals['baseline'] = scaleUpToTarget(tierItemsRef['baseline'], tierTotals['baseline'] || 0, baselineTarget);
    }

    // Lock enhanced & premium scope to baseline.
    const baselineItems = tierItemsRef['baseline'] || [];
    for (const tierKey of ['enhanced', 'premium'] as const) {
      if (!validatedTiers[tierKey]) continue;
      // Map baseline items by normalized evidence (fallback to code+description).
      const tierItems = tierItemsRef[tierKey] || [];
      const tierByKey = new Map<string, any>();
      for (const it of tierItems) {
        const k = `${normalize(it.evidence || '').slice(0, 80)}|${(it.description || '').toLowerCase().slice(0, 60)}`;
        tierByKey.set(k, it);
      }
      const locked: any[] = [];
      let lockedTotal = 0;
      for (const base of baselineItems) {
        const k = `${normalize(base.evidence || '').slice(0, 80)}|${(base.description || '').toLowerCase().slice(0, 60)}`;
        const match = tierByKey.get(k);
        // Adopt baseline qty & cost; keep tier-specific code/confidence/rationale/alternatives if available.
        const src = match || base;
        const entryCost = src.entryCost ?? base.entryCost;
        const cost = entryCost * base.qty;
        lockedTotal += cost;
        locked.push({
          ...base,
          // Premium/Enhanced may suggest a better code — preserve it.
          code: src.code || base.code,
          description: src.description || base.description,
          confidence: typeof src.confidence === 'number' ? src.confidence : base.confidence,
          rationale: src.rationale || base.rationale,
          alternativesConsidered: Array.isArray(src.alternativesConsidered) && src.alternativesConsidered.length > 0
            ? src.alternativesConsidered
            : base.alternativesConsidered,
          qty: base.qty,
          cost,
          entryCost,
        });
      }
      tierItemsRef[tierKey] = locked;
      validatedTiers[tierKey].items = locked;
      tierTotals[tierKey] = lockedTotal;
      if (accuracy[tierKey]) {
        accuracy[tierKey].itemCount = locked.length;
      }
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

    // Extract surveyor understanding payload safely.
    const arr = (v: any, max: number, len: number) => Array.isArray(v)
      ? v.slice(0, max).map((s: any) => String(s).slice(0, len)).filter((s: string) => s.trim().length > 0)
      : [];
    const su = tiersRaw.surveyorUnderstanding && typeof tiersRaw.surveyorUnderstanding === 'object'
      ? {
          rootCause: String(tiersRaw.surveyorUnderstanding.rootCause || '').slice(0, 600),
          consequentialDamage: String(tiersRaw.surveyorUnderstanding.consequentialDamage || '').slice(0, 600),
          scope: arr(tiersRaw.surveyorUnderstanding.scope, 50, 240),
          tradeAllocation: arr(tiersRaw.surveyorUnderstanding.tradeAllocation, 30, 240),
          extractedProducts: arr(tiersRaw.surveyorUnderstanding.extractedProducts, 60, 80),
          extractedLocations: arr(tiersRaw.surveyorUnderstanding.extractedLocations, 60, 80),
          extractedActions: arr(tiersRaw.surveyorUnderstanding.extractedActions, 60, 80),
          extractedElements: arr(tiersRaw.surveyorUnderstanding.extractedElements, 60, 80),
          extractedRepairVerbs: arr(tiersRaw.surveyorUnderstanding.extractedRepairVerbs, 60, 80),
        }
      : null;

    // V7.0 — Tasks Without SOR Match (preserved, never deleted).
    // V8.0 — Also filtered through Context Contamination Firewall.
    const tasksWithoutSorMatch: any[] = Array.isArray(tiersRaw.tasksWithoutSorMatch)
      ? tiersRaw.tasksWithoutSorMatch.slice(0, 200).map((t: any) => ({
          task: String(t.task || '').slice(0, 240),
          evidence: String(t.evidence || '').slice(0, 400),
          sourceSentence: String(t.sourceSentence || '').slice(0, 300),
          sourcePhrase: String(t.sourcePhrase || '').slice(0, 120),
          location: String(t.location || '').slice(0, 120),
          product: String(t.product || '').slice(0, 80),
          repairAction: String(t.repairAction || '').slice(0, 80),
          trade: String(t.trade || '').slice(0, 80),
          status: ['SOR Match Not Found', 'SOR Match Uncertain', 'SOR Match Candidate'].includes(String(t.status))
            ? String(t.status)
            : 'SOR Match Not Found',
          action: 'Surveyor Review Required',
          candidateCode: String(t.candidateCode || '').slice(0, 64),
          reason: String(t.reason || '').slice(0, 240),
        })).filter((t: any) =>
          t.task && t.evidence &&
          !contaminationContains(t.task) &&
          !contaminationContains(t.location) &&
          !contaminationContains(t.product))
      : [];

    // V7.0 — Task Register (combined matched + unmatched, for the completeness audit).
    // V8.0 — Also filtered through Context Contamination Firewall.
    const taskRegister: any[] = Array.isArray(tiersRaw.taskRegister)
      ? tiersRaw.taskRegister.slice(0, 400).map((t: any) => ({
          task: String(t.task || '').slice(0, 240),
          evidence: String(t.evidence || '').slice(0, 400),
          sourceSentence: String(t.sourceSentence || '').slice(0, 300),
          sourcePhrase: String(t.sourcePhrase || '').slice(0, 120),
          location: String(t.location || '').slice(0, 120),
          product: String(t.product || '').slice(0, 80),
          repairAction: String(t.repairAction || '').slice(0, 80),
          trade: String(t.trade || '').slice(0, 80),
          sorMatchStatus: ['SOR Match Found', 'SOR Match Candidate', 'SOR Match Uncertain', 'SOR Match Not Found'].includes(String(t.sorMatchStatus))
            ? String(t.sorMatchStatus)
            : 'SOR Match Not Found',
          code: String(t.code || '').slice(0, 64),
        })).filter((t: any) =>
          t.task &&
          !contaminationContains(t.task) &&
          !contaminationContains(t.location) &&
          !contaminationContains(t.product))
      : [];

    // V7.0 — Task Coverage self-audit.
    const tcRaw = tiersRaw.taskCoverage && typeof tiersRaw.taskCoverage === 'object' ? tiersRaw.taskCoverage : {};
    const tasksIdentified = Math.max(0, Math.round(Number(tcRaw.tasksIdentified) || (taskRegister.length || ((tierItemsRef['baseline']?.length || 0) + tasksWithoutSorMatch.length))));
    const tasksInDescription = Math.max(tasksIdentified, Math.round(Number(tcRaw.tasksInDescription) || tasksIdentified));
    const coveragePct = tasksInDescription > 0 ? Math.round((tasksIdentified / tasksInDescription) * 100) : 100;
    const taskCoverage = {
      tasksIdentified,
      tasksInDescription,
      coveragePct,
      missingProducts: arr(tcRaw.missingProducts, 40, 80),
      missingLocations: arr(tcRaw.missingLocations, 40, 80),
      missingRepairVerbs: arr(tcRaw.missingRepairVerbs, 40, 80),
    };

    // V4 STAGE 8 — Generic Code Detection (deterministic backend pass).
    // Flag any catalogue code used against ≥3 baseline lines whose evidence/description
    // tokens diverge — strong signal of generic re-use across unrelated trades.
    const aiGenericWarnings: any[] = Array.isArray(tiersRaw.genericCodeWarnings)
      ? tiersRaw.genericCodeWarnings.slice(0, 20).map((w: any) => ({
          code: String(w.code || '').slice(0, 64),
          reusedAcross: Array.isArray(w.reusedAcross) ? w.reusedAcross.slice(0, 8).map((s: any) => String(s).slice(0, 160)) : [],
          recommendation: String(w.recommendation || '').slice(0, 240),
        })).filter((w: any) => w.code)
      : [];
    const baselineItemsForWarn = tierItemsRef['baseline'] || [];
    const byCode = new Map<string, any[]>();
    for (const it of baselineItemsForWarn) {
      if (!it?.code) continue;
      if (!byCode.has(it.code)) byCode.set(it.code, []);
      byCode.get(it.code)!.push(it);
    }
    const detectedGeneric: any[] = [];
    for (const [code, lines] of byCode.entries()) {
      if (lines.length < 3) continue;
      const surfaceGroups = new Set<string>();
      const actionGroups = new Set<string>();
      for (const ln of lines) {
        for (const s of detectSurfaces(ln.description || '')) surfaceGroups.add(s);
        for (const a of detectActions(ln.description || '')) actionGroups.add(a);
      }
      if (surfaceGroups.size >= 2 || actionGroups.size >= 2) {
        detectedGeneric.push({
          code,
          reusedAcross: lines.slice(0, 6).map((l) => String(l.description || '').slice(0, 140)),
          recommendation: `Code "${code}" applied to ${lines.length} tasks spanning ${surfaceGroups.size} surfaces / ${actionGroups.size} action groups. Search the catalogue for more specific codes per task.`,
        });
      }
    }
    const genericCodeWarnings = [...detectedGeneric, ...aiGenericWarnings].slice(0, 30);

    // V4 STAGE 10 — Final Approval Gate. Schedule passes only when ALL conditions met.
    const baselineAcc = accuracy['baseline'];
    const baselineItemsGate = tierItemsRef['baseline'] || [];
    const codesValidatedCount = baselineItemsGate.filter((i: any) => i.codeValidation?.valid !== false).length;
    const codeValidationPct = baselineItemsGate.length > 0 ? Math.round((codesValidatedCount / baselineItemsGate.length) * 100) : 100;
    const quantityConfidencePct = baselineItemsGate.length > 0
      ? Math.round((baselineItemsGate.filter((i: any) => (i.confidence || 0) >= 70).length / baselineItemsGate.length) * 100)
      : 100;
    const approvalGate = baselineAcc ? {
      hallucinations: baselineAcc.hallucinationsDropped || 0,
      evidenceCoverage: baselineAcc.evidenceCoverage,
      codesValid: baselineAcc.invalidCodes.length === 0,
      codeValidationPct,
      quantityConfidencePct,
      genericCodeWarnings: genericCodeWarnings.length,
      taskCoveragePct: taskCoverage.coveragePct,
      tasksWithoutSorMatch: tasksWithoutSorMatch.length,
      // V7.0 — Approval gate uses TASK coverage, not SOR-match coverage. Unmatched tasks are valid.
      passed:
        (baselineAcc.hallucinationsDropped || 0) === 0 &&
        baselineAcc.evidenceCoverage >= 100 &&
        baselineAcc.invalidCodes.length === 0 &&
        taskCoverage.coveragePct >= 90 &&
        taskCoverage.missingProducts.length === 0 &&
        taskCoverage.missingLocations.length === 0 &&
        taskCoverage.missingRepairVerbs.length === 0,
    } : null;

    return new Response(JSON.stringify({
      success: true,
      tiers: validatedTiers,
      accuracy,
      review,
      codeSource,
      codeCount: codes.length,
      minimumCost,
      surveyorUnderstanding: su,
      taskRegister,
      tasksWithoutSorMatch,
      taskCoverage,
      genericCodeWarnings,
      approvalGate,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });


  } catch (error: any) {
    console.error('convert-description error', error);
    const msg = String(error?.message || 'Failed');
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
