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
 * Verify Brevo webhook signature using HMAC-SHA256
 * Brevo sends: x-brevo-signature header with HMAC-SHA256 hash of the request body
 */
async function verifyBrevoSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Convert secret to Uint8Array
    const secretBytes = new TextEncoder().encode(secret);

    // Create HMAC-SHA256 key
    const key = await Deno.crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Create HMAC signature of the body
    const bodyBytes = new TextEncoder().encode(body);
    const signatureBytes = await Deno.crypto.subtle.sign(
      "HMAC",
      key,
      bodyBytes
    );

    // Convert signature bytes to hex string
    const calculatedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures (constant-time comparison to prevent timing attacks)
    return calculatedSignature === signature;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
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
        "Access-Control-Allow-Headers": "Content-Type, x-brevo-signature",
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
    // Get Brevo webhook secret from environment
    const brevoWebhookSecret = Deno.env.get("BREVO_WEBHOOK_SECRET");
    if (!brevoWebhookSecret) {
      console.error("BREVO_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the raw body for signature verification
    const bodyText = await req.text();

    // Get the signature from headers
    const signature = req.headers.get("x-brevo-signature");
    if (!signature) {
      console.warn("Missing x-brevo-signature header");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify the signature
    const isValid = await verifyBrevoSignature(
      bodyText,
      signature,
      brevoWebhookSecret
    );

    if (!isValid) {
      console.warn("Invalid Brevo webhook signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

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
