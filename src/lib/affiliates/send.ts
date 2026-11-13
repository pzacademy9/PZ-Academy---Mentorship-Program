// src/lib/affiliates/send.ts
// Sends the three affiliate emails and writes each attempt to the history. Never throws:
// a failed email returns false and the caller keeps its change.
import "server-only";
import { sendAffiliateEmail } from "@/lib/brevo-affiliates";
import { logAffiliateEmail, type AffiliateEmailKind } from "@/lib/data/affiliate-emails";
import { getEmailMessage } from "@/lib/data/affiliate-email-settings";
import { droppedEmail, leftEmail } from "./emails";
import { messageBlockPlain, welcomeEmailRich, progressEmail, motivationEmail, payoutPaidEmail, payoutRejectedEmail, type ProgressInput, type MotivationInput } from "./rich-emails";
import { affiliateGroupWa, affiliateLink, affiliateSupportWa } from "./contact";

async function deliver(
  who: { id: string; name: string; email: string },
  kind: AffiliateEmailKind,
  mail: { subject: string; html: string },
): Promise<boolean> {
  let ok = false;
  let error: string | undefined;
  try {
    const r = await sendAffiliateEmail({ to: who.email, toName: who.name, subject: mail.subject, htmlContent: mail.html });
    ok = r.ok;
    if (!r.ok) error = r.error;
  } catch (e) {
    error = e instanceof Error ? e.message : "Send failed";
  }
  await logAffiliateEmail({ affiliateId: who.id, kind, toEmail: who.email, ok, error });
  return ok;
}

export async function sendAccepted(a: { id: string; name: string; email: string; code: string; team: string | null; token: string }): Promise<boolean> {
  // A failed read of the message box must never stop the Accepted email: send without a message.
  let messageHtml = "";
  try {
    messageHtml = messageBlockPlain(await getEmailMessage());
  } catch {
    messageHtml = "";
  }
  return deliver(
    a,
    "accepted",
    welcomeEmailRich({
      name: a.name,
      code: a.code,
      team: a.team ? `Team ${a.team}` : "Not set yet",
      link: affiliateLink(a.token),
      supportWa: affiliateSupportWa(),
      groupWa: affiliateGroupWa(),
      messageHtml,
    }),
  );
}
export const sendProgress = (a: { id: string; name: string; email: string }, input: ProgressInput) => deliver(a, "progress", progressEmail(input));
export const sendMotivation = (a: { id: string; name: string; email: string }, input: MotivationInput) => deliver(a, "motivation", motivationEmail(input));
export const sendPayoutPaid = (a: { id: string; name: string; email: string }, input: Parameters<typeof payoutPaidEmail>[0]) => deliver(a, "payout_paid", payoutPaidEmail(input));
export const sendPayoutRejected = (a: { id: string; name: string; email: string }, input: Parameters<typeof payoutRejectedEmail>[0]) => deliver(a, "payout_rejected", payoutRejectedEmail(input));
export const sendDropped = (a: { id: string; name: string; email: string }) => deliver(a, "dropped", droppedEmail({ name: a.name }));
export const sendLeft = (a: { id: string; name: string; email: string }) => deliver(a, "left", leftEmail({ name: a.name }));
