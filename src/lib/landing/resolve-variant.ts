// src/lib/landing/resolve-variant.ts
// Pure: turns the main page content + a variant (region / module link) + that variant's overrides
// into the content to render. Never mutates its inputs.
//
// Order of resolution:
//  1. Overrides. For each known section id, apply `fields` (only keys that exist in that section's
//     SECTION_DEFS) and `hidden` (sets enabled=false). Unknown section ids are ignored. `order`
//     reorders known ids; unknown ids are dropped; sections missing from `order` keep their relative
//     position after the listed ones. `settings` and `seo` are shallow-merged.
//  2. Module filter (ref.moduleKey): for sections in MODULE_ITEM_SECTIONS, drop list items whose
//     `module` is non-empty and different from the key. A section whose list became empty is disabled.
//  3. Registration narrowing.
//     - ref.regionKey: keep only that region, make it the default, prune prices to it, drop options
//       with no price there. An unknown region leaves nothing, so registration is disabled.
//     - ref.moduleKey: keep only the module's option (kind "module"), turn moduleMix off, drop
//       modules[] entries other than this one. If the module has no (found) option, registration is
//       disabled. Tiers that have explicit group totals somewhere in the main page but none on the kept
//       option are removed (percent-only tiers, which no option prices explicitly, stay).
import { SECTION_DEFS } from "./sections";
import { MODULE_ITEM_SECTIONS, type VariantOverrides, type VariantRef } from "./variants";
import type { LandingContent, LandingSection } from "./content";
import type { RegistrationConfig } from "./registration/config";

export { emptyOverrides } from "./variants";

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function applyOverrides(sections: LandingSection[], overrides: VariantOverrides): LandingSection[] {
  const out = sections.map((s) => {
    const ov = own(overrides.sections, s.id) ? overrides.sections[s.id] : undefined;
    if (!ov) return s;
    const keys = new Set(SECTION_DEFS[s.type].fields.map((f) => f.key));
    const data = { ...s.data };
    for (const [k, v] of Object.entries(ov.fields ?? {})) if (keys.has(k)) data[k] = v;
    return { ...s, data, enabled: ov.hidden ? false : s.enabled };
  });
  if (!overrides.order) return out;
  const rank = new Map<string, number>();
  overrides.order.forEach((id, i) => { if (!rank.has(id)) rank.set(id, i); });
  const listed = out.filter((s) => rank.has(s.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...listed, ...out.filter((s) => !rank.has(s.id))];
}

function filterModule(sections: LandingSection[], moduleKey: string): LandingSection[] {
  return sections.map((s) => {
    if (!MODULE_ITEM_SECTIONS.includes(s.type)) return s;
    let data = s.data;
    let emptied = false;
    for (const f of SECTION_DEFS[s.type].fields) {
      const list = data[f.key];
      if (f.kind !== "list" || !Array.isArray(list)) continue;
      const kept = list.filter((it) => {
        const m = (it as { module?: unknown } | null)?.module;
        return typeof m !== "string" || m === "" || m === moduleKey;
      });
      if (kept.length === list.length) continue;
      data = { ...data, [f.key]: kept };
      if (kept.length === 0 && f.required) emptied = true;
    }
    return data === s.data ? s : { ...s, data, enabled: emptied ? false : s.enabled };
  });
}

function narrowRegion(r: RegistrationConfig, regionKey: string): RegistrationConfig {
  const region = r.regions.find((g) => g.key === regionKey);
  if (!region) return { ...r, enabled: false, regions: [], prices: {}, options: [] };
  const prices: RegistrationConfig["prices"] = {};
  for (const [opt, row] of Object.entries(r.prices)) {
    if (own(row, regionKey)) prices[opt] = { [regionKey]: row[regionKey] };
  }
  return {
    ...r,
    regions: [region],
    defaultRegionKey: regionKey,
    prices,
    options: r.options.filter((o) => own(prices, o.key)),
  };
}

function narrowModule(r: RegistrationConfig, optionKey: string, original: RegistrationConfig): RegistrationConfig {
  const option = optionKey === "" ? undefined : r.options.find((o) => o.key === optionKey && o.kind === "module");
  if (!option) return { ...r, enabled: false, options: [], prices: {}, tiers: [], moduleMix: { enabled: false, bundleOptionKey: "" } };
  const prices: RegistrationConfig["prices"] = own(r.prices, option.key) ? { [option.key]: r.prices[option.key] } : {};
  const usedAnywhere = new Set<string>();
  for (const row of Object.values(original.prices)) {
    for (const cell of Object.values(row)) {
      for (const k of [...Object.keys(cell.groupTotals ?? {}), ...Object.keys(cell.earlyGroupTotals ?? {})]) usedAnywhere.add(k);
    }
  }
  const usedHere = new Set<string>();
  for (const cell of Object.values(prices[option.key] ?? {})) {
    for (const k of [...Object.keys(cell.groupTotals ?? {}), ...Object.keys(cell.earlyGroupTotals ?? {})]) usedHere.add(k);
  }
  return {
    ...r,
    options: [option],
    prices,
    moduleMix: { enabled: false, bundleOptionKey: "" },
    tiers: r.tiers.filter((t) => !usedAnywhere.has(t.key) || usedHere.has(t.key)),
  };
}

export function resolveVariant(main: LandingContent, ref: VariantRef, overrides: VariantOverrides): LandingContent {
  const base = structuredClone(main);
  const ov = structuredClone(overrides);
  let sections = applyOverrides(base.sections, ov);
  let registration = base.registration;
  let modules = base.modules ?? [];

  if (ref.moduleKey) sections = filterModule(sections, ref.moduleKey);
  if (ref.regionKey) registration = narrowRegion(registration, ref.regionKey);
  if (ref.moduleKey) {
    const mod = modules.find((m) => m.key === ref.moduleKey);
    registration = narrowModule(registration, mod?.optionKey ?? "", base.registration);
    modules = mod ? [mod] : [];
  }
  return {
    ...base,
    settings: { ...base.settings, ...(ov.settings ?? {}) },
    seo: { ...base.seo, ...(ov.seo ?? {}) },
    sections,
    registration,
    modules,
  };
}

export function findOrphans(
  main: LandingContent,
  overrides: VariantOverrides,
): { sectionIds: string[]; fields: { sectionId: string; field: string }[] } {
  const sectionIds: string[] = [];
  const fields: { sectionId: string; field: string }[] = [];
  for (const [id, ov] of Object.entries(overrides.sections)) {
    const s = main.sections.find((x) => x.id === id);
    if (!s) { sectionIds.push(id); continue; }
    const keys = new Set(SECTION_DEFS[s.type].fields.map((f) => f.key));
    for (const field of Object.keys(ov.fields ?? {})) if (!keys.has(field)) fields.push({ sectionId: id, field });
  }
  return { sectionIds, fields };
}
