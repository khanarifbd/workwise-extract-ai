import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateLanguageRequest {
  teamId: string;
  languagePreference: string;
}

const SUPPORTED_LANGUAGES = ['en', 'pl', 'ro', 'es', 'pt', 'uk', 'ru', 'lt', 'lv', 'bg', 'hu'];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: UpdateLanguageRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { teamId, languagePreference } = body;

    if (!teamId || !languagePreference) {
      return new Response(
        JSON.stringify({ error: "Team ID and language preference are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPPORTED_LANGUAGES.includes(languagePreference)) {
      return new Response(
        JSON.stringify({ error: "Invalid language code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from("team_access_codes")
      .update({ language_preference: languagePreference })
      .eq("team_id", teamId);

    if (error) {
      console.error("Failed to update language:", error.message);
      return new Response(
        JSON.stringify({ error: "Failed to update language preference" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Language preference updated to ${languagePreference} for team ${teamId}`);

    return new Response(
      JSON.stringify({ success: true, languagePreference }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
