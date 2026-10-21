import "server-only";
import { listPaymentAccounts } from "@/lib/data/landing-payment-accounts";
import type { RegistrationRecord } from "@/lib/data/landing-registrations";
import type { RegistrablePage } from "@/lib/data/landing-public";
import { resolveAccess, type ResolvedAccess } from "@/lib/data/landing-enrollment";
import {
  buildFreeJoiningEmail, buildMemberReceivedEmail, buildPaidEmail, buildReceivedEmail, buildReservedEmail, buildUnderpaidEmail,
  formatStartsOn, type BuiltEmail, type LandingEmailContext,
} from "@/lib/emails/landing-registration";
import { buildVerifyMessage, whatsappVerifyUrl } from "./labels";
import { selectWaGroups } from "./wa-groups";
import { emailGetsPortalLink } from "./access-rules";
import type { ManualEmailKind } from "./manual-kinds";

export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmacozyme.com";

/** The shared email context for a registration's lead and page. */
export async function emailContext(lead: RegistrationRecord, page: RegistrablePage): Promise<LandingEmailContext> {
  const cfg = page.registration;
  const region = cfg.regions.find((r) => r.key === lead.region) ?? null;
  const isFree = lead.status === "free";
  const accounts = !isFree && region ? await listPaymentAccounts(region.accountKeys) : [];
  const refId = lead.refId ?? "";
  const verifyMessage = buildVerifyMessage(cfg, { name: lead.name, email: lead.email, refId, optionLabel: lead.optionLabel, isFree });
  return {
    name: lead.name,
    eventLabel: cfg.eventLabel || page.title,
    refId,
    optionLabel: lead.optionLabel,
    currency: lead.currency,
    amount: lead.expectedAmount ?? 0,
    groupSize: lead.groupSize,
    region: region ? { label: region.label, classTime: region.classTime, timezoneLabel: region.timezoneLabel } : null,
    startsOn: formatStartsOn(page.content.settings.countdownTo),
    accounts,
    waGroups: selectWaGroups(cfg, lead.optionKeys, lead.mode),
    verifyUrl: verifyMessage ? whatsappVerifyUrl(cfg.whatsappVerifyNumber, verifyMessage) : "",
    supportWhatsapp: cfg.whatsappVerifyNumber,
  };
}

/**
 * Builds the text of one status email for one person, as of now. Builds only: it never sends, claims,
 * logs or changes anything. `base` and `access` may be passed by a caller that already has them
 * (the automatic sender reuses its own so the number of lookups stays the same).
 */
export async function buildStatusEmail(p: {
  kind: ManualEmailKind;
  person: RegistrationRecord;
  lead: RegistrationRecord;
  page: RegistrablePage;
  asOf?: "now";
  base?: LandingEmailContext;
  access?: ResolvedAccess;
}): Promise<BuiltEmail> {
  const { kind, person, lead, page } = p;
  const base = p.base ?? (await emailContext(lead, page));
  if (kind === "received") {
    if (person.rowType === "member") {
      const ctx = { ...base, name: person.name, accounts: [] };
      return lead.status === "free" ? buildFreeJoiningEmail(ctx) : buildMemberReceivedEmail({ ...ctx, leadName: lead.name });
    }
    return lead.status === "free" ? buildFreeJoiningEmail(base) : buildReceivedEmail(base);
  }
  const access = p.access ?? (await resolveAccess(person.id));
  if (!access) throw new Error("registration access could not be resolved");
  const { desired, courseId, courseSlug, hasAccount } = access;
  const isPaid = kind === "paid";
  const portalUrl = hasAccount && courseSlug && emailGetsPortalLink(desired) ? `${appUrl()}/portal/${courseSlug}` : undefined;
  const ctx: LandingEmailContext = {
    ...base,
    name: person.name,
    email: person.email,
    amountReceived: person.amountReceived,
    coveredByGroup: person.rowType === "member",
    portalUrl,
    needsAccount: isPaid && courseId !== null && !hasAccount,
    signupUrl: `${appUrl()}/register`,
    portalOpensLater: isPaid && lead.mode === "live" && !desired.portalOpen,
    noCourse: courseId === null,
  };
  return kind === "paid" ? buildPaidEmail(ctx) : kind === "underpaid" ? buildUnderpaidEmail(ctx) : buildReservedEmail(ctx);
}
