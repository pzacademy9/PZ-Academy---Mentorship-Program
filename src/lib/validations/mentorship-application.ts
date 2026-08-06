import { z } from "zod";

const photoSchema = z.object({
  name: z.string().min(1),
  base64: z.string().min(1),
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
  cvBase64: z.string().min(1, "CV is required"),
  cvFileName: z.string().min(1, "CV filename is required"),
  photos: z.array(photoSchema).min(1, "At least one photo is required"),
});

export type MentorshipApplicationInput = z.infer<typeof mentorshipApplicationSchema>;
