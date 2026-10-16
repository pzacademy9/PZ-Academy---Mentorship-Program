// src/lib/data/landing-pages.ts
import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  computeReadiness, hasUnpublishedChanges, normalizeContent,
  type LandingContent, type PageKind, type PageStatus, type Problem,
} from "@/lib/landing/content";

// COLUMNS selects only the page columns; the Phase 2 registration columns (0069) are not read here.
type Row = Omit<
  Database["public"]["Tables"]["landing_pages"]["Row"],
  "course_id" | "sheet_id" | "drive_folder_id" | "ref_prefix"
>;

export interface LandingPage {
  id: string; slug: string; kind: PageKind; title: string; status: PageStatus;
  draft: LandingContent; published: LandingContent | null; revision: number;
  publishedAt: string | null; createdAt: string; updatedAt: string;
}
export interface LandingPageSummary {
  id: string; slug: string; kind: PageKind; title: string; status: PageStatus; revision: number;
  publishedAt: string | null; updatedAt: string; hasUnpublishedChanges: boolean;
}
export interface LandingVersion { version: number; createdAt: string }

export type CreateResult = { ok: true; id: string } | { ok: false; reason: "slug-taken" | "db-error" };
export type SaveResult = { ok: true; revision: number } | { ok: false; reason: "conflict" | "not-found" | "db-error" };
export type PublishResult =
  | { ok: true; version: number }
  | { ok: false; reason: "not-found" | "db-error" | "conflict" }
  | { ok: false; reason: "not-ready"; problems: Problem[] };
export type SimpleResult = { ok: true } | { ok: false; reason: "not-found" | "not-published" | "db-error" };

const UNIQUE_VIOLATION = "23505";
const COLUMNS = "id, slug, kind, title, status, draft, published, revision, published_at, created_by, created_at, updated_at";

function mapRow(r: Row): LandingPage {
  return {
    id: r.id, slug: r.slug, kind: r.kind as PageKind, title: r.title, status: r.status as PageStatus,
    draft: normalizeContent(r.draft), published: r.published ? normalizeContent(r.published) : null,
    revision: r.revision, publishedAt: r.published_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const asJson = (c: LandingContent) => c as unknown as Json;

export async function listLandingPages(): Promise<LandingPageSummary[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("landing_pages").select(COLUMNS).order("updated_at", { ascending: false });
  return (data ?? []).map((r) => {
    const p = mapRow(r);
    return {
      id: p.id, slug: p.slug, kind: p.kind, title: p.title, status: p.status, revision: p.revision,
      publishedAt: p.publishedAt, updatedAt: p.updatedAt,
      hasUnpublishedChanges: hasUnpublishedChanges(p.draft, p.published),
    };
  });
}

export async function getLandingPage(id: string): Promise<LandingPage | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_pages").select(COLUMNS).eq("id", id).maybeSingle();
  // A read error is not "not found": throw so callers never treat a DB blip as a missing page.
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/** Public read. Only published or closed pages with a published copy are visible. */
export async function getPublishedLandingPage(slug: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_pages").select(COLUMNS).eq("slug", slug).maybeSingle();
  // Throw so ISR keeps the previous good page instead of caching a 404 for a live page.
  if (error) throw error;
  if (!data || data.status === "draft" || !data.published) return null;
  const p = mapRow(data);
  return {
    page: { id: p.id, slug: p.slug, kind: p.kind, title: p.title, status: p.status },
    content: p.published as LandingContent,
  };
}

export async function listVersions(id: string): Promise<LandingVersion[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_page_versions")
    .select("version, created_at")
    .eq("page_id", id)
    .order("version", { ascending: false })
    .limit(50);
  // Throw rather than tell the admin "no published versions yet" for a page that has some.
  if (error) throw error;
  return (data ?? []).map((v) => ({ version: v.version, createdAt: v.created_at }));
}

export async function createLandingPage(
  userId: string,
  input: { title: string; slug: string; kind: PageKind; content: LandingContent },
): Promise<CreateResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .insert({ slug: input.slug, kind: input.kind, title: input.title, draft: asJson(input.content), created_by: userId })
    .select("id")
    .single();
  if (error) return { ok: false, reason: error.code === UNIQUE_VIOLATION ? "slug-taken" : "db-error" };
  if (!data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

export async function duplicateLandingPage(
  userId: string,
  id: string,
  input: { title: string; slug: string },
): Promise<CreateResult | { ok: false; reason: "not-found" }> {
  let source: LandingPage | null;
  try {
    source = await getLandingPage(id);
  } catch {
    return { ok: false, reason: "db-error" };
  }
  if (!source) return { ok: false, reason: "not-found" };
  return createLandingPage(userId, { title: input.title, slug: input.slug, kind: source.kind, content: source.draft });
}

/**
 * Optimistic concurrency: the update only matches when `revision` is still the
 * one the client loaded. A stale tab, or a slow older request landing after a
 * newer one, matches nothing and is reported as a conflict, never overwritten.
 */
export async function saveDraft(id: string, content: LandingContent, baseRevision: number): Promise<SaveResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .update({ draft: asJson(content), revision: baseRevision + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("revision", baseRevision)
    .select("revision")
    .maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (data) return { ok: true, revision: data.revision };
  const { data: exists, error: readError } = await admin.from("landing_pages").select("id").eq("id", id).maybeSingle();
  // A failed read says nothing about whether the page exists: never report it as missing.
  if (readError) return { ok: false, reason: "db-error" };
  return { ok: false, reason: exists ? "conflict" : "not-found" };
}

/** Maps the fixed messages raised by the 0068 functions to results; anything else is a database error. */
function rpcFailure(error: { message?: string } | null): "not-found" | "conflict" | "db-error" {
  const m = error?.message ?? "";
  if (m.includes("landing_page_not_found") || m.includes("landing_version_not_found")) return "not-found";
  if (m.includes("landing_revision_conflict")) return "conflict";
  return "db-error";
}

/**
 * Publish runs as one database transaction (landing_publish_page, migration 0068). It locks the page
 * row, snapshots the draft as the next version and copies it to published. Two publishes at once queue
 * on the lock instead of colliding on the version number. Readiness is checked here first, and its
 * revision is passed down, so the function refuses to publish a draft that changed after the check.
 */
export async function publishLandingPage(userId: string, id: string): Promise<PublishResult> {
  let page: LandingPage | null;
  try {
    page = await getLandingPage(id);
  } catch {
    return { ok: false, reason: "db-error" };
  }
  if (!page) return { ok: false, reason: "not-found" };
  // The server re-checks readiness: the disabled Publish button is not a security boundary.
  const readiness = computeReadiness(page.draft, { title: page.title, slug: page.slug });
  if (!readiness.ready) return { ok: false, reason: "not-ready", problems: readiness.problems };
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("landing_publish_page", { p_page_id: id, p_user: userId, p_revision: page.revision });
  if (error) return { ok: false, reason: rpcFailure(error) };
  revalidatePath(`/e/${page.slug}`, "layout");
  return { ok: true, version: Number(data) };
}

/** A restore runs as one transaction (landing_rollback_page): the chosen version becomes the draft AND the live page. */
export async function rollbackLandingPage(userId: string, id: string, version: number): Promise<PublishResult> {
  let page: LandingPage | null;
  try {
    page = await getLandingPage(id);
  } catch {
    return { ok: false, reason: "db-error" };
  }
  if (!page) return { ok: false, reason: "not-found" };
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("landing_rollback_page", { p_page_id: id, p_version: version, p_user: userId });
  if (error) return { ok: false, reason: rpcFailure(error) };
  revalidatePath(`/e/${page.slug}`, "layout");
  return { ok: true, version: Number(data) };
}

export async function setPageStatus(id: string, status: "closed" | "published"): Promise<SimpleResult> {
  let page: LandingPage | null;
  try {
    page = await getLandingPage(id);
  } catch {
    return { ok: false, reason: "db-error" };
  }
  if (!page) return { ok: false, reason: "not-found" };
  if (!page.published) return { ok: false, reason: "not-published" };
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("landing_pages")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, reason: "db-error" };
  revalidatePath(`/e/${page.slug}`);
  return { ok: true };
}

/** Renames a page. Only `title` (and updated_at) change: not the slug, the draft or the revision. */
export async function renameLandingPage(id: string, title: string): Promise<SimpleResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, slug")
    .maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };
  revalidatePath(`/e/${data.slug}`);
  revalidatePath("/dashboard/admin/landing-pages");
  return { ok: true };
}
