
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all team_job_updates with photos
    const { data: updates, error: updErr } = await supabase
      .from("team_job_updates")
      .select("job_id, photos, created_at, team_id")
      .not("photos", "is", null)
      .order("created_at", { ascending: true });

    if (updErr) throw updErr;

    // Filter to only updates with actual photos
    const withPhotos = (updates || []).filter(
      (u: any) => u.photos && u.photos.length > 0
    );

    // Group photos by job_id
    const jobPhotosMap: Record<string, { url: string; created_at: string; team_id: string }[]> = {};
    for (const upd of withPhotos) {
      if (!jobPhotosMap[upd.job_id]) jobPhotosMap[upd.job_id] = [];
      for (const url of upd.photos) {
        jobPhotosMap[upd.job_id].push({
          url,
          created_at: upd.created_at,
          team_id: upd.team_id,
        });
      }
    }

    const jobIds = Object.keys(jobPhotosMap);
    let recoveredCount = 0;
    let jobsUpdated = 0;
    const details: any[] = [];

    // Process in batches of 20
    for (let i = 0; i < jobIds.length; i += 20) {
      const batch = jobIds.slice(i, i + 20);

      const { data: jobs, error: jobErr } = await supabase
        .from("jobs")
        .select("id, job_number, name, attachments")
        .in("id", batch);

      if (jobErr) throw jobErr;

      for (const job of jobs || []) {
        const existing = (job.attachments as any[]) || [];
        const existingUrls = new Set(existing.map((a: any) => a.url));

        const teamPhotos = jobPhotosMap[job.id] || [];
        const missing: any[] = [];

        for (const photo of teamPhotos) {
          if (!existingUrls.has(photo.url)) {
            const pathMatch = photo.url.match(/\/job-attachments\/(.+)$/);
            const path = pathMatch ? pathMatch[1] : undefined;
            const ext = photo.url.split('.').pop()?.toLowerCase() || 'jpg';
            const isVideo = ['mp4', 'mov', 'avi', 'webm'].includes(ext);

            missing.push({
              id: crypto.randomUUID(),
              name: `team_${photo.team_id}_${photo.created_at.replace(/[^0-9]/g, '').slice(0, 14)}_${missing.length}.${ext}`,
              type: isVideo ? 'video' : 'image',
              url: photo.url,
              path: path,
              uploadedAt: photo.created_at,
            });
            existingUrls.add(photo.url);
          }
        }

        if (missing.length > 0) {
          const merged = [...existing, ...missing];
          const { error: updateErr } = await supabase
            .from("jobs")
            .update({ attachments: merged })
            .eq("id", job.id);

          if (updateErr) {
            console.error(`Failed to update job ${job.job_number}:`, updateErr);
          } else {
            recoveredCount += missing.length;
            jobsUpdated++;
            details.push({
              jobNumber: job.job_number,
              name: job.name,
              previousCount: existing.length,
              recoveredPhotos: missing.length,
              newTotal: merged.length,
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobsUpdated,
        totalPhotosRecovered: recoveredCount,
        details,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Recovery error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
