import { z } from "zod";
import { url } from "@/lib/validations/admin-lms";
import { photoUrl, mentorSocialLinkSchema, mentorCredentialSchema, MENTOR_TIMEZONES } from "@/lib/validations/admin-mentor";

/**
 * The self-service whitelist from migration 0029's update_own_mentor_profile
 * RPC, mirrored here for form validation. Content/marketing fields only —
 * no slug, name, title, domain, expertise, visibility,
 * price_per_session_pkr, packages, order_index, or testimonials.
 *
 * Every field is optional in the Zod sense only — so a caller isn't forced
 * to supply a value it has nothing to set. This is NOT partial-edit/merge
 * semantics: update_own_mentor_profile assigns all 11 whitelisted columns
 * unconditionally on every call, so any field omitted from the payload is
 * written as null/[] on the row, not left unchanged. MentorSelfProfileForm
 * always sends the complete set of 11 keys for exactly this reason — a
 * future caller that sends a partial payload (e.g. a single-field inline
 * editor) would silently wipe the other columns.
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
