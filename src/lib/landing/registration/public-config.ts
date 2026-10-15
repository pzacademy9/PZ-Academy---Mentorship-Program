// What the public registration routes may show about a page's registration settings. Pure (client-safe).
import type { RegistrationConfig } from "./config";
import { isEarlyBird, type QuoteResult } from "./pricing";

/** Same shape as the stored config (the widget prices with it), plus the server's Early Bird verdict. */
export type PublicRegistration = RegistrationConfig & { earlyBirdActive: boolean };
export type QuoteFailureReason = Extract<QuoteResult, { ok: false }>["reason"];

/**
 * WhatsApp group links are returned only by the register route (after someone registers), so they
 * cannot be lifted from the page source. The ref prefix is internal.
 */
export function toPublicRegistration(config: RegistrationConfig, now: Date): PublicRegistration {
  return {
    ...config,
    options: config.options.map((o) => ({ ...o, waGroupUrl: "" })),
    refPrefix: "",
    earlyBirdActive: isEarlyBird(config, now),
  };
}

/** Every payment account any region uses, each once, in region order. */
export function regionAccountKeys(config: RegistrationConfig): string[] {
  return Array.from(new Set(config.regions.flatMap((r) => r.accountKeys)));
}

/** People-facing text (and the form field to highlight) for a selection the engine cannot price. */
export const QUOTE_ERRORS: Record<QuoteFailureReason, { message: string; field: string }> = {
  no_region: { message: "Choose the country you are registering from.", field: "regionKey" },
  mode_not_offered: { message: "That learning mode is not offered for this event.", field: "mode" },
  no_option: { message: "Choose what you want to register for.", field: "optionKeys" },
  no_price: { message: "That option is not available in your country.", field: "optionKeys" },
  mixed_free: { message: "Free and paid options cannot be combined. Choose one of them.", field: "optionKeys" },
  bad_tier: { message: "Choose individual or one of the group options.", field: "tierKey" },
  bad_group_size: { message: "The number of people does not match the group option you chose.", field: "groupSize" },
  free_group: { message: "Group registration is only available for paid options.", field: "tierKey" },
};
