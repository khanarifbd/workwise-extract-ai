import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    // 24 hours ago
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Get all active jobs with booked_date older than 24h, not completed, not referred back
    const { data: overdueJobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("id, job_number, name, address, team, team2, booked_date, description, attachments, status, is_completed, refer_back")
      .eq("is_completed", false)
      .eq("refer_back", false)
      .not("booked_date", "is", null)
      .not("team", "is", null)
      .lt("booked_date", cutoff)
      .neq("status", "complete");

    if (jobsErr) {
      console.error("Failed to fetch overdue jobs:", jobsErr);
      return new Response(JSON.stringify({ error: "Failed to fetch jobs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!overdueJobs || overdueJobs.length === 0) {
      return new Response(JSON.stringify({ chased: 0, message: "No overdue jobs found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all sign-offs to exclude fully signed-off jobs
    const jobIds = overdueJobs.map((j) => j.id);
    const { data: signOffs } = await supabase
      .from("team_sign_offs")
      .select("job_id, team_name")
      .in("job_id", jobIds);

    const signOffMap = new Map<string, Set<string>>();
    (signOffs || []).forEach((s) => {
      if (!signOffMap.has(s.job_id)) signOffMap.set(s.job_id, new Set());
      signOffMap.get(s.job_id)!.add(s.team_name);
    });

    // Check which messages were already sent in the last 8 hours to avoid spam
    const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString();
    const { data: recentMessages } = await supabase
      .from("team_messages")
      .select("team_id, message_text")
      .eq("sender_name", "Danni (Auto)")
      .gte("created_at", eightHoursAgo);

    const recentChaseSet = new Set(
      (recentMessages || []).map((m) => `${m.team_id}`)
    );

    // Get team access codes for team_id lookup
    const { data: teamCodes } = await supabase
      .from("team_access_codes")
      .select("team_id, team_name")
      .eq("is_active", true);

    const teamIdByName = new Map<string, string>();
    (teamCodes || []).forEach((t) => teamIdByName.set(t.team_name, t.team_id));

    const messagesToSend: Array<{
      team_id: string;
      team_name: string;
      sender_name: string;
      message_type: string;
      message_text: string;
    }> = [];

    for (const job of overdueJobs) {
      const assignedTeams = [job.team, job.team2].filter(Boolean) as string[];
      const signedOffTeams = signOffMap.get(job.id) || new Set();

      // Check if all assigned teams have signed off
      const allSignedOff = assignedTeams.every((t) => signedOffTeams.has(t));
      if (allSignedOff) continue;

      // Diagnose what's missing
      const attachments = (job.attachments as any[]) || [];
      const hasPhotos = attachments.some((a: any) => a.type === "image");
      const hasDescription = !!(job.description && job.description.trim().length > 10);

      // Only chase if something is actually missing
      if (hasPhotos && hasDescription) continue;

      const missingItems: string[] = [];
      if (!hasPhotos) missingItems.push("photos (before & after)");
      if (!hasDescription) missingItems.push("a description of works completed");

      // Send to each unsigned-off team
      for (const teamName of assignedTeams) {
        if (signedOffTeams.has(teamName)) continue;

        const teamId = teamIdByName.get(teamName);
        if (!teamId) continue;

        // Skip if recently chased
        if (recentChaseSet.has(teamId)) continue;

        const bookedDate = new Date(job.booked_date);
        const daysOverdue = Math.floor(
          (now.getTime() - bookedDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const message = `⚠️ SIGN-OFF REQUIRED — ${job.name} (${job.job_number})\n\n` +
          `📍 ${job.address || "No address"}\n` +
          `📅 Booked: ${bookedDate.toLocaleDateString("en-GB")} (${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} ago)\n\n` +
          `🚨 This job is still missing:\n` +
          missingItems.map((item) => `  • ${item}`).join("\n") +
          `\n\nPlease upload the missing items and sign off this job in your portal as soon as possible.\n\n` +
          `— Danni (Automated Sign-Off Chase)`;

        messagesToSend.push({
          team_id: teamId,
          team_name: teamName,
          sender_name: "Danni (Auto)",
          message_type: "text",
          message_text: message,
        });
      }
    }

    if (messagesToSend.length === 0) {
      return new Response(
        JSON.stringify({ chased: 0, message: "No chase messages needed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("team_messages")
      .insert(messagesToSend)
      .select();

    if (insertErr) {
      console.error("Failed to insert chase messages:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to send chase messages" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const teamsSent = [...new Set(messagesToSend.map((m) => m.team_name))];
    console.log(
      `Auto-chase: Sent ${inserted?.length || 0} messages to ${teamsSent.length} teams: ${teamsSent.join(", ")}`
    );

    return new Response(
      JSON.stringify({
        chased: inserted?.length || 0,
        teams: teamsSent,
        message: `Sent ${inserted?.length || 0} chase messages`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-chase error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
