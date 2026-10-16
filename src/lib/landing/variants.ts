// src/lib/landing/variants.ts
// Landing variants (country / module links). Types and constants only here.
// Use `import type` from sections.ts / content.ts: sections.ts imports MODULE_ITEM_SECTIONS from this
// file at runtime, so a runtime import back would create a cycle.
import type { SectionType } from "./sections";

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
