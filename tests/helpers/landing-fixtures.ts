// tests/helpers/landing-fixtures.ts
import { DEFAULT_REGISTRATION, type RegistrationConfig } from "@/lib/landing/registration/config";
import type { Person, RegisterPayload } from "@/lib/landing/registration/submit-schema";
import { emptyContent, type LandingContent } from "@/lib/landing/content";

const WA = "https://chat.whatsapp.com/";
const moduleCell = { PK: { amount: 2000, earlyAmount: 1600 }, UAE: { amount: 50, earlyAmount: 40 } };

export const PPC_CONFIG: RegistrationConfig = {
  ...DEFAULT_REGISTRATION,
  enabled: true,
  modes: ["live", "recorded"],
  recordedPercentOfRegular: 85,
  regions: [
    { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 - 8:30 PM", timezoneLabel: "Pakistan Standard Time", accountKeys: ["faysal", "easypaisa"] },
    { key: "UAE", label: "United Arab Emirates", currency: "AED", classTime: "6:30 - 7:30 PM", timezoneLabel: "UAE / Gulf Time", accountKeys: ["mashreq", "paypal"] },
  ],
  defaultRegionKey: "PK",
  options: [
    { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: `${WA}IGAWff910JFIzNCw42qGle`, moduleIds: [] },
    { key: "m1", label: "Clinical Pharmacology Workshop", kind: "module", free: false, waGroupUrl: `${WA}KLF9jSiENUE64EyZoOEH1W`, moduleIds: [] },
    { key: "m2", label: "Acute & Chronic Therapeutics Workshop", kind: "module", free: false, waGroupUrl: `${WA}Lj2CBmor48lHWLXHgmSdxz`, moduleIds: [] },
    { key: "m3", label: "Critical Care & Emergency Workshop", kind: "module", free: false, waGroupUrl: `${WA}Jjpym0jOL9hFgFNLz1JEQb`, moduleIds: [] },
    { key: "m4", label: "IV Therapy & Safety Workshop", kind: "module", free: false, waGroupUrl: `${WA}GOERJJxSCjeKl5eHkevmbk`, moduleIds: [] },
  ],
  moduleMix: { enabled: true, bundleOptionKey: "full" },
  tiers: [
    { key: "g3", label: "Group of 3", minSize: 3, maxSize: 3, percentOff: 20 },
    { key: "g5", label: "Group of 5", minSize: 5, maxSize: 5, percentOff: 25 },
  ],
  prices: {
    full: {
      // Part A engine: earlyGroupTotals applies only while Early Bird is on, groupTotals only after it.
      // The Early Bird group of 5 (18,000) and the AED cells (384 / 600) are what the 20% / 25% discount computes.
      PK: { amount: 6000, earlyAmount: 4800, earlyGroupTotals: { g3: 11500 } },
      UAE: { amount: 200, earlyAmount: 160 },
    },
    m1: moduleCell,
    m2: moduleCell,
    m3: moduleCell,
    m4: moduleCell,
  },
  earlyBirdEndsAt: "2026-10-15T19:00:00Z",
  capacity: 0,
  whatsappVerifyNumber: "923700199429",
  successTitle: "Registration Submitted!",
  eventLabel: "PPC Batch 3",
  refPrefix: "PPC",
  professions: ["Doctor", "Pharmacist", "Nurse", "Allied Health Professional", "Student", "Other"],
  discoveryOptions: ["Friends", "WhatsApp", "Facebook", "Instagram", "Google", "YouTube", "Email", "Wall Poster"],
  pixelId: "",
};

export const W20_CONFIG: RegistrationConfig = {
  ...DEFAULT_REGISTRATION,
  enabled: true,
  modes: ["live"],
  recordedPercentOfRegular: 100,
  regions: [
    { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 PM", timezoneLabel: "Pakistan Standard Time", accountKeys: ["paypal", "easypaisa", "faysal"] },
  ],
  defaultRegionKey: "PK",
  options: [
    { key: "free", label: "Free Access", kind: "bundle", free: true, waGroupUrl: `${WA}HKo9nNrUCsB84AXPD3QPmH`, moduleIds: [] },
    { key: "pro", label: "Pro Access", kind: "bundle", free: false, waGroupUrl: `${WA}Bf6XZabVsORFh237IRN7Az`, moduleIds: [] },
  ],
  moduleMix: { enabled: false, bundleOptionKey: "" },
  tiers: [{ key: "group", label: "Group (3+)", minSize: 3, maxSize: 50, percentOff: 20 }],
  prices: { free: { PK: { amount: 0 } }, pro: { PK: { amount: 399 } } },
  earlyBirdEndsAt: "",
  capacity: 0,
  whatsappVerifyNumber: "923155614490",
  successTitle: "You're Registered!",
  eventLabel: "Webinar 20",
  refPrefix: "DPT",
  professions: [],
  discoveryOptions: [],
  pixelId: "",
};

/** 13 Oct 2026 10:00 UTC: before the PPC Early Bird cutoff (15 Oct 19:00 UTC). */
export const PRE_EB = new Date("2026-10-13T10:00:00Z");

export function contentWith(config: RegistrationConfig): LandingContent {
  return { ...emptyContent("course"), registration: config };
}

export function groupMembers(n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Member ${i + 1}`,
    email: `Member${i + 1}@Example.com`,
    whatsapp: `+92300000000${i + 1}`,
    profession: "Pharmacist",
  }));
}

export function ppcPayload(over: Partial<RegisterPayload> = {}): RegisterPayload {
  return {
    regionKey: "PK",
    mode: "live",
    optionKeys: ["full"],
    tierKey: "individual",
    groupSize: 1,
    lead: {
      name: "Ayesha Khan", email: "Ayesha@Example.com", whatsapp: "+923001234567", profession: "Pharmacist",
      city: "Lahore", discovery: "WhatsApp", consent: true,
    },
    members: [],
    paymentMethod: "faysal",
    promoCode: "",
    honeypot: "",
    attribution: { refCode: "", utm: {}, fbp: "", fbc: "", eventId: "evt-0001", sessionId: "sess-0001-abcd" },
    testMode: false,
    ...over,
  };
}
