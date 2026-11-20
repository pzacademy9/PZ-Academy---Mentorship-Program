import { z } from "zod";

const id = z.string().uuid();

export const choicesQuerySchema = z.object({ pageId: id });

export const applyChoiceBodySchema = z.object({
  pageId: id,
  // Not trimmed: the exact stored label must round-trip from the listing to the update.
  label: z.string().min(1).max(500).refine((v) => v.trim() !== ""),
  optionKeys: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
});
