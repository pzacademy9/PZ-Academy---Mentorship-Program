// The registration form as plain data, so every rule is unit-tested without rendering.
import type { Mode, RegistrationView } from "./config";
import type { QuoteResult } from "./pricing";
import type { RegisterPayload } from "./submit-schema";
import { pickRegion } from "./region-pick";
import { QUOTE_ERRORS } from "./public-config";
import { MAX_VOUCHER_UPLOAD_BYTES } from "./voucher";

export type StepKey = "choose" | "details" | "pay" | "upload";
export interface PersonDraft { name: string; email: string; whatsapp: string; profession: string }
export interface LeadDraft extends PersonDraft { city: string; discovery: string }
export interface FormState {
  step: StepKey;
  regionKey: string;
  mode: Mode;
  optionKeys: string[];
  tierKey: string;
  groupSize: number;
  lead: LeadDraft;
  members: PersonDraft[];
  consent: boolean;
  paymentMethod: string;
  promoInput: string;
  promoApplied: string;
  voucher: File | null;
  honeypot: string;
  emailLocked: boolean;
  detailsCollapsed: boolean;
}
export type FieldErrors = Record<string, string>;

export const INDIVIDUAL = "individual";
// Same cap and types as the register route (voucher.ts checkVoucher): Vercel rejects bodies over 4.5 MB.
export const MAX_VOUCHER_BYTES = MAX_VOUCHER_UPLOAD_BYTES;
export const VOUCHER_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emptyPerson = (): PersonDraft => ({ name: "", email: "", whatsapp: "", profession: "" });
const digits = (v: string) => v.replace(/\D/g, "");

export function initialState(
  config: RegistrationView,
  { country, me, regionParam }: { country: string | null; me: PersonDraft | null; regionParam?: string | null },
): FormState {
  const lead: LeadDraft = {
    name: me?.name.trim() ?? "",
    email: me?.email.trim().toLowerCase() ?? "",
    whatsapp: me?.whatsapp.trim() ?? "",
    profession: me?.profession.trim() ?? "",
    city: "",
    discovery: "",
  };
  return {
    step: "choose",
    regionKey: pickRegion(config.regions, country, config.defaultRegionKey, regionParam),
    mode: config.modes[0] ?? "live",
    optionKeys: config.options.length === 1 ? [config.options[0].key] : [],
    tierKey: INDIVIDUAL,
    groupSize: 1,
    lead,
    members: [],
    consent: false,
    paymentMethod: "",
    promoInput: "",
    promoApplied: "",
    voucher: null,
    honeypot: "",
    emailLocked: !!me && lead.email !== "",
    detailsCollapsed: !!me && lead.name !== "" && lead.email !== "" && lead.whatsapp !== "" && lead.profession !== "",
  };
}

export function stepsFor(isFree: boolean): StepKey[] {
  return isFree ? ["choose", "details"] : ["choose", "details", "pay", "upload"];
}

export function isFreeSelection(config: RegistrationView, optionKeys: string[]): boolean {
  if (optionKeys.length === 0) return false;
  return optionKeys.every((k) => config.options.find((o) => o.key === k)?.free === true);
}

/** Packages are chosen alone; modules combine; choosing every module collapses to the package when module mix is on. */
export function toggleOption(config: RegistrationView, optionKeys: string[], key: string): { optionKeys: string[]; collapsed: boolean } {
  const opt = config.options.find((o) => o.key === key);
  if (!opt) return { optionKeys, collapsed: false };
  if (opt.kind === "bundle") return { optionKeys: [key], collapsed: false };
  const modules = config.options.filter((o) => o.kind === "module").map((o) => o.key);
  const current = optionKeys.filter((k) => modules.includes(k));
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  const { enabled, bundleOptionKey } = config.moduleMix;
  if (enabled && bundleOptionKey && modules.length > 1 && modules.every((m) => next.includes(m))) {
    return { optionKeys: [bundleOptionKey], collapsed: true };
  }
  return { optionKeys: modules.filter((m) => next.includes(m)), collapsed: false };
}

export function tierBounds(config: RegistrationView, tierKey: string): { min: number; max: number } | null {
  if (tierKey === INDIVIDUAL) return { min: 1, max: 1 };
  const t = config.tiers.find((x) => x.key === tierKey);
  return t ? { min: t.minSize, max: t.maxSize } : null;
}

export function resizeMembers(members: PersonDraft[], groupSize: number): PersonDraft[] {
  const want = Math.max(0, groupSize - 1);
  if (members.length >= want) return members.slice(0, want);
  return [...members, ...Array.from({ length: want - members.length }, emptyPerson)];
}

export function chooseTier(state: FormState, config: RegistrationView, tierKey: string): FormState {
  const b = tierBounds(config, tierKey);
  if (!b) return state;
  return { ...state, tierKey, groupSize: b.min, members: resizeMembers(state.members, b.min) };
}

export function setGroupSize(state: FormState, config: RegistrationView, n: number): FormState {
  const b = tierBounds(config, state.tierKey);
  if (!b) return state;
  const size = Math.min(b.max, Math.max(b.min, Math.round(Number.isFinite(n) ? n : b.min)));
  return { ...state, groupSize: size, members: resizeMembers(state.members, size) };
}

export function quoteProblem(quote: QuoteResult | null, config: RegistrationView, tierKey: string): { field: string; message: string } | null {
  if (!quote || quote.ok) return null;
  const b = tierBounds(config, tierKey) ?? { min: 1, max: 1 };
  switch (quote.reason) {
    case "no_region": return { field: "regionKey", message: "Choose where you are registering from." };
    case "no_option": return { field: "optionKeys", message: "Choose what you want to join." };
    case "no_price": return { field: "optionKeys", message: "This option isn't sold in your country yet. Choose another country or option." };
    case "bad_tier": return { field: "tierKey", message: "Choose Individual or one of the group options." };
    case "bad_group_size": return { field: "groupSize", message: `Group size must be between ${b.min} and ${b.max} people.` };
    case "mode_not_offered": return { field: "mode", message: "Choose live sessions or recorded lectures." };
    case "free_group": return { field: "tierKey", message: "Groups aren't available for the free option. Choose Individual." };
    case "mixed_free": return { field: "optionKeys", message: "Choose either the free option or paid options, not both." };
    default: {
      const e = QUOTE_ERRORS[quote.reason as keyof typeof QUOTE_ERRORS];
      return e ? { field: e.field, message: e.message } : { field: "optionKeys", message: "Please check your choice." };
    }
  }
}

/** Mirrors the register route's checkVoucher so a bad file is caught before anything is uploaded. */
export function voucherProblem(f: { size: number; type: string } | null): string | null {
  if (!f || f.size <= 0) return "Upload a photo or PDF of your payment receipt.";
  if (!VOUCHER_TYPES.includes(f.type)) return "Upload a JPG, PNG, WebP or PDF file.";
  if (f.size > MAX_VOUCHER_BYTES) return "This file is bigger than 4 MB. Send a screenshot instead.";
  return null;
}

// The register route requires a profession for the lead and for every member, so the form does too.
// An empty professions list means a free-text field, which is required just the same.
function checkPerson(p: PersonDraft, prefix: string, n: number | null, errors: FieldErrors, freeText: boolean): void {
  const who = n === null ? null : `member ${n}`;
  if (p.name.trim().length < 2) errors[`${prefix}.name`] = who ? `Enter ${who}'s full name.` : "Enter your full name.";
  if (!EMAIL_RE.test(p.email.trim())) errors[`${prefix}.email`] = who ? `Enter a valid email for ${who}.` : "Enter a valid email address, like name@example.com.";
  const d = digits(p.whatsapp).length;
  if (d < 10 || d > 15) errors[`${prefix}.whatsapp`] = who ? `Enter ${who}'s WhatsApp number with the country code.` : "Enter your WhatsApp number with the country code, like 923001234567.";
  if (p.profession.trim() === "") {
    const verb = freeText ? "Enter" : "Choose";
    errors[`${prefix}.profession`] = who ? `${verb} ${who}'s profession.` : `${verb} your profession.`;
  }
}

const CONSENT_MESSAGE = "Please tick the box to agree to the registration terms.";

export function validateStep(
  step: StepKey, state: FormState, config: RegistrationView, quote: QuoteResult | null,
  { hasAccounts, isFree }: { hasAccounts: boolean; isFree: boolean },
): FieldErrors {
  const errors: FieldErrors = {};
  if (step === "choose") {
    if (!config.regions.some((r) => r.key === state.regionKey)) errors.regionKey = "Choose where you are registering from.";
    if (state.optionKeys.length === 0) errors.optionKeys = "Choose what you want to join.";
    else {
      const p = quoteProblem(quote, config, state.tierKey);
      if (p) errors[p.field] = p.message;
    }
  }
  if (step === "details") {
    const freeText = config.professions.length === 0;
    checkPerson(state.lead, "lead", null, errors, freeText);
    if (state.lead.city.trim() === "") errors["lead.city"] = "Enter your city or country.";
    const seen = new Set([state.lead.email.trim().toLowerCase()]);
    state.members.slice(0, Math.max(0, state.groupSize - 1)).forEach((m, i) => {
      checkPerson(m, `members.${i}`, i + 2, errors, freeText);
      const e = m.email.trim().toLowerCase();
      if (!errors[`members.${i}.email`] && seen.has(e)) errors[`members.${i}.email`] = "Each person needs their own email address.";
      seen.add(e);
    });
    if (isFree && !state.consent) errors.consent = CONSENT_MESSAGE;
  }
  if (step === "pay") {
    if (hasAccounts && !state.paymentMethod) errors.paymentMethod = "Choose the account you paid into.";
    if (state.promoInput.trim() !== "" && state.promoInput.trim().toUpperCase() !== state.promoApplied) errors.promoCode = "Press Apply to use your promo code, or clear the box.";
  }
  if (step === "upload") {
    const problem = voucherProblem(state.voucher);
    if (problem) errors.voucher = problem;
    if (!state.consent) errors.consent = CONSENT_MESSAGE;
  }
  return errors;
}

export function nextStep(steps: StepKey[], step: StepKey): StepKey | "submit" {
  const i = steps.indexOf(step);
  return i < 0 || i >= steps.length - 1 ? "submit" : steps[i + 1];
}
export function prevStep(steps: StepKey[], step: StepKey): StepKey | null {
  const i = steps.indexOf(step);
  return i <= 0 ? null : steps[i - 1];
}

/** Which step a server-reported field belongs to (e.g. "lead.email" -> details). */
export function fieldStep(field: string, steps: StepKey[]): StepKey {
  const last = steps[steps.length - 1];
  if (field === "consent" || field === "lead.consent") return last;
  if (field.startsWith("lead.") || field.startsWith("members")) return "details";
  if ((field === "paymentMethod" || field === "promoCode") && steps.includes("pay")) return "pay";
  if (field === "voucher" && steps.includes("upload")) return "upload";
  return "choose";
}

export function buildPayload(state: FormState, attribution: RegisterPayload["attribution"], testMode: boolean, isFree: boolean): RegisterPayload {
  const person = (p: PersonDraft) => ({ name: p.name.trim(), email: p.email.trim().toLowerCase(), whatsapp: digits(p.whatsapp), profession: p.profession.trim() });
  return {
    regionKey: state.regionKey,
    mode: state.mode,
    optionKeys: state.optionKeys,
    tierKey: state.tierKey,
    groupSize: state.groupSize,
    lead: { ...person(state.lead), city: state.lead.city.trim(), discovery: state.lead.discovery, consent: true },
    members: state.members.slice(0, Math.max(0, state.groupSize - 1)).map(person),
    paymentMethod: isFree ? "" : state.paymentMethod,
    promoCode: isFree ? "" : state.promoApplied,
    honeypot: state.honeypot, // inside the JSON: the server reads it from the raw body
    attribution,
    testMode,
  };
}
