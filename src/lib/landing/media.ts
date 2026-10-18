import type { Role } from "@/lib/roles";

export type MediaFolder = "heroes" | "instructors" | "misc";

export const MEDIA_FOLDERS: readonly { key: MediaFolder; label: string }[] = [
  { key: "heroes", label: "Hero pictures" },
  { key: "instructors", label: "Instructors" },
  { key: "misc", label: "Other" },
];

export type MediaOrientation = "wide" | "tall" | "square";

/** wide when w/h >= 1.2, tall when <= 0.83, else square; null if unknown. */
export function orientationOf(
  width: number | null,
  height: number | null,
): MediaOrientation | null {
  if (width == null || height == null || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  if (ratio >= 1.2) return "wide";
  if (ratio <= 0.83) return "tall";
  return "square";
}

export function fitFor(
  o: MediaOrientation | null,
  want: "wide" | "tall",
): "fits" | "other" | "unknown" {
  if (o == null) return "unknown";
  return o === want ? "fits" : "other";
}

/** Drive file id from a `id=` query or `/d/<id>` URL; null otherwise. */
export function fileIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ?? url.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

export function cleanMediaName(
  raw: string,
): { ok: true; name: string } | { ok: false } {
  const name = raw.trim();
  if (name.length < 1 || name.length > 80) return { ok: false };
  return { ok: true, name };
}

// Mirrors isAdminRole in src/lib/auth/require-admin.ts, which is server-only
// and so cannot be imported by client code or tests.
export function canManageMedia(role: Role | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}
