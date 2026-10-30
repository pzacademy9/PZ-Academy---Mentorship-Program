// Who would receive a class email or an ID email, and who would not and why.
import "server-only";
import { resolveCandidates } from "@/lib/data/participant-campaigns";
import { pzIdsFor } from "@/lib/data/participant-sends";
import { listUnsubscribed } from "@/lib/data/participant-prefs";
import type { RegistrationListFilters } from "@/lib/data/landing-registration-admin";
import type { Candidate } from "@/lib/landing/participants/types";
import { matchAudience, parseOption, type Audience, type ExcludeReason } from "@/lib/classes/audience";

export type PreviewPerson = { name: string; email: string; optionLabel: string };
export type NotReceivingReason = "no_id" | "no_email" | "unsubscribed" | ExcludeReason;
export type RecipientPreview = {
  receiving: PreviewPerson[];
  notReceiving: (PreviewPerson & { reason: NotReceivingReason })[];
};

export function buildRecipientPreview(
  candidates: Candidate[],
  opts: { audience?: Audience; requirePzId: boolean; pzIds: Map<string, string>; unsubscribed: Set<string> },
): RecipientPreview {
  const receiving: PreviewPerson[] = [];
  const notReceiving: RecipientPreview["notReceiving"] = [];
  for (const c of candidates) {
    const person: PreviewPerson = { name: c.name, email: c.email, optionLabel: c.optionLabel ?? "" };
    const email = c.email.trim().toLowerCase();
    const hasId = opts.pzIds.has(c.registrationId);
    const paidOrFree = c.status === "paid" || c.status === "free";
    let reason: NotReceivingReason | null = null;
    if (opts.audience ? !paidOrFree || !hasId : opts.requirePzId && !hasId) reason = "no_id";
    else if (email === "") reason = "no_email";
    else if (opts.unsubscribed.has(email)) reason = "unsubscribed";
    else if (opts.audience) {
      const m = matchAudience(parseOption(person.optionLabel), opts.audience);
      if (!m.include) reason = m.reason;
    }
    if (reason) notReceiving.push({ ...person, reason });
    else receiving.push(person);
  }
  return { receiving, notReceiving };
}

export async function previewRecipients(input: {
  pageId: string;
  ids?: string[];
  filters?: RegistrationListFilters;
  audience?: Audience;
  requirePzId?: boolean;
}): Promise<RecipientPreview> {
  const candidates = await resolveCandidates({ pageId: input.pageId, ids: input.ids, filters: input.filters });
  const pzIds = await pzIdsFor(candidates.map((c) => c.registrationId));
  const unsubscribed = await listUnsubscribed(candidates.map((c) => c.email).filter((e) => e.trim() !== ""));
  return buildRecipientPreview(candidates, {
    audience: input.audience,
    requirePzId: input.requirePzId ?? false,
    pzIds,
    unsubscribed,
  });
}
