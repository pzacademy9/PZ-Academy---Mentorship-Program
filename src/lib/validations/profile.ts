import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  // Empty string means "clear the photo" -- distinct from omitting the field.
  avatarUrl: z.union([z.string().trim().url().max(2000), z.literal("")]).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
