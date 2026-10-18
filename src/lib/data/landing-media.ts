// src/lib/data/landing-media.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  MEDIA_FOLDERS,
  cleanMediaName,
  fileIdFromUrl,
  orientationOf,
  type MediaFolder,
  type MediaOrientation,
} from "@/lib/landing/media";

export type MediaItem = {
  id: string;
  driveFileId: string;
  url: string;
  name: string;
  folder: MediaFolder;
  width: number | null;
  height: number | null;
  orientation: MediaOrientation | null;
  sizeBytes: number | null;
  createdAt: string;
};

type MediaPage = { id: string; title: string; slug: string };

const COLUMNS =
  "id, drive_file_id, url, name, folder, width, height, orientation, size_bytes, created_at";

type MediaRow = {
  id: string;
  drive_file_id: string;
  url: string;
  name: string;
  folder: string;
  width: number | null;
  height: number | null;
  orientation: string | null;
  size_bytes: number | null;
  created_at: string;
};

function toItem(r: MediaRow): MediaItem {
  return {
    id: r.id,
    driveFileId: r.drive_file_id,
    url: r.url,
    name: r.name,
    folder: r.folder as MediaFolder,
    width: r.width,
    height: r.height,
    orientation: r.orientation as MediaOrientation | null,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  };
}

const isFolder = (f: string): f is MediaFolder => MEDIA_FOLDERS.some((m) => m.key === f);

/** Newest first. Throws on a read error. */
export async function listMedia(opts: { q?: string; folder?: MediaFolder } = {}): Promise<MediaItem[]> {
  const admin = createAdminSupabase();
  let query = admin.from("landing_media").select(COLUMNS);
  if (opts.folder) query = query.eq("folder", opts.folder);
  const q = opts.q?.trim();
  if (q) query = query.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).order("id");
  if (error) throw error;
  return (data ?? []).map(toItem);
}

export async function addMedia(
  input: {
    url: string;
    name: string;
    folder?: MediaFolder;
    width?: number | null;
    height?: number | null;
    sizeBytes?: number | null;
  },
  userId: string,
): Promise<{ ok: true; item: MediaItem; existing: boolean } | { ok: false; reason: "invalid" | "error" }> {
  const fileId = fileIdFromUrl(input.url);
  const name = cleanMediaName(input.name);
  const folder = input.folder ?? "misc";
  if (!fileId || !name.ok || !isFolder(folder)) return { ok: false, reason: "invalid" };

  const admin = createAdminSupabase();
  const lookup = async () =>
    admin.from("landing_media").select(COLUMNS).eq("drive_file_id", fileId).maybeSingle();

  const found = await lookup();
  if (found.error) return { ok: false, reason: "error" };
  if (found.data) return { ok: true, item: toItem(found.data), existing: true };

  const width = input.width ?? null;
  const height = input.height ?? null;
  const { data, error } = await admin
    .from("landing_media")
    .insert({
      drive_file_id: fileId,
      url: input.url,
      name: name.name,
      folder,
      width,
      height,
      orientation: orientationOf(width, height),
      size_bytes: input.sizeBytes ?? null,
      created_by: userId,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      // Someone added the same picture a moment ago.
      const again = await lookup();
      if (!again.error && again.data) return { ok: true, item: toItem(again.data), existing: true };
    }
    return { ok: false, reason: "error" };
  }
  return { ok: true, item: toItem(data), existing: false };
}

export async function updateMedia(
  id: string,
  patch: { name?: string; folder?: MediaFolder },
): Promise<{ ok: true; item: MediaItem } | { ok: false; reason: "invalid" | "not-found" | "error" }> {
  const update: { name?: string; folder?: MediaFolder } = {};
  if (patch.name !== undefined) {
    const n = cleanMediaName(patch.name);
    if (!n.ok) return { ok: false, reason: "invalid" };
    update.name = n.name;
  }
  if (patch.folder !== undefined) {
    if (!isFolder(patch.folder)) return { ok: false, reason: "invalid" };
    update.folder = patch.folder;
  }
  if (Object.keys(update).length === 0) return { ok: false, reason: "invalid" };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_media")
    .update(update)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, reason: "error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true, item: toItem(data) };
}

/**
 * Pages whose draft, published copy, or any variant's draft/published copy mentions the file.
 * Throws on any read error: a failed scan must never be read as "unused".
 */
export async function findMediaUsage(driveFileId: string): Promise<MediaPage[]> {
  const admin = createAdminSupabase();
  const pages = await admin.from("landing_pages").select("id, title, slug, draft, published");
  if (pages.error) throw pages.error;
  const variants = await admin.from("landing_page_variants").select("page_id, draft, published");
  if (variants.error) throw variants.error;

  const has = (v: unknown) => v != null && JSON.stringify(v).includes(driveFileId);
  const variantHit = new Set<string>();
  for (const v of variants.data ?? []) {
    if (has(v.draft) || has(v.published)) variantHit.add(v.page_id);
  }
  return (pages.data ?? [])
    .filter((p) => variantHit.has(p.id) || has(p.draft) || has(p.published))
    .map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
}

export async function deleteMedia(
  id: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: "in-use"; pages: MediaPage[] }
  | { ok: false; reason: "not-found" | "error" }
> {
  const admin = createAdminSupabase();
  const found = await admin.from("landing_media").select("id, drive_file_id").eq("id", id).maybeSingle();
  if (found.error) return { ok: false, reason: "error" };
  if (!found.data) return { ok: false, reason: "not-found" };

  let pages: MediaPage[];
  try {
    pages = await findMediaUsage(found.data.drive_file_id);
  } catch {
    return { ok: false, reason: "error" };
  }
  if (pages.length > 0) return { ok: false, reason: "in-use", pages };

  const { error } = await admin.from("landing_media").delete().eq("id", id);
  if (error) return { ok: false, reason: "error" };
  return { ok: true };
}
