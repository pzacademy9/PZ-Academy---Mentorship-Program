// src/lib/landing/registration/wa-groups.ts
// Which WhatsApp group buttons a registration gets (success screen and emails).
import { WA_GROUP_URL_RE, type Mode, type OptionView, type RegistrationView } from "./config";
import { resolveOptionKeys } from "./pricing";

export interface WaGroupButton { label: string; url: string }

export function isValidWaGroupUrl(url: string): boolean {
  return WA_GROUP_URL_RE.test(url.trim());
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
