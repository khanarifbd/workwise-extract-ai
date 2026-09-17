// Secure Admin Notes edge function
// - Requires an authenticated admin user
// - Requires the 5-digit ADMIN_SECURE_NOTES_CODE on every request
// - Uses the service role client to bypass RLS (table has USING(false))
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-secure-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Constant-time string compare to avoid timing side-channels on the code.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Env code is only a fallback now — the live code lives in the database so
    // it can never drift, pick up whitespace, or be lost.
    const SECRET_CODE = (Deno.env.get("ADMIN_SECURE_NOTES_CODE") ?? "").trim();

    // 1) Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "You are signed out. Please sign in again and retry." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Your session has expired. Please sign in again." }, 401);
    }
    const userId = userData.user.id;

    // 2) Admin role check via service client (avoids user-side RLS quirks)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) {
      console.error("secure-job-notes: role lookup failed", roleErr.message);
      return json({ error: `Could not check your access rights: ${roleErr.message}` }, 500);
    }
    if (!roleRow) {
      return json(
        { error: `This account (${userData.user.email ?? userId}) does not have admin access to secure notes.` },
        403,
      );
    }

    // 3) Parse body
    const body = await req.json().catch(() => ({}));
    const { action, jobId, noteId, noteText, newCode } = body ?? {};
    const code = String(body?.code ?? req.headers.get("x-secure-code") ?? "").trim();

    // 4) Verify access code against the stored hash (env value is a fallback)
    const { data: accessRow } = await admin
      .from("admin_secure_access")
      .select("code_hash")
      .eq("id", true)
      .maybeSingle();

    let codeOk = false;
    if (accessRow?.code_hash) {
      codeOk = timingSafeEqual(await sha256Hex(code), String(accessRow.code_hash).trim());
    } else if (SECRET_CODE) {
      codeOk = timingSafeEqual(code, SECRET_CODE);
    } else {
      return json({ error: "Secure notes code is not configured. Ask an admin to set it." }, 500);
    }

    if (!codeOk) {
      console.log(`secure-job-notes: code rejected (entered length ${code.length})`);
      // A wrong code is an expected validation result, not a function failure.
      // Returning it as structured data prevents clients/runtime monitors from
      // replacing the notes dialog with a fatal Edge Function error screen.
      return json({ ok: false, error: "Invalid access code", errorCode: "INVALID_ACCESS_CODE" });
    }

    // Admins can rotate the code once they are inside.
    if (action === "set_code") {
      const next = String(newCode ?? "").trim();
      if (!/^\d{5}$/.test(next)) return json({ error: "New code must be exactly 5 digits" }, 400);
      const { error: upErr } = await admin
        .from("admin_secure_access")
        .upsert({ id: true, code_hash: await sha256Hex(next), updated_at: new Date().toISOString(), updated_by: userId });
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true });
    }



    // Author display name (best effort)
    let authorName: string | null = userData.user.email ?? null;
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.display_name) authorName = profile.display_name;

    switch (action) {
      case "verify":
        return json({ ok: true });

      case "list": {
        if (!jobId) return json({ error: "jobId required" }, 400);
        const { data, error } = await admin
          .from("job_admin_secure_notes")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json({ notes: data ?? [] });
      }

      case "create": {
        if (!jobId || !noteText?.trim()) return json({ error: "jobId + noteText required" }, 400);
        if (noteText.length > 10000) return json({ error: "Note too long (10k max)" }, 400);
        const { data, error } = await admin
          .from("job_admin_secure_notes")
          .insert({
            job_id: jobId,
            note_text: noteText.trim(),
            author_name: authorName,
            author_user_id: userId,
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ note: data });
      }

      case "update": {
        if (!noteId || !noteText?.trim()) return json({ error: "noteId + noteText required" }, 400);
        if (noteText.length > 10000) return json({ error: "Note too long (10k max)" }, 400);
        const { data, error } = await admin
          .from("job_admin_secure_notes")
          .update({ note_text: noteText.trim() })
          .eq("id", noteId)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ note: data });
      }

      case "delete": {
        if (!noteId) return json({ error: "noteId required" }, 400);
        const { error } = await admin
          .from("job_admin_secure_notes")
          .delete()
          .eq("id", noteId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("secure-job-notes error", e);
    return json({ error: (e as Error).message ?? "Server error" }, 500);
  }
});
