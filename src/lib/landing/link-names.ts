// src/lib/landing/link-names.ts
// The words that end a page's links (/e/<slug>/<country>/<module>): a country's code in lower case and
// a module's link name. Both share one URL segment, so neither may equal the other, and neither may be
// "status" (the page's status screen). Messages are shown to admins as-is.
import { MODULE_KEY_RE, isReservedSegment, parseVariantPath, variantPath, type VariantRef } from "./variants";
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

/**
 * Why `key` can't be the link name of the module at `index`, or null. `taken` = the module link names
 * of every link the page already has, including links of modules since removed: a new module given
 * such a name would take over that old link (its on/off state, its edits, its live version).
 */
export function moduleKeyProblem(key: string, c: Names, index: number, taken: readonly string[] = []): string | null {
  if (key === "") return "Give this module a link name, for example module-2.";
  if (key.length > MAX_MODULE_KEY) return `Keep the link name to ${MAX_MODULE_KEY} characters or fewer.`;
  if (!MODULE_KEY_RE.test(key)) return "Use only small letters, numbers and single dashes, for example module-2.";
  if (isReservedSegment(key)) return `"${key}" can't be used as a link name. Choose another one.`;
  const region = c.registration.regions.find((g) => g.key.toLowerCase() === key);
  if (region) return `"${key}" is already the link name of the country ${region.label.trim() || region.key}. Choose another one.`;
  if (c.modules.some((m, i) => i !== index && m.key === key)) return "Another module already uses this link name. Choose another one.";
  if (taken.includes(key) && c.modules[index]?.key !== key) {
    return "An earlier module used this link name and its link still exists. Choose another one.";
  }
  return null;
}

/** module-1, module-2, …: the first one no module, country or existing link uses. */
export function nextModuleKey(c: Names, taken: readonly string[] = []): string {
  for (let n = 1; ; n++) {
    const key = `module-${n}`;
    if (moduleKeyProblem(key, c, -1, taken) === null) return key;
  }
}

/**
 * Links are created from the main page as it is being edited, but they are served (and published)
 * on top of the LIVE main page. A link whose country or module is not on the live main page yet
 * would not open, so it can't be published: this says why, or null when it can.
 */
export function linkMissingFromLive(ref: VariantRef, draft: Names, live: Names | null): string | null {
  if (!live) return "Publish the main page first";
  if (parseVariantPath(variantPath(ref).split("/"), live)) return null;
  const missing: string[] = [];
  if (ref.regionKey && !live.registration.regions.some((g) => g.key === ref.regionKey)) {
    const g = draft.registration.regions.find((x) => x.key === ref.regionKey);
    missing.push(g?.label.trim() || ref.regionKey);
  }
  if (ref.moduleKey && !live.modules.some((m) => m.key === ref.moduleKey)) {
    const m = draft.modules.find((x) => x.key === ref.moduleKey);
    missing.push(m?.title.trim() || ref.moduleKey);
  }
  return `Publish the main page again so it includes ${missing.length > 0 ? missing.join(" and ") : "this link"}`;
}
