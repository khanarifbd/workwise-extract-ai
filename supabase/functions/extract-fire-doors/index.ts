import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const extractFireDoorsSchema = z.object({
  description: z.string().max(50000, "Description too long").optional(),
  workItems: z.array(z.object({
    description: z.string().max(1000).optional(),
    qty: z.number().optional(),
  }).passthrough()).max(200, "Too many work items").optional(),
}).refine(
  data => data.description || (data.workItems && data.workItems.length > 0),
  { message: "Description or work items are required" }
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isAdmin, error: roleError } = await supabaseClient.rpc('is_admin', { _user_id: user.id });
    if (roleError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawBody = await req.json();
    const parseResult = extractFireDoorsSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parseResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { description, workItems } = parseResult.data;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const workItemsText = (workItems || []).map((item: any) => {
      const qty = item.qty || 1;
      const desc = item.description || '';
      return `[QTY: ${qty}] ${desc}`;
    }).join('\n');

    const combinedText = [description || '', workItemsText].filter(Boolean).join('\n\nWORK ITEMS:\n');

    const systemPrompt = `You are an expert at identifying fire door works in UK property maintenance job descriptions.

YOUR TASK: Find ALL references to fire doors (or fire-rated door sets) that need to be supplied, installed, renewed, or repaired.

FIRE DOOR TERMS TO LOOK FOR:
- Fire door / Fire doors / FD30 / FD60 / FD90
- Fire-rated door / Fire-rated door set
- Fire door set / Fire doorset / FD30s / FD60s (with smoke seals)
- Communal fire door / Flat entrance fire door
- Riser cupboard fire door / Service riser door
- Fire door intumescent strips / Smoke seals
- Fire door closer / Perko closer / Overhead door closer (when on a fire door)
- Fire door frame / Fire door lining
- Self-closing fire door
- Half-hour / one-hour fire door (FD30 = 30 min, FD60 = 60 min)
- Certifire / BWF Certifire / Q-Mark fire door
- Glazed fire door / Fire-rated glazing

WORK DESCRIPTIONS THAT INDICATE FIRE DOORS:
- "RENEW" / "REPLACE" / "INSTALL" / "SUPPLY AND FIT" any fire door
- "OVERHAUL" / "REPAIR" fire door / closer / seals
- "RE-HANG" fire door
- Terms like "FD30", "FD60", "fire rated", "intumescent"

IMPORTANT EXCLUSIONS — do NOT count these as fire doors:
- Standard internal doors with no fire rating
- External entrance doors that are not described as fire-rated
- Cupboard doors with no fire rating

COUNTING RULES:
1. Work items are prefixed with [QTY: X] - this is the EXACT quantity to use
2. If no QTY prefix shown, assume quantity = 1
3. Add up ALL fire-door work item quantities
4. Also check the description text for additional mentions not in work items

EXAMPLES:
- "[QTY: 2] RENEW FD30 FIRE DOOR" → 2 fire doors
- "Supply and fit fire door to kitchen" → 1 fire door
- "[QTY: 1] OVERHAUL FIRE DOOR CLOSER" → 1 (closer counts as a fire door work item)
- "Replace internal door to bedroom" → 0 (NOT fire-rated)

Return ONLY valid JSON:
{
  "hasFireDoors": true/false,
  "fireDoors": [{"type": "Fire Door Type", "quantity": <number>, "location": "room if mentioned"}],
  "totalFireDoorCount": <sum of all quantities>
}

If NO fire doors found: {"hasFireDoors": false, "fireDoors": [], "totalFireDoorCount": 0}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this job description for fire door works:\n\n${combinedText}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add more credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Lovable AI error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in AI response');

    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) cleanedContent = cleanedContent.slice(7);
    else if (cleanedContent.startsWith('```')) cleanedContent = cleanedContent.slice(3);
    if (cleanedContent.endsWith('```')) cleanedContent = cleanedContent.slice(0, -3);
    cleanedContent = cleanedContent.trim();

    let extractedData;
    try {
      extractedData = JSON.parse(cleanedContent);
    } catch {
      const jsonMatch = cleanedContent.match(/\{[\s\S]*?\}(?=\s*$)/);
      extractedData = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { hasFireDoors: false, fireDoors: [], totalFireDoorCount: 0 };
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-fire-doors function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing the request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
