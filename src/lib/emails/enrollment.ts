import "server-only";
import { sendTransactionalEmail } from "@/lib/brevo";

/**
 * Transactional emails for the enrollment lifecycle.
 *
 * Kept separate from src/lib/email-templates.ts, which is scoped to auth
 * events (invite / signup / reset / email change). Same visual shell, same
 * brand colours, different domain.
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

/**
 * Escapes interpolated values. Course titles and rejection reasons are
 * operator- and admin-authored free text going straight into an HTML email —
 * without this a stray `<` silently breaks the layout, and a crafted note
 * could inject markup into a message the student trusts.
 */
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

const p = (html: string) =>
  `<p style="margin: 0 0 20px; color: ${COLORS.lightGray};">${html}</p>`;

export interface EnrollmentEmailContext {
  fullName: string;
  courseTitle: string;
  courseSlug: string;
  /** Only read by the "rejected" email. */
  rejectionReason?: string | null;
  /** Only read by the "shortfall" email. */
  shortfallPkr?: number | null;
}

type EnrollmentEmailKind = "received" | "approved" | "reserved" | "rejected" | "shortfall" | "leadWelcome";

function buildEmail(
  kind: EnrollmentEmailKind,
  ctx: EnrollmentEmailContext,
): { subject: string; html: string } {
  const name = esc(ctx.fullName.trim() || "there");
  const course = `<strong>${esc(ctx.courseTitle)}</strong>`;

  switch (kind) {
    case "received":
      return {
        subject: `We received your enrollment — ${ctx.courseTitle}`,
        html: shell({
          title: "Enrollment received",
          heading: "Enrollment Received",
          accent: COLORS.gold,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`Thanks — we've received your enrollment request for ${course}.`) +
            p(
              "Our team is verifying your payment now. This usually takes 24–48 hours, and we'll email you the moment it's confirmed. You don't need to do anything else.",
            ),
        }),
      };

    case "approved":
      return {
        subject: `You're in — ${ctx.courseTitle}`,
        html: shell({
          title: "Enrollment approved",
          heading: "Payment Verified — You're In! 🎓",
          accent: COLORS.deepGreen,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`Your payment for ${course} has been verified and your enrollment is now active.`) +
            p("Your first lesson is unlocked and waiting. Jump in whenever you're ready."),
          cta: { label: "Start Learning", href: `${APP_URL}/portal/${ctx.courseSlug}` },
        }),
      };

    case "reserved":
      return {
        subject: `Your seat is reserved — ${ctx.courseTitle}`,
        html: shell({
          title: "Seat reserved",
          heading: "Your Seat Is Reserved",
          accent: COLORS.gold,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`We're holding your seat in ${course} while your payment is completed.`) +
            p(
              "Course content unlocks as soon as the remaining payment is confirmed. If you've already paid in full, reply to this email or message us on WhatsApp and we'll sort it out.",
            ),
          cta: { label: "Complete Payment", href: `${APP_URL}/enroll/${ctx.courseSlug}` },
        }),
      };

    case "rejected":
      return {
        subject: `Action needed for your enrollment — ${ctx.courseTitle}`,
        html: shell({
          title: "Enrollment not approved",
          heading: "We Couldn't Verify Your Payment",
          accent: COLORS.danger,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`We weren't able to approve your enrollment for ${course}.`) +
            (ctx.rejectionReason
              ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 20px;">
                <tr><td style="background-color: #fff5f5; border-left: 4px solid ${COLORS.danger}; padding: 14px 18px; border-radius: 4px;">
                  <p style="margin: 0; color: ${COLORS.darkGray}; font-size: 14px;"><strong>Reason:</strong> ${esc(ctx.rejectionReason)}</p>
                </td></tr>
              </table>`
              : "") +
            p(
              "You can submit a new payment from the course page once this is resolved — your place isn't lost.",
            ),
          cta: { label: "Submit New Payment", href: `${APP_URL}/enroll/${ctx.courseSlug}` },
        }),
      };

    case "shortfall":
      return {
        subject: `Additional payment needed — ${ctx.courseTitle}`,
        html: shell({
          title: "Additional payment needed",
          heading: "A Balance Is Still Due",
          accent: COLORS.gold,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`We received a partial payment for ${course}.`) +
            p(
              `<strong>Rs. ${(ctx.shortfallPkr ?? 0).toLocaleString("en-GB")}</strong> is still due to complete your enrollment.`,
            ) +
            p("Your seat is held, but course content unlocks once the remaining amount is confirmed."),
          cta: { label: "Complete Payment", href: `${APP_URL}/enroll/${ctx.courseSlug}` },
        }),
      };

    case "leadWelcome":
      return {
        subject: `Create your account to access ${ctx.courseTitle}`,
        html: shell({
          title: "Create your account",
          heading: "Almost There",
          accent: COLORS.deepGreen,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`We received your submission for ${course}.`) +
            p(
              "To access the course, create your PZ Academy account with this same email address.",
            ) +
            p(
              "Already have an account under a different email? Reply to this email or message us on WhatsApp and we'll link it up.",
            ),
          cta: { label: "Create Your Account", href: `${APP_URL}/register` },
        }),
      };
  }
}

/**
 * Sends an enrollment email. Never throws and never rejects.
 *
 * Callers fire this AFTER the status change has already been committed, so a
 * dead Brevo key or a network blip must not surface as a failed approval —
 * the student's access is the source of truth, the email is a notification.
 * Returns whether the send succeeded so the caller can log it.
 */
export async function sendEnrollmentEmail(
  kind: EnrollmentEmailKind,
  to: string | null | undefined,
  ctx: EnrollmentEmailContext,
): Promise<boolean> {
  if (!to) {
    console.warn(`[enrollment-email] skipped "${kind}": no recipient address`);
    return false;
  }

  try {
    const { subject, html } = buildEmail(kind, ctx);
    await sendTransactionalEmail({
      to,
      toName: ctx.fullName || undefined,
      subject,
      htmlContent: html,
    });
    return true;
  } catch (error) {
    console.error(`[enrollment-email] failed to send "${kind}" to ${to}:`, error);
    return false;
  }
}
