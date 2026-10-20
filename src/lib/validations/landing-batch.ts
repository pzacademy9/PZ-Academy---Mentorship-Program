import { z } from "zod";

export const finishBatchBodySchema = z.object({
  pageId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
});

export const portalLinksBodySchema = z.object({
  pageId: z.string().uuid(),
  audience: z.enum(["live", "recorded", "both"]),
});

export const batchOverviewQuerySchema = z.object({ pageId: z.string().uuid() });
