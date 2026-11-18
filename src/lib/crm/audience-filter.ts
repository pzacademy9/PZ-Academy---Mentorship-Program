import { z } from "zod";

/**
 * Audience filter for Meta / plain downloads. Pure: no I/O, safe to import
 * from server routes, the server engine and client components.
 */

export type AudienceFilter = {
  /** Course display names. Empty = no restriction. */
  courses: string[];
  mode: "either" | "recorded" | "live";
  /** ISO 3166 alpha-2 codes (upper case) plus the literal "unknown". Empty = no restriction. */
  countries: string[];
  who: "paid" | "unpaid" | "both";
  /** YYYY-MM-DD */
  from: string | null;
  to: string | null;
};

export const DEFAULT_AUDIENCE_FILTER: AudienceFilter = {
  courses: [],
  mode: "either",
  countries: [],
  who: "both",
  from: null,
  to: null,
};

export const AUDIENCE_MAX_PEOPLE = 50000;

const MAX_ENCODED_LENGTH = 4000;

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const dateField = z
  .string()
  .refine(isRealDate, { message: "Use a real date, like 2026-01-31." })
  .nullable();

export const audienceFilterSchema = z
  .object({
    courses: z.array(z.string().trim().min(1, "A course name is empty.").max(200, "A course name is too long.")).max(50, "Pick at most 50 courses."),
    mode: z.enum(["either", "recorded", "live"]),
    countries: z
      .array(z.string().regex(/^(?:[A-Z]{2}|unknown)$/, "A country is not recognised."))
      .max(20, "Pick at most 20 countries."),
    who: z.enum(["paid", "unpaid", "both"]),
    from: dateField,
    to: dateField,
  })
  .refine((f) => !(f.from && f.to) || f.from <= f.to, {
    message: "The start date is after the end date.",
    path: ["to"],
  });

export type ParsedAudienceFilter =
  | { ok: true; filter: AudienceFilter }
  | { ok: false; error: string };

const GENERIC_ERROR = "The audience choices are not valid.";

const PLAIN_MESSAGES = new Set([
  "Use a real date, like 2026-01-31.",
  "A course name is empty.",
  "A course name is too long.",
  "Pick at most 50 courses.",
  "A country is not recognised.",
  "Pick at most 20 countries.",
  "The start date is after the end date.",
]);

function dedupeCourses(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

export function parseAudienceFilter(input: unknown): ParsedAudienceFilter {
  const r = audienceFilterSchema.safeParse(input);
  if (r.success) {
    return {
      ok: true,
      filter: {
        ...r.data,
        courses: dedupeCourses(r.data.courses),
        countries: Array.from(new Set(r.data.countries)),
      },
    };
  }
  // Only our own plain sentences reach the owner; zod's wording never does.
  const msg = r.error.issues.map((i) => i.message).find((m) => PLAIN_MESSAGES.has(m));
  return { ok: false, error: msg ?? GENERIC_ERROR };
}

export function encodeAudienceFilter(f: AudienceFilter): string {
  const bytes = new TextEncoder().encode(JSON.stringify(f));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeAudienceFilter(s: string): ParsedAudienceFilter {
  const bad: ParsedAudienceFilter = { ok: false, error: "This audience link is not valid." };
  if (typeof s !== "string" || s.length === 0 || s.length > MAX_ENCODED_LENGTH) return bad;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return bad;
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseAudienceFilter(JSON.parse(json));
  } catch {
    return bad;
  }
}

const COUNTRY_NAMES: Record<string, string> = {
  PK: "Pakistan",
  AE: "UAE",
  SA: "Saudi Arabia",
  unknown: "Not known",
};

export function describeAudienceFilter(f: AudienceFilter): string[] {
  const lines: string[] = [];
  if (f.courses.length > 0) lines.push(`Courses: ${f.courses.join(", ")}`);
  if (f.mode === "recorded") lines.push("Recorded only");
  else if (f.mode === "live") lines.push("Live only");
  if (f.countries.length > 0) {
    lines.push(`Countries: ${f.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(", ")}`);
  }
  if (f.who === "paid") lines.push("Paid only");
  else if (f.who === "unpaid") lines.push("Registered, not paid");
  if (f.from) lines.push(`From ${f.from}`);
  if (f.to) lines.push(`To ${f.to}`);
  return lines.length > 0 ? lines : ["Everyone who registered or bought"];
}
