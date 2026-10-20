import type { RegistrationStatus } from "@/lib/landing/registration/config";
import type { Candidate, Channel, SkipReason, Summary } from "./types";

type Plan = { send: Candidate[]; skipped: { candidate: Candidate; reason: SkipReason }[] };

const norm = (email: string) => email.trim().toLowerCase();

export function planRecipients(candidates: Candidate[], channel: Channel, unsubscribed: Set<string>): Plan {
  const send: Candidate[] = [];
  const skipped: Plan["skipped"] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const email = norm(candidate.email);
    if (channel === "email") {
      if (email === "") { skipped.push({ candidate, reason: "no_email" }); continue; }
      if (unsubscribed.has(email)) { skipped.push({ candidate, reason: "unsubscribed" }); continue; }
    } else if (candidate.phone.trim() === "") {
      skipped.push({ candidate, reason: "no_phone" });
      continue;
    }
    // Email dedupe applies to the email channel only; WhatsApp does not dedupe.
    if (channel === "email") {
      if (seen.has(email)) { skipped.push({ candidate, reason: "merged" }); continue; }
      seen.add(email);
    }
    send.push(candidate);
  }
  return { send, skipped };
}

export function summarize(plan: Plan, _channel: Channel): Summary {
  const byStatus: Record<RegistrationStatus, number> = { pending: 0, reserved: 0, underpaid: 0, paid: 0, free: 0 };
  const skipped: Record<SkipReason, number> = { no_email: 0, no_phone: 0, unsubscribed: 0, merged: 0 };
  let members = 0;
  for (const c of plan.send) {
    byStatus[c.status] += 1;
    if (c.isMember) members += 1;
  }
  for (const s of plan.skipped) skipped[s.reason] += 1;
  // "free" counts as not Paid (owner's Paid-only concern).
  const notPaid = plan.send.length - byStatus.paid;
  return { total: plan.send.length, byStatus, notPaid, skipped, members };
}
