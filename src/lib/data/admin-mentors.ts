import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { mapMentorRow, MENTOR_SELECT, type Mentor } from "@/lib/data/mentors";
import { slugify, reorderIndexes } from "@/lib/validations/admin-lms";
import { mentorPackageWarnings, type MentorConfigInput, type MentorVisibility } from "@/lib/validations/admin-mentor";
import { diffSingleImageFileId, extractDriveFileId } from "@/lib/validations/drive-cleanup";
import { trashDriveFiles } from "@/lib/data/drive-cleanup";

/**
 * Admin data layer for the Mentor Registry. Mirrors the conventions in
 * src/lib/data/admin-lms.ts: the service-role client (every caller is
 * already gated by requireAdmin()/requireAdminPage() at its own route
 * boundary), typed row mappers, explicit column selects.
 */

export interface MentorListRow {
  id: string;
  slug: string;
  name: string;
  expertise: string;
  pricePerSession: number;
  visibility: MentorVisibility;
  orderIndex: number;
  bookingCount: number;
  hasLinkedAccount: boolean;
}

export interface MentorListStats {
  total: number;
  published: number;
  draft: number;
  hidden: number;
}

/**
 * The Mentor Registry table + stat cards. Booking counts are computed
 * in-memory from a small full-table read of mentorship_bookings — same
 * "good enough for now" call listPrograms() already makes for session/
 * enrollment counts at this platform's current size.
 */
export async function listMentorsForAdmin(): Promise<{ rows: MentorListRow[]; stats: MentorListStats }> {
  const admin = createAdminSupabase();

  const [{ data: mentors }, { data: bookings }] = await Promise.all([
    admin
      .from("mentors")
      .select("id, slug, name, expertise, price_per_session_pkr, visibility, order_index, profile_id")
      .order("order_index", { ascending: true }),
    admin.from("mentorship_bookings").select("mentor_slug"),
  ]);

  const bookingCountBySlug = new Map<string, number>();
  for (const b of bookings ?? []) {
    bookingCountBySlug.set(b.mentor_slug, (bookingCountBySlug.get(b.mentor_slug) ?? 0) + 1);
  }

  const rows: MentorListRow[] = (mentors ?? []).map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    expertise: m.expertise ?? "",
    pricePerSession: m.price_per_session_pkr,
    visibility: m.visibility,
    orderIndex: m.order_index,
    bookingCount: bookingCountBySlug.get(m.slug) ?? 0,
    hasLinkedAccount: m.profile_id != null,
  }));

  const stats: MentorListStats = {
    total: rows.length,
    published: rows.filter((r) => r.visibility === "published").length,
    draft: rows.filter((r) => r.visibility === "draft").length,
    hidden: rows.filter((r) => r.visibility === "hidden").length,
  };

  return { rows, stats };
}

export interface MentorConfigDetail extends Mentor {
  visibility: MentorVisibility;
  orderIndex: number;
  bookingCount: number;
  profileId: string | null;
  showReviews: boolean;
}

const ADMIN_SELECT = `${MENTOR_SELECT}, visibility, order_index, profile_id, show_reviews`;

/** Full detail for the Configuration page: mentor fields + booking count, nothing else. */
export async function getMentorConfig(id: string): Promise<MentorConfigDetail | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select(ADMIN_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;

  const { count } = await admin
    .from("mentorship_bookings")
    .select("id", { count: "exact", head: true })
    .eq("mentor_slug", data.slug);

  return {
    ...mapMentorRow(data),
    visibility: data.visibility,
    orderIndex: data.order_index,
    bookingCount: count ?? 0,
    profileId: data.profile_id,
    showReviews: data.show_reviews,
  };
}

export type CreateMentorResult = { ok: true; id: string; slug: string } | { ok: false; reason: "db-error" };

/**
 * New mentors start as visibility='draft', same "draft until an admin
 * finishes filling it in" shape as createCourse(). Slug uniqueness via the
 * same max-20-attempt probing loop as createCourse (admin-lms.ts).
 */
export async function createMentor(input: { name: string }): Promise<CreateMentorResult> {
  const admin = createAdminSupabase();

  const baseSlug = slugify(input.name) || "mentor";
  let slug = baseSlug;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const { data: existing } = await admin.from("mentors").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${attempt + 1}`;
  }

  const { data: maxRow } = await admin
    .from("mentors")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orderIndex = maxRow ? maxRow.order_index + 1 : 0;

  const { data, error } = await admin
    .from("mentors")
    .insert({ name: input.name, slug, visibility: "draft", order_index: orderIndex })
    .select("id, slug")
    .single();
  if (error || !data) return { ok: false, reason: "db-error" };

  return { ok: true, id: data.id, slug: data.slug };
}

export type UpdateMentorConfigResult =
  | { ok: true; warning: string | null }
  | { ok: false; reason: "not-found" | "db-error" };

/** Applies the Configuration form. No slug field — see the comment on mentorConfigSchema for why it's immutable. */
export async function updateMentorConfig(id: string, input: MentorConfigInput): Promise<UpdateMentorConfigResult> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin.from("mentors").select("photo_url").eq("id", id).maybeSingle();

  const patch = {
    name: input.name,
    title: input.title ?? null,
    expertise: input.expertise ?? null,
    short_bio: input.shortBio ?? null,
    full_bio: input.fullBio ?? [],
    photo_url: input.photoUrl ?? null,
    experience: input.experience ?? null,
    domain: input.domain ?? null,
    language: input.language ?? null,
    format: input.format ?? null,
    price_per_session_pkr: input.pricePerSessionPkr,
    packages: input.packages ?? [],
    availability_text: input.availabilityText ?? null,
    lead_time: input.leadTime ?? null,
    credentials: input.credentials ?? [],
    skills: input.skills ?? [],
    intro_video_url: input.introVideoUrl ?? null,
    linkedin_url: input.linkedinUrl ?? null,
    social_links: input.socialLinks ?? [],
    testimonials: input.testimonials ?? [],
    session_duration_minutes: input.sessionDurationMinutes,
    session_duration_text: input.sessionDurationText ?? null,
    timezone: input.timezone ?? null,
    visibility: input.visibility,
    show_reviews: input.showReviews,
  };

  const { data, error } = await admin.from("mentors").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const warnings: string[] = [];
  if (existing) {
    const driveWarning = await trashDriveFiles(diffSingleImageFileId(existing.photo_url, input.photoUrl ?? null));
    if (driveWarning) warnings.push(driveWarning);
  }
  warnings.push(...mentorPackageWarnings(input.packages ?? [], input.pricePerSessionPkr));

  return { ok: true, warning: warnings.length > 0 ? warnings.join(" ") : null };
}

export type DeleteMentorResult =
  | { ok: true; warning: string | null }
  | { ok: false; reason: "not-found" | "has-bookings" | "db-error"; bookingCount?: number };

/**
 * mentorship_bookings.mentor_slug has no FK (deliberately — see
 * 0028_mentor_registry.sql), so nothing stops the delete at the DB level.
 * Mirrors deleteCourse's has-enrollments guard: refuse outright rather than
 * silently orphaning booking/payment history, and point the admin at
 * Hidden instead.
 */
export async function deleteMentor(id: string): Promise<DeleteMentorResult> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("slug, photo_url").eq("id", id).maybeSingle();
  if (!mentor) return { ok: false, reason: "not-found" };

  const { count } = await admin
    .from("mentorship_bookings")
    .select("id", { count: "exact", head: true })
    .eq("mentor_slug", mentor.slug);
  if ((count ?? 0) > 0) {
    return { ok: false, reason: "has-bookings", bookingCount: count ?? 0 };
  }

  const { error } = await admin.from("mentors").delete().eq("id", id);
  if (error) return { ok: false, reason: "db-error" };

  const fileId = extractDriveFileId(mentor.photo_url);
  const warning = await trashDriveFiles(fileId ? [fileId] : []);

  return { ok: true, warning };
}

export interface MentorLinkOption {
  id: string;
  slug: string;
  name: string;
  title: string;
  photo: string;
  hasLinkedAccount: boolean;
}

/**
 * Lightweight mentor listing for "link this to a mentor" pickers (the
 * feedback session-creation modal's combobox today) — every mentor
 * regardless of visibility, ordered the same as the registry table, with
 * just enough shape to render a searchable dropdown row and flag mentors
 * with no linked login account (profile_id null).
 */
export async function listMentorsForLinking(): Promise<MentorLinkOption[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("mentors")
    .select("id, slug, name, title, photo_url, profile_id")
    .order("order_index", { ascending: true });

  return (data ?? []).map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    title: m.title ?? "",
    photo: m.photo_url ?? "",
    hasLinkedAccount: m.profile_id != null,
  }));
}

export type ReorderMentorsResult = { ok: true } | { ok: false; reason: "db-error" };

export async function reorderMentors(orderedIds: string[]): Promise<ReorderMentorsResult> {
  const admin = createAdminSupabase();
  const updates = reorderIndexes(orderedIds);
  const results = await Promise.all(
    updates.map(({ id, orderIndex }) => admin.from("mentors").update({ order_index: orderIndex }).eq("id", id)),
  );
  if (results.some((r) => r.error)) return { ok: false, reason: "db-error" };
  return { ok: true };
}
