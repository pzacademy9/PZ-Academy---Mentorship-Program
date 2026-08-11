import { z } from "zod";
import { url } from "@/lib/validations/admin-lms";
import { photoUrl, mentorSocialLinkSchema, mentorCredentialSchema, MENTOR_TIMEZONES } from "@/lib/validations/admin-mentor";

/**
 * The self-service whitelist from migration 0029's update_own_mentor_profile
 * RPC, mirrored here for form validation. Content/marketing fields only —
 * no slug, name, title, domain, expertise, visibility,
 * price_per_session_pkr, packages, order_index, or testimonials. Every
 * field is optional so a mentor can save a partial edit.
 */
export const mentorSelfEditSchema = z.object({
  shortBio: z.string().trim().max(500).optional(),
  fullBio: z.array(z.string().trim().min(1)).max(20).optional(),
  photoUrl,
  availabilityText: z.string().trim().max(200).optional(),
  introVideoUrl: url,
  linkedinUrl: url,
  socialLinks: z.array(mentorSocialLinkSchema).max(10).optional(),
  skills: z.array(z.string().trim().min(1)).max(20).optional(),
  credentials: z.array(mentorCredentialSchema).max(20).optional(),
  timezone: z.enum(MENTOR_TIMEZONES).optional(),
  sessionDurationText: z.string().trim().max(50).optional(),
});

export type MentorSelfEditInput = z.infer<typeof mentorSelfEditSchema>;
