import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all pending scheduled messages that are due
    const { data: dueMessages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString());

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${dueMessages?.length || 0} messages to send`);

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const scheduledMsg of dueMessages || []) {
      try {
        // Insert the message into the messages table
        const { error: insertError } = await supabase
          .from('messages')
          .insert({
            conversation_id: scheduledMsg.conversation_id,
            sender_id: scheduledMsg.sender_id,
            content: scheduledMsg.content,
            media_url: scheduledMsg.media_url,
            media_type: scheduledMsg.media_type,
          });

        if (insertError) {
          throw insertError;
        }

        // Update the conversation's last_message_at
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', scheduledMsg.conversation_id);

        // Mark the scheduled message as sent
        const { error: updateError } = await supabase
          .from('scheduled_messages')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', scheduledMsg.id);

        if (updateError) {
          console.error('Error updating scheduled message status:', updateError);
        }

        results.sent++;
        console.log(`Sent message ${scheduledMsg.id}`);
      } catch (error) {
        console.error(`Failed to send message ${scheduledMsg.id}:`, error);
        
        // Mark as failed
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', scheduledMsg.id);

        results.failed++;
        results.errors.push(`Message ${scheduledMsg.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.sent + results.failed} messages`,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error processing scheduled messages:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
