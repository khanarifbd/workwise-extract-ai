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
    const { pdfText, sorCodesContext } = await req.json();
    
    if (!pdfText) {
      return new Response(
        JSON.stringify({ error: 'PDF text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    if (!DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    console.log('Processing PDF text with DeepSeek AI...');
    console.log('Text length:', pdfText.length);

    const systemPrompt = `You are a job extraction specialist. Extract the following information from the provided text:
- NAME: The customer/client name
- ADDRESS: The full property address
- PHONE: Phone number
- JOB_NUMBER: Any job reference number or order number
- DESCRIPTION: The full detailed description of works required
- WORK_ITEMS: A list of individual work items with descriptions

For each work item, try to match it with the most appropriate SOR code from this database:
${sorCodesContext}

Return the data in this exact JSON format:
{
  "name": "string",
  "address": "string", 
  "phoneNumber": "string",
  "jobNumber": "string",
  "description": "string",
  "workItems": [
    {
      "description": "string",
      "sorCode": "string (from the SOR database)",
      "qty": 1,
      "cost": 0
    }
  ]
}

Be precise and extract all relevant information. If a field is not found, use an empty string or empty array as appropriate.`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract job information from this document:\n\n${pdfText}` }
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402 || response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'API authentication failed. Please check your DeepSeek API key.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in DeepSeek response');
    }

    console.log('DeepSeek extraction completed');
    console.log('Raw response preview:', content.substring(0, 300));

    // Parse the JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from DeepSeek response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-pdf function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
