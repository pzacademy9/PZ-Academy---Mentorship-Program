// src/lib/data/landing-pages.ts
import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  computeReadiness, hasUnpublishedChanges, normalizeContent,
  type LandingContent, type PageKind, type PageStatus, type Problem,
} from "@/lib/landing/content";

type Row = Database["public"]["Tables"]["landing_pages"]["Row"];

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
  | { ok: true }
  | { ok: false; reason: "not-found" | "db-error" }
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
  const { data } = await admin.from("landing_pages").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? mapRow(data) : null;
}

/** Public read. Only published or closed pages with a published copy are visible. */
export async function getPublishedLandingPage(slug: string) {
  const admin = createAdminSupabase();
  const { data } = await admin.from("landing_pages").select(COLUMNS).eq("slug", slug).maybeSingle();
  if (!data || data.status === "draft" || !data.published) return null;
  const p = mapRow(data);
  return {
    page: { id: p.id, slug: p.slug, kind: p.kind, title: p.title, status: p.status },
    content: p.published as LandingContent,
  };
}

export async function listVersions(id: string): Promise<LandingVersion[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("landing_page_versions")
    .select("version, created_at")
    .eq("page_id", id)
    .order("version", { ascending: false })
    .limit(50);
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
  const source = await getLandingPage(id);
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
  const { data: exists } = await admin.from("landing_pages").select("id").eq("id", id).maybeSingle();
  return { ok: false, reason: exists ? "conflict" : "not-found" };
}

async function applyPublish(
  userId: string,
  page: LandingPage,
  content: LandingContent,
  resetDraft: boolean,
): Promise<PublishResult> {
  const admin = createAdminSupabase();
  const { data: last } = await admin
    .from("landing_page_versions")
    .select("version")
    .eq("page_id", page.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { error: vErr } = await admin
    .from("landing_page_versions")
    .insert({ page_id: page.id, version, content: asJson(content), created_by: userId });
  if (vErr) return { ok: false, reason: "db-error" };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("landing_pages")
    .update({
      published: asJson(content),
      ...(resetDraft ? { draft: asJson(content), revision: page.revision + 1 } : {}),
      // Publishing edits to a closed page must not silently reopen registration.
      status: page.status === "closed" ? "closed" : "published",
      published_at: now,
      updated_at: now,
    })
    .eq("id", page.id);
  if (error) return { ok: false, reason: "db-error" };
  revalidatePath(`/e/${page.slug}`);
  return { ok: true };
}

export async function publishLandingPage(userId: string, id: string): Promise<PublishResult> {
  const page = await getLandingPage(id);
  if (!page) return { ok: false, reason: "not-found" };
  // The server re-checks readiness: the disabled Publish button is not a security boundary.
  const readiness = computeReadiness(page.draft, { title: page.title, slug: page.slug });
  if (!readiness.ready) return { ok: false, reason: "not-ready", problems: readiness.problems };
  return applyPublish(userId, page, page.draft, false);
}

export async function rollbackLandingPage(userId: string, id: string, version: number): Promise<PublishResult> {
  const page = await getLandingPage(id);
  if (!page) return { ok: false, reason: "not-found" };
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("landing_page_versions")
    .select("content")
    .eq("page_id", id)
    .eq("version", version)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not-found" };
  return applyPublish(userId, page, normalizeContent(data.content), true);
}

export async function setPageStatus(id: string, status: "closed" | "published"): Promise<SimpleResult> {
  const page = await getLandingPage(id);
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
