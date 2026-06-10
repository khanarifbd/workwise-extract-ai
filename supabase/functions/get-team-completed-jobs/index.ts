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
    const limit = Math.min(Math.max(body.limit ?? 2000, 1), 5000);
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

    const teamName = teamRow.team_name as string;

    // SOURCE OF TRUTH: the main jobs table. We must mirror the Genie exactly.
    // A "completed job for this team" = a non-deleted job that is fully complete
    // (is_completed=true OR status='complete') AND the team is assigned as
    // either `team` or `team2`. This matches how the admin Genie groups
    // completed jobs into monthly folders by `date_issued`.
    const jobSelect =
      "id, job_number, name, address, phone_number, summary_of_works, description, work_items, attachments, status, is_completed, completion_date, date_issued, booked_date, progress_notes, team, team2, category_id";

    const [primaryRes, secondaryRes, signOffJobsRes] = await Promise.all([
      supabase
        .from("jobs")
        .select(jobSelect)
        .is("deleted_at", null)
        .or("is_completed.eq.true,status.eq.complete")
        .eq("team", teamName)
        .order("date_issued", { ascending: false })
        .limit(5000),
      supabase
        .from("jobs")
        .select(jobSelect)
        .is("deleted_at", null)
        .or("is_completed.eq.true,status.eq.complete")
        .eq("team2", teamName)
        .order("date_issued", { ascending: false })
        .limit(5000),
      // Also include any completed job this team has signed off on,
      // even if they aren't currently assigned as team/team2 (e.g. after reassignment).
      supabase
        .from("team_sign_offs")
        .select("job_id")
        .eq("team_id", teamId)
        .limit(5000),
    ]);

    if (primaryRes.error || secondaryRes.error) {
      console.error("jobs query failed", primaryRes.error || secondaryRes.error);
      return new Response(JSON.stringify({ error: "Failed to load jobs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobsById = new Map<string, any>();
    for (const j of primaryRes.data ?? []) jobsById.set(j.id, j);
    for (const j of secondaryRes.data ?? []) if (!jobsById.has(j.id)) jobsById.set(j.id, j);

    // Pull in completed jobs this team signed off on but isn't currently assigned to
    const extraSignedJobIds = Array.from(
      new Set((signOffJobsRes.data ?? []).map((s: any) => s.job_id).filter(Boolean)),
    ).filter((id) => !jobsById.has(id));
    if (extraSignedJobIds.length > 0) {
      const chunk = 200;
      for (let i = 0; i < extraSignedJobIds.length; i += chunk) {
        const slice = extraSignedJobIds.slice(i, i + chunk);
        const { data: extra } = await supabase
          .from("jobs")
          .select(jobSelect)
          .is("deleted_at", null)
          .or("is_completed.eq.true,status.eq.complete")
          .in("id", slice);
        for (const j of extra ?? []) if (!jobsById.has(j.id)) jobsById.set(j.id, j);
      }
    }

    const jobIds = Array.from(jobsById.keys());

    // Fetch matching sign-off metadata (optional — many older jobs may not have one)
    const signOffByJobId = new Map<string, any>();
    if (jobIds.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < jobIds.length; i += chunkSize) {
        const slice = jobIds.slice(i, i + chunkSize);
        const { data: sos } = await supabase
          .from("team_sign_offs")
          .select(
            "job_id, signed_off_at, photos_count, videos_count, documents_count, work_items_modified, work_items_total, progress_notes, team_id, on_behalf_of",
          )
          .in("job_id", slice)
          .eq("team_id", teamId)
          .eq("on_behalf_of", "team");
        for (const s of sos ?? []) {
          // Latest wins
          const existing = signOffByJobId.get(s.job_id);
          if (!existing || new Date(s.signed_off_at) > new Date(existing.signed_off_at)) {
            signOffByJobId.set(s.job_id, s);
          }
        }
      }
    }

    // Categories lookup
    const { data: cats } = await supabase.from("categories").select("id, name, color");
    const catsById = new Map((cats ?? []).map((c: any) => [c.id, c]));

    let combined = Array.from(jobsById.values()).map((job: any) => {
      const cat = job.category_id ? catsById.get(job.category_id) : null;
      const s = signOffByJobId.get(job.id);
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
        fully_complete: true,
        completion_date: job.completion_date,
        date_issued: job.date_issued,
        booked_date: job.booked_date,
        progress_notes: s?.progress_notes ?? job.progress_notes,
        team: job.team,
        team2: job.team2,
        category_id: job.category_id,
        category_name: cat?.name ?? null,
        category_color: cat?.color ?? null,
        // Prefer date_issued for archive grouping so it mirrors the Genie's monthly folders
        signed_off_at: s?.signed_off_at ?? job.completion_date ?? job.date_issued,
        bucket_date: job.date_issued ?? job.completion_date ?? s?.signed_off_at ?? null,
        photos_count: s?.photos_count ?? 0,
        videos_count: s?.videos_count ?? 0,
        documents_count: s?.documents_count ?? 0,
        work_items_modified: s?.work_items_modified ?? 0,
        work_items_total: s?.work_items_total ?? 0,
        has_sign_off: !!s,
      };
    });

    // Sort by date_issued desc to match Genie order
    combined.sort((a, b) => {
      const da = a.bucket_date ? new Date(a.bucket_date).getTime() : 0;
      const db = b.bucket_date ? new Date(b.bucket_date).getTime() : 0;
      return db - da;
    });

    if (search) {
      combined = combined.filter((j) => {
        const hay = [j.job_number, j.name, j.address, j.summary_of_works, j.description, j.category_name]
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
