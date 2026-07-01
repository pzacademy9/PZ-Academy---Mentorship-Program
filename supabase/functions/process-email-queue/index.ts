import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { BrevoClient } from "npm:@getbrevo/brevo@5.0.4";

/**
 * Configuration constants
 */
const BATCH_SIZE = 10;
const BACKOFF_MINUTES = {
  1: 1,      // 1st retry: 1 minute
  2: 5,      // 2nd retry: 5 minutes
  3: 30,     // 3rd retry: 30 minutes
};
const MAX_RETRIES = 3;

/**
 * Interface for email queue record
 */
interface EmailQueueRecord {
  id: string;
  event_type: string;
  user_id: string | null;
  user_email: string;
  subject: string;
  html_content: string;
  status: string;
  brevo_message_id: string | null;
  retry_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

/**
 * Response structure for the function
 */
interface ProcessEmailQueueResponse {
  processed: number;
  sent: number;
  failed: number;
  retry: number;
  errors?: string[];
}

/**
 * Calculate next retry time based on retry count
 */
function calculateNextRetryTime(retryCount: number): Date {
  const minutes = BACKOFF_MINUTES[retryCount as keyof typeof BACKOFF_MINUTES] || 60;
  const nextRetry = new Date(Date.now() + minutes * 60 * 1000);
  return nextRetry;
}

/**
 * Main handler function - processes pending emails from queue
 */
Deno.serve(async (req: Request): Promise<Response> => {
  const stats: ProcessEmailQueueResponse = {
    processed: 0,
    sent: 0,
    failed: 0,
    retry: 0,
    errors: [],
  };

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME");

    // Validate environment variables
    if (!supabaseUrl || !supabaseServiceKey) {
      const errorMsg = "Missing Supabase credentials";
      console.error(errorMsg);
      stats.errors?.push(errorMsg);
      return new Response(
        JSON.stringify({
          ...stats,
          error: errorMsg,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!brevoApiKey || !brevoSenderEmail || !brevoSenderName) {
      const errorMsg = "Missing Brevo credentials";
      console.error(errorMsg);
      stats.errors?.push(errorMsg);
      return new Response(
        JSON.stringify({
          ...stats,
          error: errorMsg,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Initialize Brevo client
    const brevoClient = new BrevoClient({ apiKey: brevoApiKey });

    // Query pending emails ready for sending
    console.log("Fetching pending emails from queue...");
    const { data: emailQueue, error: queryError } = await supabase
      .from("email_queue")
      .select("*")
      .eq("status", "pending")
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .limit(BATCH_SIZE)
      .order("created_at", { ascending: true });

    if (queryError) {
      const errorMsg = `Failed to query email queue: ${queryError.message}`;
      console.error(errorMsg);
      stats.errors?.push(errorMsg);
      return new Response(
        JSON.stringify({
          ...stats,
          error: errorMsg,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!emailQueue || emailQueue.length === 0) {
      console.log("No pending emails to process");
      return new Response(
        JSON.stringify(stats),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Processing ${emailQueue.length} emails...`);

    // Process each email
    for (const email of emailQueue) {
      const typedEmail = email as EmailQueueRecord;
      stats.processed += 1;

      try {
        console.log(
          `Processing email ${stats.processed}/${emailQueue.length}: ${typedEmail.id} to ${typedEmail.user_email}`
        );

        // Send email via Brevo API
        const brevoResponse = await brevoClient.transactionalEmails.sendTransacEmail({
          sender: {
            email: brevoSenderEmail,
            name: brevoSenderName,
          },
          to: [{ email: typedEmail.user_email }],
          subject: typedEmail.subject,
          htmlContent: typedEmail.html_content,
        });

        // Extract message ID from response
        const messageId = brevoResponse?.id || brevoResponse?.messageId || null;

        // Mark email as sent
        console.log(`Email sent successfully: ${typedEmail.id} (Brevo ID: ${messageId})`);

        const { error: updateError } = await supabase
          .from("email_queue")
          .update({
            status: "sent",
            brevo_message_id: messageId,
            sent_at: new Date().toISOString(),
          })
          .eq("id", typedEmail.id);

        if (updateError) {
          const errorMsg = `Failed to update email status to sent: ${updateError.message}`;
          console.error(errorMsg);
          stats.errors?.push(errorMsg);
        } else {
          stats.sent += 1;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error processing email ${typedEmail.id}: ${errorMessage}`);

        // Handle retry logic
        if (typedEmail.retry_count < MAX_RETRIES) {
          const nextRetryCount = typedEmail.retry_count + 1;
          const nextRetryTime = calculateNextRetryTime(nextRetryCount);

          console.log(
            `Scheduling retry ${nextRetryCount}/${MAX_RETRIES} for ${typedEmail.id} at ${nextRetryTime.toISOString()}`
          );

          const { error: retryError } = await supabase
            .from("email_queue")
            .update({
              retry_count: nextRetryCount,
              next_retry_at: nextRetryTime.toISOString(),
              last_error: errorMessage,
              last_error_at: new Date().toISOString(),
            })
            .eq("id", typedEmail.id);

          if (retryError) {
            const errorMsg = `Failed to update retry count: ${retryError.message}`;
            console.error(errorMsg);
            stats.errors?.push(errorMsg);
          } else {
            stats.retry += 1;
          }
        } else {
          // Mark as failed after max retries
          console.log(
            `Max retries (${MAX_RETRIES}) exceeded for ${typedEmail.id}, marking as failed`
          );

          const { error: failError } = await supabase
            .from("email_queue")
            .update({
              status: "failed",
              last_error: errorMessage,
              last_error_at: new Date().toISOString(),
            })
            .eq("id", typedEmail.id);

          if (failError) {
            const errorMsg = `Failed to mark email as failed: ${failError.message}`;
            console.error(errorMsg);
            stats.errors?.push(errorMsg);
          }

          // Insert into auth_email_logs for admin visibility
          const { error: logError } = await supabase.from("auth_email_logs").insert({
            event_type: typedEmail.event_type,
            user_email: typedEmail.user_email,
            error_message: errorMessage,
            error_details: {
              email_queue_id: typedEmail.id,
              original_error: errorMessage,
            },
            retry_count: typedEmail.retry_count,
            final_attempt_at: new Date().toISOString(),
          });

          if (logError) {
            const errorMsg = `Failed to log failed email: ${logError.message}`;
            console.error(errorMsg);
            stats.errors?.push(errorMsg);
          } else {
            stats.failed += 1;
          }
        }
      }
    }

    console.log(
      `Processing complete: sent=${stats.sent}, retry=${stats.retry}, failed=${stats.failed}`
    );

    return new Response(
      JSON.stringify(stats),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Unexpected error in process-email-queue: ${errorMessage}`);
    stats.errors?.push(errorMessage);

    return new Response(
      JSON.stringify({
        ...stats,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
