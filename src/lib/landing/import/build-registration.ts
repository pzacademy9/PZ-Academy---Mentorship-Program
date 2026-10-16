// src/lib/landing/import/build-registration.ts
// Maps the front-matter `registration` and `modules` of a pz-landing/1 file to the stored shapes.
// Pure module. Messages are plain words (country / module / option), never internal terms.
import {
  ITEM_KEY_RE, REGION_KEY_RE, normalizeRegistration, registrationProblems,
  type OptionDef, type PriceCell, type RegionDef, type RegistrationConfig, type TierDef,
} from "../registration/config";
import { MODULE_KEY_RE, type ModuleDef } from "../variants";
import type { ImportProblem } from "./parse";

export interface BuiltRegistration {
  registration: RegistrationConfig;
  modules: ModuleDef[];
  problems: ImportProblem[];
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const asList = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRecord) : []);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter((s) => s !== "") : []);
const finite = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const count = (v: unknown, fallback: number): number => Math.max(0, Math.round(finite(v) ?? fallback));

export function buildRegistration(front: Record<string, unknown>): BuiltRegistration {
  const problems: ImportProblem[] = [];
  const error = (message: string) => problems.push({ level: "error", message });
  const warn = (message: string) => problems.push({ level: "warning", message });

  const reg = isRecord(front.registration) ? front.registration : {};
  const rawModules = asList(front.modules);
  const reserved = (code: string) => { error(`"${code}" is a reserved word, pick another code.`); };
  const moduleOptionKeys = new Set(rawModules.map((m) => text(m.option)).filter((k) => k !== ""));

  // ---- countries
  const regions: RegionDef[] = [];
  for (const r of asList(reg.regions)) {
    const key = text(r.code);
    if (BAD_KEYS.has(key)) { reserved(key); continue; }
    if (regions.some((x) => x.key === key)) { error(`Two countries use the same code "${key}". Give each country its own code.`); continue; }
    if (!REGION_KEY_RE.test(key)) error(`The country code "${key}" must be 2 to 6 capital letters, for example PK.`);
    regions.push({
      key, label: text(r.name), currency: text(r.currency), classTime: text(r.class_time),
      timezoneLabel: text(r.timezone),
      accountKeys: strings(r.accounts).filter((a) => { if (BAD_KEYS.has(a)) { reserved(a); return false; } return true; }),
    });
  }
  const regionName = (key: string) => regions.find((g) => g.key === key)?.label.trim() || key;

  // ---- options
  const options: OptionDef[] = [];
  for (const o of asList(reg.options)) {
    const key = text(o.key);
    if (BAD_KEYS.has(key)) { reserved(key); continue; }
    if (options.some((x) => x.key === key)) { error(`Two options use the same code "${key}". Give each option its own code.`); continue; }
    if (!ITEM_KEY_RE.test(key)) error(`The option code "${key}" must use small letters, digits or _ only.`);
    options.push({
      key, label: text(o.name),
      kind: o.kind === "module" || o.kind === "bundle" ? o.kind : moduleOptionKeys.has(key) ? "module" : "bundle",
      free: o.free === true, waGroupUrl: text(o.wa_group),
    });
  }
  const optionName = (key: string) => options.find((o) => o.key === key)?.label.trim() || key;

  // ---- group discounts
  const tiers: TierDef[] = asList(reg.tiers).filter((t) => { const k = text(t.key); if (BAD_KEYS.has(k)) { reserved(k); return false; } return true; }).map((t) => {
    const size = finite(t.size);
    const min = size ?? finite(t.min) ?? 2;
    const max = size ?? finite(t.max) ?? min;
    return { key: text(t.key), label: text(t.label), minSize: min, maxSize: max, percentOff: finite(t.percent_off) ?? 0 };
  });

  // ---- prices
  const readMoney = (v: unknown, what: string): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = finite(v);
    if (n !== undefined && n >= 0) return n;
    if (typeof v === "string" && !/-\s*\d/.test(v)) {
      const found = v.replace(/,/g, "").match(/\d+(?:\.\d+)?/g);
      if (found && found.length === 1) {
        const read = Number(found[0]);
        warn(`${what} was read as ${read}. Please check it.`);
        return read;
      }
    }
    warn(`${what} is not a number.`);
    return undefined;
  };
  const readTotals = (v: unknown, what: string): Record<string, number> | undefined => {
    if (!isRecord(v)) return undefined;
    const out: Record<string, number> = Object.create(null);
    for (const [k, x] of Object.entries(v)) {
      const n = readMoney(x, `${what} for the group "${k}"`);
      if (n !== undefined) out[k] = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const prices: Record<string, Record<string, PriceCell>> = Object.create(null);
  const covered = new Set<string>(); // option|country pairs already explained by a specific message
  if (isRecord(reg.prices)) {
    for (const [optKey, byCountry] of Object.entries(reg.prices)) {
      if (!options.some((o) => o.key === optKey)) { error(`A price is given for "${optKey}", which is not one of the options.`); continue; }
      if (!isRecord(byCountry)) continue;
      for (const [code, cellRaw] of Object.entries(byCountry)) {
        if (!regions.some((g) => g.key === code)) {
          error(`A price for ${optionName(optKey)} is given for "${code}", which is not one of the countries.`);
          continue;
        }
        if (!isRecord(cellRaw)) {
          covered.add(`${optKey}|${code}`);
          warn(`The price of ${optionName(optKey)} for ${regionName(code)} is not written correctly. Write it as amount: 200.`);
          continue;
        }
        const where = `${optionName(optKey)} for ${regionName(code)}`;
        const amount = readMoney(cellRaw.amount, `The price of ${where}`);
        if (amount === undefined) { covered.add(`${optKey}|${code}`); continue; }
        const cell: PriceCell = { amount };
        const early = readMoney(cellRaw.early, `The Early Bird price of ${where}`);
        if (early !== undefined) cell.earlyAmount = early;
        const gt = readTotals(cellRaw.group_totals, `The group total of ${where}`);
        if (gt) cell.groupTotals = gt;
        const egt = readTotals(cellRaw.early_group_totals, `The Early Bird group total of ${where}`);
        if (egt) cell.earlyGroupTotals = egt;
        (prices[optKey] ??= Object.create(null) as Record<string, PriceCell>)[code] = cell;
      }
    }
  }

  // ---- modules
  const modules: ModuleDef[] = [];
  for (const m of rawModules) {
    const key = text(m.key);
    if (BAD_KEYS.has(key)) { reserved(key); continue; }
    const title = text(m.title);
    const shown = title || key;
    if (!MODULE_KEY_RE.test(key)) error(`The module code "${key}" must use small letters, digits and single dashes, for example module-1.`);
    const optionKey = text(m.option);
    if (optionKey !== "" && !options.some((o) => o.key === optionKey)) {
      error(`The module "${shown}" points to the option "${optionKey}", which does not exist.`);
    }
    if (modules.some((x) => x.key === key)) { error(`Two modules use the code "${key}". Give each module its own code.`); }
    if (modules.some((x) => x.key === key)) continue;
    modules.push({ key, title, format: text(m.format), days: count(m.days, 0), optionKey });
  }

  // ---- module options without a price in a country
  for (const m of modules) {
    const opt = options.find((o) => o.key === m.optionKey);
    if (!opt || opt.free) continue;
    for (const g of regions) {
      if (!prices[opt.key]?.[g.key] && !covered.has(`${opt.key}|${g.key}`)) { covered.add(`${opt.key}|${g.key}`); warn(`${regionName(g.key)} has no price for ${optionName(opt.key)}.`); }
    }
  }

  const mix = isRecord(reg.module_mix) ? reg.module_mix : {};
  const registration = normalizeRegistration({
    enabled: regions.length > 0 && options.length > 0,
    modes: Array.isArray(reg.modes) ? reg.modes : undefined,
    recordedPercentOfRegular: finite(reg.recorded_percent),
    regions,
    defaultRegionKey: text(reg.default_region) || regions[0]?.key || "",
    options,
    moduleMix: { enabled: mix.enabled === true, bundleOptionKey: text(mix.bundle) },
    tiers,
    prices,
    earlyBirdEndsAt: text(reg.early_bird_ends),
    capacity: count(reg.capacity, 0),
    whatsappVerifyNumber: text(reg.verify_whatsapp),
    eventLabel: text(reg.event_label),
    refPrefix: text(reg.ref_prefix),
    professions: strings(reg.professions),
    discoveryOptions: strings(reg.discovery),
  });

  // Readiness-style findings never block the import.
  const seen = new Set(problems.map((p) => p.message));
  covered.forEach((pair) => {
    const [ok, rk] = pair.split("|");
    seen.add(`Add the price of "${optionName(ok)}" for ${regionName(rk)}.`);
  });
  for (const p of registrationProblems(registration)) {
    if (!seen.has(p.message)) { seen.add(p.message); warn(p.message); }
  }

  return { registration, modules, problems };
}
