// src/lib/landing/variant-grid.ts
// Pure: every link the admin could create for a page (regions, modules, region x module),
// joined with the variants that already exist.
import type { LandingContent } from "./content";
import { variantPath, type VariantRef } from "./variants";
import type { LandingVariant } from "@/lib/data/landing-variants";

export interface VariantGridRow {
  ref: VariantRef; label: string; path: string;
  variantId: string | null; enabled: boolean; published: boolean;
}

const sameRef = (a: VariantRef, b: VariantRef) => a.regionKey === b.regionKey && a.moduleKey === b.moduleKey;

export function buildVariantGrid(draft: LandingContent, variants: LandingVariant[]): VariantGridRow[] {
  const regions = draft.registration?.regions ?? [];
  const modules = draft.modules ?? [];
  const combos: { ref: VariantRef; label: string }[] = [];
  const rName = (r: (typeof regions)[number]) => r.label.trim() || r.key;
  const mName = (m: (typeof modules)[number]) => m.title.trim() || m.key;
  for (const r of regions) combos.push({ ref: { regionKey: r.key, moduleKey: null }, label: rName(r) });
  for (const m of modules) combos.push({ ref: { regionKey: null, moduleKey: m.key }, label: mName(m) });
  for (const r of regions) {
    for (const m of modules) {
      combos.push({ ref: { regionKey: r.key, moduleKey: m.key }, label: `${rName(r)} \u00b7 ${mName(m)}` });
    }
  }
  return combos.map(({ ref, label }) => {
    const v = variants.find((x) => sameRef(x.ref, ref));
    return {
      ref, label, path: variantPath(ref),
      variantId: v ? v.id : null, enabled: v ? v.enabled : false, published: !!v?.published,
    };
  });
}
