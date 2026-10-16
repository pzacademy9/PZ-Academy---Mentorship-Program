/** `?v=<variant path>` for a country / module link, or "" on the main page (an empty `?v=` would 404). */
export function variantQuery(variant?: string | null): string {
  return variant ? `?v=${encodeURIComponent(variant)}` : "";
}
