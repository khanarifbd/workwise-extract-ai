import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const extractRoofingSchema = z.object({
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
      global: { headers: { Authorization: authHeader } }
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
    const parseResult = extractRoofingSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parseResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { description, workItems } = parseResult.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Scanning for roofing works for user ${user.id}...`);

    const workItemsText = (workItems || []).map((item: any) => {
      const qty = item.qty || 1;
      const desc = item.description || '';
      return `[QTY: ${qty}] ${desc}`;
    }).join('\n');

    const combinedText = [
      description || '',
      workItemsText
    ].filter(Boolean).join('\n\nWORK ITEMS:\n');

    const systemPrompt = `You are an expert at identifying roofing works in UK property maintenance job descriptions.

YOUR TASK: Carefully read the entire description and work items to find ALL references to roofing work.

ROOFING TYPES TO LOOK FOR:
- Roof repair / Roof renewal
- Roof tiles (concrete, clay, slate)
- Ridge tiles / Hip tiles
- Flat roof / Flat roofing
- Felt roofing / Torch-on felt
- EPDM rubber roofing
- GRP fibreglass roofing
- Lead flashing / Lead work
- Roof flashing / Step flashing
- Chimney flashing
- Valley gutter / Box gutter
- Soffit / Fascia / Bargeboard
- Guttering / Downpipes (when part of roof works)
- Roof ventilation / Roof vents
- Roof insulation (when part of roof works)
- Pointing / Repointing (chimney/ridge)
- Chimney repair / Chimney stack
- Roof scaffold / Scaffolding (when for roof access)
- Slating / Re-slating
- Tiling / Re-tiling (roof)
- Roof leak repair
- Storm damage (roof)
- Verge / Verge board
- Dry verge system
- Roof light / Skylight

WORK DESCRIPTIONS THAT INDICATE ROOFING:
- "RENEW" or "RENEWAL" of any roofing element
- "REPAIR" roof / tiles / flashing
- "REPLACE" roof tiles / slates
- "RE-ROOF" or "REROOFING"
- "STRIP AND RE-" any roof covering
- "OVERHAUL" roof
- "MAKE GOOD" roof
- Terms like "roof", "roofing", "tiles", "slates", "flashing", "ridge"

COUNTING RULES:
1. Work items are prefixed with [QTY: X] - this is the EXACT quantity to use
2. If no QTY prefix shown, assume quantity = 1
3. Add up ALL roofing-related work item quantities
4. Also check the description text for additional roofing mentions not in work items

EXAMPLES:
- "[QTY: 20] ROOF:RENEW TILES" → 20 tiles
- "Repair roof flashing to chimney" → 1 flashing repair
- "[QTY: 1] STRIP AND RE-FELT FLAT ROOF" → 1 flat roof

Return ONLY valid JSON:
{
  "hasRoofing": true/false,
  "roofing": [{"type": "Roofing Type", "quantity": <number>, "location": "area if mentioned"}],
  "totalRoofingCount": <sum of all quantities>
}

If NO roofing found: {"hasRoofing": false, "roofing": [], "totalRoofingCount": 0}`;

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
          { role: 'user', content: `Analyze this job description for roofing works:\n\n${combinedText}` }
        ],
        response_format: { type: "json_object" },
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

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('Roofing extraction completed for user:', user.id);

    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.slice(7);
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.slice(3);
    }
    if (cleanedContent.endsWith('```')) {
      cleanedContent = cleanedContent.slice(0, -3);
    }
    cleanedContent = cleanedContent.trim();

    let extractedData;
    try {
      extractedData = JSON.parse(cleanedContent);
    } catch (parseError) {
      const jsonMatch = cleanedContent.match(/\{[\s\S]*?\}(?=\s*$)/);
      if (!jsonMatch) {
        console.error('Failed to parse JSON:', parseError);
        extractedData = { hasRoofing: false, roofing: [], totalRoofingCount: 0 };
      } else {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-roofing function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing the request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
