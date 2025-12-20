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
    const { teamName, whatsappGroup, jobDetails, sendViaTwilio = true } = await req.json();
    
    if (!teamName || !jobDetails) {
      return new Response(
        JSON.stringify({ error: 'Team name and job details are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing WhatsApp notification for ${teamName}, phone: ${whatsappGroup || 'none'}`);

    // Format the message for WhatsApp
    const message = `🔧 *NEW JOB ASSIGNMENT*

*Team:* ${teamName}
*Job Number:* ${jobDetails.jobNumber}
*Customer:* ${jobDetails.name}
*Address:* ${jobDetails.address}
*Phone:* ${jobDetails.phoneNumber}

*Description:*
${jobDetails.description || jobDetails.summaryOfWorks || 'See job details'}

*Work Items:*
${jobDetails.workItems?.slice(0, 5).map((item: any, i: number) => 
  `${i + 1}. ${item.description} (${item.sorCode})`
).join('\n') || 'See job details'}${jobDetails.workItems?.length > 5 ? `\n... and ${jobDetails.workItems.length - 5} more` : ''}

Please confirm receipt and estimated start date.`;

    // Try to send via Twilio if configured
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

    let twilioResult = null;
    let sentViaTwilio = false;

    if (sendViaTwilio && twilioSid && twilioToken && twilioNumber && whatsappGroup) {
      try {
        // Format phone number for Twilio (must include country code)
        const toNumber = whatsappGroup.startsWith('+') ? whatsappGroup : `+${whatsappGroup}`;
        const fromNumber = twilioNumber.startsWith('whatsapp:') ? twilioNumber : `whatsapp:${twilioNumber}`;
        
        console.log(`Sending via Twilio from ${fromNumber} to whatsapp:${toNumber}`);

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        
        const formData = new URLSearchParams();
        formData.append('To', `whatsapp:${toNumber}`);
        formData.append('From', fromNumber);
        formData.append('Body', message);

        const twilioResponse = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        twilioResult = await twilioResponse.json();
        
        if (twilioResponse.ok) {
          sentViaTwilio = true;
          console.log('Twilio message sent successfully:', twilioResult.sid);
        } else {
          console.error('Twilio error:', twilioResult);
        }
      } catch (twilioError) {
        console.error('Twilio API error:', twilioError);
      }
    }

    // Generate fallback wa.me link
    const encodedMessage = encodeURIComponent(message);
    let whatsappLink: string;
    if (whatsappGroup && /^\d+$/.test(whatsappGroup)) {
      whatsappLink = `https://wa.me/${whatsappGroup}?text=${encodedMessage}`;
    } else {
      whatsappLink = `https://wa.me/?text=${encodedMessage}`;
    }

    console.log('WhatsApp notification result:', {
      team: teamName,
      phone: whatsappGroup,
      jobNumber: jobDetails.jobNumber,
      sentViaTwilio,
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: sentViaTwilio 
          ? `WhatsApp message sent to ${teamName}` 
          : `WhatsApp link ready for ${teamName}`,
        sentViaTwilio,
        twilioResult: sentViaTwilio ? { sid: twilioResult?.sid, status: twilioResult?.status } : null,
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
