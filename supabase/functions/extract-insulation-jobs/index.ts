import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema - accepts either PDF text or Excel/spreadsheet data
const extractJobsSchema = z.object({
  documentText: z.string().min(1, "Document text is required").max(200000, "Document too large (max 200KB)"),
  documentType: z.enum(['pdf', 'excel', 'spreadsheet', 'text']).optional().default('pdf'),
  sorCodesContext: z.string().max(50000, "SOR codes context too long").optional(),
});

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
    const parseResult = extractJobsSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error('Validation failed:', parseResult.error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parseResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { documentText, documentType, sorCodesContext } = parseResult.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Processing ${documentType} for insulation jobs extraction for user ${user.id}...`);
    console.log('Document length:', documentText.length);

    const systemPrompt = `You are an expert job data extraction specialist for UK property maintenance and insulation work. Your task is to intelligently analyze documents and extract ALL individual jobs from the content.

CRITICAL: The document may contain ONE job or MULTIPLE separate jobs. You MUST identify each distinct job and extract it separately.

HOW TO IDENTIFY SEPARATE JOBS:
- Different job numbers/reference numbers indicate separate jobs
- Different property addresses indicate separate jobs
- Different customer names with separate addresses indicate separate jobs
- Row-by-row data in spreadsheets/tables where each row is a job
- Clear section breaks or headers like "Job 1", "Order 2", etc.
- Different dates with different addresses/customers

FOR EACH JOB IDENTIFIED, EXTRACT:
1. jobNumber: Job reference number, order number, works order number (look for patterns like WO123456, JOB-001, REF:12345, etc.)
2. name: Customer/tenant name
3. address: Full property address including postcode
4. phoneNumber: Contact phone number (mobile or landline)
5. description: Full description of works required
6. workItems: Array of individual work items with:
   - description: Work item description
   - sorCode: SOR code if identifiable from: ${sorCodesContext || 'N/A'}
   - qty: Quantity (default 1)
   - cost: Cost if mentioned (default 0)
7. insulationInfo: Array of insulation units found:
   - type: Type of insulation (Loft, Cavity Wall, EWI, Pipe Lagging, etc.)
   - quantity: Number of units
   - location: Room/area if mentioned
   - thickness: Depth/thickness if mentioned (e.g., "100mm", "270mm")
   - material: Material type if mentioned (mineral wool, PIR, etc.)

INSULATION TYPES TO RECOGNIZE:
- Loft insulation / Roof insulation / Attic insulation
- Cavity wall insulation / CWI
- External wall insulation / EWI
- Internal wall insulation / IWI
- Floor insulation / Underfloor insulation
- Pipe insulation / Pipe lagging / Tank jacket
- Draught proofing
- Any other thermal insulation

DOCUMENT TYPE HANDLING:
- PDF: Look for structured sections, headers, and formatted data
- Excel/Spreadsheet: Treat each row as potentially a separate job, columns as fields
- Text lists: Parse line by line, identify patterns

Return ONLY valid JSON in this exact format:
{
  "jobCount": <number of jobs found>,
  "jobs": [
    {
      "jobNumber": "string",
      "name": "string",
      "address": "string",
      "phoneNumber": "string",
      "description": "string",
      "workItems": [
        {"description": "string", "sorCode": "string", "qty": 1, "cost": 0}
      ],
      "insulationInfo": [
        {"type": "string", "quantity": 1, "location": "string", "thickness": "string", "material": "string"}
      ]
    }
  ]
}

RULES:
- If a field is not found, use empty string "" or empty array []
- Always return an array of jobs, even if only 1 job is found
- Be thorough - extract ALL jobs from the document
- For spreadsheets, each populated row typically represents one job
- Preserve exact job numbers as written in the document
- Include ALL details mentioned, don't summarize`;

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
          { role: 'user', content: `Analyze this ${documentType} document and extract ALL insulation jobs:\n\n${documentText}` }
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

    console.log('Job extraction completed for user:', user.id);

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
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('Failed to parse JSON:', parseError);
        extractedData = { jobCount: 0, jobs: [] };
      } else {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    }

    // Ensure jobs array exists and has proper structure
    if (!extractedData.jobs) {
      extractedData.jobs = [];
    }
    if (typeof extractedData.jobCount !== 'number') {
      extractedData.jobCount = extractedData.jobs.length;
    }

    // Ensure each job has required fields
    extractedData.jobs = extractedData.jobs.map((job: any, index: number) => ({
      jobNumber: job.jobNumber || `INS-${Date.now()}-${index + 1}`,
      name: job.name || '',
      address: job.address || '',
      phoneNumber: job.phoneNumber || '',
      description: job.description || '',
      workItems: Array.isArray(job.workItems) ? job.workItems.map((item: any) => ({
        id: crypto.randomUUID(),
        description: item.description || '',
        sorCode: item.sorCode || '',
        qty: item.qty || 1,
        cost: item.cost || 0,
        completed: false
      })) : [],
      insulationInfo: Array.isArray(job.insulationInfo) ? job.insulationInfo : []
    }));

    console.log(`Extracted ${extractedData.jobCount} jobs from document`);

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-insulation-jobs function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing the request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
