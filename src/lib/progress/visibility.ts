// src/lib/progress/visibility.ts
// The one rule for "is this batch shown on the public portal". Used by the portal loaders and by the
// student's own progress, and mirrored in SQL by find_enrolled_ids_by_name (migration 0095).
const KINDS: readonly string[] = ["course", "workshop", "webinar"];

export type PortalVisibilityInput = {
  status: string;
  showInPortal: boolean;
  kind: string;
  /** True when the batch has at least one paid or free, non-test registration. */
  enrolled: boolean;
};

/** Switch on, a portal kind, and either published/closed or already holding enrolled students. */
export function isPortalVisible({ status, showInPortal, kind, enrolled }: PortalVisibilityInput): boolean {
  if (showInPortal !== true) return false;
  if (!KINDS.includes(kind)) return false;
  return status === "published" || status === "closed" || enrolled;
}
