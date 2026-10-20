import { z } from "zod";

const uuid = z.string().uuid();

const filtersSchema = z.object({
  pageId: uuid.optional(),
  status: z.enum(["all", "pending", "reserved", "underpaid", "paid", "free"]).optional(),
  mode: z.enum(["live", "recorded"]).optional(),
  agentId: uuid.optional(),
  q: z.string().max(200).optional(),
  region: z.string().max(200).optional(),
  optionLabel: z.string().max(200).optional(),
  page: z.number().int().min(1).optional(),
});

const channel = z.enum(["email", "whatsapp"]);
const recipientSet = {
  ids: z.array(uuid).min(1).max(1000).optional(),
  filters: filtersSchema.optional(),
};
/** Exactly one of ids / filters. */
const exactlyOne = (v: { ids?: unknown; filters?: unknown }) => (v.ids === undefined) !== (v.filters === undefined);

export const previewBodySchema = z.object({ pageId: uuid, channel, ...recipientSet }).refine(exactlyOne);

export const createSendBodySchema = z
  .object({
    pageId: uuid,
    channel,
    ...recipientSet,
    subject: z.string().max(300),
    body: z.string().min(1).max(20000),
    templateId: uuid.nullable().optional(),
    expectedCount: z.number().int().min(1),
    expectedNotPaid: z.number().int().min(0),
    confirmNotPaid: z.boolean(),
  })
  .refine(exactlyOne)
  .refine((v) => v.channel !== "email" || v.subject.trim() !== "");

export const templateBodySchema = z.object({
  name: z.string().trim().min(1, "Give the template a name").max(120),
  subject: z.string().max(300),
  emailBody: z.string().max(20000),
  whatsappBody: z.string().max(20000),
});

export const markSentBodySchema = z.object({ sent: z.boolean() });

/** The test goes to the signed-in admin, so there is deliberately no address field. */
export const testBodySchema = z.object({
  pageId: uuid,
  subject: z.string().trim().min(1).max(300),
  body: z.string().min(1).max(20000),
});

export const isUuid = (s: string): boolean => uuid.safeParse(s).success;
