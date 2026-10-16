// src/lib/landing/variants.ts
// Landing variants (country / module links). Types and constants only here.
// Use `import type` from sections.ts / content.ts: sections.ts imports MODULE_ITEM_SECTIONS from this
// file at runtime, so a runtime import back would create a cycle.
import type { SectionType } from "./sections";
import type { LandingContent, LandingSettings, LandingSeo } from "./content";

export interface ModuleDef {
  key: string;
  title: string;
  /** For example "3-Day Workshop". */
  format: string;
  days: number;
  /** The registration.options[].key (kind "module") that sells this module; "" until linked. */
  optionKey: string;
}

export const MODULE_KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_MODULES = 12;

/** Sections whose list items can be tagged with the module they apply to ("" = all modules). */
export const MODULE_ITEM_SECTIONS: readonly SectionType[] = [
  "curriculum", "schedule", "pricing_cards", "faq", "feature_cards", "testimonials", "stats",
];

export interface VariantRef {
  regionKey: string | null;
  moduleKey: string | null;
}

const RESERVED_SEGMENTS = ["status"];

export function isReservedSegment(s: string): boolean {
  return RESERVED_SEGMENTS.includes(s);
}

/** Region (case-insensitive, canonical key returned) then module (exact). null for anything else. */
export function parseVariantPath(
  segments: string[],
  content: Pick<LandingContent, "modules" | "registration">,
): VariantRef | null {
  if (segments.length < 1 || segments.length > 2) return null;
  if (segments.some((s) => !s || isReservedSegment(s))) return null;
  const regions = content.registration?.regions ?? [];
  const modules = content.modules ?? [];
  const findRegion = (s: string) => regions.find((r) => r.key.toLowerCase() === s.toLowerCase())?.key ?? null;
  const findModule = (s: string) => modules.find((m) => m.key === s)?.key ?? null;

  if (segments.length === 1) {
    const region = findRegion(segments[0]);
    if (region) return { regionKey: region, moduleKey: null };
    const mod = findModule(segments[0]);
    return mod ? { regionKey: null, moduleKey: mod } : null;
  }
  const region = findRegion(segments[0]);
  const mod = findModule(segments[1]);
  return region && mod ? { regionKey: region, moduleKey: mod } : null;
}

export function variantPath(ref: VariantRef): string {
  return [ref.regionKey?.toLowerCase(), ref.moduleKey].filter(Boolean).join("/");
}

/** Per-variant edits stored against a main page; see resolve-variant.ts for how they are applied. */
export interface VariantOverrides {
  sections: Record<string, { hidden?: boolean; fields?: Record<string, unknown> }>;
  order?: string[];
  settings?: Partial<LandingSettings>;
  seo?: Partial<LandingSeo>;
}

export function emptyOverrides(): VariantOverrides {
  return { sections: {} };
}

/** Default hero headline for a module link, for example "3-Day Workshop: Diabetes". */
export function defaultModuleHeadline(m: ModuleDef): string {
  return `${m.format}: ${m.title}`;
}

/** Same value as the `v` API param. */
export function variantQuery(ref: VariantRef): string {
  return variantPath(ref);
}
