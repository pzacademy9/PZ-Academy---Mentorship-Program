import { z } from "zod";

const photoSchema = z.object({
  name: z.string().min(1),
  // Base64 is ~4/3 the size of raw bytes, so ~7,000,000 chars corresponds to
  // a ~5MB-per-file cap, matching the same convention used elsewhere.
  base64: z.string().min(1).max(7_000_000, "Photo is too large"),
});

export const mentorshipApplicationSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  country: z.string().trim().max(100).optional(),
  profession: z.string().trim().max(200).optional(),
  position: z.string().trim().max(200).optional(),
  expertise: z.string().trim().max(300).optional(),
  organization: z.string().trim().max(200).optional(),
  years: z.string().trim().max(50).optional(),
  linkedin: z.string().trim().max(300).optional(),
  roles: z.string().trim().max(200).optional(),
  whyJoin: z.string().trim().max(2000).optional(),
  valueProvide: z.string().trim().max(2000).optional(),
  // Base64 is ~4/3 the size of raw bytes, so ~7,000,000 chars corresponds to
  // a ~5MB cap, matching the same convention used elsewhere.
  cvBase64: z.string().min(1, "CV is required").max(7_000_000, "CV is too large"),
  cvFileName: z.string().min(1, "CV filename is required"),
  photos: z.array(photoSchema).min(1, "At least one photo is required"),
});

export type MentorshipApplicationInput = z.infer<typeof mentorshipApplicationSchema>;
