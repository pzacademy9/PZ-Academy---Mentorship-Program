/** Where "Back to registrations" goes: the list the person came from, with its filters. */
const LIST_BASE = "/dashboard/admin/enrollments/registrations";
const DEFAULT_BACK = `${LIST_BASE}/all`;

/** The list address plus its filters, ready to hang on a person's link as `?from=`. */
export function listAddress(basePath: string, query: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || value === "all" || value === 1) continue;
    qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `${basePath}?${text}` : basePath;
}

/** The suffix a person's link carries so the detail page can send you back to the same list. */
export function detailSuffix(listHref: string): string {
  return `?from=${encodeURIComponent(listHref)}`;
}

/** Reads `from` back. Only an address inside the registrations area is accepted, anything else falls back. */
export function backTarget(from: string | string[] | undefined): string {
  const raw = Array.isArray(from) ? from[0] : from;
  if (!raw || !raw.startsWith(`${LIST_BASE}/`) || raw.includes("//") || raw.includes("\\")) return DEFAULT_BACK;
  return raw;
}
