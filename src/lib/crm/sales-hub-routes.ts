/** Route constants for the admin Sales Hub. Pure, safe to import in client code. */
export const SALES_HUB_BASE = "/dashboard/admin/sales-hub";

export function hubPath(section: string): string {
  return `${SALES_HUB_BASE}/${section}`;
}

const LEGACY_TABS = new Set(["contacts", "import", "merge", "campaigns", "cohorts", "whatsapp", "conversion"]);

/** Where the old `/dashboard/admin/crm?tab=<tab>` URL now lives. */
export function legacyCrmTabTarget(tab: string | undefined): string {
  if (tab === "agents") return SALES_HUB_BASE; // legacy lead-link system was removed
  if (tab && LEGACY_TABS.has(tab)) return hubPath(tab);
  return hubPath("contacts");
}

export function isSalesHubPath(pathname: string): boolean {
  return pathname === SALES_HUB_BASE || pathname.startsWith(`${SALES_HUB_BASE}/`);
}
