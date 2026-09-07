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

export const contactListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;
export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;
