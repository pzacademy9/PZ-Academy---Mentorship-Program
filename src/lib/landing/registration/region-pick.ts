import type { RegionDef } from "./config";

// Vercel's x-vercel-ip-country is ISO 3166 alpha-2; region keys are the page's own short codes.
const COUNTRY_TO_REGION: Record<string, string> = { PK: "PK", AE: "UAE", SA: "KSA", PH: "PH", IN: "IN" };

/** Which region to preselect: a valid ?region= override, else the visitor's country, else International, else the default. */
export function pickRegion(regions: RegionDef[], country: string | null, defaultKey: string, override?: string | null): string {
  if (regions.length === 1) return regions[0].key; // a country / module link: the only region is the choice
  const has = (k: string) => regions.some((r) => r.key === k);
  const o = (override ?? "").trim().toUpperCase();
  if (o && has(o)) return o;
  if (country) {
    const c = country.trim().toUpperCase();
    const mapped = COUNTRY_TO_REGION[c] ?? c;
    if (has(mapped)) return mapped;
    if (has("INTL")) return "INTL";
  }
  if (has(defaultKey)) return defaultKey;
  return regions[0]?.key ?? "";
}
