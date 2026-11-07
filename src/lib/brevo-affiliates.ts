import "server-only";
import { BrevoClient } from "@getbrevo/brevo";

/**
 * Separate Brevo account for affiliate messages, so their reputation and
 * quota stay apart from the main sender and the participants sender.
 * No fallback to any other sender: a missing setting is a clean
 * "not set up" result. The key value is never logged.
 */
let client: BrevoClient | null = null;

function getClient(): BrevoClient | null {
  const apiKey = process.env.BREVO_API_KEY_AFFILIATES;
  if (!apiKey) return null;
  client ??= new BrevoClient({ apiKey });
  return client;
}

export async function sendAffiliateEmail(opts: {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const brevo = getClient();
    if (!brevo) return { ok: false, error: "Affiliate email is not set up" };
    const email = process.env.BREVO_SENDER_EMAIL_AFFILIATES;
    const name = process.env.BREVO_SENDER_NAME_AFFILIATES;
    if (!email || !name) return { ok: false, error: "Affiliate email sender is not set up" };
    await brevo.transactionalEmails.sendTransacEmail({
      sender: { email, name },
      to: [{ email: opts.to, name: opts.toName }],
      subject: opts.subject,
      htmlContent: opts.htmlContent,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}
