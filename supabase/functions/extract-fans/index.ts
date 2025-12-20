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
    const { description, workItems } = await req.json();
    
    if (!description && (!workItems || workItems.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'Description or work items are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Scanning for fan installations with Lovable AI...');

    const combinedText = [
      description || '',
      ...(workItems || []).map((item: any) => item.description || '')
    ].join('\n');

    const systemPrompt = `You are an expert at identifying fan installation requirements in property maintenance job descriptions.

IMPORTANT: Only extract information that is DIRECTLY related to fans. Do not include any other work items, repairs, or general job information.

Analyze the provided text and identify ONLY mentions of fans that need to be installed. This includes:
- Extractor fans
- Bathroom fans
- Kitchen fans
- Ventilation fans
- Exhaust fans
- Any fan-related work

For each fan found, extract ONLY fan-specific details:
1. The type of fan (e.g., "Bathroom Extractor Fan", "Kitchen Ventilation Fan")
2. The quantity (default to 1 if not specified)
3. The location where the fan should be installed

Do NOT include:
- General job descriptions
- Non-fan related work items
- Customer contact details
- Property details unrelated to fan location

Return the data in this exact JSON format:
{
  "hasFans": true/false,
  "fans": [
    {
      "type": "string (e.g., Bathroom Extractor Fan)",
      "quantity": number,
      "location": "string (e.g., Main Bathroom, Kitchen)"
    }
  ],
  "totalFanCount": number
}

If no fans are mentioned, return:
{
  "hasFans": false,
  "fans": [],
  "totalFanCount": 0
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
          { role: 'user', content: `Analyze this job description for fan installations:\n\n${combinedText}` }
        ],
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

    console.log('Fan extraction completed');
    console.log('Raw response:', content);

    // Parse the JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from AI response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-fans function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
