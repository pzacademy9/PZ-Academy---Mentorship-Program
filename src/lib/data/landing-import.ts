// src/lib/data/landing-import.ts
// Create-only import: builds a page from a pz-landing/1 file, then every possible link (off by default).
import "server-only";
import { buildImport, type ImportLink } from "@/lib/landing/import/build-content";
import { createLandingPage } from "@/lib/data/landing-pages";
import { ensureVariant, saveVariantDraft, setVariantEnabled, type LandingVariant } from "@/lib/data/landing-variants";
import type { LandingContent } from "@/lib/landing/content";
import type { VariantOverrides } from "@/lib/landing/variants";

export type ImportResult =
  | { ok: false; errors: string[] }
  | { ok: true; pageId: string; slug: string; slugChanged: boolean; warnings: string[]; linksCreated: number; linksFailed: string[] };

const SLUG_MAX = 60;
const MAX_SUFFIX = 20;
const SLUG_TAKEN = "That link name is already used. Choose another in the file.";

function withHero(draft: VariantOverrides, heroId: string, link: ImportLink): VariantOverrides {
  const prev = draft.sections[heroId] ?? {};
  const fields: Record<string, unknown> = { ...(prev.fields ?? {}) };
  if (link.heroTitle) fields.headline = link.heroTitle;
  if (link.heroSubtitle) fields.subheadline = link.heroSubtitle;
  return { ...draft, sections: { ...draft.sections, [heroId]: { ...prev, fields } } };
}

function linkLabel(link: ImportLink, content: LandingContent): string {
  const parts: string[] = [];
  if (link.regionKey) {
    const r = content.registration.regions.find((g) => g.key === link.regionKey);
    parts.push(r && r.label.trim() !== "" ? r.label : link.regionKey);
  }
  if (link.moduleKey) {
    const m = content.modules.find((x) => x.key === link.moduleKey);
    parts.push(m && m.title.trim() !== "" ? m.title : link.moduleKey);
  }
  return parts.join(", ");
}

async function createLink(pageId: string, link: ImportLink, heroId: string | undefined): Promise<boolean> {
  const ref = { regionKey: link.regionKey, moduleKey: link.moduleKey };
  const ensured = await ensureVariant(pageId, ref, false);
  if (!ensured.ok) return false;
  let variant: LandingVariant = ensured.variant;
  if (heroId && (link.heroTitle || link.heroSubtitle)) {
    let saved = await saveVariantDraft(variant.id, withHero(variant.draft, heroId, link), variant.revision);
    if (!saved.ok && saved.reason === "conflict") {
      // One retry on the freshest copy; a second conflict counts as a failed link.
      const again = await ensureVariant(pageId, ref, false);
      if (!again.ok) return false;
      variant = again.variant;
      saved = await saveVariantDraft(variant.id, withHero(variant.draft, heroId, link), variant.revision);
    }
    if (!saved.ok) return false;
  }
  if (link.on) {
    const r = await setVariantEnabled(variant.id, true);
    if (!r.ok) return false;
  }
  return true;
}

export async function importLandingPage(userId: string, raw: string): Promise<ImportResult> {
  const b = buildImport(raw);
  if (!b.ok) return { ok: false, errors: b.errors };
  const { built } = b;

  let pageId: string | null = null;
  let slug = built.slug;
  let slugChanged = false;
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    if (n > 1) {
      const suffix = `-${n}`;
      slug = `${built.slug.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
      slugChanged = true;
    }
    const r = await createLandingPage(userId, { title: built.title, slug, kind: built.kind, content: built.content });
    if (r.ok) { pageId = r.id; break; }
    if (r.reason !== "slug-taken") return { ok: false, errors: ["The page could not be saved. Please try again."] };
  }
  if (!pageId) return { ok: false, errors: [SLUG_TAKEN] };

  const heroId = built.content.sections.find((s) => s.type === "hero")?.id;
  const warnings = built.warnings.map((w) => w.message);
  let linksCreated = 0;
  const linksFailed: string[] = [];
  // Sequential on purpose (keeps order, avoids races); costs O(links) queries.
  for (const link of built.links) {
    if (!heroId && (link.heroTitle || link.heroSubtitle)) {
      warnings.push(`${linkLabel(link, built.content)}: the hero text was not saved because the page has no hero section.`);
    }
    let ok = false;
    try {
      ok = await createLink(pageId, link, heroId);
    } catch {
      ok = false;
    }
    if (ok) linksCreated++;
    else linksFailed.push(linkLabel(link, built.content));
  }
  return { ok: true, pageId, slug, slugChanged, warnings, linksCreated, linksFailed };
}
