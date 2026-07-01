// Archive editing endpoint
// Allows a PIN-authenticated team to append notes and/or upload photos
// to a job they previously signed off. All edits are append-only and
// recorded in team_job_updates as an audit trail. Previous progress_notes
// are preserved (never overwritten).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ArchiveEditRequest {
  teamId: string;
  jobId: string;
  noteText?: string;
  photos?: string[]; // data: URIs or already-hosted URLs
}

interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  url: string;
  path?: string;
  uploadedAt: string;
  uploadedBy?: string;
  category?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractJobAttachmentPath(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
    return url.replace(/^job-attachments\//, '');
  }

  const match = url.match(/\/job-attachments\/(.+?)(?:\?|$)/);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ArchiveEditRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { teamId, jobId, noteText, photos } = body || ({} as ArchiveEditRequest);
  if (!teamId || !jobId || !UUID_RE.test(jobId)) {
    return new Response(JSON.stringify({ error: "teamId and valid jobId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const trimmedNote = (noteText || "").trim();
  const photoList = Array.isArray(photos) ? photos.filter((p) => typeof p === "string" && p.length > 0) : [];
  if (!trimmedNote && photoList.length === 0) {
    return new Response(JSON.stringify({ error: "Provide a note or at least one photo" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (trimmedNote.length > 5000) {
    return new Response(JSON.stringify({ error: "Note too long (max 5000 chars)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (photoList.length > 20) {
    return new Response(JSON.stringify({ error: "Max 20 photos per edit" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validate team access code
  const { data: teamRow, error: teamErr } = await supabase
    .from("team_access_codes")
    .select("team_id, team_name, is_active")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .maybeSingle();

  if (teamErr || !teamRow) {
    return new Response(JSON.stringify({ error: "Invalid team" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const teamName = teamRow.team_name as string;

  // Verify this team actually signed off on this job (only signed-off jobs are editable)
  const { data: signOff } = await supabase
    .from("team_sign_offs")
    .select("id")
    .eq("job_id", jobId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!signOff) {
    return new Response(JSON.stringify({ error: "You can only edit jobs you signed off" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, progress_notes, attachments, job_number")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const timestamp = new Date().toISOString();

  // Upload base64 photos to storage, collect public URLs
  const uploadedUrls: string[] = [];
  const newAttachments: Attachment[] = [];
  for (let i = 0; i < photoList.length; i++) {
    const item = photoList[i];
    try {
      if (item.startsWith("data:")) {
        const match = item.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) continue;
        const mime = match[1];
        const b64 = match[2];
        const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const safeTeam = teamId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const path = `archive-edits/${safeTeam}/${jobId}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("job-attachments")
          .upload(path, bytes, { contentType: mime, upsert: false });
        if (upErr) {
          console.error("Upload error", upErr);
          continue;
        }
        const { data: pub } = supabase.storage.from("job-attachments").getPublicUrl(path);
        if (pub?.publicUrl) {
          uploadedUrls.push(pub.publicUrl);
          newAttachments.push({
            id: `${Date.now()}-${i}`,
            name: `archive-${jobId}-${i}.${ext}`,
            type: mime.startsWith("video") ? "video" : "image",
            url: pub.publicUrl,
            path,
            uploadedAt: timestamp,
            uploadedBy: teamName,
            category: "archive-edit",
          });
        }
      } else {
        // Already-hosted URL — record as-is
        const path = extractJobAttachmentPath(item);
        uploadedUrls.push(item);
        newAttachments.push({
          id: `${Date.now()}-${i}`,
          name: `archive-${jobId}-${i}`,
          type: "image",
          url: item,
          ...(path ? { path } : {}),
          uploadedAt: timestamp,
          uploadedBy: teamName,
          category: "archive-edit",
        });
      }
    } catch (e) {
      console.error("photo processing failure", e);
    }
  }

  // Append note (preserve previous progress_notes)
  const updates: Record<string, unknown> = { updated_at: timestamp };
  if (trimmedNote) {
    const header = `\n\n--- ARCHIVE EDIT — ${teamName} — ${new Date(timestamp).toLocaleString()} ---\n`;
    updates.progress_notes = (job.progress_notes || "") + header + trimmedNote;
  }
  if (newAttachments.length > 0) {
    const existing = (job.attachments as Attachment[]) || [];
    const existingUrls = new Set(existing.map((a) => a.url));
    const dedup = newAttachments.filter((a) => !existingUrls.has(a.url));
    updates.attachments = [...existing, ...dedup];
  }

  if (Object.keys(updates).length > 1) {
    const { error: updErr } = await supabase.from("jobs").update(updates).eq("id", jobId);
    if (updErr) {
      console.error("Job update failed", updErr);
      return new Response(JSON.stringify({ error: "Failed to save edit" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Audit row
  await supabase.from("team_job_updates").insert({
    job_id: jobId,
    team_id: teamId,
    updated_by: teamName,
    notes: trimmedNote || null,
    photos: uploadedUrls,
    status: "archive_edit",
    synced_at: timestamp,
  });

  return new Response(
    JSON.stringify({
      success: true,
      uploaded: uploadedUrls.length,
      noteSaved: !!trimmedNote,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
