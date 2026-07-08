import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationRequest {
  apiKeyId: string
  apiKeyName: string
  userId: string
  userEmail: string
  currentUsage: number
  limit: number
  thresholdPercent: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const resend = new Resend(resendApiKey)

    const { apiKeyId, apiKeyName, userId, userEmail, currentUsage, limit, thresholdPercent }: NotificationRequest = await req.json()

    console.log(`Processing rate limit notification for API key ${apiKeyId}, threshold ${thresholdPercent}%`)

    // Check if we already sent a notification for this threshold today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: existingNotification } = await supabase
      .from('rate_limit_notifications')
      .select('id')
      .eq('api_key_id', apiKeyId)
      .eq('threshold_percent', thresholdPercent)
      .gte('sent_at', today.toISOString())
      .maybeSingle()

    if (existingNotification) {
      console.log(`Notification already sent for API key ${apiKeyId} at ${thresholdPercent}% threshold today`)
      return new Response(
        JSON.stringify({ message: 'Notification already sent today' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send the email notification
    const usagePercent = Math.round((currentUsage / limit) * 100)
    const remaining = limit - currentUsage

    const { error: emailError } = await resend.emails.send({
      from: 'Alsamos API <onboarding@resend.dev>',
      to: [userEmail],
      subject: `⚠️ API Key "${apiKeyName}" approaching rate limit (${usagePercent}% used)`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #f59e0b; margin-bottom: 20px;">⚠️ Rate Limit Warning</h2>
          
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Your API key <strong>"${apiKeyName}"</strong> has reached <strong>${usagePercent}%</strong> of its daily rate limit.
          </p>
          
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>Current Usage:</strong> ${currentUsage.toLocaleString()} / ${limit.toLocaleString()} requests<br>
              <strong>Remaining:</strong> ${remaining.toLocaleString()} requests
            </p>
          </div>
          
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Once you hit the limit, additional requests will be rejected until the counter resets at midnight UTC.
          </p>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            Consider upgrading your rate limit or optimizing your API usage to avoid interruptions.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          
          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated notification from Alsamos API Gateway.
          </p>
        </div>
      `,
    })

    if (emailError) {
      console.error('Failed to send email:', emailError)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Record that we sent this notification
    await supabase.from('rate_limit_notifications').insert({
      api_key_id: apiKeyId,
      user_id: userId,
      threshold_percent: thresholdPercent,
    })

    console.log(`Rate limit notification sent successfully to ${userEmail}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Notification sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('Error in rate-limit-notification:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
