import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Public read path for the mentor registry (supabase/migrations/
 * 0028_mentor_registry.sql), replacing the hardcoded src/lib/mentorship/
 * mentors.ts. Anon-safe: the "mentors: public read published" RLS policy
 * allows this for any visibility='published' row, same pattern as
 * getCourseBySlug/getPublishedCourses in src/lib/data/lms.ts.
 *
 * Field names are kept identical to the old hardcoded Mentor interface
 * (photo, availability, pricePerSession, ...) so the existing client
 * components (MentorCard, MentorProfileClient, BookingClient) need zero
 * renames — only their import path changes.
 */

export interface MentorPackage {
  name: string;
  sessions: number;
  price: number;
  savings?: number;
}

export interface MentorCredential {
  title: string;
  institution: string;
  icon: string;
}

export interface MentorTestimonial {
  quote: string;
  author: string;
  role?: string;
}

export interface MentorSocialLink {
  label: string;
  url: string;
}

export interface Mentor {
  id: string;
  slug: string;
  name: string;
  title: string;
  expertise: string;
  shortBio: string;
  fullBio: string[];
  photo: string;
  experience: string;
  domain: string;
  language: string;
  format: string;
  pricePerSession: number;
  packages: MentorPackage[];
  availability: string;
  leadTime: string;
  credentials: MentorCredential[];
  skills: string[];
  introVideoUrl: string;
  linkedinUrl: string;
  socialLinks: MentorSocialLink[];
  testimonials: MentorTestimonial[];
  sessionDurationMinutes: number;
  sessionDurationText: string;
  timezone: string;
  showReviews: boolean;
}

// A single (non-concatenated) string literal, so Supabase's typed client can
// statically parse the selected columns — string concatenation (`"a" +
// "b"`) widens to plain `string` and silently degrades every field below to
// GenericStringError.
export const MENTOR_SELECT = `id, slug, name, title, expertise, short_bio, full_bio, photo_url, experience, domain, language, format, price_per_session_pkr, packages, availability_text, lead_time, credentials, skills, intro_video_url, linkedin_url, social_links, testimonials, session_duration_minutes, session_duration_text, timezone, show_reviews`;

/**
 * Shared by the public read functions below and by admin-mentors.ts's
 * getMentorConfig, so the snake_case -> camelCase mapping exists in exactly
 * one place. `row` is typed loosely (matches MENTOR_SELECT's shape, plus
 * whatever extra admin-only columns the caller also selected) rather than a
 * strict interface, since admin-mentors.ts selects a superset of these
 * columns in the same query.
 */
export function mapMentorRow(row: {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  expertise: string | null;
  short_bio: string | null;
  full_bio: string[] | null;
  photo_url: string | null;
  experience: string | null;
  domain: string | null;
  language: string | null;
  format: string | null;
  price_per_session_pkr: number;
  packages: unknown;
  availability_text: string | null;
  lead_time: string | null;
  credentials: unknown;
  skills: string[] | null;
  intro_video_url: string | null;
  linkedin_url: string | null;
  social_links: unknown;
  testimonials: unknown;
  session_duration_minutes: number;
  session_duration_text: string | null;
  timezone: string | null;
  show_reviews: boolean;
}): Mentor {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    title: row.title ?? "",
    expertise: row.expertise ?? "",
    shortBio: row.short_bio ?? "",
    fullBio: row.full_bio ?? [],
    photo: row.photo_url ?? "",
    experience: row.experience ?? "",
    domain: row.domain ?? "",
    language: row.language ?? "",
    format: row.format ?? "",
    pricePerSession: row.price_per_session_pkr,
    packages: (row.packages as MentorPackage[] | null) ?? [],
    availability: row.availability_text ?? "",
    leadTime: row.lead_time ?? "",
    credentials: (row.credentials as MentorCredential[] | null) ?? [],
    skills: row.skills ?? [],
    introVideoUrl: row.intro_video_url ?? "",
    linkedinUrl: row.linkedin_url ?? "",
    socialLinks: (row.social_links as MentorSocialLink[] | null) ?? [],
    testimonials: (row.testimonials as MentorTestimonial[] | null) ?? [],
    sessionDurationMinutes: row.session_duration_minutes,
    sessionDurationText: row.session_duration_text ?? "",
    timezone: row.timezone ?? "",
    showReviews: row.show_reviews,
  };
}

/** Every published mentor, in admin-controlled order, for the /mentorship grid. */
export async function getPublishedMentors(): Promise<Mentor[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("mentors")
    .select(MENTOR_SELECT)
    .eq("visibility", "published")
    .order("order_index", { ascending: true });

  return (data ?? []).map(mapMentorRow);
}

/** A single published mentor by slug — draft/hidden both return null, matching the RLS policy so an admin's bypassed read sees the same 404 the public sees. */
export async function getPublicMentorBySlug(slug: string): Promise<Mentor | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("mentors")
    .select(MENTOR_SELECT)
    .eq("slug", slug)
    .eq("visibility", "published")
    .maybeSingle();

  return data ? mapMentorRow(data) : null;
}

/**
 * The booking route's guard — identical to getPublicMentorBySlug today
 * (bookable === published), kept as its own name so the booking route reads
 * intent-first and the two can diverge later (e.g. a mentor whose profile
 * stays visible but who's stopped taking new bookings).
 */
export async function getBookableMentor(slug: string): Promise<Mentor | null> {
  return getPublicMentorBySlug(slug);
}
