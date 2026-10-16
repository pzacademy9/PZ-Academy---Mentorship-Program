// src/lib/landing/link-names.ts
// The words that end a page's links (/e/<slug>/<country>/<module>): a country's code in lower case and
// a module's link name. Both share one URL segment, so neither may equal the other, and neither may be
// "status" (the page's status screen). Messages are shown to admins as-is.
import { MODULE_KEY_RE, isReservedSegment } from "./variants";
import { REGION_KEY_RE } from "./registration/config";
import type { LandingContent } from "./content";

type Names = Pick<LandingContent, "modules" | "registration">;

const MAX_MODULE_KEY = 40;

/** Why this country can't be added to the page, or null. */
export function regionKeyProblem(key: string, c: Names): string | null {
  if (!REGION_KEY_RE.test(key)) return "That country can't be used here. Choose another one.";
  if (isReservedSegment(key.toLowerCase())) return `"${key}" can't be used as a country here. Choose another one.`;
  const existing = c.registration.regions.find((g) => g.key === key);
  if (existing) return `${existing.label.trim() || key} is already on this page.`;
  const lower = key.toLowerCase();
  if (c.modules.some((m) => m.key === lower)) {
    return `A module already uses the link name "${lower}". Give that module another link name first (Page settings).`;
  }
  return null;
}

/** Why `key` can't be the link name of the module at `index`, or null. */
export function moduleKeyProblem(key: string, c: Names, index: number): string | null {
  if (key === "") return "Give this module a link name, for example module-2.";
  if (key.length > MAX_MODULE_KEY) return `Keep the link name to ${MAX_MODULE_KEY} characters or fewer.`;
  if (!MODULE_KEY_RE.test(key)) return "Use only small letters, numbers and single dashes, for example module-2.";
  if (isReservedSegment(key)) return `"${key}" can't be used as a link name. Choose another one.`;
  const region = c.registration.regions.find((g) => g.key.toLowerCase() === key);
  if (region) return `"${key}" is already the link name of the country ${region.label.trim() || region.key}. Choose another one.`;
  if (c.modules.some((m, i) => i !== index && m.key === key)) return "Another module already uses this link name. Choose another one.";
  return null;
}

/** module-1, module-2, …: the first one no module or country uses. */
export function nextModuleKey(c: Names): string {
  for (let n = 1; ; n++) {
    const key = `module-${n}`;
    if (moduleKeyProblem(key, c, -1) === null) return key;
  }
}
