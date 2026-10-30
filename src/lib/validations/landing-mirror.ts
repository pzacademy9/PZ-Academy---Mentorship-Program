import { z } from "zod";

export const mirrorSyncBodySchema = z.object({ pageId: z.string().uuid(), preview: z.boolean().optional() });
