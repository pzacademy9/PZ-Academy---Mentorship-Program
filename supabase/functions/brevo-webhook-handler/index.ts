import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

/**
 * Brevo webhook event interface
 */
interface BrevoWebhookEvent {
  email?: string;
  "message-id"?: string;
  event?: string;
  ts?: number;
  ip?: string;
  "user-agent"?: string;
  bounce_type?: string;
  complaint_type?: string;
}

/**
 * Response structure for the function
 */
interface WebhookResponse {
  ok: boolean;
  error?: string;
}

/**
 * Constant-time string comparison — prevents a timing attack from leaking
 * the secret one character at a time via response-time measurement.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Main handler function
 */
Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
      },
    });
  }

  // Only allow POST
  if (req.method !== "POST") {
    console.warn(`Invalid HTTP method: ${req.method}`);
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Brevo does not sign webhook requests — no HMAC, no JWT — but its create-
    // webhook API does accept custom "headers" attached to every call it
    // makes, which is the credential channel used here. (This handler
    // previously required an "x-brevo-signature" header Brevo never sends on
    // its own, so every real call was rejected with 401 — and separately,
    // BREVO_WEBHOOK_SECRET was never actually set as a function secret, so it
    // 500'd before even reaching that check. Both are fixed together.) A
    // query-string secret was considered and rejected: URLs get written to
    // access logs, browser history, and proxies far more readily than
    // headers do, so the secret belongs in a header, not the URL.
    const brevoWebhookSecret = Deno.env.get("BREVO_WEBHOOK_SECRET");
    if (!brevoWebhookSecret) {
      console.error("BREVO_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const providedSecret = req.headers.get("x-webhook-secret") ?? "";
    if (!timingSafeEqual(providedSecret, brevoWebhookSecret)) {
      console.warn("Invalid or missing x-webhook-secret header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const bodyText = await req.text();

    // Parse the JSON body
    let event: BrevoWebhookEvent;
    try {
      event = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract event data
    const userEmail = event.email;
    const brevoMessageId = event["message-id"];
    const eventType = event.event;
    const eventTimestamp = event.ts;
    const ipAddress = event.ip;
    const userAgent = event["user-agent"];
    const bounceType = event.bounce_type;
    const complaintType = event.complaint_type;

    // Validate required fields
    if (!userEmail || !eventType || !eventTimestamp) {
      console.error("Missing required webhook fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log the incoming event
    console.log(`Brevo webhook: event=${eventType}, email=${userEmail}, message_id=${brevoMessageId}`);

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase credentials");
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query email_queue by brevo_message_id to find email_queue_id
    let emailQueueId: string | null = null;

    if (brevoMessageId) {
      const { data: queueData, error: queryError } = await supabase
        .from("email_queue")
        .select("id")
        .eq("brevo_message_id", brevoMessageId)
        .limit(1);

      if (queryError) {
        console.error("Error querying email_queue:", queryError);
      } else if (queueData && queueData.length > 0) {
        emailQueueId = queueData[0].id;
        console.log(`Found email_queue_id: ${emailQueueId}`);
      }
    }

    // Convert timestamp to ISO string
    const eventTimestampIso = new Date(eventTimestamp * 1000).toISOString();

    // INSERT into email_metrics
    const { error: insertError } = await supabase
      .from("email_metrics")
      .insert({
        email_queue_id: emailQueueId,
        user_email: userEmail,
        event_type: eventType,
        event_timestamp: eventTimestampIso,
        brevo_message_id: brevoMessageId || null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        bounce_type: bounceType || null,
        complaint_type: complaintType || null,
      });

    if (insertError) {
      // Log the error but don't fail the webhook - async, non-blocking
      console.error(
        `Failed to insert email_metrics for ${userEmail} (${eventType}):`,
        insertError
      );
    } else {
      console.log(
        `Inserted email_metrics: event=${eventType}, email=${userEmail}`
      );
    }

    // Return success response (webhook is async, failures don't block email sending)
    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Unexpected webhook handler error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
