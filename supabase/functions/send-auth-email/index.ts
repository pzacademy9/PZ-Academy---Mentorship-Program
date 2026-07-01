import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

/**
 * Email template functions for authentication events.
 */
const brandColors = {
  deepGreen: "#0f3d22",
  brightGreen: "#7ed957",
  paleGreen: "#c8f0a0",
  darkGray: "#333333",
  lightGray: "#666666",
  border: "#e0e0e0",
};

const baseStyles = `
  font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: ${brandColors.darkGray};
  line-height: 1.6;
`;

const headingStyles = `
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 600;
  color: ${brandColors.deepGreen};
`;

function inviteEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to PZ Academy</title>
</head>
<body style="margin: 0; padding: 0; ${baseStyles} background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${brandColors.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="${headingStyles} margin: 0; font-size: 28px; color: ${brandColors.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${brandColors.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="${headingStyles} font-size: 22px; margin: 0 0 20px;">You're Invited!</h2>

              <p style="margin: 0 0 20px; color: ${brandColors.lightGray};">
                Welcome to <strong>PZ Academy</strong>. You've been invited to join our mentorship platform.
              </p>

              <p style="margin: 0 0 30px; color: ${brandColors.lightGray};">
                Click the button below to accept your invitation and get started:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="background-color: ${brandColors.brightGreen}; color: ${brandColors.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${brandColors.border}; color: ${brandColors.lightGray}; font-size: 13px;">
                This invitation link expires in 7 days. If you did not expect this invitation, please disregard this email.
              </p>

              <!-- Unsubscribe -->
              <p style="margin: 20px 0 0; color: ${brandColors.lightGray}; font-size: 12px;">
                <a href="mailto:${email}?subject=Remove%20from%20PZ%20Academy" style="color: ${brandColors.brightGreen}; text-decoration: none;">Stop receiving emails</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px 30px; text-align: center; border-top: 1px solid ${brandColors.border};">
              <p style="margin: 0; color: ${brandColors.lightGray}; font-size: 12px;">
                PZ Academy Mentorship Platform<br>
                © 2024 Pharmacozyme. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function signupConfirmEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Email Address</title>
</head>
<body style="margin: 0; padding: 0; ${baseStyles} background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${brandColors.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="${headingStyles} margin: 0; font-size: 28px; color: ${brandColors.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${brandColors.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="${headingStyles} font-size: 22px; margin: 0 0 20px;">Verify Your Email</h2>

              <p style="margin: 0 0 20px; color: ${brandColors.lightGray};">
                Thank you for signing up! We're excited to have you on board.
              </p>

              <p style="margin: 0 0 30px; color: ${brandColors.lightGray};">
                Please verify your email address by clicking the button below:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="background-color: ${brandColors.brightGreen}; color: ${brandColors.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${brandColors.border}; color: ${brandColors.lightGray}; font-size: 13px;">
                This verification link expires in 24 hours. If you did not create this account, please ignore this email.
              </p>

              <p style="margin: 15px 0 0; color: ${brandColors.lightGray}; font-size: 13px;">
                <strong>Account email:</strong> ${email}
              </p>

              <!-- Unsubscribe -->
              <p style="margin: 20px 0 0; color: ${brandColors.lightGray}; font-size: 12px;">
                <a href="mailto:${email}?subject=Remove%20from%20PZ%20Academy" style="color: ${brandColors.brightGreen}; text-decoration: none;">Stop receiving emails</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px 30px; text-align: center; border-top: 1px solid ${brandColors.border};">
              <p style="margin: 0; color: ${brandColors.lightGray}; font-size: 12px;">
                PZ Academy Mentorship Platform<br>
                © 2024 Pharmacozyme. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function resetPasswordEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; ${baseStyles} background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${brandColors.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="${headingStyles} margin: 0; font-size: 28px; color: ${brandColors.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${brandColors.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="${headingStyles} font-size: 22px; margin: 0 0 20px;">Reset Your Password</h2>

              <p style="margin: 0 0 20px; color: ${brandColors.lightGray};">
                We received a request to reset the password for your PZ Academy account.
              </p>

              <p style="margin: 0 0 30px; color: ${brandColors.lightGray};">
                Click the button below to create a new password:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="background-color: ${brandColors.brightGreen}; color: ${brandColors.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${brandColors.border}; color: ${brandColors.lightGray}; font-size: 13px;">
                This link expires in 1 hour for your security. If you did not request a password reset, you can safely ignore this email.
              </p>

              <p style="margin: 15px 0 0; color: ${brandColors.lightGray}; font-size: 13px;">
                <strong>Account email:</strong> ${email}
              </p>

              <!-- Security Notice -->
              <p style="margin: 20px 0 0; padding: 15px; background-color: #f0f0f0; border-radius: 4px; border-left: 4px solid ${brandColors.brightGreen}; color: ${brandColors.lightGray}; font-size: 12px;">
                <strong>Security Tip:</strong> Never share your password with anyone. PZ Academy support will never ask for your password.
              </p>

              <!-- Unsubscribe -->
              <p style="margin: 20px 0 0; color: ${brandColors.lightGray}; font-size: 12px;">
                <a href="mailto:${email}?subject=Remove%20from%20PZ%20Academy" style="color: ${brandColors.brightGreen}; text-decoration: none;">Stop receiving emails</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px 30px; text-align: center; border-top: 1px solid ${brandColors.border};">
              <p style="margin: 0; color: ${brandColors.lightGray}; font-size: 12px;">
                PZ Academy Mentorship Platform<br>
                © 2024 Pharmacozyme. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emailChangeConfirmEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your New Email Address</title>
</head>
<body style="margin: 0; padding: 0; ${baseStyles} background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${brandColors.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="${headingStyles} margin: 0; font-size: 28px; color: ${brandColors.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${brandColors.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="${headingStyles} font-size: 22px; margin: 0 0 20px;">Confirm Your Email Change</h2>

              <p style="margin: 0 0 20px; color: ${brandColors.lightGray};">
                You requested to change the email address associated with your PZ Academy account.
              </p>

              <p style="margin: 0 0 30px; color: ${brandColors.lightGray};">
                Click the button below to confirm this change:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="background-color: ${brandColors.brightGreen}; color: ${brandColors.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      Confirm Email Change
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${brandColors.border}; color: ${brandColors.lightGray}; font-size: 13px;">
                This link expires in 24 hours. If you did not request this email change, please ignore this email. Your account will not be affected.
              </p>

              <p style="margin: 15px 0 0; color: ${brandColors.lightGray}; font-size: 13px;">
                <strong>New email address:</strong> ${email}
              </p>

              <!-- Security Notice -->
              <p style="margin: 20px 0 0; padding: 15px; background-color: #f0f0f0; border-radius: 4px; border-left: 4px solid ${brandColors.brightGreen}; color: ${brandColors.lightGray}; font-size: 12px;">
                <strong>Security Tip:</strong> If you did not make this request, please secure your account immediately by resetting your password.
              </p>

              <!-- Unsubscribe -->
              <p style="margin: 20px 0 0; color: ${brandColors.lightGray}; font-size: 12px;">
                <a href="mailto:${email}?subject=Remove%20from%20PZ%20Academy" style="color: ${brandColors.brightGreen}; text-decoration: none;">Stop receiving emails</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px 30px; text-align: center; border-top: 1px solid ${brandColors.border};">
              <p style="margin: 0; color: ${brandColors.lightGray}; font-size: 12px;">
                PZ Academy Mentorship Platform<br>
                © 2024 Pharmacozyme. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Valid email regex pattern (basic)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limit: 100 emails per minute
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_SECONDS = 60;

interface AuthEmailRequest {
  event: {
    type: "user.invited" | "user.signed_up" | "passwordrecovery.created" | "user.email_change.confirmed";
    user: {
      id: string;
      email: string;
    };
    action_link: string;
  };
}

interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
  ok: boolean;
}

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
  return email && EMAIL_REGEX.test(email);
}

/**
 * Gets email template and subject based on event type
 */
function getEmailTemplate(
  eventType: string,
  email: string,
  actionLink: string
): { subject: string; html: string } | null {
  switch (eventType) {
    case "user.invited":
      return {
        subject: "You're Invited to PZ Academy",
        html: inviteEmailHtml(email, actionLink),
      };
    case "user.signed_up":
      return {
        subject: "Verify Your Email Address",
        html: signupConfirmEmailHtml(email, actionLink),
      };
    case "passwordrecovery.created":
      return {
        subject: "Reset Your Password",
        html: resetPasswordEmailHtml(email, actionLink),
      };
    case "user.email_change.confirmed":
      return {
        subject: "Confirm Your Email Change",
        html: emailChangeConfirmEmailHtml(email, actionLink),
      };
    default:
      return null;
  }
}

/**
 * Main handler function
 */
export default async (
  req: Request,
): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse request body
    const data: AuthEmailRequest = await req.json();

    // Validate required fields
    if (!data.event || !data.event.type || !data.event.user || !data.event.action_link) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { event } = data;
    const userEmail = event.user.email;
    const userId = event.user.id;
    const actionLink = event.action_link;
    const eventType = event.type;

    // Validate email
    if (!isValidEmail(userEmail)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate action_link
    if (!actionLink || typeof actionLink !== "string" || actionLink.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Invalid or missing action_link" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get email template
    const emailTemplate = getEmailTemplate(eventType, userEmail, actionLink);
    if (!emailTemplate) {
      return new Response(
        JSON.stringify({ error: `Unknown event type: ${eventType}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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

    // Rate limit check: count emails sent in the last 60 seconds
    const oneMinuteAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();

    const { count, error: countError } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .gt("created_at", oneMinuteAgo);

    if (countError) {
      console.error("Rate limit check error:", countError);
      return new Response(
        JSON.stringify({ error: "Failed to check rate limit" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if ((count || 0) >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded (100/min)" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert email into queue
    const createdMinute = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM

    const { data: insertData, error: insertError } = await supabase
      .from("email_queue")
      .insert({
        event_type: eventType,
        user_id: userId,
        user_email: userEmail,
        subject: emailTemplate.subject,
        html_content: emailTemplate.html,
        status: "pending",
        created_minute: createdMinute,
      });

    if (insertError) {
      console.error("Email queue insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to queue email" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Success response
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
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
