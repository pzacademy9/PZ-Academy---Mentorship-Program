// src/lib/landing/registration/card-price.ts
// Pure: what a linked pricing card shows. All maths comes from computeQuote / isEarlyBird; nothing is recomputed here.
// Imported into the public page bundle, so no server-only, React or zod imports (types.ts, not config.ts, which builds the zod schema).
import { INDIVIDUAL, MAX_GROUP_SIZE, type Mode, type OptionDef, type RegistrationConfig } from "./types";
import { formatMoney } from "./format";
import { availableOptions, computeQuote } from "./pricing";

export const LINK_ALL_MODULES = "all:modules";
export const LINK_GROUP = "group:discount";

export type CardPrice =
  | {
      kind: "price";
      current: string;
      strike: string | null;
      earlyEnds: string | null;
      recorded: string | null;
      suffix: "per module" | "from" | null;
      groupLines: string[];
    }
  | { kind: "group"; lines: string[] };

export function priceLinkChoices(config: RegistrationConfig): { value: string; label: string }[] {
  const out = config.options.map((o) => ({ value: o.key, label: o.label.trim() === "" ? o.key : o.label }));
  if (config.options.some((o) => o.kind === "module")) out.push({ value: LINK_ALL_MODULES, label: "All single modules" });
  if (config.tiers.length > 0) out.push({ value: LINK_GROUP, label: "Group discount" });
  return out;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The date written in the Early Bird value itself (its own zone), e.g. "24 September 2026". */
function earlyEndsText(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : null;
}

function groupLabel(minSize: number, maxSize: number, percentOff: number): string {
  const who = maxSize === minSize ? `Group of ${minSize}`
    : maxSize >= MAX_GROUP_SIZE ? `Group of ${minSize} or more`
    : `Group of ${minSize} to ${maxSize}`;
  return `${who}: ${percentOff}% off`;
}

export function cardPrice(config: RegistrationConfig, link: string, regionKey: string, now: Date): CardPrice | null {
  const region = config.regions.find((r) => r.key === regionKey);
  if (!region) return null;
  const baseMode: Mode | null = config.modes.includes("live") ? "live" : config.modes.includes("recorded") ? "recorded" : null;
  if (baseMode === null) return null;
  const currency = region.currency;

  const quote = (optionKeys: string[], mode: Mode, tierKey = INDIVIDUAL, groupSize = 1) =>
    computeQuote({ config, regionKey, mode, optionKeys, tierKey, groupSize, now });

  const groupLines = (optionKey: string): string[] =>
    config.tiers.map((t) => {
      const label = groupLabel(t.minSize, t.maxSize, t.percentOff);
      const q = quote([optionKey], baseMode, t.key, t.minSize);
      return q.ok && !q.isFree ? `${label} · ${formatMoney(q.perPerson, currency)} each` : label;
    });

  if (link === LINK_GROUP) {
    if (config.tiers.length === 0) return null;
    const avail = availableOptions(config, regionKey).filter((o) => !o.free && o.kind === "bundle");
    const mm = config.moduleMix;
    const bundle: OptionDef | undefined = (mm.enabled ? avail.find((o) => o.key === mm.bundleOptionKey) : undefined) ?? avail[0];
    if (!bundle) {
      return { kind: "group", lines: config.tiers.map((t) => groupLabel(t.minSize, t.maxSize, t.percentOff)) };
    }
    return { kind: "group", lines: groupLines(bundle.key) };
  }

  // Which option(s) this link means, and the one whose figures the card shows.
  let optionKey: string;
  let suffix: "per module" | "from" | null = null;
  if (link === LINK_ALL_MODULES) {
    const mods = availableOptions(config, regionKey).filter((o) => o.kind === "module");
    const priced = mods.map((o) => ({ key: o.key, q: quote([o.key], baseMode) }));
    const good = priced.filter((p): p is { key: string; q: Extract<typeof p.q, { ok: true }> } => p.q.ok);
    if (good.length === 0) return null;
    let low = good[0];
    for (const g of good) if (g.q.perPerson < low.q.perPerson) low = g;
    optionKey = low.key;
    if (good.length > 1 && !low.q.isFree) suffix = good.every((g) => g.q.perPerson === low.q.perPerson) ? "per module" : "from";
  } else {
    const opt = config.options.find((o) => o.key === link);
    if (!opt) return null;
    optionKey = opt.key;
  }

  const q = quote([optionKey], baseMode);
  if (!q.ok) return null;
  if (q.isFree) return { kind: "price", current: "Free", strike: null, earlyEnds: null, recorded: null, suffix, groupLines: [] };

  const early = q.earlyBirdApplied;
  let recorded: string | null = null;
  if (baseMode === "live" && config.modes.includes("recorded")) {
    const r = quote([optionKey], "recorded");
    if (r.ok) recorded = formatMoney(r.perPerson, currency);
  }
  return {
    kind: "price",
    current: formatMoney(q.perPerson, currency),
    strike: early ? formatMoney(q.listPerPerson, currency) : null,
    earlyEnds: early ? earlyEndsText(config.earlyBirdEndsAt) : null,
    recorded,
    suffix,
    groupLines: link !== LINK_ALL_MODULES && config.options.find((o) => o.key === optionKey)?.kind === "bundle" ? groupLines(optionKey) : [],
  };
}
