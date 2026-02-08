import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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

    const systemPrompt = `You are an expert job data extraction specialist for UK property maintenance and insulation work. Your task is to THOROUGHLY and ACCURATELY analyze documents and extract ALL individual jobs from the content.

CRITICAL ACCURACY REQUIREMENTS:
1. READ EVERY SINGLE ROW/ENTRY in the document - do not skip any data
2. Extract EXACT values as written - do not modify or summarize
3. Map data to the CORRECT fields based on column headers or context
4. Preserve ALL information - if unsure where data belongs, include it in description

HOW TO IDENTIFY SEPARATE JOBS:
- Different job numbers/reference numbers indicate separate jobs
- Different property addresses indicate separate jobs (MOST RELIABLE identifier)
- Different customer/tenant names with separate addresses
- Row-by-row data in spreadsheets where each row represents a property
- Section breaks or numbered entries

=== MANDATORY FIELD MAPPING RULES (ALWAYS APPLY) ===

1. jobNumber: Job/Order/Works/Reference number (patterns: WO123456, JOB-001, REF:12345, ORD-XXX)
   - If no job number found, use format "INS-[first 4 chars of postcode]-[row number]"

2. name: Customer/Tenant name (look for: Name, Tenant, Customer, Occupant columns)

3. address: COMPLETE property address WITH postcode (most critical field for matching)
   - Include house number, street, town/city, postcode
   - UK postcodes follow patterns like: SW1A 1AA, M1 1AA, B1 1AA

4. phoneNumber: Contact number (mobile: 07xxx, landline: 01xxx, 02xxx)
   - Extract from Phone/Tel/Contact/Mobile columns

5. team: CRITICAL - Look for "Team" column in spreadsheet
   - Team member names found in "Team" column MUST populate this field
   - This maps to the "Assigned" column in the database
   - Examples: "John", "Sarah Team", "Installation Crew A"

6. status: Look for "Action" or "Contact" columns
   - Contact details and action items should populate this field
   - Examples: "Call back", "Awaiting response", "Scheduled"

7. description: MUST include ALL of the following data types when present:
   - "To be collected" information - include verbatim
   - "Loft rubbish" data - include any loft rubbish notes/details
   - "Issue" column data - include all issue information
   - "Vent" column data - include all vent-related information
   - "Tenants contact details" - include tenant phone/email/notes
   - "Type" column data - include the type classification
   - Format each as: "[Category]: [Value]" for clarity
   - Example: "To be collected: 3 bags | Loft rubbish: Yes, needs clearing | Issue: Access restricted | Type: Standard install"

8. privateNotes: For sensitive/important data requiring admin attention:
   - "EPC bookings" data - include EPC booking dates/references/status
   - Format: "EPC Booking: [date/reference/details]"

INSULATION DATA - Extract with full detail:
9. insulationInfo: For EACH insulation item found:
   - type: Exact insulation type (Loft Insulation, Cavity Wall Insulation, EWI, Pipe Lagging, etc.)
   - quantity: Number of units/areas (default 1)
   - location: Specific room/area (bedroom 1, hallway, loft hatch area, etc.)
   - thickness: Depth in mm (100mm, 200mm, 270mm, 300mm)
   - material: Material type (Mineral Wool, Glass Wool, PIR Board, Rockwool, etc.)

10. workItems: Individual work tasks with SOR codes if identifiable from: ${sorCodesContext || 'N/A'}

SPREADSHEET/EXCEL COLUMN MAPPING (CRITICAL):
- Each row with a valid address = one separate job
- Column headers tell you what each field contains - map accordingly:
  * Address/Property/Location -> address
  * Name/Tenant/Customer -> name
  * Phone/Tel/Contact/Mobile -> phoneNumber
  * Ref/Reference/Job No/WO -> jobNumber
  * Team/Assigned/Installer -> team (MAPS TO ASSIGNED COLUMN)
  * Action/Contact/Status -> status
  * To be collected -> description (prefix with "To be collected:")
  * Loft rubbish/Rubbish -> description (prefix with "Loft rubbish:")
  * Issue/Issues/Problems -> description (prefix with "Issue:")
  * Vent/Vents/Ventilation -> description (prefix with "Vent:")
  * Type/Job Type/Work Type -> description (prefix with "Type:")
  * Tenant Contact/Tenant Phone -> description (prefix with "Tenant contact:")
  * EPC/EPC Booking/EPC Date -> privateNotes (prefix with "EPC Booking:")
  * Notes/Comments/Description/Works -> description
  * Type/Insulation Type -> insulationInfo.type
  * Depth/Thickness/mm -> insulationInfo.thickness
  * Qty/Quantity/Amount -> insulationInfo.quantity

UNMAPPED DATA HANDLING:
- Any data that doesn't fit a specific field goes into description
- Format: "[Column Name]: [Value]"
- Include dates, statuses, additional references in description

Return ONLY valid JSON:
{
  "jobCount": <exact number of jobs extracted>,
  "jobs": [
    {
      "jobNumber": "string",
      "name": "string",
      "address": "string (MUST include postcode if available)",
      "phoneNumber": "string",
      "team": "string (from Team column - maps to Assigned)",
      "status": "string (from Action/Contact columns)",
      "description": "string (To be collected, Loft rubbish, Issue, Vent, Type, Tenant contact - all combined)",
      "privateNotes": "string (EPC bookings and sensitive data)",
      "workItems": [{"description": "string", "sorCode": "string", "qty": 1, "cost": 0}],
      "insulationInfo": [{"type": "string", "quantity": 1, "location": "string", "thickness": "string", "material": "string"}]
    }
  ]
}

VALIDATION RULES:
- Empty fields = "" or []
- Always return jobs array even for single job
- jobCount MUST match actual jobs array length
- Every row with valid address = separate job entry
- DO NOT merge or combine rows with different addresses
- Team column data MUST go to team field (for Assigned column)
- Contact/Action data MUST go to status field
- To be collected, Loft rubbish, Issue, Vent, Type, Tenant contact MUST go to description
- EPC bookings MUST go to privateNotes`;

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

    // Ensure each job has required fields including new mapping fields
    extractedData.jobs = extractedData.jobs.map((job: any, index: number) => ({
      jobNumber: job.jobNumber || `INS-${Date.now()}-${index + 1}`,
      name: job.name || '',
      address: job.address || '',
      phoneNumber: job.phoneNumber || '',
      team: job.team || '', // From Team column -> Assigned
      status: job.status || '', // From Action/Contact columns
      description: job.description || '', // To be collected, Loft rubbish, Issue, Vent, Type, Tenant contact
      privateNotes: job.privateNotes || '', // EPC bookings and sensitive data
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
