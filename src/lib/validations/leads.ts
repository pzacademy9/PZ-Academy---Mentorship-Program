import { z } from "zod";
import { normalizePhone } from "@/lib/crm/phone";

const leadPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((val, ctx) => {
    const result = normalizePhone(val);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid phone number with its country code (e.g. +92 300 1234567 or 03001234567).",
      });
      return z.NEVER;
    }
    return result.e164;
  });

const optionalEmail = z
  .union([z.string().trim().toLowerCase().email(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

export const leadCreateSchema = z
  .object({
    token: z.string().trim().min(1),
    name: z.string().trim().max(200).optional(),
    email: optionalEmail,
    phone: leadPhoneSchema,
    profession: z.string().trim().max(200).optional(),
    leadCampaignId: z.string().uuid().optional(),
    resolution: z.enum(["insert", "update"]).optional(),
    existingLeadId: z.string().uuid().optional(),
  })
  .refine((v) => v.resolution !== "update" || !!v.existingLeadId, {
    message: "existingLeadId is required when resolution is 'update'",
    path: ["existingLeadId"],
  });

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

export const leadSheetSyncSchema = z.object({
  token: z.string().trim().min(1),
  id: z.string().uuid(),
  status: z.string().trim().min(1).max(100),
  notes: z
    .union([z.string().trim().max(5000), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  updatedAt: z.string().datetime(),
});

export type LeadSheetSyncInput = z.infer<typeof leadSheetSyncSchema>;
