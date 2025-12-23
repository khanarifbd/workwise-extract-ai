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

    const systemPrompt = `You are a construction cost extraction specialist. Parse the user's natural language input and extract costs into three categories: materials, labour, and other.

CRITICAL RULES:
1. "Materials" includes: parts, supplies, equipment purchases, consumables, building materials
2. "Labour" includes: worker time, installation fees, service charges based on time
3. "Other" includes: disposal, skip hire, permits, travel, accommodation, anything else

CALCULATION RULES:
- If user mentions "days" or daily rates, calculate: days × rate (e.g., "2 days at £200/day" = £400)
- If user mentions "hours" or hourly rates, calculate: hours × rate (e.g., "8 hours at £25/hour" = £200)
- If user mentions "weeks", calculate: weeks × 5 days × daily rate
- Extract ALL numeric values mentioned with £ or "pounds"
- If a number has "k" suffix, multiply by 1000 (e.g., "2k" = 2000)

EXAMPLES:
Input: "Materials about £500, labour 2 days at £200 per day, skip hire £150"
Output: {"materials": 500, "labour": 400, "other": 150, "notes": "Materials: £500, Labour: 2 days × £200 = £400, Skip hire: £150"}

Input: "parts 1.2k, 3 men for 2 days at 180 each per day, disposal 200"
Output: {"materials": 1200, "labour": 1080, "other": 200, "notes": "Parts: £1,200, Labour: 3 workers × 2 days × £180 = £1,080, Disposal: £200"}

Input: "total job cost around 2500, mostly labour"
Output: {"materials": 500, "labour": 1750, "other": 250, "notes": "Estimated split of £2,500: Materials ~20%, Labour ~70%, Other ~10%"}

Return ONLY a valid JSON object with this exact structure:
{
  "materials": number,
  "labour": number,
  "other": number,
  "notes": "Brief breakdown of calculations"
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

    const costs = JSON.parse(jsonStr);
    
    // Ensure all values are numbers
    const result = {
      materials: Number(costs.materials) || 0,
      labour: Number(costs.labour) || 0,
      other: Number(costs.other) || 0,
      notes: String(costs.notes || '')
    };

    console.log('Parsed costs:', result);

    return new Response(
      JSON.stringify({ success: true, costs: result }),
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
