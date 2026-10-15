// src/lib/landing/registration/labels.ts
import type { Mode, RegistrationConfig } from "./config";

/**
 * Human label written to the Sheet ("Registration Option"), the emails and the WhatsApp
 * verify message, e.g. "Live - Full Course - Group of 3". Plain hyphens on purpose: the
 * label is pasted into WhatsApp and Sheets, where long dashes render inconsistently.
 */
export function registrationOptionLabel(
  config: RegistrationConfig,
  sel: { mode: Mode; optionKeys: string[]; tierKey: string; groupSize: number },
): string {
  const options = sel.optionKeys.map((k) => config.options.find((o) => o.key === k)?.label ?? k).join(", ");
  let tierText = "Individual";
  if (sel.tierKey !== "individual") {
    const tier = config.tiers.find((t) => t.key === sel.tierKey);
    const label = tier?.label ?? sel.tierKey;
    tierText = tier && tier.minSize !== tier.maxSize ? `${label}, ${sel.groupSize} people` : label;
  }
  const parts = config.modes.length > 1 ? [sel.mode === "recorded" ? "Recorded" : "Live", options, tierText] : [options, tierText];
  return parts.join(" - ");
}

/** The prefilled WhatsApp message from the legacy PPC/MDC success screen. "" when not applicable. */
export function buildVerifyMessage(
  config: RegistrationConfig,
  d: { name: string; email: string; refId: string; optionLabel: string; isFree: boolean },
): string {
  if (d.isFree || !config.whatsappVerifyNumber) return "";
  return (
    `Hi PZ Academy! I just registered for ${config.eventLabel} and submitted my payment voucher.\n\n` +
    `Name: ${d.name}\nEmail: ${d.email}\nRef: ${d.refId}\nRegistration: ${d.optionLabel}\n\n` +
    "Please verify my payment. Thank you!"
  );
}

export function whatsappVerifyUrl(number: string, message: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message).replace(/'/g, "%27")}`;
}
