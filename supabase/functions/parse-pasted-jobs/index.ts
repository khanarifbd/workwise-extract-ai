import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const bodySchema = z.object({
  text: z.string().min(5).max(50000),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: isAdmin } = await supabaseClient.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const systemPrompt = `You are a precise job-data extractor for a UK property maintenance company (A&A).
The user pastes free-form text that contains ONE OR MORE distinct jobs, often numbered (1., 2., 3.) or separated by blank lines.

Extract every distinct job and return STRICTLY a JSON object of shape:
{ "jobs": [ { "jobNumber": string, "name": string, "phoneNumber": string, "address": string, "description": string } ] }

Rules:
- jobNumber: NPH job number, usually starts with "N" followed by digits (e.g. N2644072). If absent, use empty string "".
- name: Tenant name (e.g. "Mr Dickinson", "Miss McGuire"). Strip trailing punctuation.
- phoneNumber: UK mobile/landline if present, digits/spaces only (e.g. "07495413969"). Empty string if absent.
- address: Tenant property address. CRITICAL — strip any leading "A&A" or "A&A " prefix. Trim whitespace and trailing punctuation. Empty string if absent.
- description: The full works description for that specific job, cleaned up (preserve newlines as needed). Do NOT include the tenant name, phone, address, or job number in the description.
- Return ONLY the JSON object — no markdown, no commentary.
- If a single job spans multiple paragraphs, keep them together in description.
- Order jobs as they appear in the source.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract jobs from this pasted text:\n\n${parsed.data.text}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (response.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const txt = await response.text();
      console.error('AI gateway error', response.status, txt);
      throw new Error(`AI gateway error ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    let jobs: any[] = [];
    try {
      const obj = JSON.parse(content);
      jobs = Array.isArray(obj?.jobs) ? obj.jobs : [];
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { jobs = JSON.parse(match[0])?.jobs ?? []; } catch { /* ignore */ }
      }
    }

    // Sanitize / strip A&A prefix as belt-and-braces
    jobs = jobs.map((j: any) => ({
      jobNumber: String(j.jobNumber ?? '').trim(),
      name: String(j.name ?? '').trim().replace(/[.,;:\s]+$/, ''),
      phoneNumber: String(j.phoneNumber ?? '').trim(),
      address: String(j.address ?? '').trim().replace(/^A&A[\s,]*/i, '').replace(/[.,;:\s]+$/, '').trim(),
      description: String(j.description ?? '').trim(),
    }));

    return new Response(JSON.stringify({ success: true, jobs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('parse-pasted-jobs error', err);
    return new Response(JSON.stringify({ error: 'Failed to parse pasted jobs' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
