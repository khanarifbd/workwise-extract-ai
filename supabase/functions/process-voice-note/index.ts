import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ProcessVoiceNoteRequest {
  audioBase64: string; // Base64 encoded audio data
  teamId: string;
  teamName: string;
  mimeType?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioBase64, teamId, teamName, mimeType = 'audio/webm' } = await req.json() as ProcessVoiceNoteRequest;

    if (!audioBase64 || !teamId || !teamName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: audioBase64, teamId, teamName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Processing voice note from team: ${teamName} (${teamId})`);
    console.log(`Audio data length: ${audioBase64.length} characters`);

    // Step 1: Transcribe the audio using Gemini's multimodal capabilities
    // CRITICAL: This must be WORD-FOR-WORD transcription with ZERO abbreviation or summarization
    const transcriptionPrompt = `You are a court stenographer who must transcribe EVERY SINGLE WORD spoken in this audio recording with 100% accuracy.

ABSOLUTELY CRITICAL - YOU MUST:
1. Write out EVERY word spoken - NO summarization, NO abbreviation, NO paraphrasing
2. Capture ALL names EXACTLY as spoken (e.g., "Mrs Johnson", "Mr Ahmed", "John Smith")
3. Capture ALL addresses COMPLETELY (e.g., "45 Oak Street", "123 High Road, London")  
4. Capture ALL numbers EXACTLY (e.g., "2 plasterers", "3 electricians", "house number 42")
5. Capture ALL quantities and measurements (e.g., "three meters", "two rolls of cable")
6. Include filler words like "um", "uh", "so", "and" - these are part of the speech
7. If the speaker says "Send two plasterers to Mrs Johnson at 45 Oak Street tomorrow morning" 
   - CORRECT: "Send two plasterers to Mrs Johnson at 45 Oak Street tomorrow morning"
   - WRONG: "Send plasterers to address" (this loses critical details!)

DO NOT:
- Summarize or shorten anything
- Skip any names, addresses, or numbers
- Paraphrase what was said
- Abbreviate any words

Output the COMPLETE word-for-word transcription. If parts are unclear, write [inaudible].
No explanations, no formatting, just the raw transcription.`;

    const transcriptionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'user', 
            content: [
              { type: 'text', text: transcriptionPrompt },
              { 
                type: 'image_url', 
                image_url: { 
                  url: `data:${mimeType};base64,${audioBase64}` 
                } 
              }
            ]
          }
        ],
        max_tokens: 2000,
      }),
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error('Transcription error:', transcriptionResponse.status, errorText);
      
      if (transcriptionResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (transcriptionResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please contact administrator.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Failed to transcribe audio');
    }

    const transcriptionData = await transcriptionResponse.json();
    const transcribedText = transcriptionData.choices?.[0]?.message?.content?.trim();

    if (!transcribedText) {
      throw new Error('No transcription received from AI');
    }

    console.log(`Transcribed text: ${transcribedText.substring(0, 100)}...`);

    // Step 2: Enhance, categorize, and extract metadata from the transcription
    // CRITICAL: The enhanced text must preserve ALL details - names, addresses, numbers, quantities
    const enhancePrompt = `You are processing a voice note from an Operations Manager at a construction company.

VERBATIM TRANSCRIPTION:
"${transcribedText}"

YOUR TASK - Format this note professionally while PRESERVING EVERY DETAIL:

RULE 1 - COPY ALL SPECIFIC INFORMATION INTO enhanced_text:
- ALL person names (Mrs Johnson, Mr Ahmed, Karen, etc.) - COPY EXACTLY
- ALL addresses (45 Oak Street, 123 High Road, etc.) - COPY COMPLETELY  
- ALL numbers/quantities (2 plasterers, 3 electricians, house 42) - COPY EXACTLY
- ALL instructions/actions mentioned - COPY FULLY

RULE 2 - DO NOT LOSE ANY INFORMATION:
If transcription says: "Send 2 plasterers to Mrs Johnson at 45 Oak Street tomorrow morning and 3 electricians to Mr Ahmed at 123 High Road"
- CORRECT enhanced_text: "📋 Send 2 plasterers to Mrs Johnson at 45 Oak Street tomorrow morning. Send 3 electricians to Mr Ahmed at 123 High Road."
- WRONG: "Send tradesmen to properties" (LOST: names, quantities, addresses, times!)

RULE 3 - The enhanced_text should be LONGER than a summary, almost as long as the original but formatted cleanly.

Identify:
- urgency: "immediate" (ASAP/urgent), "high" (today/soon), "normal" (standard), "low" (when possible)
- team_association: Look for team names (Indika, Bartek, Shakthi, Abraham, Jess, Alindo, Ramesh, Kumar, Billy, Argen, Leci, Sam, Eleanor, Core, Gupi) or null
- job_number: Any job/reference numbers mentioned, or null
- category: "issue" (problem), "instruction" (task/action), "reminder", "feedback", "general"

Output ONLY valid JSON:
{
  "enhanced_text": "Professionally formatted text with ALL original names, addresses, numbers, and details preserved - add relevant emoji",
  "title": "Short title under 60 chars with emoji",
  "urgency": "immediate|high|normal|low",
  "team_association": "team name or null",
  "job_number": "number or null",
  "category": "issue|instruction|reminder|feedback|general"
}`;

    const enhanceResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert assistant. Always respond with valid JSON only, no markdown code blocks.' },
          { role: 'user', content: enhancePrompt }
        ],
        max_tokens: 1500,
      }),
    });

    if (!enhanceResponse.ok) {
      console.error('Enhancement error:', enhanceResponse.status);
      // Fall back to basic processing
      const basicResult = {
        enhanced_text: transcribedText,
        title: transcribedText.substring(0, 50) + '...',
        urgency: 'normal',
        team_association: null,
        job_number: null,
        category: 'general',
      };
      
      // Save to database
      return await saveNoteToDatabase(basicResult, transcribedText, teamId, teamName);
    }

    const enhanceData = await enhanceResponse.json();
    let enhancedContent = enhanceData.choices?.[0]?.message?.content?.trim();

    // Clean up potential markdown code blocks
    if (enhancedContent?.startsWith('```')) {
      enhancedContent = enhancedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(enhancedContent);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      parsedResult = {
        enhanced_text: transcribedText,
        title: transcribedText.substring(0, 50) + '...',
        urgency: 'normal',
        team_association: null,
        job_number: null,
        category: 'general',
      };
    }

    console.log(`Enhanced result:`, parsedResult);

    // Save to database
    return await saveNoteToDatabase(parsedResult, transcribedText, teamId, teamName);

  } catch (error) {
    console.error('Process voice note error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to process voice note' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function saveNoteToDatabase(
  result: any,
  transcribedText: string,
  teamId: string,
  teamName: string
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Look up job_id if job_number was identified
  let jobId = null;
  if (result.job_number) {
    const { data: jobData } = await supabase
      .from('jobs')
      .select('id')
      .eq('job_number', result.job_number)
      .maybeSingle();
    
    if (jobData) {
      jobId = jobData.id;
    }
  }

  const { data: noteData, error: insertError } = await supabase
    .from('ops_manager_notes')
    .insert({
      created_by: teamId,
      created_by_name: teamName,
      transcribed_text: transcribedText,
      enhanced_text: result.enhanced_text,
      title: result.title,
      urgency: result.urgency || 'normal',
      team_association: result.team_association,
      job_number: result.job_number,
      job_id: jobId,
      category: result.category || 'general',
    })
    .select()
    .single();

  if (insertError) {
    console.error('Database insert error:', insertError);
    throw new Error('Failed to save note to database');
  }

  console.log(`Note saved with ID: ${noteData.id}`);

  return new Response(
    JSON.stringify({
      success: true,
      note: noteData,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
