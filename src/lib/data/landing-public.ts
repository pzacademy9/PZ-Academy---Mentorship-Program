// src/lib/data/landing-public.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeContent, type LandingContent } from "@/lib/landing/content";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import { variantPath } from "@/lib/landing/variants";
import { getPublishedVariantPage } from "@/lib/data/landing-variants";

type PageRow = Database["public"]["Tables"]["landing_pages"]["Row"];
type Picked = Pick<PageRow, "id" | "slug" | "title" | "status" | "published" | "sheet_id" | "drive_folder_id" | "ref_prefix" | "course_id">;

export interface RegistrablePage {
  id: string;
  slug: string;
  title: string;
  status: "published" | "closed";
  content: LandingContent;
  registration: RegistrationConfig;
  sheetId: string | null;
  driveFolderId: string | null;
  refPrefix: string | null;
  courseId: string | null;
  /** The variant path ("uae/module-2") this page was resolved for; "" for the main page. */
  variantKey: string;
}

const COLUMNS = "id, slug, title, status, published, sheet_id, drive_folder_id, ref_prefix, course_id";

function toPage(r: Picked | null): RegistrablePage | null {
  if (!r || r.status === "draft" || !r.published) return null;
  const content = normalizeContent(r.published);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status === "closed" ? "closed" : "published",
    content,
    registration: content.registration,
    sheetId: r.sheet_id,
    driveFolderId: r.drive_folder_id,
    refPrefix: r.ref_prefix,
    courseId: r.course_id,
    variantKey: "",
  };
}

/**
 * Public lookup used by every /api/landing/[slug]/* route. Throws on a read error.
 * With `variantSegments` the page is RESOLVED for that variant link (content and registration are the
 * variant's, so quote/register price against the narrowed config) and `variantKey` is its path. An
 * unknown, disabled or unpublished variant is null. The status is always the main page's, so a closed
 * main page is closed for its variants.
 */
export async function getRegistrablePage(slug: string, variantSegments?: string[]): Promise<RegistrablePage | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_pages").select(COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  const main = toPage(data as Picked | null);
  if (!main || !variantSegments) return main;
  const found = await getPublishedVariantPage(slug, variantSegments);
  if (!found) return null;
  return { ...main, content: found.content, registration: found.content.registration, variantKey: variantPath(found.ref) };
}

/** Same as getRegistrablePage, by id (background jobs know the page id, not the slug). */
export async function getRegistrablePageById(id: string): Promise<RegistrablePage | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_pages").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return toPage(data as Picked | null);
}
