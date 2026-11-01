// src/lib/progress/visibility.ts
// The one rule for "is this batch shown on the public portal". Used by the portal loaders and by the
// student's own progress, and mirrored in SQL by find_enrolled_ids_by_name (migration 0095).
const KINDS: readonly string[] = ["course", "workshop", "webinar"];

export type PortalVisibilityInput = {
  status: string;
  /** null = automatic (published/closed only), true = admin switched on, false = admin switched off. */
  showInPortal: boolean | null;
  kind: string;
  /** True when the batch has at least one paid or free, non-test registration. */
  enrolled: boolean;
};

const isLive = (status: string) => status === "published" || status === "closed";

/**
 * A portal kind, switch not off, and: published/closed; or (admin switched on) already holding enrolled
 * students. A draft stays private unless an admin switched it on AND it has students.
 */
export function isPortalVisible({ status, showInPortal, kind, enrolled }: PortalVisibilityInput): boolean {
  if (!KINDS.includes(kind)) return false;
  if (showInPortal === false) return false;
  if (showInPortal === true) return isLive(status) || enrolled;
  return isLive(status);
}

/** What the admin switch shows: on when switched on, or automatic and published/closed. */
export function isPortalSwitchOn(status: string, showInPortal: boolean | null | undefined): boolean {
  if (showInPortal === true) return true;
  if (showInPortal === false) return false;
  return isLive(status);
}
