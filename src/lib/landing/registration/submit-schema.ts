// src/lib/landing/registration/submit-schema.ts
// The register route's request body (the `payload` JSON string). The server recomputes the price;
// nothing here is trusted for money.
import { z } from "zod";
import { MAX_GROUP_SIZE, type Mode } from "./config";

export interface Person { name: string; email: string; whatsapp: string; profession: string }
export interface Attribution { refCode: string; utm: Record<string, string>; fbp: string; fbc: string; eventId: string; sessionId: string }
export interface RegisterPayload {
  regionKey: string; mode: Mode; optionKeys: string[]; tierKey: string; groupSize: number;
  lead: Person & { city: string; discovery: string; consent: true };
  members: Person[];            // length === groupSize - 1 (0 for individual)
  paymentMethod: string;        // account key, "" for free
  promoCode: string;
  honeypot: string;             // must be ""
  attribution: Attribution;
  testMode: boolean;            // honoured only for an authenticated admin
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digitCount = (v: string) => v.replace(/\D/g, "").length;

const personSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name (at least 2 letters).").max(120, "Use 120 characters or fewer."),
  email: z.string().trim().toLowerCase().max(200, "Use 200 characters or fewer.").regex(EMAIL_RE, "Enter a valid email address."),
  whatsapp: z
    .string()
    .trim()
    .max(30, "Use 30 characters or fewer.")
    .regex(/^[+\d\s()-]*$/, "Use digits only, with the country code.")
    .refine((v) => digitCount(v) >= 10 && digitCount(v) <= 15, "Enter the WhatsApp number with the country code (at least 10 digits)."),
  profession: z.string().trim().min(1, "Choose a profession.").max(120, "Use 120 characters or fewer."),
});

const emptyAttribution = (): Attribution => ({ refCode: "", utm: {}, fbp: "", fbc: "", eventId: "", sessionId: "" });

const attributionSchema = z
  .object({
    refCode: z.string().trim().max(40).regex(/^[A-Za-z0-9-]*$/).catch(""),
    utm: z
      .record(z.string().max(40), z.string().max(200))
      .refine((o) => Object.keys(o).length <= 10)
      .catch(() => ({})),
    fbp: z.string().max(200).catch(""),
    fbc: z.string().max(500).catch(""),
    eventId: z.string().max(100).catch(""),
    sessionId: z.string().max(100).catch(""),
  })
  .catch(emptyAttribution);

export const registerPayloadSchema: z.ZodType<RegisterPayload> = z
  .object({
    regionKey: z.string().trim().min(1, "Choose your country.").max(6),
    mode: z.enum(["live", "recorded"]),
    optionKeys: z.array(z.string().min(1).max(32)).min(1, "Choose what you want to register for.").max(12),
    tierKey: z.string().min(1).max(32),
    groupSize: z.number().int().min(1).max(MAX_GROUP_SIZE),
    lead: personSchema.extend({
      city: z.string().trim().max(120).default(""),
      discovery: z.string().trim().max(120).default(""),
      consent: z.literal(true, { message: "Please accept the registration terms to continue." }),
    }),
    members: z.array(personSchema).max(MAX_GROUP_SIZE - 1).default([]),
    paymentMethod: z.string().trim().max(40).default(""),
    promoCode: z.string().trim().toUpperCase().max(40).default(""),
    honeypot: z.literal("", { message: "Invalid input" }).default(""),
    attribution: attributionSchema,
    testMode: z.boolean().catch(false),
  })
  .superRefine((v, ctx) => {
    if (v.members.length !== v.groupSize - 1) {
      ctx.addIssue({
        code: "custom",
        path: ["members"],
        message: v.groupSize === 1 ? "An individual registration has no group members." : `Add the details of all ${v.groupSize - 1} group members.`,
      });
    }
    const emails = [v.lead.email, ...v.members.map((m) => m.email)];
    const dup = emails.find((e, i) => emails.indexOf(e) !== i);
    if (dup) ctx.addIssue({ code: "custom", path: ["members"], message: `Each person needs their own email address (${dup} is used twice).` });
  });
