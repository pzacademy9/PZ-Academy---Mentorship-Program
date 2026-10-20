// src/lib/landing/registration/types.ts
// Zod-free types and constants shared by the pricing maths and the public cards.
// Keep this file free of imports: the public page bundle imports it, and it must not pull in zod.

export type Mode = "live" | "recorded";
export interface RegionDef { key: string; label: string; currency: string; classTime: string; timezoneLabel: string; accountKeys: string[] }
// key: short upper-case code such as "PK" | "UAE" | "KSA" | "PH" | "IN" | "INTL"; currency ISO code such as "PKR"
export interface OptionDef { key: string; label: string; kind: "bundle" | "module"; free: boolean; waGroupUrl: string; moduleIds: string[] }
// moduleIds: course module ids this option grants ([] = whole course or none). waGroupUrl: "" or https://chat.whatsapp.com/<code>. An option is offered in a region only when prices[option][region] exists.
/** An option as the browser sees it: the public routes never send which course modules it unlocks. */
export type OptionView = Omit<OptionDef, "moduleIds">;
export interface TierDef { key: string; label: string; minSize: number; maxSize: number; percentOff: number }
// "individual" is implicit (size 1, 0%) and is NOT listed in tiers. Fixed-size tier: minSize === maxSize.
export interface PriceCell {
  amount: number;                              // regular per-person price in the region currency
  earlyAmount?: number;                        // per-person Early Bird price
  groupTotals?: Record<string, number>;        // explicit TOTAL per fixed-size tier, used when Early Bird is NOT applied
  earlyGroupTotals?: Record<string, number>;   // explicit TOTAL per fixed-size tier, used when Early Bird IS applied
}
export interface RegistrationConfig {
  enabled: boolean;
  modes: Mode[];
  recordedPercentOfRegular: number;    // recorded price = round(regular * pct / 100), ignores Early Bird
  regions: RegionDef[];
  defaultRegionKey: string;
  options: OptionDef[];
  moduleMix: { enabled: boolean; bundleOptionKey: string };
  tiers: TierDef[];
  prices: Record<string, Record<string, PriceCell>>;   // prices[optionKey][regionKey]
  earlyBirdEndsAt: string;             // ISO-8601 WITH offset; "" = no Early Bird
  capacity: number;                    // 0 = unlimited; counts people, excludes test rows
  whatsappVerifyNumber: string;        // digits only, e.g. "923700199429"
  successTitle: string;
  eventLabel: string;                  // used in the WhatsApp verify message and the Sheet
  refPrefix: string;                   // "PPC" -> PZA-PPC-001
  professions: string[];               // [] = free-text profession field
  discoveryOptions: string[];
  pixelId: string;                     // "" = global default (NEXT_PUBLIC_META_PIXEL_ID)
}

export const INDIVIDUAL = "individual";
export const MAX_GROUP_SIZE = 50;

/** The registration settings as the browser sees them (RegistrationConfig minus each option's module links). The stored config fits it. */
export type RegistrationView = Omit<RegistrationConfig, "options"> & { options: OptionView[] };
