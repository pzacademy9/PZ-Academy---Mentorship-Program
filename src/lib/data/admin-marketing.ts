import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { reorderIndexes } from "@/lib/validations/admin-lms";
import { diffSingleImageFileId } from "@/lib/validations/drive-cleanup";
import { trashDriveFiles } from "@/lib/data/drive-cleanup";
import type { BannerSlot, FeaturedItemType } from "@/lib/validations/admin-marketing";
import type { bannerCreateSchema, bannerUpdateSchema, featuredItemCreateSchema } from "@/lib/validations/admin-marketing";
import type { Database } from "@/lib/supabase/database.types";
import type { z } from "zod";

/**
 * Admin data layer for the Marketing Funnel CMS. Mirrors admin-lms.ts: the
 * service-role client (callers are already gated by requireAdmin() at the
 * route boundary), discriminated-union results instead of throwing, the
 * `if (error) ... if (!data) ...` two-step on every mutation.
 */

export type BannerCreateInput = z.infer<typeof bannerCreateSchema>;
export type BannerUpdateInput = z.infer<typeof bannerUpdateSchema>;
export type FeaturedItemCreateInput = z.infer<typeof featuredItemCreateSchema>;

export interface AdminBannerRow {
  id: string;
  slot: BannerSlot;
  imageUrl: string | null;
  headline: string;
  ctaText: string;
  ctaLink: string;
  isActive: boolean;
  activeFrom: string | null;
  activeUntil: string | null;
  orderIndex: number;
}

export type MutationResult =
  | { ok: true; id: string; warning?: string | null }
  | { ok: false; reason: "not-found" | "db-error" };
export type ReorderResult = { ok: true } | { ok: false; reason: "db-error" };

function mapBannerRow(b: {
  id: string;
  slot: BannerSlot;
  image_url: string | null;
  headline: string;
  cta_text: string;
  cta_link: string;
  is_active: boolean;
  active_from: string | null;
  active_until: string | null;
  order_index: number;
}): AdminBannerRow {
  return {
    id: b.id,
    slot: b.slot,
    imageUrl: b.image_url,
    headline: b.headline,
    ctaText: b.cta_text,
    ctaLink: b.cta_link,
    isActive: b.is_active,
    activeFrom: b.active_from,
    activeUntil: b.active_until,
    orderIndex: b.order_index,
  };
}

const BANNER_COLUMNS = "id, slot, image_url, headline, cta_text, cta_link, is_active, active_from, active_until, order_index";

export async function listBanners(slot?: BannerSlot): Promise<AdminBannerRow[]> {
  const admin = createAdminSupabase();
  let query = admin.from("banners").select(BANNER_COLUMNS);
  if (slot) query = query.eq("slot", slot);
  const { data } = await query.order("slot").order("order_index", { ascending: true });
  return (data ?? []).map(mapBannerRow);
}

async function nextBannerOrderIndex(admin: ReturnType<typeof createAdminSupabase>, slot: BannerSlot): Promise<number> {
  const { data } = await admin
    .from("banners")
    .select("order_index")
    .eq("slot", slot)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.order_index + 1 : 0;
}

export async function createBanner(userId: string, input: BannerCreateInput): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const orderIndex = await nextBannerOrderIndex(admin, input.slot);
  const { data, error } = await admin
    .from("banners")
    .insert({
      slot: input.slot,
      image_url: input.imageUrl ?? null,
      headline: input.headline,
      cta_text: input.ctaText,
      cta_link: input.ctaLink,
      active_from: input.activeFrom ?? null,
      active_until: input.activeUntil ?? null,
      order_index: orderIndex,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

export async function updateBanner(id: string, input: BannerUpdateInput): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin.from("banners").select("image_url").eq("id", id).maybeSingle();

  const patch: Database["public"]["Tables"]["banners"]["Update"] = {};
  if (input.slot !== undefined) patch.slot = input.slot;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl ?? null;
  if (input.headline !== undefined) patch.headline = input.headline;
  if (input.ctaText !== undefined) patch.cta_text = input.ctaText;
  if (input.ctaLink !== undefined) patch.cta_link = input.ctaLink;
  if (input.activeFrom !== undefined) patch.active_from = input.activeFrom ?? null;
  if (input.activeUntil !== undefined) patch.active_until = input.activeUntil ?? null;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await admin.from("banners").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const warning =
    existing && input.imageUrl !== undefined
      ? await trashDriveFiles(diffSingleImageFileId(existing.image_url, input.imageUrl ?? null))
      : null;

  return { ok: true, id: data.id, warning };
}

export async function deleteBanner(id: string): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin.from("banners").select("image_url").eq("id", id).maybeSingle();

  const { data, error } = await admin.from("banners").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const warning = await trashDriveFiles(diffSingleImageFileId(existing?.image_url ?? null, null));

  return { ok: true, id: data.id, warning };
}

export async function reorderBanners(slot: BannerSlot, orderedIds: string[]): Promise<ReorderResult> {
  const admin = createAdminSupabase();
  const updates = reorderIndexes(orderedIds);
  const results = await Promise.all(
    updates.map(({ id, orderIndex }) => admin.from("banners").update({ order_index: orderIndex }).eq("id", id).eq("slot", slot)),
  );
  if (results.some((r) => r.error)) return { ok: false, reason: "db-error" };
  return { ok: true };
}

export interface AdminFeaturedItemRow {
  id: string;
  itemType: FeaturedItemType;
  itemId: string;
  orderIndex: number;
  courseTitle: string;
  courseSlug: string;
  courseThumbnailUrl: string | null;
}

/** item_id has no FK constraint — see the comment on getFeaturedItems() in src/lib/data/marketing.ts. */
export async function listFeaturedItems(): Promise<AdminFeaturedItemRow[]> {
  const admin = createAdminSupabase();
  const { data: items } = await admin
    .from("featured_items")
    .select("id, item_type, item_id, order_index")
    .order("order_index", { ascending: true });

  if (!items || items.length === 0) return [];

  const { data: courses } = await admin
    .from("courses")
    .select("id, title, slug, thumbnail_url")
    .in(
      "id",
      items.map((i) => i.item_id),
    );

  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));

  return items
    .map((item) => {
      const course = courseById.get(item.item_id);
      if (!course) return null;
      return {
        id: item.id,
        itemType: item.item_type,
        itemId: item.item_id,
        orderIndex: item.order_index,
        courseTitle: course.title,
        courseSlug: course.slug,
        courseThumbnailUrl: course.thumbnail_url,
      };
    })
    .filter((row): row is AdminFeaturedItemRow => row != null);
}

export interface AvailableCourseRow {
  id: string;
  title: string;
  slug: string;
  type: string;
  thumbnailUrl: string | null;
}

/** Published courses/webinars not already featured — the "Available" column source. */
export async function listAvailableCourses(): Promise<AvailableCourseRow[]> {
  const admin = createAdminSupabase();
  const [{ data: courses }, { data: featured }] = await Promise.all([
    admin
      .from("courses")
      .select("id, title, slug, type, thumbnail_url")
      .eq("is_published", true)
      .in("type", ["course", "webinar"])
      .order("title"),
    admin.from("featured_items").select("item_id"),
  ]);

  const featuredIds = new Set((featured ?? []).map((f) => f.item_id));
  return (courses ?? [])
    .filter((c) => !featuredIds.has(c.id))
    .map((c) => ({ id: c.id, title: c.title, slug: c.slug, type: c.type, thumbnailUrl: c.thumbnail_url }));
}

async function nextFeaturedOrderIndex(admin: ReturnType<typeof createAdminSupabase>): Promise<number> {
  const { data } = await admin
    .from("featured_items")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.order_index + 1 : 0;
}

export async function addFeaturedItem(input: FeaturedItemCreateInput): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const orderIndex = await nextFeaturedOrderIndex(admin);
  const { data, error } = await admin
    .from("featured_items")
    .insert({ item_type: input.itemType, item_id: input.itemId, order_index: orderIndex })
    .select("id")
    .single();

  if (error || !data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

export async function removeFeaturedItem(id: string): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("featured_items").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true, id: data.id };
}

export async function reorderFeaturedItems(orderedIds: string[]): Promise<ReorderResult> {
  const admin = createAdminSupabase();
  const updates = reorderIndexes(orderedIds);
  const results = await Promise.all(
    updates.map(({ id, orderIndex }) => admin.from("featured_items").update({ order_index: orderIndex }).eq("id", id)),
  );
  if (results.some((r) => r.error)) return { ok: false, reason: "db-error" };
  return { ok: true };
}
