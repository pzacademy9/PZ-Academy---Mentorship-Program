// src/lib/landing/registration/config.ts
// Registration settings, stored in page content as content.registration.
// Pure module (no server-only imports): used by the editor, the public widget and the API.
import { z } from "zod";
import { isSafeUrl } from "../simple-text";

export type Mode = "live" | "recorded";
export const MODES = ["live", "recorded"] as const;
export type RegistrationStatus = "pending" | "paid" | "underpaid" | "reserved" | "free";

export interface RegionDef { key: string; label: string; currency: string; classTime: string; timezoneLabel: string; accountKeys: string[] }
// key: short upper-case code such as "PK" | "UAE" | "KSA" | "PH" | "IN" | "INTL"; currency ISO code such as "PKR"
export interface OptionDef { key: string; label: string; kind: "bundle" | "module"; free: boolean; waGroupUrl: string }
// waGroupUrl: "" or https://chat.whatsapp.com/<code>. An option is offered in a region only when prices[option][region] exists.
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
export const WA_GROUP_URL_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;
export const REGION_KEY_RE = /^[A-Z]{2,6}$/;
export const ITEM_KEY_RE = /^[a-z0-9_]{1,32}$/;
export const ACCOUNT_KEY_RE = /^[a-z0-9_]{2,40}$/;
export const CURRENCY_RE = /^[A-Z]{3}$/;
export const REF_PREFIX_RE = /^[A-Z0-9]{2,6}$/;
const PIXEL_RE = /^\d{0,20}$/;
const MAX_MONEY = 10_000_000;

export const DEFAULT_REGISTRATION: RegistrationConfig = {
  enabled: false,
  modes: ["live"],
  recordedPercentOfRegular: 100,
  regions: [],
  defaultRegionKey: "",
  options: [],
  moduleMix: { enabled: false, bundleOptionKey: "" },
  tiers: [],
  prices: {},
  earlyBirdEndsAt: "",
  capacity: 0,
  whatsappVerifyNumber: "",
  successTitle: "Registration received!",
  eventLabel: "",
  refPrefix: "",
  professions: [],
  discoveryOptions: [],
  pixelId: "",
};

// ------------------------------------------------------------ schema (structural only)

const money = z.number().min(0).max(MAX_MONEY);
const amountMap = z.record(z.string().max(32), money);
const text = (max: number) => z.string().max(max);

export const registrationConfigSchema: z.ZodType<RegistrationConfig> = z.object({
  enabled: z.boolean(),
  modes: z.array(z.enum(MODES)).max(2),
  recordedPercentOfRegular: z.number().int().min(1).max(100),
  regions: z.array(z.object({
    key: text(6),
    label: text(80),
    currency: text(3),
    classTime: text(80),
    timezoneLabel: text(80),
    accountKeys: z.array(text(40)).max(8),
  })).max(12),
  defaultRegionKey: text(6),
  options: z.array(z.object({
    key: text(32),
    label: text(120),
    kind: z.enum(["bundle", "module"]),
    free: z.boolean(),
    waGroupUrl: text(200).refine((v) => v === "" || isSafeUrl(v), "Enter a full link starting with https://"),
  })).max(12),
  moduleMix: z.object({ enabled: z.boolean(), bundleOptionKey: text(32) }),
  tiers: z.array(z.object({
    key: text(32),
    label: text(80),
    minSize: z.number().int().min(1).max(MAX_GROUP_SIZE),
    maxSize: z.number().int().min(1).max(MAX_GROUP_SIZE),
    percentOff: z.number().min(0).max(90),
  })).max(6),
  prices: z.record(text(32), z.record(text(6), z.object({
    amount: money,
    earlyAmount: money.optional(),
    groupTotals: amountMap.optional(),
    earlyGroupTotals: amountMap.optional(),
  }))),
  earlyBirdEndsAt: text(40),
  capacity: z.number().int().min(0).max(100_000),
  whatsappVerifyNumber: text(20),
  successTitle: text(80),
  eventLabel: text(80),
  refPrefix: text(6),
  professions: z.array(text(80)).max(30),
  discoveryOptions: z.array(text(80)).max(30),
  pixelId: z.string().regex(PIXEL_RE, "The Pixel ID is digits only."),
});

// ------------------------------------------------------------ tolerant loader

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const okKey = (k: string, max: number) => k.length >= 1 && k.length <= max && !BAD_KEYS.has(k);
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);
const isMoney = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const int = (v: unknown, min: number, max: number, fallback: number) => Math.round(num(v, min, max, fallback));
const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, maxItems).map((x) => x.slice(0, maxLen)) : [];
function list<T>(v: unknown, max: number, f: (x: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord).map(f).filter((x): x is T => x !== null).slice(0, max);
}

function amountRecord(v: unknown): Record<string, number> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v)) if (okKey(k, 32) && isMoney(x)) out[k] = Math.min(x, MAX_MONEY);
  return Object.keys(out).length > 0 ? out : undefined;
}

function priceCell(v: unknown): PriceCell | null {
  if (!isRecord(v) || !isMoney(v.amount)) return null;
  const cell: PriceCell = { amount: Math.min(v.amount, MAX_MONEY) };
  if (isMoney(v.earlyAmount)) cell.earlyAmount = Math.min(v.earlyAmount, MAX_MONEY);
  const g = amountRecord(v.groupTotals);
  if (g) cell.groupTotals = g;
  const eg = amountRecord(v.earlyGroupTotals);
  if (eg) cell.earlyGroupTotals = eg;
  return cell;
}

/** Tolerant loader for anything read from the database or a snapshot. Never throws; always fresh objects. */
export function normalizeRegistration(raw: unknown): RegistrationConfig {
  const r = isRecord(raw) ? raw : {};
  const prices: Record<string, Record<string, PriceCell>> = {};
  if (isRecord(r.prices)) {
    for (const [optionKey, byRegion] of Object.entries(r.prices)) {
      if (!okKey(optionKey, 32) || !isRecord(byRegion)) continue;
      const row: Record<string, PriceCell> = {};
      for (const [regionKey, c] of Object.entries(byRegion)) {
        if (!okKey(regionKey, 6)) continue;
        const cell = priceCell(c);
        if (cell) row[regionKey] = cell;
      }
      if (Object.keys(row).length > 0) prices[optionKey] = row;
    }
  }
  const mm = isRecord(r.moduleMix) ? r.moduleMix : {};
  const rawModes = r.modes;
  return {
    enabled: r.enabled === true,
    modes: Array.isArray(rawModes) ? MODES.filter((m) => rawModes.includes(m)) : [...DEFAULT_REGISTRATION.modes],
    recordedPercentOfRegular: int(r.recordedPercentOfRegular, 1, 100, 100),
    regions: list(r.regions, 12, (x) => (typeof x.key === "string"
      ? {
          key: str(x.key, 6), label: str(x.label, 80), currency: str(x.currency, 3),
          classTime: str(x.classTime, 80), timezoneLabel: str(x.timezoneLabel, 80), accountKeys: strList(x.accountKeys, 8, 40),
        }
      : null)),
    defaultRegionKey: str(r.defaultRegionKey, 6),
    options: list(r.options, 12, (x) => (typeof x.key === "string"
      ? {
          key: str(x.key, 32),
          label: str(x.label, 120),
          kind: x.kind === "module" ? ("module" as const) : ("bundle" as const),
          free: x.free === true,
          waGroupUrl: typeof x.waGroupUrl === "string" && (x.waGroupUrl === "" || isSafeUrl(x.waGroupUrl)) ? x.waGroupUrl.slice(0, 200) : "",
        }
      : null)),
    moduleMix: { enabled: mm.enabled === true, bundleOptionKey: str(mm.bundleOptionKey, 32) },
    tiers: list(r.tiers, 6, (x) => (typeof x.key === "string"
      ? {
          key: str(x.key, 32), label: str(x.label, 80),
          minSize: int(x.minSize, 1, MAX_GROUP_SIZE, 2), maxSize: int(x.maxSize, 1, MAX_GROUP_SIZE, 2),
          percentOff: num(x.percentOff, 0, 90, 0),
        }
      : null)),
    prices,
    earlyBirdEndsAt: str(r.earlyBirdEndsAt, 40),
    capacity: int(r.capacity, 0, 100_000, 0),
    whatsappVerifyNumber: str(r.whatsappVerifyNumber, 20),
    successTitle: str(r.successTitle, 80, DEFAULT_REGISTRATION.successTitle),
    eventLabel: str(r.eventLabel, 80),
    refPrefix: str(r.refPrefix, 6),
    professions: strList(r.professions, 30, 80),
    discoveryOptions: strList(r.discoveryOptions, 30, 80),
    pixelId: typeof r.pixelId === "string" && PIXEL_RE.test(r.pixelId) ? r.pixelId : "",
  };
}

// ------------------------------------------------------------ readiness (plain words)

/** ISO-8601 with an explicit Z or +hh:mm offset, so every visitor sees the same cutoff instant. */
export function isValidInstant(v: string): boolean {
  const s = v.trim();
  return /(Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
}

function duplicates(keys: string[]): string[] {
  return Array.from(new Set(keys.filter((k, i) => keys.indexOf(k) !== i)));
}

export function registrationProblems(r: RegistrationConfig): { message: string }[] {
  const out: { message: string }[] = [];
  const add = (message: string) => out.push({ message });
  const name = (label: string, key: string) => (label.trim() === "" ? key : label);

  if (r.modes.length === 0) add("Choose Live, Recorded or both (Registration setup).");
  if (r.regions.length === 0) add("Add at least one country people can register from (Registration setup).");
  if (r.options.length === 0) add('Add at least one thing people can buy, for example "Full Course" (Registration setup).');

  for (const k of duplicates(r.regions.map((x) => x.key))) add(`Two countries use the same code "${k}". Give each country its own code.`);
  for (const g of r.regions) {
    if (!REGION_KEY_RE.test(g.key)) add(`The country code "${g.key}" must be 2 to 6 capital letters, for example PK.`);
    if (g.label.trim() === "") add(`Give the country "${g.key}" a name.`);
    if (!CURRENCY_RE.test(g.currency)) add(`Set the currency for ${name(g.label, g.key)} as a 3-letter code, for example PKR.`);
  }
  if (r.regions.length > 0 && !r.regions.some((g) => g.key === r.defaultRegionKey)) {
    add("Choose which country is selected first (Registration setup).");
  }

  for (const k of duplicates(r.options.map((o) => o.key))) add(`Two options use the same code "${k}". Give each option its own code.`);
  for (const o of r.options) {
    if (!ITEM_KEY_RE.test(o.key)) add(`The option code "${o.key}" must use small letters, digits or _ only.`);
    if (o.label.trim() === "") add(`Give the option "${o.key}" a name.`);
    if (o.waGroupUrl.trim() !== "" && !WA_GROUP_URL_RE.test(o.waGroupUrl.trim())) {
      add(`The WhatsApp group link for "${name(o.label, o.key)}" must look like https://chat.whatsapp.com/...`);
    }
  }

  for (const k of duplicates(r.tiers.map((t) => t.key))) add(`Two group discounts use the same code "${k}".`);
  for (const t of r.tiers) {
    if (!ITEM_KEY_RE.test(t.key) || t.key === INDIVIDUAL) add(`"${name(t.label, t.key)}" needs a different code (small letters, digits or _, not "individual").`);
    if (t.minSize < 2) add(`"${name(t.label, t.key)}" must be for at least 2 people.`);
    if (t.maxSize < t.minSize) add(`"${name(t.label, t.key)}": the largest group size cannot be smaller than the smallest.`);
  }

  if (r.moduleMix.enabled && !r.options.some((o) => o.key === r.moduleMix.bundleOptionKey && o.kind === "bundle")) {
    add("Choose which bundle replaces every module when someone picks them all (Registration setup).");
  }

  for (const o of r.options) {
    const row = r.prices[o.key] ?? {};
    if (o.free) {
      if (!r.regions.some((g) => row[g.key] !== undefined)) {
        add(`"${name(o.label, o.key)}" is free but not offered in any country. Tick at least one country for it.`);
      }
      continue;
    }
    for (const g of r.regions) {
      const cell = row[g.key];
      if (!cell) add(`Add the price of "${name(o.label, o.key)}" for ${name(g.label, g.key)}.`);
      else if (cell.earlyAmount !== undefined && cell.earlyAmount > cell.amount) {
        add(`The Early Bird price of "${name(o.label, o.key)}" for ${name(g.label, g.key)} is higher than the regular price.`);
      }
    }
  }

  const allFree = r.options.length > 0 && r.options.every((o) => o.free);
  if (!allFree) {
    for (const g of r.regions) {
      if (g.accountKeys.length === 0) add(`Choose at least one payment account for ${name(g.label, g.key)}.`);
      for (const k of g.accountKeys) if (!ACCOUNT_KEY_RE.test(k)) add(`The payment account "${k}" for ${name(g.label, g.key)} is not a known account code.`);
    }
  }

  if (r.earlyBirdEndsAt.trim() !== "" && !isValidInstant(r.earlyBirdEndsAt)) {
    add("The Early Bird end date is not a valid date and time.");
  }
  if (!REF_PREFIX_RE.test(r.refPrefix)) {
    add("Set a short code for reference numbers: 2 to 6 capital letters or digits, for example PPC (Registration setup).");
  }
  if (r.eventLabel.trim() === "") {
    add('Give the registration a short name for messages and the Sheet, for example "PPC Batch 3" (Registration setup).');
  }
  if (!allFree || r.whatsappVerifyNumber !== "") {
    if (!/^\d{8,15}$/.test(r.whatsappVerifyNumber)) {
      add("The WhatsApp number for payment checks must be digits only with the country code, for example 923700199429.");
    }
  }
  return out;
}
