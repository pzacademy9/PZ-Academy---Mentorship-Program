// src/lib/landing/registration/wa-groups.ts
// Which WhatsApp group buttons a registration gets (success screen and emails).
import { WA_GROUP_URL_RE, type Mode, type OptionView, type RegistrationView } from "./config";
import { resolveOptionKeys } from "./pricing";
import type { ChangeableStatus } from "./status-rules";

export interface WaGroupButton { label: string; url: string }

export function isValidWaGroupUrl(url: string): boolean {
  return WA_GROUP_URL_RE.test(url.trim());
}

export const PAID_NO_GROUP_WARNING =
  "Marked Paid and the email is queued, but this batch has no WhatsApp group link, so the email will have no group button.";

/** Warning for the admin when Paid goes out to a live student whose batch has no group link. Recorded students never get one. */
export function paidGroupWarning(args: { to: ChangeableStatus; mode: "live" | "recorded"; groups: WaGroupButton[] }): string | null {
  return args.to === "paid" && args.mode === "live" && args.groups.length === 0 ? PAID_NO_GROUP_WARNING : null;
}

export function selectWaGroups(config: RegistrationView, optionKeys: string[], mode: Mode): WaGroupButton[] {
  if (mode === "recorded") return [];
  const keys = resolveOptionKeys(config, optionKeys);
  const chosen = keys
    .map((k) => config.options.find((o) => o.key === k))
    .filter((o): o is OptionView => o !== undefined);
  const bundles = chosen.filter((o) => o.kind === "bundle");
  const shown = bundles.length > 0 ? bundles : chosen;
  return shown
    .filter((o) => isValidWaGroupUrl(o.waGroupUrl))
    .map((o) => ({ label: o.label, url: o.waGroupUrl.trim() }));
}
