import { z } from "zod";

export const createEnrollmentSchema = z.object({
  courseSlug: z.string().min(1, "Course is required"),
  paymentAmountPkr: z.number().int().positive("Enter a valid amount"),
  // Optional: when the GAS screenshot bridge isn't reachable, the wizard lets
  // the student submit without a screenshot so an admin can follow up.
  paymentScreenshotUrl: z.string().url().optional(),
});

export const screenshotUploadSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"], {
    message: "Only PNG, JPEG, WEBP, or PDF files are accepted",
  }),
  sizeBytes: z
    .number()
    .int()
    .max(5 * 1024 * 1024, "File must be under 5 MB"),
});

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type ScreenshotUploadInput = z.infer<typeof screenshotUploadSchema>;
