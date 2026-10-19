// src/lib/landing/registration/admin-edit.ts
// Pure, immutable edits for the admin registration stepper. Every function returns a new config.
import type { OptionDef, PriceCell, RegionDef, RegistrationConfig, TierDef } from "./config";

export const REGION_PRESETS: RegionDef[] = [
  { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "Pakistan Standard Time", accountKeys: [] },
  { key: "UAE", label: "United Arab Emirates", currency: "AED", classTime: "", timezoneLabel: "UAE / Gulf Time", accountKeys: [] },
  { key: "KSA", label: "Saudi Arabia", currency: "SAR", classTime: "", timezoneLabel: "Saudi Arabia Time", accountKeys: [] },
  { key: "PH", label: "Philippines", currency: "PHP", classTime: "", timezoneLabel: "Philippine Time", accountKeys: [] },
  { key: "IN", label: "India", currency: "INR", classTime: "", timezoneLabel: "India Standard Time", accountKeys: [] },
  { key: "INTL", label: "International", currency: "USD", classTime: "", timezoneLabel: "Your Local Time", accountKeys: [] },
];

export const TIER_PRESETS: TierDef[] = [
  { key: "group3", label: "Group of 3", minSize: 3, maxSize: 3, percentOff: 20 },
  { key: "group5", label: "Group of 5", minSize: 5, maxSize: 5, percentOff: 25 },
  { key: "group3plus", label: "Group (3 or more)", minSize: 3, maxSize: 50, percentOff: 20 },
];

export const TZ_CHOICES: { label: string; offset: string }[] = [
  { label: "Pakistan time (UTC+5)", offset: "+05:00" },
  { label: "UAE time (UTC+4)", offset: "+04:00" },
  { label: "Saudi Arabia time (UTC+3)", offset: "+03:00" },
  { label: "Philippine time (UTC+8)", offset: "+08:00" },
  { label: "India time (UTC+5:30)", offset: "+05:30" },
  { label: "UTC", offset: "+00:00" },
];

const deep = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype", "individual"]);

/** Option codes must match ITEM_KEY_RE (/^[a-z0-9_]{1,32}$/): underscores, never hyphens. */
function uniqueKey(label: string, taken: string[]): string {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "option";
  if (RESERVED_KEYS.has(base)) base = `${base}_option`;
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}_${n}`)) return `${base}_${n}`;
}

export function addRegion(r: RegistrationConfig, preset: RegionDef): RegistrationConfig {
  if (r.regions.some((g) => g.key === preset.key)) return r;
  return { ...r, regions: [...r.regions, deep(preset)], defaultRegionKey: r.defaultRegionKey || preset.key };
}

export function updateRegion(r: RegistrationConfig, key: string, patch: Partial<Omit<RegionDef, "key">>): RegistrationConfig {
  return { ...r, regions: r.regions.map((g) => (g.key === key ? { ...g, ...patch } : g)) };
}

export function removeRegion(r: RegistrationConfig, key: string): RegistrationConfig {
  const regions = r.regions.filter((g) => g.key !== key);
  const prices = Object.fromEntries(
    Object.entries(r.prices).map(([o, cells]) => [o, Object.fromEntries(Object.entries(cells).filter(([g]) => g !== key))]),
  );
  const defaultRegionKey = r.defaultRegionKey === key ? regions[0]?.key ?? "" : r.defaultRegionKey;
  return { ...r, regions, prices, defaultRegionKey };
}

export function addOption(r: RegistrationConfig, kind: OptionDef["kind"], label: string): RegistrationConfig {
  const key = uniqueKey(label, r.options.map((o) => o.key));
  return { ...r, options: [...r.options, { key, label, kind, free: false, waGroupUrl: "", moduleIds: [] }], prices: { ...r.prices, [key]: {} } };
}

export function updateOption(r: RegistrationConfig, key: string, patch: Partial<Omit<OptionDef, "key">>): RegistrationConfig {
  return { ...r, options: r.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) };
}

export function removeOption(r: RegistrationConfig, key: string): RegistrationConfig {
  const prices = { ...r.prices };
  delete prices[key];
  const moduleMix = r.moduleMix.bundleOptionKey === key ? { enabled: false, bundleOptionKey: "" } : r.moduleMix;
  return { ...r, options: r.options.filter((o) => o.key !== key), prices, moduleMix };
}

export function addTier(r: RegistrationConfig, preset: TierDef): RegistrationConfig {
  if (r.tiers.some((t) => t.key === preset.key)) return r;
  return { ...r, tiers: [...r.tiers, { ...preset }] };
}

export function updateTier(r: RegistrationConfig, key: string, patch: Partial<Omit<TierDef, "key">>): RegistrationConfig {
  return { ...r, tiers: r.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)) };
}

export function removeTier(r: RegistrationConfig, key: string): RegistrationConfig {
  const prices = deep(r.prices);
  for (const cells of Object.values(prices)) {
    for (const cell of Object.values(cells)) {
      for (const field of ["groupTotals", "earlyGroupTotals"] as const) {
        const map = cell[field];
        if (!map) continue;
        delete map[key];
        if (Object.keys(map).length === 0) delete cell[field];
      }
    }
  }
  return { ...r, tiers: r.tiers.filter((t) => t.key !== key), prices };
}

/** null removes the cell (= "no price in this country"). */
export function setPriceCell(r: RegistrationConfig, optionKey: string, regionKey: string, cell: PriceCell | null): RegistrationConfig {
  const cells = { ...(r.prices[optionKey] ?? {}) };
  if (cell === null) delete cells[regionKey];
  else cells[regionKey] = cell;
  return { ...r, prices: { ...r.prices, [optionKey]: cells } };
}

/**
 * Sets (or with null clears) the hand-set TOTAL for one fixed-size tier in one cell: `early` false
 * writes `groupTotals` (used after Early Bird), true writes `earlyGroupTotals` (used while Early Bird
 * is on; Task 2). No-op when the cell has no price.
 */
export function setGroupTotal(
  r: RegistrationConfig, optionKey: string, regionKey: string, tierKey: string, total: number | null, early = false,
): RegistrationConfig {
  const cell = r.prices[optionKey]?.[regionKey];
  if (!cell) return r;
  const field = early ? "earlyGroupTotals" : "groupTotals";
  const map = { ...(cell[field] ?? {}) };
  if (total === null) delete map[tierKey];
  else map[tierKey] = total;
  const next: PriceCell = { ...cell };
  if (Object.keys(map).length > 0) next[field] = map;
  else delete next[field];
  return setPriceCell(r, optionKey, regionKey, next);
}

/** "Copy this row": every option's price in `from` is copied into `to` (cells `from` lacks are removed from `to`). */
export function copyPriceRow(r: RegistrationConfig, from: string, to: string): RegistrationConfig {
  if (from === to) return r;
  const prices = Object.fromEntries(
    Object.entries(r.prices).map(([o, cells]) => {
      const next = { ...cells };
      if (cells[from]) next[to] = deep(cells[from]);
      else delete next[to];
      return [o, next];
    }),
  );
  return { ...r, prices };
}

export function toggleAccount(r: RegistrationConfig, regionKey: string, accountKey: string): RegistrationConfig {
  return {
    ...r,
    regions: r.regions.map((g) => {
      if (g.key !== regionKey) return g;
      const has = g.accountKeys.includes(accountKey);
      return { ...g, accountKeys: has ? g.accountKeys.filter((k) => k !== accountKey) : [...g.accountKeys, accountKey] };
    }),
  };
}

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const OFFSET_RE = /^[+-]\d{2}:\d{2}$/;
const ISO_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** datetime-local value + "+05:00" -> "2026-10-15T23:59:00+05:00"; "" when either part is invalid. */
export function localToOffsetIso(local: string, offset: string): string {
  if (!LOCAL_RE.test(local) || !OFFSET_RE.test(offset)) return "";
  const iso = `${local}:00${offset}`;
  return Number.isNaN(Date.parse(iso)) ? "" : iso;
}

/** The inverse, for showing a stored value. Unknown shapes that still parse are shown in Pakistan time. */
export function offsetIsoToLocal(iso: string): { local: string; offset: string } {
  const m = ISO_RE.exec(iso.trim());
  if (m) return { local: m[1], offset: m[2] === "Z" ? "+00:00" : m[2] };
  const t = Date.parse(iso);
  if (iso.trim() === "" || Number.isNaN(t)) return { local: "", offset: "+05:00" };
  return { local: new Date(t + 5 * 3600_000).toISOString().slice(0, 16), offset: "+05:00" };
}
