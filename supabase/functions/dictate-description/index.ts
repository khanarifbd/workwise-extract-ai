import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReqBody {
  // mode A: transcribe a fresh recording
  audioBase64?: string;
  mimeType?: string;
  // mode B: refine using clarification answers
  draftText?: string;
  clarifications?: { question: string; answer: string }[];
  // shared context
  existingText?: string;
  appendMode?: boolean;
  jobContext?: string;
  fieldType?: "description" | "notes";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body: ReqBody = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const fieldLabel = body.fieldType === "notes" ? "progress note" : "job description";

    let mergedDraft = body.draftText || "";

    // ---- MODE A: transcribe audio ----
    if (body.audioBase64) {
      const transcribePrompt = `You are a forensic transcriber for a UK construction/housing-repairs operative.

TASK:
1. Transcribe the audio WORD-FOR-WORD, exactly as spoken.
2. If the speaker uses a non-English language (Polish, Romanian, Spanish, Portuguese, Tamil, Sinhala, Hindi, Russian, Bulgarian, Italian, French etc.) translate the FINAL output into clear, natural British English while keeping every detail (names, addresses, materials, quantities, room names, measurements, timescales).
3. Do NOT summarise. Do NOT skip any details. Preserve numbers, units (mm, m, m², litres), trade terms.
4. Write it as a clean ${fieldLabel} suitable for a job sheet — full sentences, proper punctuation, no filler ("um", "erm", "you know").

Return STRICT JSON only:
{"transcript": "...english transcript here...", "detectedLanguage": "english|polish|...", "confidence": 0.0-1.0}`;

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: transcribePrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${body.mimeType || "audio/webm"};base64,${body.audioBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      });
      if (!r.ok) {
        if (r.status === 429)
          return jsonResp({ error: "Rate limited, try again shortly." }, 429);
        if (r.status === 402) return jsonResp({ error: "AI credits exhausted." }, 402);
        throw new Error("Transcription failed");
      }
      const tdata = await r.json();
      let raw = tdata.choices?.[0]?.message?.content?.trim() || "";
      raw = raw.replace(/^```(?:json)?\n?/i, "").replace(/```$/i, "").trim();
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { transcript: raw, detectedLanguage: "unknown", confidence: 0.5 };
      }
      mergedDraft = parsed.transcript || "";
    }

    // Apply append vs replace using existing text
    let workingText = mergedDraft.trim();
    if (body.appendMode && body.existingText && body.existingText.trim()) {
      workingText = `${body.existingText.trim()}\n\n${workingText}`.trim();
    }

    // ---- MODE B/refinement: clean + ask clarifications ----
    const clarificationContext =
      body.clarifications && body.clarifications.length
        ? `\n\nThe operative previously answered clarification questions — incorporate these answers seamlessly:\n${body.clarifications
            .map((c, i) => `Q${i + 1}: ${c.question}\nA${i + 1}: ${c.answer}`)
            .join("\n")}`
        : "";

    const refinePrompt = `You polish a UK ${fieldLabel} written/dictated by a site operative.

CURRENT DRAFT:
"""${workingText}"""
${body.jobContext ? `\nJOB CONTEXT: ${body.jobContext}` : ""}${clarificationContext}

YOUR TASK:
1. Produce the cleanest, most professional British-English version of this ${fieldLabel}, preserving EVERY detail (names, rooms, materials, sizes, quantities, dates, timescales). NEVER summarise away content.
2. Identify up to 3 specific words/phrases that are AMBIGUOUS, MISHEARD, or NEED CLARIFICATION (technical term unclear, garbled name, vague measurement, unclear location). Only ask if genuinely ambiguous — if the text is clear, return an empty array.

Return STRICT JSON only, no code fences:
{
  "finalText": "the polished ${fieldLabel}",
  "questions": [
    { "id": "q1", "phrase": "the exact word/phrase from the draft", "question": "Plain-English question to ask the operative" }
  ]
}`;

    const r2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Reply with valid JSON only. No markdown fences." },
          { role: "user", content: refinePrompt },
        ],
      }),
    });

    if (!r2.ok) {
      if (r2.status === 429) return jsonResp({ error: "Rate limited, try again shortly." }, 429);
      if (r2.status === 402) return jsonResp({ error: "AI credits exhausted." }, 402);
      // Fallback: return draft only
      return jsonResp({ finalText: workingText, questions: [] });
    }
    const rdata = await r2.json();
    let rraw = rdata.choices?.[0]?.message?.content?.trim() || "";
    rraw = rraw.replace(/^```(?:json)?\n?/i, "").replace(/```$/i, "").trim();
    let parsed: any = { finalText: workingText, questions: [] };
    try {
      parsed = JSON.parse(rraw);
    } catch (e) {
      console.error("refine parse error", e, rraw);
    }
    if (!parsed.finalText) parsed.finalText = workingText;
    if (!Array.isArray(parsed.questions)) parsed.questions = [];
    return jsonResp(parsed);
  } catch (e) {
    console.error("dictate-description error", e);
    return jsonResp({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

function jsonResp(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
