import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type BannerSlot = Database["public"]["Enums"]["banner_slot"];
export type FeaturedItemType = Database["public"]["Enums"]["featured_item_type"];

export interface Banner {
  id: string;
  slot: BannerSlot;
  imageUrl: string | null;
  headline: string;
  ctaText: string;
  ctaLink: string;
}

/**
 * RLS ("banners: public read active") already restricts anon callers to rows
 * where is_active is true and now() falls within [active_from, active_until];
 * admins see every row through the same query. No app-side filtering needed.
 */
export async function getActiveBanners(slot: BannerSlot): Promise<Banner[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("banners")
    .select("id, slot, image_url, headline, cta_text, cta_link")
    .eq("slot", slot)
    .order("order_index", { ascending: true });

  if (!data) return [];
  return data.map((b) => ({
    id: b.id,
    slot: b.slot,
    imageUrl: b.image_url,
    headline: b.headline,
    ctaText: b.cta_text,
    ctaLink: b.cta_link,
  }));
}

export interface FeaturedCourseRow {
  slug: string;
  title: string;
  tagline: string | null;
  type: FeaturedItemType;
  durationText: string | null;
  durationWeeks: number | null;
}

export interface FeaturedCard {
  title: string;
  desc: string;
  badge: string;
  duration: string | null;
  href: string;
  grad: string;
}

const FEATURED_GRADIENTS = ["from-pz-forest to-pz-mid", "from-pz-deep to-pz-forest", "from-pz-mid to-pz-deep"];

/** featured_items has no badge/gradient/enrolled-count columns — derived here from the joined course row. */
export function buildFeaturedCard(course: FeaturedCourseRow, index: number): FeaturedCard {
  return {
    title: course.title,
    desc: course.tagline ?? "",
    badge: course.type === "webinar" ? "Webinar" : "Course",
    duration: course.durationText ?? (course.durationWeeks != null ? `${course.durationWeeks} Weeks` : null),
    href: `/courses/${course.slug}`,
    grad: FEATURED_GRADIENTS[index % FEATURED_GRADIENTS.length],
  };
}

/**
 * item_id has no FK constraint (it's a plain uuid, not `references courses.id`
 * — confirmed against 0001_enums_and_tables.sql), so this can't use a
 * PostgREST embed. Two queries + an in-memory join, same pattern as
 * listPrograms() in admin-lms.ts.
 */
export async function getFeaturedItems(): Promise<FeaturedCard[]> {
  const supabase = await createServerSupabase();
  const { data: items } = await supabase
    .from("featured_items")
    .select("item_id, order_index")
    .order("order_index", { ascending: true });

  if (!items || items.length === 0) return [];

  const { data: courses } = await supabase
    .from("courses")
    .select("id, slug, title, tagline, type, duration_text, duration_weeks")
    .in(
      "id",
      items.map((i) => i.item_id),
    );

  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));

  return items
    .map((item) => courseById.get(item.item_id))
    .filter((course): course is NonNullable<typeof course> => course != null)
    .map((course, index) =>
      buildFeaturedCard(
        {
          slug: course.slug,
          title: course.title,
          tagline: course.tagline,
          type: course.type === "webinar" ? "webinar" : "course",
          durationText: course.duration_text,
          durationWeeks: course.duration_weeks,
        },
        index,
      ),
    );
}

export type { BannerStatus } from "@/lib/validations/admin-marketing";
export { getBannerStatus } from "@/lib/validations/admin-marketing";
