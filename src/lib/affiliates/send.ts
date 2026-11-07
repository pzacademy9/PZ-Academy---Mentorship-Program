// src/lib/affiliates/send.ts
// Sends the three affiliate emails. Never throws: a failed email returns false and the caller keeps its change.
import "server-only";
import { sendAffiliateEmail } from "@/lib/brevo-affiliates";
import { acceptedEmail, droppedEmail, leftEmail } from "./emails";
import { affiliateGroupWa, affiliateLink, affiliateSupportWa } from "./contact";

async function deliver(to: string, toName: string, mail: { subject: string; html: string }): Promise<boolean> {
  try {
    const r = await sendAffiliateEmail({ to, toName, subject: mail.subject, htmlContent: mail.html });
    return r.ok;
  } catch {
    return false;
  }
}

export function sendAccepted(a: { name: string; email: string; code: string; team: string | null; token: string }): Promise<boolean> {
  return deliver(
    a.email,
    a.name,
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
export const sendDropped = (a: { name: string; email: string }) => deliver(a.email, a.name, droppedEmail({ name: a.name }));
export const sendLeft = (a: { name: string; email: string }) => deliver(a.email, a.name, leftEmail({ name: a.name }));
