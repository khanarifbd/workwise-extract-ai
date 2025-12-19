import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { teamName, whatsappGroup, jobDetails } = await req.json();
    
    if (!teamName || !jobDetails) {
      return new Response(
        JSON.stringify({ error: 'Team name and job details are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending job assignment to ${teamName} WhatsApp group: ${whatsappGroup}`);

    // Format the message for WhatsApp
    const message = `🔧 *NEW JOB ASSIGNMENT*

*Team:* ${teamName}
*Job Number:* ${jobDetails.jobNumber}
*Customer:* ${jobDetails.name}
*Address:* ${jobDetails.address}
*Phone:* ${jobDetails.phoneNumber}

*Description:*
${jobDetails.description || jobDetails.summaryOfWorks}

*Work Items:*
${jobDetails.workItems?.map((item: any, i: number) => 
  `${i + 1}. ${item.description} (${item.sorCode})`
).join('\n') || 'See job details'}

Please confirm receipt and estimated start date.`;

    // For now, we'll create a WhatsApp web link that can be opened
    // Real WhatsApp Business API integration would require WhatsApp Business API setup
    const encodedMessage = encodeURIComponent(message);
    const whatsappLink = `https://wa.me/?text=${encodedMessage}`;

    // Log the notification for audit purposes
    console.log('WhatsApp notification prepared:', {
      team: teamName,
      group: whatsappGroup,
      jobNumber: jobDetails.jobNumber,
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Job assignment prepared for ${teamName}`,
        whatsappLink,
        notificationMessage: message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-whatsapp function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
