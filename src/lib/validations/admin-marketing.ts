import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { url } from "./admin-lms";

export type BannerSlot = Database["public"]["Enums"]["banner_slot"];
export type FeaturedItemType = Database["public"]["Enums"]["featured_item_type"];

export const BANNER_SLOTS = ["hero", "mid_page", "sidebar", "footer"] as const satisfies readonly BannerSlot[];
export const FEATURED_ITEM_TYPES = ["course", "webinar"] as const satisfies readonly FeaturedItemType[];

export const bannerCreateSchema = z.object({
  slot: z.enum(BANNER_SLOTS),
  imageUrl: url,
  headline: z.string().trim().min(1, "Headline is required").max(150),
  ctaText: z.string().trim().min(1, "CTA text is required").max(50),
  ctaLink: z.string().trim().min(1, "CTA link is required").max(500),
  activeFrom: z.string().trim().min(1).optional(),
  activeUntil: z.string().trim().min(1).optional(),
});

export const bannerUpdateSchema = bannerCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const featuredItemCreateSchema = z.object({
  itemType: z.enum(FEATURED_ITEM_TYPES),
  itemId: z.string().uuid(),
});

/** Banner reorder is scoped to one slot — sibling order_index values only compete within the same slot. */
export const bannerReorderSchema = z.object({
  slot: z.enum(BANNER_SLOTS),
  orderedIds: z.array(z.string().uuid()).min(1),
});

export type BannerStatus = "active" | "scheduled" | "expired" | "inactive";

interface BannerSchedule {
  isActive: boolean;
  activeFrom: string | null;
  activeUntil: string | null;
}

/**
 * Display-only status for the admin banner list — RLS enforces the actual
 * visibility window. Lives here (not in src/lib/data/marketing.ts) because
 * that file is `import "server-only"` and this needs to run in the client
 * BannersPanel component too.
 */
export function getBannerStatus(banner: BannerSchedule, now: Date = new Date()): BannerStatus {
  if (!banner.isActive) return "inactive";
  if (banner.activeFrom && now < new Date(banner.activeFrom)) return "scheduled";
  if (banner.activeUntil && now > new Date(banner.activeUntil)) return "expired";
  return "active";
}
