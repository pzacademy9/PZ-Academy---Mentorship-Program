// src/lib/data/landing-variants.ts
// Data layer for landing variants (country / module links). Mirrors landing-pages.ts.
import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { computeReadiness, normalizeContent, type LandingContent, type PageStatus, type Problem } from "@/lib/landing/content";
import {
  defaultModuleHeadline, emptyOverrides, parseVariantPath,
  type VariantOverrides, type VariantRef,
} from "@/lib/landing/variants";
import { resolveVariant } from "@/lib/landing/resolve-variant";
import { getLandingPage, type LandingPage } from "@/lib/data/landing-pages";

type Row = Database["public"]["Tables"]["landing_page_variants"]["Row"];

export interface LandingVariant {
  id: string; pageId: string; ref: VariantRef; enabled: boolean;
  draft: VariantOverrides; published: VariantOverrides | null;
  revision: number; publishedAt: string | null;
}
export interface LandingVariantVersion { version: number; createdAt: string }

export type EnsureResult =
  | { ok: true; variant: LandingVariant }
  | { ok: false; reason: "not-found" | "bad-ref" | "db-error" };
export type VariantSaveResult = { ok: true; revision: number } | { ok: false; reason: "conflict" | "not-found" | "db-error" };
export type VariantSimpleResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };
export type VariantPublishResult =
  | { ok: true; version: number }
  | { ok: false; reason: "not-found" | "db-error" | "conflict" | "main-not-published" }
  | { ok: false; reason: "not-ready"; problems: Problem[] };

const UNIQUE_VIOLATION = "23505";
const COLUMNS = "id, page_id, region_key, module_key, enabled, draft, published, revision, published_at, created_at, updated_at";

const asJson = (o: VariantOverrides) => o as unknown as Json;

/** Coerces stored JSON to a safe VariantOverrides (never throws on bad data). */
function normalizeOverrides(raw: unknown): VariantOverrides {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<VariantOverrides>;
  const sections = r.sections && typeof r.sections === "object" && !Array.isArray(r.sections) ? r.sections : {};
  const out: VariantOverrides = { sections };
  if (Array.isArray(r.order)) out.order = r.order.filter((x): x is string => typeof x === "string");
  if (r.settings && typeof r.settings === "object") out.settings = r.settings;
  if (r.seo && typeof r.seo === "object") out.seo = r.seo;
  return out;
}

function mapRow(r: Row): LandingVariant {
  return {
    id: r.id, pageId: r.page_id, ref: { regionKey: r.region_key, moduleKey: r.module_key },
    enabled: r.enabled, draft: normalizeOverrides(r.draft),
    published: r.published ? normalizeOverrides(r.published) : null,
    revision: r.revision, publishedAt: r.published_at,
  };
}

export async function listVariants(pageId: string): Promise<LandingVariant[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_page_variants").select(COLUMNS).eq("page_id", pageId);
  // Throw rather than show an admin an empty list for a page that has variants.
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

const sameRef = (a: VariantRef, b: VariantRef) => a.regionKey === b.regionKey && a.moduleKey === b.moduleKey;

export async function ensureVariant(pageId: string, ref: VariantRef, enabled: boolean): Promise<EnsureResult> {
  let page: LandingPage | null;
  try {
    page = await getLandingPage(pageId);
  } catch {
    return { ok: false, reason: "db-error" };
  }
  if (!page) return { ok: false, reason: "not-found" };
  if (!ref.regionKey && !ref.moduleKey) return { ok: false, reason: "bad-ref" };
  const region = ref.regionKey
    ? (page.draft.registration?.regions ?? []).find((g) => g.key.toUpperCase() === ref.regionKey!.toUpperCase())
    : null;
  if (ref.regionKey && !region) return { ok: false, reason: "bad-ref" };
  const mod = ref.moduleKey ? (page.draft.modules ?? []).find((m) => m.key === ref.moduleKey) : null;
  if (ref.moduleKey && !mod) return { ok: false, reason: "bad-ref" };
  const canonical: VariantRef = { regionKey: region ? region.key : null, moduleKey: mod ? mod.key : null };

  let existing: LandingVariant[];
  try {
    existing = await listVariants(pageId);
  } catch {
    return { ok: false, reason: "db-error" };
  }
  const found = existing.find((v) => sameRef(v.ref, canonical));
  if (found) return { ok: true, variant: found };

  const draft = emptyOverrides();
  if (mod) {
    const hero = page.draft.sections.find((s) => s.type === "hero");
    if (hero) draft.sections[hero.id] = { fields: { headline: defaultModuleHeadline(mod) } };
  }
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_page_variants")
    .insert({ page_id: pageId, region_key: canonical.regionKey, module_key: canonical.moduleKey, enabled, draft: asJson(draft) })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Lost a race with another create: return the row that won.
      try {
        const again = (await listVariants(pageId)).find((v) => sameRef(v.ref, canonical));
        if (again) return { ok: true, variant: again };
      } catch { /* fall through */ }
    }
    return { ok: false, reason: "db-error" };
  }
  if (!data) return { ok: false, reason: "db-error" };
  return { ok: true, variant: mapRow(data) };
}

/** Optimistic concurrency, same as saveDraft: a stale revision matches nothing and is a conflict. */
export async function saveVariantDraft(variantId: string, overrides: VariantOverrides, baseRevision: number): Promise<VariantSaveResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_page_variants")
    .update({ draft: asJson(overrides), revision: baseRevision + 1, updated_at: new Date().toISOString() })
    .eq("id", variantId)
    .eq("revision", baseRevision)
    .select("revision")
    .maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (data) return { ok: true, revision: data.revision };
  const { data: exists, error: readError } = await admin.from("landing_page_variants").select("id").eq("id", variantId).maybeSingle();
  if (readError) return { ok: false, reason: "db-error" };
  return { ok: false, reason: exists ? "conflict" : "not-found" };
}

type Loaded = { variant: LandingVariant; page: LandingPage };

/** Variant plus its main page. "db-error" for a failed read, null when either is missing. */
async function load(variantId: string): Promise<Loaded | null | "db-error"> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_page_variants").select(COLUMNS).eq("id", variantId).maybeSingle();
  if (error) return "db-error";
  if (!data) return null;
  try {
    const page = await getLandingPage(data.page_id);
    return page ? { variant: mapRow(data), page } : null;
  } catch {
    return "db-error";
  }
}

function revalidate(slug: string) {
  revalidatePath(`/e/${slug}`, "layout");
}

export async function setVariantEnabled(variantId: string, enabled: boolean): Promise<VariantSimpleResult> {
  const l = await load(variantId);
  if (l === "db-error") return { ok: false, reason: "db-error" };
  if (!l) return { ok: false, reason: "not-found" };
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("landing_page_variants")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", variantId);
  if (error) return { ok: false, reason: "db-error" };
  revalidate(l.page.slug);
  return { ok: true };
}

export async function deleteVariant(variantId: string): Promise<VariantSimpleResult> {
  const l = await load(variantId);
  if (l === "db-error") return { ok: false, reason: "db-error" };
  if (!l) return { ok: false, reason: "not-found" };
  const admin = createAdminSupabase();
  const { error } = await admin.from("landing_page_variants").delete().eq("id", variantId);
  if (error) return { ok: false, reason: "db-error" };
  revalidate(l.page.slug);
  return { ok: true };
}

function rpcFailure(error: { message?: string } | null): "not-found" | "conflict" | "main-not-published" | "db-error" {
  const m = error?.message ?? "";
  if (m.includes("landing_variant_not_found") || m.includes("landing_version_not_found")) return "not-found";
  if (m.includes("landing_revision_conflict")) return "conflict";
  if (m.includes("landing_main_not_published")) return "main-not-published";
  return "db-error";
}

/** Currency codes used by OTHER regions of the page, found as whole words in text. */
function foreignCurrencyIn(text: string, own: string, content: LandingContent): string | null {
  const codes = new Set(
    (content.registration?.regions ?? []).map((g) => g.currency.toUpperCase()).filter((c) => c !== "" && c !== own.toUpperCase()),
  );
  for (const code of Array.from(codes)) {
    if (new RegExp(`\\b${code}\\b`, "i").test(text)) return code;
  }
  return null;
}

/** Variant-specific problems, in plain language, over the resolved draft. */
function variantProblems(main: LandingContent, ref: VariantRef, resolved: LandingContent): Problem[] {
  const out: Problem[] = [];
  if (main.registration.enabled) {
    if (ref.regionKey) {
      const label = main.registration.regions.find((g) => g.key === ref.regionKey)?.label || ref.regionKey;
      if (resolved.registration.options.length === 0) {
        out.push({ message: `Nothing is priced for ${label} yet. Add a price for ${label} (Registration setup) before publishing this link.` });
      }
    }
    if (ref.moduleKey) {
      const mod = main.modules.find((m) => m.key === ref.moduleKey);
      const name = mod && mod.title.trim() !== "" ? mod.title : ref.moduleKey;
      const linked = !!mod && mod.optionKey !== "" && main.registration.options.some((o) => o.key === mod.optionKey && o.kind === "module");
      if (!linked) {
        out.push({ message: `${name} is not linked to a priced registration option. Link it to one (Registration setup) before publishing this link.` });
      } else if (!ref.regionKey && resolved.registration.options.length === 0) {
        out.push({ message: `${name} has no price. Add one (Registration setup) before publishing this link.` });
      }
    }
  }
  if (ref.regionKey) {
    const region = main.registration.regions.find((g) => g.key === ref.regionKey);
    if (region) {
      for (const s of resolved.sections) {
        if (s.type !== "pricing_cards" || !s.enabled) continue;
        const code = foreignCurrencyIn(JSON.stringify(s.data), region.currency, main);
        if (code) out.push({ message: `The Prices section still shows ${code} amounts. Edit it for this link.`, sectionId: s.id });
      }
    }
  }
  return out;
}

export async function publishVariant(userId: string, variantId: string): Promise<VariantPublishResult> {
  const l = await load(variantId);
  if (l === "db-error") return { ok: false, reason: "db-error" };
  if (!l) return { ok: false, reason: "not-found" };
  const { variant, page } = l;
  if (!page.published) return { ok: false, reason: "main-not-published" };
  const resolved = resolveVariant(page.published, variant.ref, variant.draft);
  const readiness = computeReadiness(resolved, { title: page.title, slug: page.slug });
  const problems = [...readiness.problems, ...variantProblems(page.published, variant.ref, resolved)];
  if (problems.length > 0) return { ok: false, reason: "not-ready", problems };
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("landing_publish_variant", {
    p_variant_id: variantId, p_user: userId, p_revision: variant.revision,
  });
  if (error) return { ok: false, reason: rpcFailure(error) };
  revalidate(page.slug);
  return { ok: true, version: Number(data) };
}

export async function rollbackVariant(userId: string, variantId: string, version: number): Promise<VariantPublishResult> {
  const l = await load(variantId);
  if (l === "db-error") return { ok: false, reason: "db-error" };
  if (!l) return { ok: false, reason: "not-found" };
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("landing_rollback_variant", {
    p_variant_id: variantId, p_version: version, p_user: userId,
  });
  if (error) return { ok: false, reason: rpcFailure(error) };
  revalidate(l.page.slug);
  return { ok: true, version: Number(data) };
}

export async function listVariantVersions(variantId: string): Promise<LandingVariantVersion[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_variant_versions")
    .select("version, created_at")
    .eq("variant_id", variantId)
    .order("version", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((v) => ({ version: v.version, createdAt: v.created_at }));
}

/**
 * Public read for /e/<slug>/<segments...>. Resolves main's PUBLISHED content with the variant's
 * PUBLISHED overrides. null for a draft page, unknown path, or a variant that is disabled or never
 * published. Throws on a DB error so ISR keeps the previous good page.
 */
export async function getPublishedVariantPage(slug: string, segments: string[]): Promise<{
  page: { id: string; slug: string; kind: string; title: string; status: PageStatus };
  content: LandingContent; ref: VariantRef; status: PageStatus;
} | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .select("id, slug, kind, title, status, published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status === "draft" || !data.published) return null;
  const main = normalizeContent(data.published);
  const ref = parseVariantPath(segments, main);
  if (!ref) return null;
  const { data: rows, error: vErr } = await admin
    .from("landing_page_variants")
    .select(COLUMNS)
    .eq("page_id", data.id)
    .eq("enabled", true);
  if (vErr) throw vErr;
  const variant = (rows ?? []).map(mapRow).find((v) => sameRef(v.ref, ref));
  if (!variant || !variant.published) return null;
  const status = data.status as PageStatus;
  return {
    page: { id: data.id, slug: data.slug, kind: data.kind, title: data.title, status },
    content: resolveVariant(main, ref, variant.published),
    ref, status,
  };
}
