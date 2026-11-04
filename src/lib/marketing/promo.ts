/**
 * In-site promos ("house ads") for the public website. One promo per spot:
 * the admin's banner for that spot first (Admin -> Marketing -> Banners),
 * else an open live batch, else nothing (the spot hides — never an empty box).
 * Pure: the page fetches banners/batches and passes them in.
 */

export interface Promo {
  headline: string;
  /** One short supporting line, or null. */
  detail: string | null;
  ctaText: string;
  href: string;
  imageUrl: string | null;
}

/** Only same-site paths ("/x", not "//x") or http(s) links — never javascript: or data:. */
export function isSafeHref(href: string): boolean {
  const h = href.trim();
  return (h.startsWith("/") && !h.startsWith("//")) || /^https?:\/\//i.test(h);
}

type PromoBanner = { headline: string; ctaText: string; ctaLink: string; imageUrl: string | null };
type PromoBatch = { title: string; startsOn: string; href: string };

export function pickPromo({
  banners,
  batches,
  exclude = [],
}: {
  banners: PromoBanner[];
  batches: PromoBatch[];
  /** Links the visitor is already on — never promote those. */
  exclude?: string[];
}): Promo | null {
  const skip = new Set(exclude);

  const banner = banners.find((b) => b.headline.trim() && isSafeHref(b.ctaLink) && !skip.has(b.ctaLink));
  if (banner) {
    return {
      headline: banner.headline.trim(),
      detail: null,
      ctaText: banner.ctaText.trim() || "Learn more",
      href: banner.ctaLink,
      imageUrl: banner.imageUrl,
    };
  }

  const batch = batches.find((b) => b.title.trim() && isSafeHref(b.href) && !skip.has(b.href));
  if (batch) {
    return {
      headline: batch.title.trim(),
      detail: batch.startsOn ? `New batch starts ${batch.startsOn}` : "New batch open",
      ctaText: "See the batch",
      href: batch.href,
      imageUrl: null,
    };
  }

  return null;
}
