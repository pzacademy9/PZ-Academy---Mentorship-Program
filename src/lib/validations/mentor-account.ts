import { z } from "zod";

export const mentorInviteEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(255),
});

export type MentorInviteEmailInput = z.infer<typeof mentorInviteEmailSchema>;
