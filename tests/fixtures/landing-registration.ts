// Registration configs built from the real legacy pages (PPC-B3-Landing.html, MDC-B3-Landing.html,
// Webinar20 Landing.html). Not a test file: imported by the registration tests.
import { DEFAULT_REGISTRATION, type PriceCell, type RegistrationConfig } from "@/lib/landing/registration/config";

export const WA = {
  full: "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle",
  m1: "https://chat.whatsapp.com/KLF9jSiENUE64EyZoOEH1W",
  m2: "https://chat.whatsapp.com/Lj2CBmor48lHWLXHgmSdxz",
  m3: "https://chat.whatsapp.com/Jjpym0jOL9hFgFNLz1JEQb",
  m4: "https://chat.whatsapp.com/GOERJJxSCjeKl5eHkevmbk",
  mdc: "https://chat.whatsapp.com/JcC6Hmmek4W42vUur36K4w",
  w20Pro: "https://chat.whatsapp.com/Bf6XZabVsORFh237IRN7Az",
  w20Free: "https://chat.whatsapp.com/HKo9nNrUCsB84AXPD3QPmH",
};

// Legacy PPC cutoff was new Date('2026-10-16T00:00:00') in the visitor's timezone; for Pakistan that is 19:00Z on the 15th.
export const PPC_EB_ENDS = "2026-10-15T19:00:00Z";
export const DURING_PPC_EB = new Date("2026-10-13T12:00:00Z");
export const AFTER_PPC_EB = new Date("2026-10-20T12:00:00Z");
export const DURING_MDC_EB = new Date("2026-08-20T12:00:00Z");
export const AFTER_MDC_EB = new Date("2026-10-13T12:00:00Z");

const base = (): RegistrationConfig => structuredClone(DEFAULT_REGISTRATION);

export function ppcConfig(): RegistrationConfig {
  const moduleCells = (): Record<string, PriceCell> => ({
    PK: { amount: 2000, earlyAmount: 1600 },
    INTL: { amount: 20, earlyAmount: 16, earlyGroupTotals: { group3: 38 } },
  });
  return {
    ...base(),
    enabled: true,
    modes: ["live", "recorded"],
    recordedPercentOfRegular: 85,
    regions: [
      { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 – 8:30 PM", timezoneLabel: "Pakistan Standard Time", accountKeys: ["faysal", "easypaisa"] },
      { key: "INTL", label: "International", currency: "USD", classTime: "7:30 PM PKT", timezoneLabel: "Your Local Time", accountKeys: ["paypal"] },
    ],
    defaultRegionKey: "PK",
    options: [
      { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: WA.full },
      { key: "m1", label: "M1 Clinical Pharmacology", kind: "module", free: false, waGroupUrl: WA.m1 },
      { key: "m2", label: "M2 Acute & Chronic Therapeutics", kind: "module", free: false, waGroupUrl: WA.m2 },
      { key: "m3", label: "M3 Critical Care & Emergency", kind: "module", free: false, waGroupUrl: WA.m3 },
      { key: "m4", label: "M4 IV Therapy & Safety", kind: "module", free: false, waGroupUrl: WA.m4 },
    ],
    moduleMix: { enabled: true, bundleOptionKey: "full" },
    tiers: [
      { key: "group3", label: "Group of 3", minSize: 3, maxSize: 3, percentOff: 20 },
      { key: "group5", label: "Group of 5", minSize: 5, maxSize: 5, percentOff: 25 },
    ],
    prices: {
      full: {
        PK: { amount: 6000, earlyAmount: 4800, earlyGroupTotals: { group3: 11500 } },
        INTL: { amount: 55, earlyAmount: 44, groupTotals: { group3: 131, group5: 204 }, earlyGroupTotals: { group5: 164 } },
      },
      m1: moduleCells(),
      m2: moduleCells(),
      m3: moduleCells(),
      m4: moduleCells(),
    },
    earlyBirdEndsAt: PPC_EB_ENDS,
    capacity: 0,
    whatsappVerifyNumber: "923700199429",
    successTitle: "Registration Submitted!",
    eventLabel: "PPC Batch 3",
    refPrefix: "PPC",
    professions: ["Doctor", "Pharmacist", "Nurse", "Allied Health Professional", "Student", "Other"],
    discoveryOptions: ["Friends", "WhatsApp", "Facebook", "Instagram", "Google", "YouTube", "Email", "Wall Poster"],
    pixelId: "",
  };
}

export function mdcConfig(): RegistrationConfig {
  return {
    ...base(),
    enabled: true,
    modes: ["live", "recorded"],
    recordedPercentOfRegular: 85,
    regions: [
      { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 PM", timezoneLabel: "PKT", accountKeys: ["easypaisa", "faysal"] },
      { key: "INTL", label: "International", currency: "USD", classTime: "7:30 PM PKT", timezoneLabel: "Your Local Time", accountKeys: ["paypal"] },
    ],
    defaultRegionKey: "PK",
    options: [{ key: "workshop", label: "Mastering Dose Calculation Workshop", kind: "bundle", free: false, waGroupUrl: WA.mdc }],
    moduleMix: { enabled: false, bundleOptionKey: "" },
    tiers: [{ key: "group", label: "Group (3+)", minSize: 3, maxSize: 50, percentOff: 20 }],
    prices: { workshop: { PK: { amount: 3500, earlyAmount: 2700 }, INTL: { amount: 27, earlyAmount: 22 } } },
    earlyBirdEndsAt: "2026-08-29T18:59:59Z",
    capacity: 100,
    whatsappVerifyNumber: "923700199429",
    successTitle: "Registration Submitted!",
    eventLabel: "MDC Workshop",
    refPrefix: "MDC",
    professions: ["PharmD Student", "Fresh Graduate", "Hospital Pharmacist", "Clinical Pharmacist", "Pharmacy Technician", "Nurse", "Medical Student", "Junior Doctor", "Allied Health Professional", "Other"],
    discoveryOptions: ["WhatsApp", "Instagram", "Facebook", "LinkedIn", "Friend / Colleague", "Email", "Search Engine (Google etc.)", "Other"],
    pixelId: "",
  };
}

export function w20Config(): RegistrationConfig {
  return {
    ...base(),
    enabled: true,
    modes: ["live"],
    recordedPercentOfRegular: 100,
    regions: [
      { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 PM", timezoneLabel: "PKT", accountKeys: ["paypal", "easypaisa", "faysal"] },
      { key: "PH", label: "Philippines", currency: "PHP", classTime: "10:30 PM", timezoneLabel: "Philippine Time", accountKeys: ["paypal", "pnb_ph"] },
    ],
    defaultRegionKey: "PK",
    options: [
      { key: "free", label: "Free Access", kind: "bundle", free: true, waGroupUrl: WA.w20Free },
      { key: "pro", label: "Pro Access", kind: "bundle", free: false, waGroupUrl: WA.w20Pro },
    ],
    moduleMix: { enabled: false, bundleOptionKey: "" },
    tiers: [{ key: "group", label: "Group (3+)", minSize: 3, maxSize: 50, percentOff: 20 }],
    // Free has no Philippines cell: the Philippines page was Pro only.
    prices: { free: { PK: { amount: 0 } }, pro: { PK: { amount: 399 }, PH: { amount: 150 } } },
    earlyBirdEndsAt: "",
    capacity: 0,
    whatsappVerifyNumber: "923155614490",
    successTitle: "You're Registered!",
    eventLabel: "Webinar 20: Diabetes Pharmacotherapy",
    refPrefix: "DPT",
    professions: [],
    discoveryOptions: ["Instagram", "Facebook", "WhatsApp", "LinkedIn", "PZ Academy Email", "Past PZ Academy Webinar", "Friend / Colleague", "Google / Search", "Other"],
    pixelId: "",
  };
}
