import { z } from "zod";
import { CHANGEABLE_STATUSES } from "@/lib/landing/registration/status-rules";

/** `from` is the status the person was looking at when they clicked. */
export const statusChangeBodySchema = z
  .object({
    status: z.enum(CHANGEABLE_STATUSES),
    from: z.enum([...CHANGEABLE_STATUSES, "free"]),
    amount: z.number().nullable().optional(),
  })
  .strict();
