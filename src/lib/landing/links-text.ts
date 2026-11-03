// src/lib/landing/links-text.ts
// Pure helpers for the Links screen: the "Copy all links" text and each row's check.
import type { VariantGridRow } from "./variant-grid";
import type { PageCheck } from "./page-check";

/** The page's public web address for a link: https://<host>/e/<slug>/<path>. */
export function publicLinkUrl(origin: string, slug: string, path: string): string {
  return `${origin}/e/${slug}${path ? `/${path}` : ""}`;
}

/** The list the sales team pastes into WhatsApp: page name, then one line per live link. */
export function buildLinksText(i: {
  pageTitle: string;
  origin: string;
  slug: string;
  mainLive: boolean;
  rows: Pick<VariantGridRow, "label" | "path" | "enabled" | "published">[];
}): string {
  const lines: string[] = [];
  if (i.mainLive) lines.push(`• Main page: ${publicLinkUrl(i.origin, i.slug, "")}`);
  // A link only opens while the main page is live, so with the main page down nothing is listed.
  for (const r of i.mainLive ? i.rows : []) {
    if (r.enabled && r.published) lines.push(`• ${r.label}: ${publicLinkUrl(i.origin, i.slug, r.path)}`);
  }
  return [i.pageTitle, ...(lines.length > 0 ? lines : ["No links are live yet."])].join("\n");
}

/** The check for a country-only or module-only row; a country-with-module row has none of its own. */
export function rowCheck(row: Pick<VariantGridRow, "ref">, checks: PageCheck[]): PageCheck | null {
  const { regionKey, moduleKey } = row.ref;
  if (regionKey && !moduleKey) return checks.find((c) => c.id === `country-${regionKey}`) ?? null;
  if (moduleKey && !regionKey) return checks.find((c) => c.id === `module-${moduleKey}`) ?? null;
  return null;
}
