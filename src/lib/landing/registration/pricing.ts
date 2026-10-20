// src/lib/landing/registration/pricing.ts
// The one price calculation. The server recomputes every quote with this; the widget uses it for display only.
import { INDIVIDUAL, type Mode, type OptionView, type PriceCell, type RegistrationView, type TierDef } from "./types";

export interface QuoteInput {
  config: RegistrationView;
  regionKey: string;
  mode: Mode;
  optionKeys: string[];
  tierKey: string; // "individual" or a TierDef.key
  groupSize: number;
  now: Date;
}

export type QuoteResult =
  | {
      ok: true; currency: string; regionKey: string; mode: Mode; optionKeys: string[]; tierKey: string; groupSize: number;
      earlyBirdApplied: boolean; isFree: boolean;
      listPerPerson: number; // regular (non-early) per-person price, for strike-through
      perPerson: number;     // price per person after Early Bird / recorded / tier
      total: number;         // total due for the whole registration BEFORE promo
      savings: number;       // listPerPerson * groupSize - total, >= 0
    }
  | { ok: false; reason: "no_region" | "no_option" | "no_price" | "bad_tier" | "bad_group_size" | "mode_not_offered" | "free_group" | "mixed_free" };

type Failure = Extract<QuoteResult, { ok: false }>;
const fail = (reason: Failure["reason"]): Failure => ({ ok: false, reason });

export function isEarlyBird(config: RegistrationView, now: Date): boolean {
  if (config.earlyBirdEndsAt.trim() === "") return false;
  const end = Date.parse(config.earlyBirdEndsAt);
  return Number.isFinite(end) && now.getTime() < end;
}

/** Known keys only, no duplicates, in config order; every module (or the bundle itself) collapses to the bundle. */
export function resolveOptionKeys(config: RegistrationView, optionKeys: string[]): string[] {
  const wanted = new Set(optionKeys);
  let keys = config.options.filter((o) => wanted.has(o.key)).map((o) => o.key);
  const mm = config.moduleMix;
  if (mm.enabled && config.options.some((o) => o.key === mm.bundleOptionKey)) {
    const modules = config.options.filter((o) => o.kind === "module").map((o) => o.key);
    const hasBundle = keys.includes(mm.bundleOptionKey);
    const allModules = modules.length > 0 && modules.every((k) => keys.includes(k));
    if (hasBundle || allModules) {
      const rest = keys.filter((k) => k !== mm.bundleOptionKey && !modules.includes(k));
      keys = config.options.map((o) => o.key).filter((k) => k === mm.bundleOptionKey || rest.includes(k));
    }
  }
  return keys;
}

/** Options that have a price in this region (a free option is offered where it has a 0 cell). */
export function availableOptions(config: RegistrationView, regionKey: string): OptionView[] {
  return config.options.filter((o) => cellOf(config, o.key, regionKey) !== undefined);
}

/** Own-property lookup: config price maps are plain objects, so "constructor" etc. must never resolve to inherited members. */
function own<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  return obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}
const cellOf = (config: RegistrationView, optionKey: string, regionKey: string): PriceCell | undefined =>
  own(own(config.prices, optionKey), regionKey);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeQuote(i: QuoteInput): QuoteResult {
  const { config } = i;
  const region = config.regions.find((r) => r.key === i.regionKey);
  if (!region) return fail("no_region");
  if (!config.modes.includes(i.mode)) return fail("mode_not_offered");
  if (i.optionKeys.length === 0 || i.optionKeys.some((k) => !config.options.some((o) => o.key === k))) return fail("no_option");

  const keys = resolveOptionKeys(config, i.optionKeys);
  const opts = keys.map((k) => config.options.find((o) => o.key === k) as OptionView);
  const freeCount = opts.filter((o) => o.free).length;
  if (freeCount > 0 && freeCount < opts.length) return fail("mixed_free");

  if (!Number.isInteger(i.groupSize) || i.groupSize < 1) return fail("bad_group_size");
  let tier: TierDef | null = null;
  if (i.tierKey === INDIVIDUAL) {
    if (i.groupSize !== 1) return fail("bad_group_size");
  } else {
    tier = config.tiers.find((t) => t.key === i.tierKey) ?? null;
    if (!tier) return fail("bad_tier");
    if (i.groupSize < tier.minSize || i.groupSize > tier.maxSize) return fail("bad_group_size");
  }

  const cells = keys.map((k) => cellOf(config, k, region.key));
  if (cells.some((c) => c === undefined)) return fail("no_price");
  const priced = cells as PriceCell[];
  const isAmount = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (priced.some((c) => !isAmount(c.amount) || (c.earlyAmount !== undefined && !isAmount(c.earlyAmount)))) return fail("no_price");

  const head = { currency: region.currency, regionKey: region.key, mode: i.mode, optionKeys: keys, tierKey: i.tierKey, groupSize: i.groupSize };
  if (freeCount === opts.length) {
    if (tier) return fail("free_group");
    return { ok: true, ...head, earlyBirdApplied: false, isFree: true, listPerPerson: 0, perPerson: 0, total: 0, savings: 0 };
  }

  const early = i.mode === "live" && isEarlyBird(config, i.now);
  const pct = config.recordedPercentOfRegular;
  const regular = (c: PriceCell) => (i.mode === "recorded" ? Math.round((c.amount * pct) / 100) : c.amount);
  const effective = (c: PriceCell) => (i.mode === "recorded" ? regular(c) : early && c.earlyAmount !== undefined ? c.earlyAmount : c.amount);

  const listPerPerson = sum(priced.map(regular));
  const unit = sum(priced.map(effective));
  const earlyBirdApplied = early && priced.some((c) => c.earlyAmount !== undefined && c.earlyAmount !== c.amount);

  let perPerson = unit;
  let total = unit;
  if (tier) {
    const cell = priced[0];
    const usesEarly = early && cell.earlyAmount !== undefined;
    const explicit = keys.length === 1 && i.mode === "live"
      ? own(usesEarly ? cell.earlyGroupTotals : cell.groupTotals, tier.key)
      : undefined;
    if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
      total = explicit;
      perPerson = Math.round(explicit / i.groupSize);
    } else {
      perPerson = Math.round((unit * (100 - tier.percentOff)) / 100);
      total = perPerson * i.groupSize;
    }
  }

  const savings = Math.max(0, listPerPerson * i.groupSize - total);
  if (![listPerPerson, perPerson, total, savings].every(Number.isSafeInteger)) return fail("no_price");
  return { ok: true, ...head, earlyBirdApplied, isFree: false, listPerPerson, perPerson, total, savings };
}
