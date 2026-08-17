import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { url } from "@/lib/validations/admin-lms";

export type MentorVisibility = Database["public"]["Enums"]["mentor_visibility"];

export const MENTOR_VISIBILITIES = ["draft", "published", "hidden"] as const satisfies readonly MentorVisibility[];

/** The exact keys MentorProfileClient's iconMap supports (src/components/mentorship/MentorProfileClient.tsx). Anything else silently renders Award there — reject it here instead. */
export const CREDENTIAL_ICONS = ["GraduationCap", "Award", "BookOpen", "Lightbulb", "TrendingUp"] as const;

/** Curated so the stored value is always a valid IANA identifier without shipping a full IANA picker widget. */
export const MENTOR_TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuala_Lumpur",
  "Australia/Melbourne",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

export const mentorPackageSchema = z.object({
  name: z.string().trim().min(1, "Package name is required").max(100),
  sessions: z.number().int().min(1),
  price: z.number().int().nonnegative(),
  savings: z.number().int().nonnegative().optional(),
});

export const mentorCredentialSchema = z.object({
  title: z.string().trim().min(1, "Credential title is required").max(150),
  institution: z.string().trim().min(1, "Institution is required").max(200),
  icon: z.enum(CREDENTIAL_ICONS),
});

export const mentorTestimonialSchema = z.object({
  quote: z.string().trim().min(1, "Quote is required").max(1000),
  author: z.string().trim().min(1, "Author is required").max(150),
  role: z.string().trim().max(150).optional(),
});

export const mentorSocialLinkSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(50),
  url: z.string().trim().url("Must be a valid URL"),
});

export const mentorCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});

/**
 * `photoUrl` can be a root-relative local path (the 8 seeded mentors carry
 * "/mentor-dr-roha.png" — see 0028_mentor_registry.sql) OR a full Drive
 * thumbnail URL from ImageUploadField. The shared `url` helper from
 * admin-lms requires an absolute URL with a scheme, which rejects the local
 * paths outright — so photoUrl gets its own looser coercion instead of
 * reusing `url`. introVideoUrl/linkedinUrl/social links keep the strict
 * `url` schema since those are always real external links.
 */
export const photoUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

/**
 * No `slug` field, deliberately: slug is immutable after creation (see the
 * comment on mentors.slug in supabase/migrations/0028_mentor_registry.sql —
 * mentorship_bookings.mentor_slug is an FK-less snapshot, so renaming would
 * orphan every historical booking). Omitting it from the schema removes a
 * "slug taken" failure mode from the update path entirely; the admin form
 * renders it read-only.
 */
export const mentorConfigSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    title: z.string().trim().max(200).optional(),
    expertise: z.string().trim().max(200).optional(),
    shortBio: z.string().trim().max(500).optional(),
    fullBio: z.array(z.string().trim().min(1)).max(20).optional(),
    photoUrl,
    experience: z.string().trim().max(50).optional(),
    domain: z.string().trim().max(150).optional(),
    language: z.string().trim().max(150).optional(),
    format: z.string().trim().max(150).optional(),
    pricePerSessionPkr: z.number().int().nonnegative(),
    packages: z.array(mentorPackageSchema).max(20).optional(),
    availabilityText: z.string().trim().max(200).optional(),
    leadTime: z.string().trim().max(100).optional(),
    credentials: z.array(mentorCredentialSchema).max(20).optional(),
    skills: z.array(z.string().trim().min(1)).max(20).optional(),
    introVideoUrl: url,
    linkedinUrl: url,
    socialLinks: z.array(mentorSocialLinkSchema).max(10).optional(),
    testimonials: z.array(mentorTestimonialSchema).max(20).optional(),
    sessionDurationMinutes: z.number().int().positive(),
    sessionDurationText: z.string().trim().max(50).optional(),
    timezone: z.enum(MENTOR_TIMEZONES).optional(),
    visibility: z.enum(MENTOR_VISIBILITIES),
    showReviews: z.boolean(),
  })
  .superRefine((data, ctx) => {
    // BookingClient.tsx keys its package <option> on p.name and posts that
    // name back as packageName — a duplicate is both a React key collision
    // and an ambiguous price lookup (mentor.packages.find(p => p.name === ...)
    // silently picks the first match).
    const names = (data.packages ?? []).map((p) => p.name);
    const seen = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Package name "${name}" is used more than once — package names must be unique.`,
          path: ["packages"],
        });
        break;
      }
      seen.add(name);
    }
  });

export type MentorConfigInput = z.infer<typeof mentorConfigSchema>;

/** published only — kept as its own function (see isMentorListedPublicly) in case "hidden" is later made link-reachable. */
export function isMentorPubliclyVisible(visibility: MentorVisibility): boolean {
  return visibility === "published";
}

/** published only — whether a mentor appears in the /mentorship grid. Currently identical to isMentorPubliclyVisible; kept separate so a future change to one doesn't have to touch the other's callers. */
export function isMentorListedPublicly(visibility: MentorVisibility): boolean {
  return visibility === "published";
}

export function isKnownPackageName(packages: { name: string }[], name: string): boolean {
  return packages.some((p) => p.name === name);
}

/**
 * Non-blocking sanity checks surfaced as toast.warning after a save — never
 * rejects the save itself, since a mentor's real pricing sometimes has
 * legitimate exceptions.
 */
export function mentorPackageWarnings(
  packages: { name: string; sessions: number; price: number; savings?: number }[],
  pricePerSessionPkr: number,
): string[] {
  const warnings: string[] = [];

  const single = packages.find((p) => p.sessions === 1);
  if (single && single.price !== pricePerSessionPkr) {
    warnings.push(
      `"${single.name}" is priced at PKR ${single.price.toLocaleString()}, which doesn't match the headline single-session price of PKR ${pricePerSessionPkr.toLocaleString()}.`,
    );
  }

  for (const p of packages) {
    if (p.savings != null && p.savings >= p.price) {
      warnings.push(`"${p.name}"'s savings (PKR ${p.savings.toLocaleString()}) is not less than its price.`);
    }
    if (p.sessions > 1 && p.price > p.sessions * pricePerSessionPkr) {
      warnings.push(`"${p.name}" costs more than paying for ${p.sessions} single sessions individually.`);
    }
  }

  return warnings;
}

export function formatSessionDuration(minutes: number): string {
  return `${minutes} Minute${minutes === 1 ? "" : "s"}`;
}
