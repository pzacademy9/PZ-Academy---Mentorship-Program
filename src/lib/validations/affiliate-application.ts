// src/lib/validations/affiliate-application.ts
// The public affiliate application. Pure: safe to import in the form and the route.
import { z } from "zod";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const rating = z.number().int().min(1).max(5);

/** A yes/no answer that asks for a few words of detail when it is yes. */
const yesWithDetails = z
  .object({ yes: z.boolean(), details: z.string().trim().max(600).default("") })
  .refine((v) => !v.yes || v.details.length >= 3, { message: "Please add a few words of detail.", path: ["details"] });

export const HOURS = ["1-3", "4-6", "7-10", "10+"] as const;

export const affiliateApplicationSchema = z.object({
  name: text(2, 80),
  email: z.string().trim().toLowerCase().max(200, { abort: true }).regex(EMAIL_RE, "Enter a valid email address."),
  whatsapp: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/[\s\-().]/g, ""))
    .pipe(z.string().regex(/^\+?\d{7,20}$/, "Enter a valid WhatsApp number.")),
  city: text(1, 60),
  country: text(1, 60),
  status: z.enum(["student", "professional"]),
  organization: text(1, 120),
  field: text(1, 120),
  commissionExperience: yesWithDetails,
  eventsManaged: yesWithDetails,
  promotingPrograms: z.boolean(),
  onlineSales: z.boolean(),
  ratings: z.object({
    marketing: rating,
    eventPromotion: rating,
    onlineEngagement: rating,
    communication: rating,
  }),
  hoursPerWeek: z.enum(HOURS),
  linkedin: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || v.startsWith("https://"), { message: "The LinkedIn link must start with https://" })
    .default(""),
  why: text(10, 1000),
  agreeTerms: z.literal(true, { message: "Please agree to the terms to apply." }),
  /** Honeypot: real people never see this field. */
  website: z.string().max(0).default(""),
});

export type AffiliateApplication = z.infer<typeof affiliateApplicationSchema>;
