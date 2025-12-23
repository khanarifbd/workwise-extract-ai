import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const parseCostsSchema = z.object({
  input: z.string().min(1, "Input is required").max(5000, "Input too long"),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const parseResult = parseCostsSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error('Validation failed:', parseResult.error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parseResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { input } = parseResult.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Parsing costs input:', input);

    const systemPrompt = `You are a construction cost extraction specialist. Parse the user's natural language input and extract EACH cost as a SEPARATE item.

CRITICAL RULES:
1. Each distinct cost mentioned becomes a separate item
2. "materials" category: parts, supplies, equipment purchases, consumables, building materials
3. "labour" category: worker time, installation fees, service charges based on time
4. "other" category: disposal, skip hire, permits, travel, accommodation, anything else

CALCULATION RULES:
- Multiple workers × days × rate: "3 workers for 2 days at £180 each" = 3 × 2 × 180 = £1080 (ONE item)
- Hourly rates: "8 hours at £25/hour" = 8 × 25 = £200
- Weekly rates: multiply by 5 days
- "k" suffix: multiply by 1000 (e.g., "2k" = 2000)
- Daily rate: "2 days at £200/day" = 2 × 200 = £400

ALWAYS show your calculation in the description clearly.

EXAMPLES:
Input: "Materials 500, 3 men 2 days at 180 each, skip 200"
Output: {
  "items": [
    { "description": "Materials", "amount": 500, "category": "materials" },
    { "description": "Labour: 3 workers × 2 days × £180", "amount": 1080, "category": "labour" },
    { "description": "Skip hire", "amount": 200, "category": "other" }
  ]
}

Input: "plumber 4hrs at 45/hr, pipe fittings 80, drain cover 25"
Output: {
  "items": [
    { "description": "Plumber: 4hrs × £45/hr", "amount": 180, "category": "labour" },
    { "description": "Pipe fittings", "amount": 80, "category": "materials" },
    { "description": "Drain cover", "amount": 25, "category": "materials" }
  ]
}

Input: "2 electricians 3 days 200 each, cable 150, consumer unit 280, permits 50"
Output: {
  "items": [
    { "description": "Electricians: 2 × 3 days × £200", "amount": 1200, "category": "labour" },
    { "description": "Cable", "amount": 150, "category": "materials" },
    { "description": "Consumer unit", "amount": 280, "category": "materials" },
    { "description": "Permits", "amount": 50, "category": "other" }
  ]
}

Return ONLY a valid JSON object with this exact structure:
{
  "items": [
    { "description": "Clear description with calculation if applicable", "amount": number, "category": "materials|labour|other" }
  ]
}`;

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
          { role: 'user', content: input }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
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
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response:', content);

    // Parse the JSON from the response - handle markdown code blocks
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    const parsed = JSON.parse(jsonStr);
    
    // Validate and normalize items
    let items: Array<{ description: string; amount: number; category: string }> = [];
    
    if (parsed.items && Array.isArray(parsed.items)) {
      items = parsed.items.map((item: any) => ({
        description: String(item.description || 'Item'),
        amount: Math.round(Number(item.amount) || 0),
        category: ['materials', 'labour', 'other'].includes(item.category) ? item.category : 'other'
      }));
    }

    // Also provide legacy format for backwards compatibility
    const costs = {
      materials: items.filter(i => i.category === 'materials').reduce((sum, i) => sum + i.amount, 0),
      labour: items.filter(i => i.category === 'labour').reduce((sum, i) => sum + i.amount, 0),
      other: items.filter(i => i.category === 'other').reduce((sum, i) => sum + i.amount, 0),
      notes: items.map(i => `${i.description}: £${i.amount}`).join(', ')
    };

    console.log('Parsed items:', items);
    console.log('Legacy costs:', costs);

    return new Response(
      JSON.stringify({ success: true, items, costs }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in parse-costs function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
