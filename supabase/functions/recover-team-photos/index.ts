
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

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "recover";

    if (mode === "audit") {
      // FULL STORAGE AUDIT: List all files in job-attachments bucket
      // and cross-reference with jobs.attachments metadata
      const allStorageFiles: { name: string; created_at: string }[] = [];
      let offset = 0;
      const limit = 1000;

      while (true) {
        const { data: files, error } = await supabase.storage
          .from("job-attachments")
          .list("", { limit, offset, sortBy: { column: "created_at", order: "asc" } });

        if (error) throw error;
        if (!files || files.length === 0) break;

        // Also check subdirectories
        for (const file of files) {
          if (file.id) {
            // It's a file
            allStorageFiles.push({ name: file.name, created_at: file.created_at || "" });
          } else {
            // It's a folder - list its contents
            const { data: subFiles } = await supabase.storage
              .from("job-attachments")
              .list(file.name, { limit: 1000 });
            if (subFiles) {
              for (const sf of subFiles) {
                if (sf.id) {
                  allStorageFiles.push({
                    name: `${file.name}/${sf.name}`,
                    created_at: sf.created_at || "",
                  });
                }
              }
            }
          }
        }

        if (files.length < limit) break;
        offset += limit;
      }

      // Get all job attachment URLs
      const { data: allJobs, error: jobErr } = await supabase
        .from("jobs")
        .select("id, job_number, name, attachments")
        .not("attachments", "is", null);

      if (jobErr) throw jobErr;

      // Build set of all tracked paths
      const trackedPaths = new Set<string>();
      for (const job of allJobs || []) {
        const attachments = (job.attachments as any[]) || [];
        for (const att of attachments) {
          if (att.path) {
            trackedPaths.add(att.path);
          }
          // Also extract path from URL
          if (att.url) {
            const pathMatch = att.url.match(/\/job-attachments\/(.+?)(\?|$)/);
            if (pathMatch) trackedPaths.add(pathMatch[1]);
          }
        }
      }

      // Also get paths from team_job_updates photos
      const { data: updates } = await supabase
        .from("team_job_updates")
        .select("photos")
        .not("photos", "is", null);

      for (const upd of updates || []) {
        for (const photoUrl of upd.photos || []) {
          const pathMatch = photoUrl.match(/\/job-attachments\/(.+?)(\?|$)/);
          if (pathMatch) trackedPaths.add(pathMatch[1]);
        }
      }

      // Find orphaned files (in storage but not tracked)
      const orphanedFiles = allStorageFiles.filter(f => !trackedPaths.has(f.name));

      // Find missing files (tracked but not in storage)
      const storagePathSet = new Set(allStorageFiles.map(f => f.name));
      const missingFiles: { path: string; jobNumber: string }[] = [];
      for (const job of allJobs || []) {
        const attachments = (job.attachments as any[]) || [];
        for (const att of attachments) {
          const path = att.path;
          if (path && !storagePathSet.has(path)) {
            missingFiles.push({ path, jobNumber: job.job_number });
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          audit: {
            totalStorageFiles: allStorageFiles.length,
            totalTrackedPaths: trackedPaths.size,
            orphanedFiles: orphanedFiles.length,
            orphanedSample: orphanedFiles.slice(0, 50).map(f => f.name),
            missingFromStorage: missingFiles.length,
            missingSample: missingFiles.slice(0, 50),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DEFAULT MODE: Recover team photos
    const { data: allUpdates, error: updErr } = await supabase
      .from("team_job_updates")
      .select("job_id, photos, created_at, team_id")
      .not("photos", "is", null)
      .order("created_at", { ascending: true });

    if (updErr) throw updErr;

    const withPhotos = (allUpdates || []).filter(
      (u: any) => u.photos && u.photos.length > 0
    );

    const jobPhotosMap: Record<string, { url: string; created_at: string; team_id: string }[]> = {};
    for (const upd of withPhotos) {
      if (!jobPhotosMap[upd.job_id]) jobPhotosMap[upd.job_id] = [];
      for (const photoUrl of upd.photos) {
        jobPhotosMap[upd.job_id].push({
          url: photoUrl,
          created_at: upd.created_at,
          team_id: upd.team_id,
        });
      }
    }

    const jobIds = Object.keys(jobPhotosMap);
    let recoveredCount = 0;
    let jobsUpdated = 0;
    const details: any[] = [];

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
