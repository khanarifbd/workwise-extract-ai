import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const bodySchema = z.object({
  bookId: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, service);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: isAdmin } = await userClient.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { bookId } = parsed.data;

    const { data: book, error: bookErr } = await admin.from('sor_code_books').select('*').eq('id', bookId).single();
    if (bookErr || !book) return new Response(JSON.stringify({ error: 'Book not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    await admin.from('sor_code_books').update({ status: 'processing', error_message: null }).eq('id', bookId);

    // Download PDF
    const { data: file, error: dlErr } = await admin.storage.from('sor-code-books').download(book.file_path);
    if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message}`);
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
    const base64 = btoa(binary);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const systemPrompt = `You are a precise SOR (Schedule of Rates) code extraction specialist for UK social housing.
Extract EVERY SOR code line item from the attached NPH-approved rate schedule PDF.

Return STRICTLY a JSON object: { "codes": [ { "code": string, "description": string, "category": string, "cost": number, "unit": string, "keywords": string[] } ] }

Rules:
- code: the exact SOR code as written (e.g. "0301AA", "P-12-345"). Preserve case and punctuation.
- description: complete works description for the line item.
- category: trade/section heading the code belongs to (e.g. Plumbing, Roofing, Electrical).
- cost: numeric GBP value (no currency symbol). If a rate has multiple values (each/per m2), use the per-unit rate.
- unit: "each", "m2", "m", "hour", "item" etc.
- keywords: 4-8 lowercase keywords useful for matching tenant descriptions to this code.
- Extract ALL codes from ALL pages. Do not summarise or omit.
- Return ONLY the JSON object.`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: 'Extract all SOR codes from this rate schedule PDF.' },
            { type: 'file', file: { filename: book.file_name, file_data: `data:application/pdf;base64,${base64}` } },
          ]},
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${txt.slice(0, 200)}`);
    }
    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content ?? '';

    let codes: any[] = [];
    try {
      const obj = JSON.parse(content);
      codes = Array.isArray(obj?.codes) ? obj.codes : [];
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { codes = JSON.parse(m[0])?.codes ?? []; } catch {} }
    }

    // Clear existing entries for this book and insert fresh
    await admin.from('sor_code_entries').delete().eq('book_id', bookId);
    const rows = codes.filter((c: any) => c?.code && c?.description).map((c: any) => ({
      book_id: bookId,
      code: String(c.code).trim().slice(0, 64),
      description: String(c.description).trim().slice(0, 1000),
      category: c.category ? String(c.category).trim().slice(0, 100) : null,
      cost: Number.isFinite(Number(c.cost)) ? Number(c.cost) : 0,
      unit: c.unit ? String(c.unit).trim().slice(0, 32) : null,
      keywords: Array.isArray(c.keywords) ? c.keywords.map((k: any) => String(k).toLowerCase().slice(0, 40)).slice(0, 12) : [],
    }));

    if (rows.length > 0) {
      // Insert in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        const { error: insErr } = await admin.from('sor_code_entries').insert(rows.slice(i, i + 500));
        if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
      }
    }

    await admin.from('sor_code_books').update({ status: 'ready', code_count: rows.length, error_message: null }).eq('id', bookId);

    return new Response(JSON.stringify({ success: true, codeCount: rows.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('extract-sor-codes error', err);
    try {
      const body = await req.clone().json();
      if (body?.bookId) {
        const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await admin.from('sor_code_books').update({ status: 'error', error_message: String(err?.message || err).slice(0, 500) }).eq('id', body.bookId);
      }
    } catch {}
    return new Response(JSON.stringify({ error: String(err?.message || 'Failed') }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
