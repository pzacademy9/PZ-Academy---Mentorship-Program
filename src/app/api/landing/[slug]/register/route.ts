// src/app/api/landing/[slug]/register/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { CLOSED_MESSAGE, loadPublicPage, publicJson, variantParam } from "@/lib/api/landing-public-http";
import { getPromoByCode, emailUsedPromo, normalizePromoCode } from "@/lib/data/landing-promo-codes";
import { resolveAgentCode } from "@/lib/data/landing-agent-links";
import {
  countRecentRegistrations, createRegistration, findOpenRegistration, findRecentRegistration, type OkPromo,
} from "@/lib/data/landing-registrations";
import { resolveAccountKeysSafe } from "@/lib/data/landing-payment-countries";
import { enqueueJobs, runJobsDirect, runJobsFor, type JobType } from "@/lib/data/landing-jobs";
import { uploadLandingVoucher } from "@/lib/gas/event-sheet-client";
import { runInBackground } from "@/lib/landing/registration/background";
import type { Mode, RegistrationConfig } from "@/lib/landing/registration/config";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { applyPromo, promoMessage, type PromoCode } from "@/lib/landing/registration/promo";
import { QUOTE_ERRORS } from "@/lib/landing/registration/public-config";
import { registerPayloadSchema } from "@/lib/landing/registration/submit-schema";
import { buildVerifyMessage, registrationOptionLabel } from "@/lib/landing/registration/labels";
import { selectWaGroups } from "@/lib/landing/registration/wa-groups";
import { checkVoucher } from "@/lib/landing/registration/voucher";

// Voucher upload to Apps Script plus the background jobs that waitUntil keeps alive.
export const maxDuration = 60;

const REPLAY_WINDOW_MINUTES = 15;
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX = 3;

const fail = (error: string, status: number, field?: string) => publicJson(field ? { error, field } : { error }, status);
const minutesBefore = (d: Date, minutes: number) => new Date(d.getTime() - minutes * 60_000).toISOString();

async function sessionUser(): Promise<{ id: string; email: string } | null> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: (data.user.email ?? "").trim().toLowerCase() } : null;
  } catch {
    return null;
  }
}

interface Selection { optionKeys: string[]; mode: Mode; tierKey: string; groupSize: number }
const sameSelection = (a: Selection, b: Selection) =>
  a.mode === b.mode && a.tierKey === b.tierKey && a.groupSize === b.groupSize && a.optionKeys.join(",") === b.optionKeys.join(",");

function successBody(
  config: RegistrationConfig,
  d: { refId: string; name: string; email: string; optionKeys: string[]; mode: Mode; optionLabel: string; total: number; currency: string; isFree: boolean },
) {
  return {
    refId: d.refId,
    total: d.total,
    currency: d.currency,
    waGroups: selectWaGroups(config, d.optionKeys, d.mode),
    verifyMessage: buildVerifyMessage(config, { name: d.name, email: d.email, refId: d.refId, optionLabel: d.optionLabel, isFree: d.isFree }),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gate = await loadPublicPage(slug, { registration: true, variant: variantParam(req) });
  if (!gate.ok) return gate.response;
  const { page } = gate;
  const config = page.registration;

  // 1. Body: multipart with a JSON `payload` and an optional `voucher` file.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Invalid input", 400);
  }
  const rawPayload = form.get("payload");
  let raw: unknown;
  try {
    raw = JSON.parse(typeof rawPayload === "string" ? rawPayload : "");
  } catch {
    return fail("Invalid input", 400);
  }
  const honeypot = raw && typeof raw === "object" ? (raw as Record<string, unknown>).honeypot : undefined;
  // Checked on the raw body, before any schema work. Bots get no field name and no detail.
  if (honeypot !== undefined && honeypot !== null && honeypot !== "") return fail("Invalid input", 400);
  const parsed = registerPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Invalid input", 400, issue && issue.path.length > 0 ? issue.path.join(".") : undefined);
  }
  const payload = parsed.data;
  const leadEmail = payload.lead.email; // validated and lower-cased by the schema; every check below uses it

  // 2. Who is registering. Test mode is honoured only for a signed-in admin (ruling 2); the admin's id
  //    is stored as the test row's student_id, which is where the job handlers send every test email.
  let isTest = false;
  let studentId: string | null = null;
  if (payload.testMode) {
    const auth = await requireAdmin();
    if (!auth.ok) return fail("Test registrations can only be made by a signed-in admin.", 403);
    isTest = true;
    studentId = auth.user.id;
  } else {
    const user = await sessionUser();
    if (user && user.email === leadEmail) studentId = user.id;
  }
  if (page.status === "closed" && !isTest) return fail(CLOSED_MESSAGE, 409);

  // 3. Price on the server, with the server clock (Early Bird is an absolute instant). The client's numbers are never read.
  const now = new Date();
  const quote = computeQuote({
    config, regionKey: payload.regionKey, mode: payload.mode, optionKeys: payload.optionKeys, tierKey: payload.tierKey, groupSize: payload.groupSize, now,
  });
  if (!quote.ok) {
    const e = QUOTE_ERRORS[quote.reason];
    return fail(e.message, 422, e.field);
  }
  const region = config.regions.find((r) => r.key === quote.regionKey);
  if (!quote.isFree) {
    const resolved = region ? await resolveAccountKeysSafe([region]) : {};
    if (!(resolved[quote.regionKey] ?? []).includes(payload.paymentMethod)) {
      return fail("Choose the account you paid into.", 400, "paymentMethod");
    }
  }
  const optionLabel = registrationOptionLabel(config, quote);

  // 4. Double submits, duplicates and the per-email rate limit (real registrations only).
  if (!isTest) {
    const recent = await findRecentRegistration(page.id, leadEmail, minutesBefore(now, REPLAY_WINDOW_MINUTES));
    const eventId = payload.attribution.eventId;
    if (recent && ((eventId !== "" && recent.eventId === eventId) || sameSelection(recent, quote))) {
      return publicJson(
        successBody(config, {
          refId: recent.refId, name: payload.lead.name, email: leadEmail, optionKeys: recent.optionKeys, mode: recent.mode,
          optionLabel: recent.optionLabel, total: recent.expectedAmount, currency: recent.currency, isFree: recent.status === "free",
        }),
        201,
      );
    }
    const open = await findOpenRegistration(page.id, leadEmail).catch(() => null);
    if (open) {
      return fail(
        "This email already has a registration for this event that is waiting for payment. Check your email for your reference, or message us on WhatsApp to change it.",
        409,
        "lead.email",
      );
    }
    const recentCount = await countRecentRegistrations(leadEmail, minutesBefore(now, RATE_WINDOW_MINUTES));
    if (recentCount >= RATE_MAX) return fail("Too many registrations from this email. Please wait a few minutes and try again.", 429);
  }

  // 5. Promo (paid only): validated here, consumed atomically by the RPC (never for tests).
  let promo: OkPromo | null = null;
  let promoCode: PromoCode | null = null;
  const promoInput = normalizePromoCode(payload.promoCode);
  if (promoInput && !quote.isFree) {
    try {
      promoCode = await getPromoByCode(promoInput);
      const emailAlreadyUsed = promoCode !== null && promoCode.oneperEmail ? await emailUsedPromo(promoCode.id, leadEmail) : false;
      const result = applyPromo({
        promo: promoCode, pageId: page.id, optionKeys: quote.optionKeys, currency: quote.currency, total: quote.total, now, emailAlreadyUsed,
      });
      if (!result.ok) return fail(promoMessage(result.reason), 422, "promoCode");
      promo = result;
    } catch {
      return fail("We could not check your promo code. Please try again.", 500);
    }
  }

  // 6. Voucher (paid only), to the page's Drive folder. Nothing is stored if the upload fails.
  let voucherUrl = "";
  if (!quote.isFree) {
    const file = form.get("voucher");
    if (!(file instanceof Blob)) return fail("Upload a screenshot or PDF of your payment.", 400, "voucher");
    const check = checkVoucher({ size: file.size, type: file.type });
    if (!check.ok) return fail(check.error, check.status, "voucher");
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const uploaded = await uploadLandingVoucher(
      page.slug,
      { base64, mimeType: file.type, filename: `voucher_${Date.now()}.${check.ext}` },
      page.driveFolderId,
    );
    if (!uploaded.ok) return fail("We could not upload your payment screenshot. Please try again.", 502, "voucher");
    voucherUrl = uploaded.url;
  }

  // 7. Attribution: the agent link wins; otherwise the agent who owns the promo code used.
  const fromLink = payload.attribution.refCode ? await resolveAgentCode(payload.attribution.refCode) : null;
  // A zero discount is not a use of the code, so it does not credit the code's owner either.
  const agentId = isTest ? null : fromLink?.agentId ?? (promo && promo.discount > 0 ? promoCode?.ownerAgentId ?? null : null);

  // 8. One atomic insert (ref counter, capacity, promo use; members get ref_id = null).
  const created = await createRegistration({
    page: { id: page.id, refPrefix: page.refPrefix }, variantKey: page.variantKey, config, payload, quote, promo: isTest ? null : promo, voucherUrl, studentId, agentId, isTest,
  });
  if (!created.ok) {
    if (created.reason === "promo_exhausted") return fail(promoMessage("exhausted"), 409, "promoCode");
    if (created.reason === "capacity_full") {
      return fail("Sorry, this event is full. Message us on WhatsApp to join the waiting list.", 409);
    }
    return fail("We could not save your registration. Please try again in a moment.", 500);
  }

  // 9. Outbox first (durable), then run it now without delaying the reply. The cron drains leftovers.
  if (created.registrationIds.length !== 1 + payload.members.length) {
    // The RPC must return one id per row sent. Anything else means the rows cannot be trusted.
    console.error(
      "[landing-register] registration id count mismatch:", created.registrationIds.length, "for", 1 + payload.members.length,
      "ref", created.refId, "first id", created.registrationIds[0],
    );
    return fail("We could not save your registration. Please try again in a moment.", 500);
  }
  const leadId = created.registrationIds[0];
  const jobs: JobType[] = [
    "email_received", // before the Sheet row: a slow Apps Script call must not delay the confirmation email
    ...(isTest ? [] : (["sheet_append"] as JobType[])),
    ...(payload.members.length > 0 ? (["email_members"] as JobType[]) : []),
    "email_admin",
  ];
  // enqueueJobs is idempotent (a duplicate counts as queued), so one retry is safe. If the outbox
  // still cannot be written, the registration row survives and the handlers run once directly.
  let queued = await enqueueJobs(leadId, jobs);
  if (queued === false) queued = await enqueueJobs(leadId, jobs);
  if (queued === false) {
    console.error("[landing-register] outbox unavailable, running jobs directly for registration", leadId);
    runInBackground(runJobsDirect(leadId, jobs));
  } else {
    runInBackground(runJobsFor(leadId));
  }

  return publicJson(
    successBody(config, {
      refId: created.refId, name: payload.lead.name, email: leadEmail, optionKeys: quote.optionKeys, mode: quote.mode,
      optionLabel, total: created.total, currency: created.currency, isFree: quote.isFree,
    }),
    201,
  );
}
