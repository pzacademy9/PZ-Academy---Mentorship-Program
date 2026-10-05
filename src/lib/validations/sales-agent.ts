import { z } from "zod";

export const salesAgentInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(255),
  fullName: z.string().trim().min(1, "Name is required").max(120),
});

export type SalesAgentInviteInput = z.infer<typeof salesAgentInviteSchema>;
