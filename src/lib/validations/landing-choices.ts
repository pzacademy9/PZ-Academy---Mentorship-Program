import { z } from "zod";

const id = z.string().uuid();

export const choicesQuerySchema = z.object({ pageId: id });

export const applyChoiceBodySchema = z.object({
  pageId: id,
  label: z.string().trim().min(1).max(200),
  optionKeys: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
});
