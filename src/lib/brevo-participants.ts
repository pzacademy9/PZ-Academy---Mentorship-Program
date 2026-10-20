import "server-only";
import { BrevoClient } from "@getbrevo/brevo";

/**
 * Separate Brevo account for messages to campaign participants, so their
 * reputation and quota stay apart from the main sender in src/lib/brevo.ts.
 * Created lazily so a missing key is a clean "not set up" result, not a
 * crash at import time. The key value is never logged.
 */
let client: BrevoClient | null = null;

function getClient(): BrevoClient | null {
  const apiKey = process.env.BREVO_API_KEY_PARTICIPANTS;
  if (!apiKey) return null;
  client ??= new BrevoClient({ apiKey });
  return client;
}

export async function sendParticipantEmail(opts: {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const brevo = getClient();
    if (!brevo) return { ok: false, error: "Participant email is not set up" };
    await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        email: (process.env.BREVO_SENDER_EMAIL_PARTICIPANTS || process.env.BREVO_SENDER_EMAIL)!,
        name: (process.env.BREVO_SENDER_NAME_PARTICIPANTS || process.env.BREVO_SENDER_NAME)!,
      },
      to: [{ email: opts.to, name: opts.toName }],
      subject: opts.subject,
      htmlContent: opts.htmlContent,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}
