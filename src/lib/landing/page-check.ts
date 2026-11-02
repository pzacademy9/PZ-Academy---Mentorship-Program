// src/lib/landing/page-check.ts
// Pure "Check this page" engine: plain-word checks run on the page content before publish.
// No server imports. The builder shows the results; publish is blocked by failures and asks
// for confirmation on warnings.
import type { LandingContent } from "./content";
import { isSafeUrl } from "./simple-text";
import { resolveVariant, emptyOverrides } from "./resolve-variant";
import { isValidWaGroupUrl, selectWaGroups } from "./registration/wa-groups";
import type { RegistrationConfig } from "./registration/config";
import type { RegistrationStepKey } from "./registration/setup-steps";

export type CheckStatus = "pass" | "fail" | "warn";
export interface PageCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail?: string;
  step?: RegistrationStepKey;
  sectionId?: string;
}

/** The builder's id for the page settings panel. */
export const SETTINGS_TARGET = "__settings__";

export const failures = (checks: PageCheck[]): PageCheck[] => checks.filter((c) => c.status === "fail");
export const warnings = (checks: PageCheck[]): PageCheck[] => checks.filter((c) => c.status === "warn");

function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function liveGroups(r: RegistrationConfig): PageCheck {
  const anyLink = r.options.some((o) => isValidWaGroupUrl(o.waGroupUrl));
  if (!r.modes.includes("live") || !anyLink) {
    return { id: "live-groups", title: "This page has no WhatsApp groups", status: "pass" };
  }
  const missing = r.options.filter((o) => !o.free && !isValidWaGroupUrl(o.waGroupUrl)).map((o) => o.label);
  if (missing.length === 0) return { id: "live-groups", title: "Every paid option has a WhatsApp group", status: "pass" };
  return {
    id: "live-groups",
    title: "Every paid option needs a WhatsApp group",
    status: "fail",
    detail: `No valid WhatsApp group link for: ${nameList(missing)}. Add one on the WhatsApp groups step.`,
    step: "whatsapp",
  };
}

function sharedGroups(r: RegistrationConfig): PageCheck {
  const byLink = new Map<string, string[]>();
  for (const o of r.options) {
    const link = o.waGroupUrl.trim();
    if (!link) continue;
    byLink.set(link, [...(byLink.get(link) ?? []), o.label]);
  }
  const shared = Array.from(byLink.values()).filter((names) => names.length >= 2);
  if (shared.length === 0) return { id: "shared-groups", title: "No two options share a WhatsApp group", status: "pass" };
  return {
    id: "shared-groups",
    title: "Some options share one WhatsApp group",
    status: "warn",
    detail: shared.map((names) => `${nameList(names)} use the same WhatsApp group`).join(". "),
    step: "whatsapp",
  };
}

function recordedNoGroup(r: RegistrationConfig): PageCheck {
  const title = "Recorded students get the portal, not a group link";
  const keys = r.options.map((o) => o.key);
  const sets = [...keys.map((k) => [k]), keys];
  const bad = sets.some((s) => selectWaGroups(r, s, "recorded").length > 0);
  return bad
    ? { id: "recorded-no-group", title, status: "fail", detail: "A recorded student would be sent a WhatsApp group link.", step: "whatsapp" }
    : { id: "recorded-no-group", title, status: "pass" };
}

function recordedPortal(c: LandingContent, ctx: { hasCourse: boolean }): PageCheck {
  const link = c.settings.portalLink.trim();
  const ok = ctx.hasCourse || (link !== "" && isSafeUrl(link));
  return ok
    ? { id: "recorded-portal", title: "Recorded students have a portal to open", status: "pass" }
    : {
        id: "recorded-portal",
        title: "Recorded students have no portal",
        status: "fail",
        detail: "Recorded students have no portal. Link this page to a course or paste a portal link.",
        sectionId: SETTINGS_TARGET,
      };
}

/** What is wrong with a country link's resolved registration, or null when it is fine. */
export function countryProblem(
  resolved: RegistrationConfig,
  key: string,
  original: RegistrationConfig,
): string | null {
  const region = resolved.regions[0];
  if (resolved.regions.length !== 1 || !region || region.key !== key) return "it shows more than one country";
  if (resolved.defaultRegionKey !== key) return "it opens on another country";
  for (const [opt, row] of Object.entries(resolved.prices)) {
    const keys = Object.keys(row);
    if (keys.length !== 1 || keys[0] !== key) return `${opt} still has prices from another country`;
  }
  for (const o of resolved.options) {
    if (!o.free && !(resolved.prices[o.key] && key in resolved.prices[o.key])) return `${o.label} has no price here`;
  }
  const was = original.regions.find((g) => g.key === key);
  if (was && was.currency !== region.currency) return "the currency changed";
  return null;
}

function countryChecks(c: LandingContent): PageCheck[] {
  return c.registration.regions.map((g): PageCheck => {
    const resolved = resolveVariant(c, { regionKey: g.key, moduleKey: null }, emptyOverrides()).registration;
    const problem = countryProblem(resolved, g.key, c.registration);
    const title = `The ${g.label} link shows only ${g.label} prices`;
    return problem === null
      ? { id: `country-${g.key}`, title, status: "pass" }
      : {
          id: `country-${g.key}`,
          title,
          status: "fail",
          detail: `The ${g.label} link would show prices or options from another country (${problem}).`,
          step: "prices",
        };
  });
}

function moduleChecks(c: LandingContent): PageCheck[] {
  const out: PageCheck[] = [];
  for (const m of c.modules ?? []) {
    if (!m.optionKey) continue;
    const r = resolveVariant(c, { regionKey: null, moduleKey: m.key }, emptyOverrides()).registration;
    const ok = r.enabled && r.options.length === 1 && r.options[0].key === m.optionKey;
    const title = `The ${m.title} link sells only ${m.title}`;
    out.push(
      ok
        ? { id: `module-${m.key}`, title, status: "pass" }
        : { id: `module-${m.key}`, title, status: "fail", detail: `The ${m.title} link would not show just that module.`, step: "buy" },
    );
  }
  return out;
}

export function runPageChecks(c: LandingContent, ctx: { hasCourse: boolean }): PageCheck[] {
  const r = c.registration;
  if (!r.enabled) return [];
  const checks: PageCheck[] = [liveGroups(r), sharedGroups(r), recordedNoGroup(r)];
  if (r.modes.includes("recorded")) checks.push(recordedPortal(c, ctx));
  checks.push(...countryChecks(c), ...moduleChecks(c));
  return checks;
}
