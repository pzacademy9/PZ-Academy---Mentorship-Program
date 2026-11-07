// src/lib/affiliates/send.ts
// Sends the three affiliate emails and writes each attempt to the history. Never throws:
// a failed email returns false and the caller keeps its change.
import "server-only";
import { sendAffiliateEmail } from "@/lib/brevo-affiliates";
import { logAffiliateEmail, type AffiliateEmailKind } from "@/lib/data/affiliate-emails";
import { acceptedEmail, droppedEmail, leftEmail } from "./emails";
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

export function sendAccepted(a: { id: string; name: string; email: string; code: string; team: string | null; token: string }): Promise<boolean> {
  return deliver(
    a,
    "accepted",
    acceptedEmail({
      name: a.name,
      code: a.code,
      team: a.team ? `Team ${a.team}` : "Not set yet",
      link: affiliateLink(a.token),
      supportWa: affiliateSupportWa(),
      groupWa: affiliateGroupWa(),
    }),
  );
}
export const sendDropped = (a: { id: string; name: string; email: string }) => deliver(a, "dropped", droppedEmail({ name: a.name }));
export const sendLeft = (a: { id: string; name: string; email: string }) => deliver(a, "left", leftEmail({ name: a.name }));
