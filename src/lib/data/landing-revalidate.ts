// src/lib/data/landing-revalidate.ts
import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Refreshes a landing page's cached public HTML: the main page, every variant link and /status.
 * Next 14 derives a page's layout cache tags from the route PATTERN (not the real URL), so the
 * layout call must use "/e/[slug]"; the exact main URL is the only tag tied to the real path.
 */
export function revalidateLandingSlug(slug: string): void {
  revalidatePath("/e/[slug]", "layout");
  revalidatePath(`/e/${slug}`);
}
