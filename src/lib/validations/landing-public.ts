// Request schemas of the public /api/landing/* routes. Pure: safe to import anywhere.
import { z } from "zod";
import { MAX_GROUP_SIZE } from "@/lib/landing/registration/config";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same shape rule as Phase 1 slugs. Anything else can never match a page, so it is a 404 without a query. */
export function isPublicSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 60 && SLUG_RE.test(slug);
}

export function isEmail(v: string): boolean {
  return v.length <= 200 && EMAIL_RE.test(v);
}

export const quoteRequestSchema = z.object({
  regionKey: z.string().trim().min(1).max(6),
  mode: z.enum(["live", "recorded"]),
  optionKeys: z.array(z.string().min(1).max(32)).min(1).max(12),
  tierKey: z.string().min(1).max(32),
  groupSize: z.number().int().min(1).max(MAX_GROUP_SIZE),
  promoCode: z.string().trim().toUpperCase().max(40).default(""),
  email: z.string().trim().toLowerCase().max(200).default(""),
});

export const FUNNEL_TYPES = ["view", "start", "step", "submit"] as const;

export const eventRequestSchema = z.object({
  // crypto.randomUUID() or "<ms>-<8 base-36 chars>" from the widget.
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  type: z.enum(FUNNEL_TYPES),
  utm: z.unknown().optional(),
  ref: z.string().max(100).optional(),
});

export const statusQuerySchema = z.object({
  ref: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/),
  email: z.string().trim().toLowerCase().max(200).regex(EMAIL_RE),
});
