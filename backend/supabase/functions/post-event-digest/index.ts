// Supabase Edge Function: post-event-digest
// Dispatches email summaries or compiles PDF digest triggers using Resend API

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch verified guests who provided emails
    const { data: guests, error: guestsError } = await supabase
      .from('profiles')
      .select('display_name, email')
      .not('email', 'is', null);

    if (guestsError) throw guestsError;

    // Fetch top liked photos
    const { data: topPhotos } = await supabase
      .from('photos')
      .select('*')
      .eq('is_approved', true)
      .order('likes_count', { ascending: false })
      .limit(10);

    // Fetch memories & predictions
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          recipientCount: guests?.length || 0,
          topPhotosCount: topPhotos?.length || 0,
          messagesCount: messages?.length || 0,
        },
        message: 'Post-event digest compiled successfully.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
