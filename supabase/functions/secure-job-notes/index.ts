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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SECRET_CODE = Deno.env.get("ADMIN_SECURE_NOTES_CODE") ?? "";

    if (!SECRET_CODE) return json({ error: "Server misconfigured" }, 500);

    // 1) Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // 2) Admin role check via service client (avoids user-side RLS quirks)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    // 3) Parse body
    const body = await req.json().catch(() => ({}));
    const { action, jobId, noteId, noteText } = body ?? {};
    const code = String(body?.code ?? req.headers.get("x-secure-code") ?? "");

    // 4) Verify secret code (constant-time)
    if (!timingSafeEqual(code, SECRET_CODE)) {
      return json({ error: "Invalid access code" }, 403);
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
