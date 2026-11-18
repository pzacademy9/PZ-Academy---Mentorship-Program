import { z } from "zod";
import { audienceFilterSchema } from "@/lib/crm/audience-filter";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BRING_IN_MAX_PAGES = 20;

const name = z.string().trim().min(1, "Give the audience a name.").max(80, "The name is too long (80 letters at most).");

export const savedAudienceCreateSchema = z.object({ name, filter: audienceFilterSchema });
export const savedAudienceRenameSchema = z.object({ name });

export const bringInSchema = z.object({
  pageIds: z.array(z.string().regex(UUID_RE, "A page is not valid.")).min(1, "Pick at least one page."),
});

/** First of our own plain sentences, else a generic one (zod wording never reaches the owner). */
export function firstPlainMessage(error: z.ZodError, fallback: string): string {
  const own = new Set([
    "Give the audience a name.",
    "The name is too long (80 letters at most).",
    "A page is not valid.",
    "Pick at least one page.",
  ]);
  return error.issues.map((i) => i.message).find((m) => own.has(m)) ?? fallback;
}
