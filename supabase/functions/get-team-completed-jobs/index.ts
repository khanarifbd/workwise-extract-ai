import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  teamId: string;
  search?: string;
  limit?: number;
  offset?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { teamId } = body;
    const limit = Math.min(Math.max(body.limit ?? 500, 1), 2000);
    const offset = Math.max(body.offset ?? 0, 0);
    const search = (body.search ?? "").trim().toLowerCase();

    if (!teamId || typeof teamId !== "string" || teamId.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid teamId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verify team exists and is active
    const { data: teamRow, error: teamErr } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name, is_active")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .maybeSingle();

    if (teamErr || !teamRow) {
      return new Response(JSON.stringify({ error: "Team not found or inactive" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all sign-offs by this team
    const { data: signOffs, error: soErr } = await supabase
      .from("team_sign_offs")
      .select(
        "job_id, signed_off_at, photos_count, videos_count, documents_count, work_items_modified, work_items_total, progress_notes, on_behalf_of",
      )
      .eq("team_id", teamId)
      .eq("on_behalf_of", "team")
      .order("signed_off_at", { ascending: false });

    if (soErr) {
      console.error("sign_offs query failed", soErr);
      return new Response(JSON.stringify({ error: "Failed to load sign-offs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!signOffs || signOffs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, jobs: [], total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const jobIds = Array.from(new Set(signOffs.map((s) => s.job_id)));

    // Chunked fetch for joined jobs to avoid URL length limits
    const chunkSize = 200;
    const jobsById = new Map<string, any>();
    for (let i = 0; i < jobIds.length; i += chunkSize) {
      const slice = jobIds.slice(i, i + chunkSize);
      const { data: jobsChunk, error: jobsErr } = await supabase
        .from("jobs")
        .select(
          "id, job_number, name, address, phone_number, summary_of_works, description, work_items, attachments, status, is_completed, completion_date, date_issued, booked_date, progress_notes, team, team2, category_id",
        )
        .in("id", slice)
        .is("deleted_at", null);

      if (jobsErr) {
        console.error("jobs fetch failed", jobsErr);
        return new Response(JSON.stringify({ error: "Failed to load jobs" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const j of jobsChunk ?? []) jobsById.set(j.id, j);
    }

    // Categories lookup (small table)
    const { data: cats } = await supabase
      .from("categories")
      .select("id, name, color");
    const catsById = new Map((cats ?? []).map((c: any) => [c.id, c]));

    // Combine and filter
    let combined = signOffs
      .map((s) => {
        const job = jobsById.get(s.job_id);
        if (!job) return null;
        const cat = job.category_id ? catsById.get(job.category_id) : null;
        const fullyComplete =
          job.is_completed === true || job.status === "complete";
        return {
          job_id: job.id,
          job_number: job.job_number,
          name: job.name,
          address: job.address,
          phone_number: job.phone_number,
          summary_of_works: job.summary_of_works,
          description: job.description,
          work_items: job.work_items,
          attachments: job.attachments,
          status: job.status,
          is_completed: job.is_completed,
          fully_complete: fullyComplete,
          completion_date: job.completion_date,
          date_issued: job.date_issued,
          booked_date: job.booked_date,
          progress_notes: s.progress_notes ?? job.progress_notes,
          team: job.team,
          team2: job.team2,
          category_id: job.category_id,
          category_name: cat?.name ?? null,
          category_color: cat?.color ?? null,
          signed_off_at: s.signed_off_at,
          photos_count: s.photos_count,
          videos_count: s.videos_count,
          documents_count: s.documents_count,
          work_items_modified: s.work_items_modified,
          work_items_total: s.work_items_total,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (search) {
      combined = combined.filter((j) => {
        const hay = [
          j.job_number,
          j.name,
          j.address,
          j.summary_of_works,
          j.description,
          j.category_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(search);
      });
    }

    const total = combined.length;
    const paged = combined.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({
        success: true,
        teamId,
        teamName: teamRow.team_name,
        total,
        jobs: paged,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("get-team-completed-jobs error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
