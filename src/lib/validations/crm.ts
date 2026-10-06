import { z } from "zod";

/**
 * Zod schemas for the CRM admin surface. Follows the conventions in
 * src/lib/validations/admin-marketing.ts: schemas here, no I/O, safe to
 * import from client components.
 */

const columnIndex = z.number().int().min(0).max(200).nullable();

export const columnMappingSchema = z.object({
  name: columnIndex,
  email: columnIndex,
  phone: columnIndex,
  profession: columnIndex,
  discovery: columnIndex,
  product: columnIndex,
  rowType: columnIndex,
  promoCode: columnIndex,
  purchasedAt: columnIndex,
});

/**
 * At least one identity column is required. Without an email or a phone
 * column every parsed row would be rejected as no-identity, so failing here
 * saves a full sheet read and gives the admin a comprehensible error rather
 * than "0 of 843 rows importable".
 */
const hasIdentityColumn = columnMappingSchema.refine(
  (m) => m.email !== null || m.phone !== null,
  { message: "Map at least an Email or a WhatsApp/Phone column." },
);

export const sheetIdSchema = z.object({
  sheetId: z.string().trim().min(1, "Sheet ID or URL is required").max(200),
});

export const importPreviewSchema = z.object({
  sheetId: z.string().trim().min(1).max(200),
  tabName: z.string().trim().min(1, "Tab name is required").max(200),
  mapping: hasIdentityColumn,
});

export const importCommitSchema = importPreviewSchema.extend({
  sheetName: z.string().trim().max(300).default(""),
  courseId: z.string().uuid().optional(),
});

export const mergeResolveSchema = z.object({
  decision: z.enum(["merge", "reject"]),
});

export const contactPhoneUpdateSchema = z.object({
  phoneRaw: z.string().trim().min(1, "Phone number is required").max(40),
});

export const contactListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  courseName: z.string().trim().min(1).max(200).optional(),
  importBatchId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;
export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

/**
 * One discriminated variant per segment field, so an operator can never be
 * paired with a field it does not apply to. A single loose
 * {field, op, value} object would type-check and then fail at query time.
 */
export const segmentFilterSchema = z.discriminatedUnion("field", [
  // .min(1) on every list and string value: an incomplete filter (empty list,
  // blank text) must be a 400, not a filter that silently matches everyone and
  // widens the send.
  z.object({ field: z.literal("contact_id"), op: z.literal("in"), values: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ field: z.literal("import_batch_id"), op: z.literal("in"), values: z.array(z.string().uuid()).min(1) }),
  z.object({ field: z.literal("course_id"), op: z.literal("in"), values: z.array(z.string().uuid()).min(1) }),
  z.object({ field: z.literal("row_type"), op: z.literal("eq"), value: z.enum(["individual", "group_leader", "group_member"]) }),
  z.object({ field: z.literal("product_label"), op: z.literal("contains"), value: z.string().trim().min(1).max(200) }),
  z.object({ field: z.literal("promo_code"), op: z.literal("eq"), value: z.string().trim().min(1).max(100) }),
  z.object({ field: z.literal("discovery_source"), op: z.literal("in"), values: z.array(z.enum(["instagram", "facebook", "whatsapp", "other", "unknown"])).min(1) }),
  z.object({ field: z.literal("country"), op: z.literal("in"), values: z.array(z.string().trim().min(1).max(4)).min(1) }),
  z.object({ field: z.literal("profession"), op: z.literal("contains"), value: z.string().trim().min(1).max(200) }),
  z.object({ field: z.literal("purchase_count"), op: z.enum(["gte", "lte"]), value: z.number().int().min(0).max(1000) }),
  z.object({ field: z.literal("last_purchase_at"), op: z.enum(["before", "after"]), value: z.string().trim().min(4).max(40) }),
  z.object({ field: z.literal("has_platform_account"), op: z.literal("eq"), value: z.boolean() }),
]);

export const segmentPreviewSchema = z.object({
  segment: z.array(segmentFilterSchema).max(20),
  channel: z.enum(["email", "whatsapp"]).default("email"),
});

export const segmentFieldValuesQuerySchema = z.object({
  field: z.enum(["country", "profession", "product_label", "promo_code"]),
});

export const conversionTagSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), courseId: z.string().uuid() }),
  z.object({ kind: z.literal("label"), pattern: z.string().trim().min(1, "Pattern is required").max(200) }),
  z.object({ kind: z.literal("none") }),
]);

export const manualConversionProgramSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), courseId: z.string().uuid() }),
  z.object({ kind: z.literal("label"), pattern: z.string().trim().min(1, "Pattern is required").max(200) }),
]);

export const manualConversionCreateSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1, "Select at least one contact").max(500, "Select at most 500 contacts at a time"),
  program: manualConversionProgramSchema,
  convertedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date").optional(),
  note: z.string().trim().max(1000).optional(),
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  bodyHtml: z.string().trim().min(1, "Body is required").max(100_000),
  segment: z.array(segmentFilterSchema).max(20),
  conversionTag: conversionTagSchema,
});

// Same shape as create — editing a draft never changes what fields exist,
// only whether the row is inserted or updated.
export const campaignUpdateSchema = campaignCreateSchema;

export const campaignTestSchema = z.object({
  email: z.string().trim().email(),
});

export const whatsappBatchCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  messageTemplate: z.string().trim().min(1, "Message is required").max(4096),
  segment: z.array(segmentFilterSchema).max(20),
  conversionTag: conversionTagSchema,
});

export const whatsappBatchUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(150).optional(),
    messageTemplate: z.string().trim().min(1, "Message is required").max(4096).optional(),
    segment: z.array(segmentFilterSchema).max(20).optional(),
    conversionTag: conversionTagSchema.optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined || v.messageTemplate !== undefined || v.segment !== undefined || v.conversionTag !== undefined,
    { message: "At least one field is required" },
  );

export const templateCreateSchema = z
  .object({
    channel: z.enum(["email", "whatsapp"]),
    name: z.string().trim().min(1, "Name is required").max(150),
    subject: z.string().trim().max(300).optional(),
    body: z.string().trim().min(1, "Body is required").max(100_000),
  })
  .refine((v) => v.channel !== "email" || (v.subject !== undefined && v.subject !== ""), {
    message: "Subject is required for an email template",
    path: ["subject"],
  });

export const whatsappRecipientStatusSchema = z.object({
  status: z.enum(["pending", "sent"]),
});
