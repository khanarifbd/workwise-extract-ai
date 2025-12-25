import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const sendWhatsAppSchema = z.object({
  teamName: z.string().min(1, "Team name required").max(100, "Team name too long"),
  whatsappGroup: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number format").optional().nullable(),
  sendViaTwilio: z.boolean().optional(),
  jobDetails: z.object({
    jobNumber: z.string().max(50).optional(),
    name: z.string().max(200).optional(),
    address: z.string().max(500).optional(),
    phoneNumber: z.string().max(20).optional(),
    description: z.string().max(5000).optional(),
    summaryOfWorks: z.string().max(5000).optional(),
    workItems: z.array(z.object({
      description: z.string().max(500).optional(),
      sorCode: z.string().max(50).optional(),
    }).passthrough()).max(100).optional(),
  }).passthrough(),
});

// Sanitize text for WhatsApp to prevent markdown injection
function sanitizeForWhatsApp(text: string): string {
  return text
    .replace(/[*_~`]/g, '') // Remove WhatsApp markdown chars
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .substring(0, 4096); // WhatsApp message limit
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request - require admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const { data: isAdmin, error: roleError } = await supabaseClient.rpc('is_admin', { _user_id: user.id });
    if (roleError || !isAdmin) {
      console.error('Admin check failed:', roleError?.message || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const rawBody = await req.json();
    const parseResult = sendWhatsAppSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error('Validation failed:', parseResult.error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parseResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { teamName, whatsappGroup, jobDetails, sendViaTwilio = true } = parseResult.data;

    console.log(`Processing WhatsApp notification for ${teamName} by user ${user.id}`);

    // Format the message for WhatsApp with sanitization
    const message = sanitizeForWhatsApp(`🔧 *NEW JOB ASSIGNMENT*

*Team:* ${teamName}
*Job Number:* ${jobDetails.jobNumber || 'N/A'}
*Customer:* ${jobDetails.name || 'N/A'}
*Address:* ${jobDetails.address || 'N/A'}
*Phone:* ${jobDetails.phoneNumber || 'N/A'}

*Description:*
${jobDetails.description || jobDetails.summaryOfWorks || 'See job details'}

*Work Items:*
${jobDetails.workItems?.slice(0, 5).map((item: any, i: number) => 
  `${i + 1}. ${item.description || ''} (${item.sorCode || ''})`
).join('\n') || 'See job details'}${(jobDetails.workItems?.length || 0) > 5 ? `\n... and ${(jobDetails.workItems?.length || 0) - 5} more` : ''}

Please confirm receipt and estimated start date.`);

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
    } else if (whatsappGroup) {
      const cleanNumber = whatsappGroup.replace(/[^0-9]/g, '');
      whatsappLink = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
    } else {
      whatsappLink = `https://wa.me/?text=${encodedMessage}`;
    }

    console.log('WhatsApp notification result:', {
      team: teamName,
      sentViaTwilio,
      user: user.id,
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
      JSON.stringify({ error: 'An error occurred while processing the request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
