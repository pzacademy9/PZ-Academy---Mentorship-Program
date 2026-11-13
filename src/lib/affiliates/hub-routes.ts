/** Route constants for the admin Affiliates hub. Pure, safe to import in client code. */
export const AFFILIATES_HUB_BASE = "/dashboard/admin/affiliates";

export type AffiliatesTab = "applications" | "affiliates" | "payouts" | "leaderboard" | "emails";

const TABS: readonly AffiliatesTab[] = ["applications", "affiliates", "payouts", "leaderboard", "emails"];

/** A missing or mistyped value opens Applications, never a blank page. */
export function parseAffiliatesTab(v: string | undefined | null): AffiliatesTab {
  return TABS.find((t) => t === v) ?? "applications";
}

export function affiliatesTabHref(t: AffiliatesTab): string {
  return `${AFFILIATES_HUB_BASE}?tab=${t}`;
}

export function isAffiliatesHubPath(pathname: string): boolean {
  return pathname === AFFILIATES_HUB_BASE || pathname.startsWith(`${AFFILIATES_HUB_BASE}/`);
}
