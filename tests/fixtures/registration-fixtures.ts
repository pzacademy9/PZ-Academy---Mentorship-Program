import type { RegistrationConfig } from "@/lib/landing/registration/config";
import type { PaymentAccount } from "@/lib/data/landing-payment-accounts";

export const ACCOUNTS: PaymentAccount[] = [
  { key: "faysal", label: "Faysal Bank", kind: "bank", rows: [{ label: "Account No.", value: "3573499000006913" }, { label: "Account Title", value: "PHARMACOZYME (PVT) LTD" }], displayText: "Bank Transfer · Recommended" },
  { key: "easypaisa", label: "EasyPaisa", kind: "wallet", rows: [{ label: "Mobile No.", value: "03401940624" }, { label: "Account Title", value: "Aftab Alam" }], displayText: "Mobile Wallet" },
  { key: "mashreq", label: "Mashreq Bank", kind: "bank", rows: [{ label: "IBAN", value: "AE800330000019101064212" }, { label: "Account Holder", value: "Asma Kanwal Ghulam Hussain" }], displayText: "Bank Transfer · AED" },
  { key: "paypal", label: "PayPal", kind: "paypal", rows: [{ label: "PayPal Link", value: "paypal.me/PharmacozymeOfficial" }, { label: "Email", value: "payments@example.com" }], displayText: "International · Friends & Family" },
];

const PROFESSIONS = ["Doctor", "Pharmacist", "Nurse", "Allied Health Professional", "Student", "Other"];

/** PPC Batch 3 numbers (facts-pages.md), trimmed to two modules and four countries. */
export const ppcConfig: RegistrationConfig = {
  enabled: true,
  modes: ["live", "recorded"],
  recordedPercentOfRegular: 85,
  regions: [
    { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 – 8:30 PM", timezoneLabel: "Pakistan Standard Time", accountKeys: ["faysal", "easypaisa"] },
    { key: "UAE", label: "United Arab Emirates", currency: "AED", classTime: "6:30 – 7:30 PM", timezoneLabel: "UAE / Gulf Time", accountKeys: ["mashreq", "paypal"] },
    { key: "KSA", label: "Saudi Arabia", currency: "SAR", classTime: "5:30 – 6:30 PM", timezoneLabel: "Saudi Arabia Time", accountKeys: ["paypal"] },
    { key: "INTL", label: "International", currency: "USD", classTime: "7:30 PM PKT", timezoneLabel: "Your Local Time", accountKeys: ["paypal"] },
  ],
  defaultRegionKey: "PK",
  options: [
    { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle", moduleIds: [] },
    { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: "https://chat.whatsapp.com/KLF9jSiENUE64EyZoOEH1W", moduleIds: [] },
    { key: "m2", label: "Module 2", kind: "module", free: false, waGroupUrl: "https://chat.whatsapp.com/Lj2CBmor48lHWLXHgmSdxz", moduleIds: [] },
  ],
  moduleMix: { enabled: true, bundleOptionKey: "full" },
  tiers: [
    { key: "group3", label: "Group of 3", minSize: 3, maxSize: 3, percentOff: 20 },
    { key: "group5", label: "Group of 5", minSize: 5, maxSize: 5, percentOff: 25 },
  ],
  prices: {
    full: { PK: { amount: 6000, earlyAmount: 4800 }, UAE: { amount: 200, earlyAmount: 160 }, KSA: { amount: 200, earlyAmount: 160 }, INTL: { amount: 55, earlyAmount: 44 } },
    m1: { PK: { amount: 2000, earlyAmount: 1600 }, UAE: { amount: 50, earlyAmount: 40 }, KSA: { amount: 50, earlyAmount: 40 }, INTL: { amount: 20, earlyAmount: 16 } },
    m2: { PK: { amount: 2000, earlyAmount: 1600 }, UAE: { amount: 50, earlyAmount: 40 }, KSA: { amount: 50, earlyAmount: 40 }, INTL: { amount: 20, earlyAmount: 16 } },
  },
  earlyBirdEndsAt: "2026-10-15T19:00:00Z",
  capacity: 0,
  whatsappVerifyNumber: "923700199429",
  successTitle: "Registration Submitted!",
  eventLabel: "PPC Batch 3",
  refPrefix: "PPC",
  professions: PROFESSIONS,
  discoveryOptions: ["Friends", "WhatsApp", "Facebook", "Instagram", "Google", "YouTube", "Email", "Wall Poster"],
  pixelId: "",
};

/** Webinar 20: Free vs Pro, Pakistan only, groups of 3 or more get 20% off Pro, no Early Bird. */
export const webinarConfig: RegistrationConfig = {
  enabled: true,
  modes: ["live"],
  recordedPercentOfRegular: 100,
  regions: [{ key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 PM", timezoneLabel: "Pakistan Standard Time", accountKeys: ["paypal", "easypaisa", "faysal"] }],
  defaultRegionKey: "PK",
  options: [
    { key: "free", label: "Free Access", kind: "bundle", free: true, waGroupUrl: "https://chat.whatsapp.com/HKo9nNrUCsB84AXPD3QPmH", moduleIds: [] },
    { key: "pro", label: "Pro Access", kind: "bundle", free: false, waGroupUrl: "https://chat.whatsapp.com/Bf6XZabVsORFh237IRN7Az", moduleIds: [] },
  ],
  moduleMix: { enabled: false, bundleOptionKey: "" },
  tiers: [{ key: "group3plus", label: "Group (3 or more)", minSize: 3, maxSize: 50, percentOff: 20 }],
  prices: { free: { PK: { amount: 0 } }, pro: { PK: { amount: 399 } } },
  earlyBirdEndsAt: "",
  capacity: 0,
  whatsappVerifyNumber: "923155614490",
  successTitle: "You're Registered!",
  eventLabel: "Webinar 20",
  refPrefix: "DPT",
  professions: PROFESSIONS,
  discoveryOptions: ["Instagram", "Facebook", "WhatsApp", "Friend / Colleague", "Other"],
  pixelId: "",
};

/** The shape GET /api/landing/[slug]/config returns, built from a config. */
export function publicConfig(config: RegistrationConfig, over: { country?: string | null; earlyBirdActive?: boolean; status?: "published" | "closed" } = {}) {
  return {
    pageId: "page-1",
    status: over.status ?? ("published" as const),
    registration: { ...config, earlyBirdActive: over.earlyBirdActive ?? config.earlyBirdEndsAt !== "" },
    accounts: ACCOUNTS,
    country: over.country === undefined ? "PK" : over.country,
  };
}
