import { z } from "zod";

export const mentorshipBookingSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required").max(200),
    email: z.string().trim().email(),
    phone: z.string().trim().min(1, "Phone is required").max(40),
    mentorSlug: z.string().trim().min(1),
    mentorName: z.string().trim().min(1),
    packageName: z.string().trim().min(1),
    goals: z.string().trim().max(2000).optional(),
    // Base64 is ~4/3 the size of raw bytes, so ~7,000,000 chars corresponds
    // to the same ~5MB cap already enforced client-side in BookingClient's
    // handleFile.
    screenshotBase64: z.string().max(7_000_000, "Screenshot is too large").optional(),
    screenshotName: z.string().optional(),
    screenshotMimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]).optional(),
  })
  .refine(
    (data) => !data.screenshotBase64 || (data.screenshotName && data.screenshotMimeType),
    {
      message: "screenshotName and screenshotMimeType are required when screenshotBase64 is provided",
      path: ["screenshotBase64"],
    },
  );

export type MentorshipBookingInput = z.infer<typeof mentorshipBookingSchema>;
