import "server-only";
import { sendTransactionalEmail } from "@/lib/brevo";

/**
 * Transactional emails for the mentorship booking/application lifecycle.
 * Structurally parallel to src/lib/emails/enrollment.ts but kept as its own
 * module — the context shape genuinely differs (no courseTitle/courseSlug).
 */

const COLORS = {
  deepGreen: "#0f3d22",
  brightGreen: "#7ed957",
  paleGreen: "#c8f0a0",
  gold: "#c9960a",
  danger: "#ef4444",
  darkGray: "#333333",
  lightGray: "#666666",
  border: "#e0e0e0",
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmacozyme.com";
const WHATSAPP = "https://wa.me/923700199429";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(opts: {
  title: string;
  heading: string;
  accent: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
}): string {
  const cta = opts.cta
    ? `
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${opts.cta.href}" style="background-color: ${COLORS.brightGreen}; color: ${COLORS.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      ${esc(opts.cta.label)}
                    </a>
                  </td>
                </tr>
              </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(opts.title)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: ${COLORS.darkGray}; line-height: 1.6; background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <tr>
            <td style="background-color: ${COLORS.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="font-family: 'Montserrat', sans-serif; font-weight: 600; margin: 0; font-size: 28px; color: ${COLORS.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${COLORS.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-family: 'Montserrat', sans-serif; font-weight: 600; color: ${opts.accent}; font-size: 22px; margin: 0 0 20px;">${esc(opts.heading)}</h2>
              ${opts.bodyHtml}
              ${cta}
              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.lightGray}; font-size: 13px;">
                Questions? WhatsApp us at <a href="${WHATSAPP}" style="color: ${COLORS.deepGreen};">+92 370 019 9429</a>.
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

const p = (html: string) => `<p style="margin: 0 0 20px; color: ${COLORS.lightGray};">${html}</p>`;

export interface MentorshipEmailContext {
  fullName: string;
  /** Only read by booking emails. */
  mentorName?: string;
  /** Only read by the "bookingCancelled" email. */
  cancellationReason?: string | null;
  /** Only read by the "applicationRejected" email. */
  rejectionReason?: string | null;
}

export type MentorshipEmailKind =
  | "bookingReceived"
  | "bookingConfirmed"
  | "bookingCancelled"
  | "applicationReceived"
  | "applicationApproved"
  | "applicationRejected";

function buildEmail(kind: MentorshipEmailKind, ctx: MentorshipEmailContext): { subject: string; html: string } {
  const name = esc(ctx.fullName.trim() || "there");
  const mentor = ctx.mentorName ? `<strong>${esc(ctx.mentorName)}</strong>` : "your mentor";

  switch (kind) {
    case "bookingReceived":
      return {
        subject: "We received your mentorship booking",
        html: shell({
          title: "Booking received",
          heading: "Booking Received",
          accent: COLORS.gold,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`Thanks — we've received your session booking with ${mentor}.`) +
            p("Our team verifies payment and confirms sessions within 24 hours. You'll get an email the moment it's confirmed."),
        }),
      };

    case "bookingConfirmed":
      return {
        subject: "Your mentorship session is confirmed",
        html: shell({
          title: "Booking confirmed",
          heading: "Your Session Is Confirmed",
          accent: COLORS.deepGreen,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`Your session with ${mentor} is confirmed. They'll be in touch to schedule a time.`),
          cta: { label: "View My Bookings", href: `${APP_URL}/dashboard/sessions` },
        }),
      };

    case "bookingCancelled":
      return {
        subject: "Your mentorship booking was cancelled",
        html: shell({
          title: "Booking cancelled",
          heading: "Booking Cancelled",
          accent: COLORS.danger,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`Your session booking with ${mentor} could not be confirmed.`) +
            (ctx.cancellationReason
              ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 20px;">
                <tr><td style="background-color: #fff5f5; border-left: 4px solid ${COLORS.danger}; padding: 14px 18px; border-radius: 4px;">
                  <p style="margin: 0; color: ${COLORS.darkGray}; font-size: 14px;"><strong>Reason:</strong> ${esc(ctx.cancellationReason)}</p>
                </td></tr>
              </table>`
              : "") +
            p("Reply to this email or message us on WhatsApp if you'd like to rebook."),
        }),
      };

    case "applicationReceived":
      return {
        subject: "We received your mentor application",
        html: shell({
          title: "Application received",
          heading: "Application Received",
          accent: COLORS.gold,
          bodyHtml:
            p(`Hi ${name},`) +
            p("Thanks for applying to become a PZ Academy mentor.") +
            p("Our team reviews every application carefully and will reach out within 48 hours."),
        }),
      };

    case "applicationApproved":
      return {
        subject: "You're approved as a PZ Academy mentor",
        html: shell({
          title: "Application approved",
          heading: "Welcome to the Mentor Network",
          accent: COLORS.deepGreen,
          bodyHtml:
            p(`Hi ${name},`) +
            p("Your mentor application has been approved. Our team will be in touch with next steps."),
        }),
      };

    case "applicationRejected":
      return {
        subject: "Update on your mentor application",
        html: shell({
          title: "Application not approved",
          heading: "Your Application Wasn't Approved This Time",
          accent: COLORS.danger,
          bodyHtml:
            p(`Hi ${name},`) +
            p("We appreciate your interest in joining the PZ Academy mentor network.") +
            (ctx.rejectionReason
              ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 20px;">
                <tr><td style="background-color: #fff5f5; border-left: 4px solid ${COLORS.danger}; padding: 14px 18px; border-radius: 4px;">
                  <p style="margin: 0; color: ${COLORS.darkGray}; font-size: 14px;"><strong>Note:</strong> ${esc(ctx.rejectionReason)}</p>
                </td></tr>
              </table>`
              : "") +
            p("You're welcome to reapply in the future as your experience grows."),
        }),
      };
  }
}

export async function sendMentorshipEmail(
  kind: MentorshipEmailKind,
  to: string | null | undefined,
  ctx: MentorshipEmailContext,
): Promise<boolean> {
  if (!to) {
    console.warn(`[mentorship-email] skipped "${kind}": no recipient address`);
    return false;
  }

  try {
    const { subject, html } = buildEmail(kind, ctx);
    await sendTransactionalEmail({ to, toName: ctx.fullName || undefined, subject, htmlContent: html });
    return true;
  } catch (error) {
    console.error(`[mentorship-email] failed to send "${kind}" to ${to}:`, error);
    return false;
  }
}
