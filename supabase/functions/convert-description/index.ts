import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, sorCodesContext } = await req.json();
    
    if (!description) {
      return new Response(
        JSON.stringify({ error: 'Description is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Converting description to work items with multiple SOR options...');

    const systemPrompt = `You are a construction work analysis specialist. Convert the provided description into a precise list of individual work items.

For each work item, provide THREE suitable SOR (Schedule of Rates) codes from this database:
${sorCodesContext}

Return ONLY a JSON array in this exact format:
[
  {
    "description": "Clear, precise description of the work item",
    "options": [
      { "code": "Primary SOR code - best match", "cost": estimated_cost_number },
      { "code": "Secondary SOR code - alternative match", "cost": estimated_cost_number },
      { "code": "Premium SOR code - higher specification/more comprehensive work", "cost": higher_cost_number, "isPremium": true }
    ],
    "qty": 1
  }
]

Guidelines:
- Break down complex descriptions into individual actionable work items
- Use clear, professional construction terminology
- Option 1: Best matching code for the described work
- Option 2: Alternative suitable code (different approach or scope)
- Option 3: Premium option with higher cost - more comprehensive work, higher spec materials, or additional related work included
- The premium option should be 20-50% more expensive and represent a realistic upgrade
- Costs should be realistic UK construction rates in GBP
- Be thorough but avoid duplicates`;

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
          { role: 'user', content: `Convert this description into work items with multiple SOR code options:\n\n${description}` }
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

    console.log('AI conversion completed');

    // Parse the JSON array from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from AI response');
    }

    const workItems = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({ success: true, workItems }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in convert-description function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
