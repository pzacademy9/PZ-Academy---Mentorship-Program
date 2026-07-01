import "server-only";
import { BrevoClient } from "@getbrevo/brevo";

const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY! });

interface SendEmailOpts {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
}

export async function sendTransactionalEmail(opts: SendEmailOpts) {
  return client.transactionalEmails.sendTransacEmail({
    sender: {
      email: process.env.BREVO_SENDER_EMAIL!,
      name: process.env.BREVO_SENDER_NAME!,
    },
    to: [{ email: opts.to, name: opts.toName }],
    subject: opts.subject,
    htmlContent: opts.htmlContent,
  });
}

export function welcomeEmailHtml(opts: {
  full_name: string;
  magic_link: string;
  course_name?: string;
}) {
  const course = opts.course_name ?? "PZ Academy";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Inter,sans-serif;background:#f2faf5;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(13,51,32,.10);">
    <div style="background:#0d3320;padding:32px;text-align:center;">
      <h1 style="color:#3ecf70;font-size:24px;margin:0;">PZ Academy</h1>
      <p style="color:#b0f5cc;margin:8px 0 0;">by Pharmacozyme</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#0d3320;font-size:20px;">Welcome, ${opts.full_name}! 🎓</h2>
      <p style="color:#527a60;line-height:1.6;">
        Your access to <strong>${course}</strong> is ready. Click the button below to sign in — no password needed.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${opts.magic_link}"
           style="background:#3ecf70;color:#0d3320;font-weight:700;padding:14px 32px;border-radius:100px;text-decoration:none;font-size:16px;display:inline-block;">
          Access My Account →
        </a>
      </div>
      <p style="color:#527a60;font-size:13px;">This link expires in 24 hours. If you didn't request this, ignore this email.</p>
      <hr style="border:none;border-top:1px solid #d6ead9;margin:24px 0;">
      <p style="color:#527a60;font-size:13px;">Need help? WhatsApp us at <a href="https://wa.me/923700199429" style="color:#0d3320;">+92 370 019 9429</a></p>
    </div>
  </div>
</body>
</html>`;
}
