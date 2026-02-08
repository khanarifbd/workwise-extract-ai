import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnhanceNotesRequest {
  text: string;
  userLanguage?: string;
  context?: string; // Optional context about the job
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, userLanguage = 'en', context } = await req.json() as EnhanceNotesRequest;

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'No text provided to enhance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Enhancing notes. Input language: ${userLanguage}, text length: ${text.length}`);

    const systemPrompt = `You are an expert assistant for construction and building trades professionals. Your job is to help workers write clear, professional progress notes and job descriptions.

EXPERTISE AREAS:
- Building and construction work
- Painting and decorating
- Mold and damp treatment
- Drainage systems
- Tiling (floor, wall, bathroom)
- Plastering and rendering
- Carpentry and joinery
- Plumbing
- Electrical work
- Roofing
- General maintenance and repairs

YOUR TASK:
1. The worker may write in ANY language or with poor grammar/spelling
2. Understand what they're trying to communicate
3. Rewrite it as a clear, professional, concise progress note in English
4. Use appropriate trade terminology where relevant
5. Fix all spelling and grammar issues
6. Keep the meaning and important details intact
7. Be concise but complete - use bullet points for multiple items

INPUT CONTEXT:
- The user's preferred language is: ${userLanguage}
- ${context ? `Job context: ${context}` : 'No additional job context provided'}

OUTPUT FORMAT:
- Return ONLY the enhanced English text
- Do not include explanations or meta-commentary
- Use professional but accessible language
- Keep it under 500 words unless the original is longer

EXAMPLES:
Input (Polish): "zrobiliśmy malowanie ścian w salonie, były problemy z wilgocią"
Output: "Completed wall painting in the living room. Encountered moisture issues that required treatment before painting could proceed."

Input (broken English): "fix leak under sink. new pipe install. old one broke rusty. also check taps work good now"
Output: "• Repaired leak under the sink
• Replaced corroded pipe with new installation
• Tested taps - now functioning correctly"

Input (Romanian): "am terminat izolația în mansardă, am folosit lana minerală 150mm"
Output: "Completed loft insulation installation using 150mm mineral wool."`;

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
          { role: 'user', content: `Please enhance the following progress note:\n\n${text}` }
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please contact administrator.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('Failed to enhance notes');
    }

    const data = await response.json();
    const enhancedText = data.choices?.[0]?.message?.content?.trim();

    if (!enhancedText) {
      throw new Error('No enhanced text received from AI');
    }

    console.log(`Successfully enhanced notes. Output length: ${enhancedText.length}`);

    return new Response(
      JSON.stringify({ 
        enhancedText,
        originalText: text,
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Enhance notes error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to enhance notes' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
