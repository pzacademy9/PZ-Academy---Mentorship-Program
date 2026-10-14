// src/lib/validations/landing-promo.ts
import { z } from "zod";
import { isValidInstant } from "@/lib/landing/registration/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const instant = z
  .string()
  .trim()
  .refine((v) => isValidInstant(v), "Use a full date and time with a time zone, for example 2026-10-31T23:59:00+05:00.");

/** Upper bounds shared by the server schema and the admin form. */
export const PROMO_MAX_FIXED_AMOUNT = 10_000_000;
export const PROMO_MAX_USES = 1_000_000;

const promoFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/, "Use 2 to 40 letters, numbers, dashes or underscores."),
  type: z.enum(["percent", "fixed"]),
  value: z.number().min(0).max(1_000_000),
  fixedAmounts: z.record(z.string().regex(/^[A-Z]{3}$/, "Use 3-letter currency codes such as PKR."), z.number().min(0).max(PROMO_MAX_FIXED_AMOUNT)),
  maxDiscountPercent: z.number().min(0).max(100),
  pageIds: z.array(z.string().regex(UUID_RE)).max(100),
  optionKeys: z.array(z.string().trim().min(1).max(32)).max(20),
  maxUses: z.number().int().min(1).max(PROMO_MAX_USES).nullable(),
  oneperEmail: z.boolean(),
  startsAt: instant.nullable(),
  endsAt: instant.nullable(),
  active: z.boolean(),
  ownerAgentId: z.string().regex(UUID_RE).nullable(),
};

export interface PromoRuleInput {
  type?: "percent" | "fixed";
  value?: number;
  fixedAmounts?: Record<string, number>;
  startsAt?: string | null;
  endsAt?: string | null;
}

/** Rules that span fields. On a patch, a type change must bring its value / amounts with it. */
export function promoIssues(v: PromoRuleInput): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  if (v.type === "percent") {
    if (v.value === undefined) out.push({ path: "value", message: "Set the percentage off." });
    else if (v.value <= 0 || v.value > 100) out.push({ path: "value", message: "A percent code takes off more than 0% and at most 100%." });
  }
  if (v.type === "fixed" && (v.fixedAmounts === undefined || Object.keys(v.fixedAmounts).length === 0)) {
    out.push({ path: "fixedAmounts", message: "Add the amount off for at least one currency, for example PKR 500." });
  }
  if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
    out.push({ path: "endsAt", message: "The end must be after the start." });
  }
  return out;
}

export const promoCreateSchema = z.object(promoFields).superRefine((v, ctx) => {
  for (const i of promoIssues(v)) ctx.addIssue({ code: "custom", path: [i.path], message: i.message });
});

export const promoPatchSchema = z
  .object(promoFields)
  .partial()
  .superRefine((v, ctx) => {
    if (Object.keys(v).length === 0) ctx.addIssue({ code: "custom", path: [], message: "Nothing to change." });
    for (const i of promoIssues(v)) ctx.addIssue({ code: "custom", path: [i.path], message: i.message });
  });

export const agentLinkSchema = z.object({ agentId: z.string().regex(UUID_RE, "Choose a sales agent.") });

/** The first problem as `{ error, field? }`, the shape every landing route answers with. */
export function firstIssue(err: z.ZodError): { error: string; field?: string } {
  const issue = err.issues[0];
  if (!issue) return { error: "Invalid input" };
  const field = issue.path.map(String).join(".");
  return field ? { error: issue.message, field } : { error: issue.message };
}
