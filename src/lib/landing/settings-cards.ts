// src/lib/landing/settings-cards.ts
// Pure status of the five Page settings cards ("Ready" or "Needs attention").
import type { LandingContent } from "./content";
import { runPageChecks } from "./page-check";
import { isHttpsUrl } from "./simple-text";

export type CardStatus = "ready" | "attention";
export type SettingsCardId = "who" | "button" | "after" | "links" | "dates";

const LINK_CHECKS = ["live-groups", "recorded-no-group", "recorded-portal", "shared-groups"];

export function settingsCardStatus(c: LandingContent, ctx: { hasCourse: boolean }): Record<SettingsCardId, CardStatus> {
  const r = c.registration;
  const who: CardStatus = r.enabled && r.modes.length === 0 ? "attention" : "ready";
  const buttonOk = c.settings.registerLabel.trim() !== "" && (r.enabled || isHttpsUrl(c.settings.registerUrl));
  const links: CardStatus = runPageChecks(c, ctx).some((k) => LINK_CHECKS.includes(k.id) && k.status !== "pass") ? "attention" : "ready";
  return { who, button: buttonOk ? "ready" : "attention", after: "ready", links, dates: "ready" };
}

export const readyCount = (s: Record<SettingsCardId, CardStatus>): number =>
  Object.values(s).filter((v) => v === "ready").length;
