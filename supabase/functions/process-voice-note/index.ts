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
    const transcriptionPrompt = `You are a professional transcription assistant. Please transcribe the following audio recording VERBATIM and COMPLETELY. 
The audio is from an Operations Manager in a construction/building trades company.

CRITICAL REQUIREMENTS:
- Transcribe EVERY word spoken, do not summarize or abbreviate
- Include ALL names of people, places, addresses, and numbers exactly as spoken
- Include ALL quantities, measurements, and specific details
- Preserve natural speech patterns and pauses
- If numbers are spoken (like tradesman counts, addresses, job numbers), write them out

Output the COMPLETE raw transcription text, nothing else. No explanations, no formatting.
If you cannot understand parts of the audio, indicate with [inaudible].`;

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
    const enhancePrompt = `You are an expert assistant for a construction/building trades Operations Manager.
Analyze the following voice note transcription and provide structured output.

TRANSCRIPTION:
"${transcribedText}"

Your task:
1. PRESERVE ALL DETAILS from the transcription - do NOT over-summarize
   - Keep ALL names (people, addresses, locations) exactly as mentioned
   - Keep ALL numbers (quantities, tradesman counts, job numbers, house numbers)
   - Keep ALL specific instructions or actions mentioned
   - Format professionally but retain FULL information content
2. Generate a concise title (max 60 chars) that captures the main action
3. Determine urgency level: "immediate", "high", "normal", or "low"
4. Identify team association if mentioned (look for names like Indika, Bartek, Shakhti, Abraham, Jess, Alindo, Ramesh, Kumar, Billy, Argen, Leci, Sam, Eleanor, Mrs)
5. Identify job number if mentioned (format: numbers like 12345)
6. Categorize: "issue", "instruction", "reminder", "feedback", or "general"
7. Add appropriate emoji symbols that convey urgency/emotion

CRITICAL: The enhanced_text MUST include ALL specific details from the transcription:
- Every person name mentioned
- Every address or location mentioned  
- Every quantity or number mentioned
- Every specific instruction or action required

Example - if transcription says "Send 2 plasterers to Mrs Johnson at 45 Oak Street":
- Good: "📋 Send 2 plasterers to Mrs Johnson at 45 Oak Street"
- Bad: "Send plasterers to property" (missing details!)

Output ONLY valid JSON in this exact format:
{
  "enhanced_text": "The cleaned up, professional version retaining ALL names, addresses, quantities and details with relevant emoji",
  "title": "Concise title with emoji",
  "urgency": "immediate|high|normal|low",
  "team_association": "team name or null",
  "job_number": "job number or null",
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
