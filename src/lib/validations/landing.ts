// src/lib/validations/landing.ts
import { z } from "zod";
import { contentSchema, MAX_CONTENT_BYTES } from "@/lib/landing/content";
import { slugify, validateSlug } from "@/lib/landing/slug";

export const PAGE_KINDS = ["course", "workshop", "webinar"] as const;

/** A slug is optional on create/duplicate: derived from the title, then validated. */
function resolveSlug(title: string, slug: string | undefined, ctx: z.core.$RefinementCtx): string {
  const s = (slug ?? "").trim() === "" ? slugify(title) : slug!.trim();
  const v = validateSlug(s);
  if (!v.ok) ctx.addIssue({ code: "custom", path: ["slug"], message: v.message });
  return s;
}

export const createPageSchema = z
  .object({
    title: z.string().trim().min(1, "Give the page a name.").max(120),
    kind: z.enum(PAGE_KINDS),
    slug: z.string().optional(),
    templateId: z.string().max(60).optional(),
  })
  .transform((v, ctx) => ({ ...v, slug: resolveSlug(v.title, v.slug, ctx) }));

export const duplicateSchema = z
  .object({ title: z.string().trim().min(1, "Give the copy a name.").max(120), slug: z.string().optional() })
  .transform((v, ctx) => ({ ...v, slug: resolveSlug(v.title, v.slug, ctx) }));

export const saveDraftSchema = z.object({
  content: contentSchema,
  baseRevision: z.number().int().min(1),
});

export const rollbackSchema = z.object({ version: z.number().int().min(1) });
export const renameSchema = z.object({ title: z.string().trim().min(1, "Give the page a name.").max(120, "Use 120 characters or fewer.") });

export const statusSchema = z.object({ status: z.enum(["closed", "published"]) });

export { MAX_CONTENT_BYTES };
