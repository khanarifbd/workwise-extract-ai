import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const extractFlooringSchema = z.object({
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
    const parseResult = extractFlooringSchema.safeParse(rawBody);
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

    const systemPrompt = `You are an expert at identifying flooring work in UK property maintenance job descriptions.

YOUR TASK: Find ALL references to flooring that needs to be installed, repaired, or replaced.

FLOORING TYPES TO LOOK FOR:
- Vinyl flooring / Vinyl tiles / Sheet vinyl
- Lino / Linoleum
- Laminate flooring
- Carpet / Carpet tiles
- Polysafe / Safety flooring / Non-slip flooring
- Timber / Hardwood flooring
- Floorboards / Floor boards
- Tiles / Ceramic tiles / Porcelain tiles (floor)
- Threshold strips / Door bars
- Underlay
- Screed / Levelling compound
- Altro flooring

WORK DESCRIPTIONS THAT INDICATE FLOORING:
- "RENEW" or "RENEWAL" of any flooring type
- "INSTALL" / "LAY" / "FIT" flooring
- "REPLACE" flooring
- "SUPPLY AND FIT" / "SUPPLY AND LAY"
- "REPAIR" flooring
- Terms like "floor covering", "floor finish"

COUNTING RULES:
1. Work items prefixed with [QTY: X] - use that exact quantity
2. If no QTY prefix, assume quantity = 1
3. Count each distinct flooring work item separately
4. Check description text for additional mentions not in work items

Return ONLY valid JSON:
{
  "hasFlooring": true/false,
  "flooring": [{"type": "Flooring Type", "quantity": <number>, "location": "room if mentioned"}],
  "totalFlooringCount": <sum of all quantities>
}

If NO flooring found: {"hasFlooring": false, "flooring": [], "totalFlooringCount": 0}`;

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
          { role: 'user', content: `Analyze this job description for flooring work:\n\n${combinedText}` }
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI error: ${response.status} - ${errorText}`);
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
      extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : { hasFlooring: false, flooring: [], totalFlooringCount: 0 };
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-flooring:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing the request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
