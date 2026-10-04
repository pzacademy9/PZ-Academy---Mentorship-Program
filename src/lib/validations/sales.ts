import { z } from "zod";
import { OUTCOME_KINDS } from "@/lib/crm/followup";

const text = (max: number) => z.string().trim().min(1, "Required").max(max);

export const outcomeSchema = z
  .object({
    kind: z.enum(OUTCOME_KINDS as unknown as [string, ...string[]]),
    askedToStop: z.boolean().optional(),
  })
  .refine((v) => !v.askedToStop || v.kind === "not_interested", {
    message: "Only 'Not interested' can be marked as asked to stop",
    path: ["askedToStop"],
  });

export const noteSchema = z.object({ body: text(2000) });

export const sendRequestSchema = z.object({
  numberId: z.string().uuid(),
  messageTemplate: text(1000),
});

export const leadSchema = z.object({
  phone: text(40),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  profession: z.string().trim().max(120).optional(),
  note: z.string().trim().max(2000).optional(),
});

export const contactsQuerySchema = z.object({
  tab: z.enum(["mine", "unclaimed", "all"]).default("mine"),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

/** PostgREST `or()` filters break on , ( ) and the wildcard characters. */
export function sanitizeSearch(q: string): string {
  return q
    .replace(/[,()%*\\_"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

const intIn = (min: number, max: number) => z.number().int().min(min).max(max);

export const numberCreateSchema = z.object({
  label: text(80),
  phoneE164: z.string().trim().max(20).optional(),
  dailyCap: intIn(1, 500).nullable().optional(),
  hourlyCap: intIn(1, 200).nullable().optional(),
  agentIds: z.array(z.string().uuid()).max(50).default([]),
});

export const numberUpdateSchema = z.object({
  label: text(80).optional(),
  phoneE164: z.string().trim().max(20).nullable().optional(),
  dailyCap: intIn(1, 500).nullable().optional(),
  hourlyCap: intIn(1, 200).nullable().optional(),
  agentIds: z.array(z.string().uuid()).max(50).optional(),
  unfreeze: z.literal(true).optional(),
});

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const settingsUpdateSchema = z
  .object({
    daily_cap: intIn(1, 500),
    hourly_cap: intIn(1, 200),
    hourly_warn_at: intIn(1, 200),
    spacing_min_s: intIn(0, 3600),
    spacing_max_s: intIn(0, 3600),
    burst_size: intIn(1, 100),
    burst_break_min: intIn(0, 240),
    quiet_start_hour: intIn(0, 23),
    quiet_end_hour: intIn(0, 23),
    warmup_start: intIn(1, 500),
    warmup_step: intIn(0, 500),
    freeze_hours: intIn(1, 720),
    timezone: z.string().refine(validTimezone, "Unknown timezone"),
  })
  .partial()
  .refine(
    (v) => v.spacing_min_s === undefined || v.spacing_max_s === undefined || v.spacing_max_s >= v.spacing_min_s,
    { message: "Maximum spacing must be at least the minimum", path: ["spacing_max_s"] },
  )
  .refine(
    (v) => v.hourly_cap === undefined || v.hourly_warn_at === undefined || v.hourly_warn_at <= v.hourly_cap,
    { message: "The warning must come at or before the hourly limit", path: ["hourly_warn_at"] },
  );

export const assignSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(500),
  agentId: z.string().uuid().nullable(),
});
