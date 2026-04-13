import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { teamId, teamName, jobId, trades, description } = await req.json();

    if (!teamId || !teamName || !jobId || !trades || !Array.isArray(trades) || trades.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Validate team exists
    const { data: teamCheck } = await supabase
      .from('team_access_codes')
      .select('team_name')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .maybeSingle();

    if (!teamCheck || teamCheck.team_name !== teamName) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid team' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // Get parent job data
    const { data: parentJob, error: jobError } = await supabase
      .from('jobs')
      .select('id, name, address, date_issued, booked_date')
      .eq('id', jobId)
      .single();

    if (jobError || !parentJob) {
      return new Response(JSON.stringify({ success: false, error: 'Job not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // Calculate deadline: 5 days from now (Awaab compliance)
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 5);

    // Create sub-tasks for each trade
    const subTasks = trades.map((trade: string) => ({
      parent_job_id: jobId,
      trade,
      tenant_name: parentJob.name,
      property_address: parentJob.address,
      description: description || null,
      deadline_date: deadlineDate.toISOString(),
      status: 'not_scheduled',
      created_by: teamName,
    }));

    const { data: insertedTasks, error: insertError } = await supabase
      .from('job_sub_tasks')
      .insert(subTasks)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({ success: false, error: 'Failed to create sub-tasks' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Update parent job status
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'awaiting_trade',
        is_ongoing: true,
        ongoing_reason: `Complete – Awaiting Secondary Trade: ${trades.join(', ')}`,
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('Update error:', updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      subTasksCreated: insertedTasks?.length || 0,
      subTasks: insertedTasks,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
