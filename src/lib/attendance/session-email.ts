// Default text of a live-session email. Plain text with tags; the send renders them per person.
export type SessionEmailSource = {
  title: string;
  number: number;
  include_kahoot: boolean;
  kahoot_url: string;
  include_attendance_link: boolean;
};

export function buildSessionEmail(
  session: SessionEmailSource,
  kind: "reminder" | "update" = "reminder",
  opts: { resend?: boolean } = {},
): { subject: string; body: string } {
  const name = session.title.trim() !== "" ? session.title.trim() : `Session ${session.number}`;
  const lines: string[] = ["Hi {{first_name}},", ""];
  const resend = kind === "update" && !!opts.resend;
  if (resend) {
    lines.push(`Here are the details of your live session "${name}":`);
  } else if (kind === "update") {
    lines.push(`The time of your live session "${name}" has changed. The new time is:`);
  } else {
    lines.push(`Your live session "${name}" is coming up:`);
  }
  lines.push("{{session_time}}", "", "Join on Zoom here:", "{{zoom_link}}");
  if (session.include_kahoot && session.kahoot_url.trim() !== "") {
    lines.push("", "Kahoot quiz link:", "{{kahoot_link}}");
  }
  if (session.include_attendance_link) {
    lines.push("", "Mark your attendance with this link during the session:", "{{attendance_link}}");
  }
  lines.push("", "Your PZ ID: {{pz_id}}", "", "See you there,", "PZ Academy");
  const subject = resend
    ? `Your class details: ${name}`
    : kind === "update" ? `Updated: ${name} is on a new time` : `Reminder: ${name} is coming up`;
  return { subject, body: lines.join("\n") };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The email that asks students for feedback on one class. Short and plain: a greeting, one line, one button.
 * Every value is HTML-escaped. `text` is the plain version (the link on its own line).
 */
export function buildFeedbackEmail(source: {
  batchTitle: string;
  classTitle: string;
  feedbackUrl: string;
  firstName: string;
}): { subject: string; html: string; text: string } {
  const name = source.firstName.trim() !== "" ? source.firstName.trim() : "there";
  const cls = source.classTitle.trim();
  const batch = source.batchTitle.trim();
  const subject = `How was ${cls}? Share your feedback`;
  const intro = `Thank you for joining ${cls}${batch !== "" ? ` (${batch})` : ""}. Please tell us how it went. It takes less than a minute.`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">` +
    `<p>Hi ${escapeHtml(name)},</p>` +
    `<p>${escapeHtml(intro)}</p>` +
    `<p><a href="${escapeHtml(source.feedbackUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;` +
    `text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:8px">Give your feedback</a></p>` +
    `<p>Thank you,<br>PZ Academy</p></div>`;
  const text = [`Hi ${name},`, "", intro, "", "Give your feedback:", source.feedbackUrl, "", "Thank you,", "PZ Academy"].join("\n");
  return { subject, html, text };
}
