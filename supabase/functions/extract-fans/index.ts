import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Input validation schema
const extractFansSchema = z.object({
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
    // Authenticate the request - require admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
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
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const { data: isAdmin, error: roleError } = await supabaseClient.rpc('is_admin', { _user_id: user.id });
    if (roleError || !isAdmin) {
      console.error('Admin check failed:', roleError?.message || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const rawBody = await req.json();
    const parseResult = extractFansSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error('Validation failed:', parseResult.error.errors);
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

    console.log(`Scanning for fan installations for user ${user.id}...`);

    // Format work items with quantities for accurate counting
    const workItemsText = (workItems || []).map((item: any) => {
      const qty = item.qty || 1;
      const desc = item.description || '';
      return `[QTY: ${qty}] ${desc}`;
    }).join('\n');

    const combinedText = [
      description || '',
      workItemsText
    ].filter(Boolean).join('\n\nWORK ITEMS:\n');

    const systemPrompt = `You are an expert at identifying and counting ventilation fans in UK property maintenance job descriptions.

YOUR TASK: Carefully read the entire description and work items to find ALL references to fans that need to be installed, renewed, or repaired.

FAN TYPES TO LOOK FOR (common terms):
- Extractor fan / Extract fan
- Bathroom fan / Bath fan
- Kitchen fan
- Ventilation fan / Vent fan
- Envirovent / EnviroVent (brand name for fan units)
- Condensation control unit / CCU
- Axial fan
- Centrifugal fan
- Mechanical ventilation
- MVH / MVHR (Mechanical Ventilation with Heat Recovery)
- Humidity sensor fan
- Timer fan
- Intermittent fan
- Continuous running fan

WORK DESCRIPTIONS THAT INDICATE FANS:
- "RENEW" or "RENEWAL" of any fan type
- "INSTALL" new fan
- "REPLACE" fan
- "FIT" fan
- "SUPPLY AND FIT" fan
- Terms like "vent", "ventilator", "extraction", "extractor"

COUNTING RULES:
1. Work items are prefixed with [QTY: X] - this is the EXACT quantity to use
2. If a work item says "[QTY: 3] FAN:RENEW" it means 3 fans
3. If no QTY prefix shown, assume quantity = 1
4. Add up ALL fan-related work item quantities
5. Also check the description text for additional fan mentions not in work items

EXAMPLES:
- "[QTY: 2] FAN:RENEW ENVIROVENT" → 2 fans
- "Install bathroom extractor fan" → 1 fan
- "[QTY: 1] RENEW EXTRACT FAN TO KITCHEN" → 1 fan

Return ONLY valid JSON:
{
  "hasFans": true/false,
  "fans": [{"type": "Fan Type", "quantity": <number>, "location": "room if mentioned"}],
  "totalFanCount": <sum of all quantities>
}

If NO fans found: {"hasFans": false, "fans": [], "totalFanCount": 0}`;

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
          { role: 'user', content: `Analyze this job description for fan installations:\n\n${combinedText}` }
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

    console.log('Fan extraction completed for user:', user.id);

    // Clean the response - remove markdown code blocks if present
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

    // Parse the JSON from the response
    let extractedData;
    try {
      extractedData = JSON.parse(cleanedContent);
    } catch (parseError) {
      // Fallback: try to extract JSON object with regex
      const jsonMatch = cleanedContent.match(/\{[\s\S]*?\}(?=\s*$)/);
      if (!jsonMatch) {
        console.error('Failed to parse JSON:', parseError);
        // Return empty result instead of throwing
        extractedData = { hasFans: false, fans: [], totalFanCount: 0 };
      } else {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-fans function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing the request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
