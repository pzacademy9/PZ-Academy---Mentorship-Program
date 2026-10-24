import { z } from "zod";

export const closeBatchQuerySchema = z.object({ pageId: z.string().uuid() });
export const closeBatchBodySchema = z.object({ pageId: z.string().uuid() });
