// The promo code admin form as plain data, so every rule is unit-tested without rendering.
import type { PromoCode } from "./promo";
import type { PromoCodeInput } from "@/lib/data/landing-promo-codes";
import { PROMO_MAX_FIXED_AMOUNT, PROMO_MAX_USES } from "@/lib/validations/landing-promo";

export const PROMO_CURRENCIES = ["PKR", "AED", "SAR", "PHP", "INR", "USD"] as const;

export interface PromoPageOption { id: string; title: string; options: { key: string; label: string }[] }

export interface PromoDraft {
  code: string;
  type: "percent" | "fixed";
  value: string;
  maxDiscountPercent: string;
  fixedAmounts: Record<string, string>;
  scope: "all" | "pages";
  pageIds: string[];
  optionKeys: string[];
  maxUses: string;
  oneperEmail: boolean;
  /** datetime-local values, read as Pakistan time (UTC+5, no daylight saving) */
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export type PromoErrors = Partial<Record<"code" | "value" | "maxDiscountPercent" | "fixedAmounts" | "pageIds" | "maxUses" | "startsAt" | "endsAt", string>>;
export type PromoStateKey = "active" | "paused" | "scheduled" | "expired" | "used_up";
export const PROMO_STATE_LABEL: Record<PromoStateKey, string> = {
  active: "Active", paused: "Paused", scheduled: "Starts later", expired: "Ended", used_up: "Used up",
};

const CODE_RE = /^[A-Z0-9_-]{2,40}$/;
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const PKT_MS = 5 * 60 * 60 * 1000;

export function normalizeCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "");
}

export function pktLocalToIso(local: string): string | null {
  if (!LOCAL_RE.test(local)) return null;
  const t = Date.parse(`${local}:00+05:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function isoToPktLocal(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t + PKT_MS).toISOString().slice(0, 16);
}

export function emptyPromoDraft(): PromoDraft {
  return {
    code: "", type: "percent", value: "", maxDiscountPercent: "", fixedAmounts: {}, scope: "all", pageIds: [], optionKeys: [],
    maxUses: "", oneperEmail: false, startsAt: "", endsAt: "", active: true,
  };
}

export function draftFromPromo(p: PromoCode): PromoDraft {
  return {
    code: p.code,
    type: p.type,
    value: p.type === "percent" ? String(p.value) : "",
    maxDiscountPercent: p.maxDiscountPercent > 0 ? String(p.maxDiscountPercent) : "",
    fixedAmounts: Object.fromEntries(Object.entries(p.fixedAmounts).map(([k, v]) => [k, String(v)])),
    scope: p.pageIds.length > 0 ? "pages" : "all",
    pageIds: [...p.pageIds],
    optionKeys: [...p.optionKeys],
    maxUses: p.maxUses === null ? "" : String(p.maxUses),
    oneperEmail: p.oneperEmail,
    startsAt: isoToPktLocal(p.startsAt),
    endsAt: isoToPktLocal(p.endsAt),
    active: p.active,
  };
}

/** "" -> null (not given); otherwise the number, or NaN when it is not one. */
function num(s: string | undefined): number | null {
  const t = (s ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function draftToInput(d: PromoDraft, ownerAgentId: string | null = null): { ok: true; input: PromoCodeInput } | { ok: false; errors: PromoErrors } {
  const errors: PromoErrors = {};
  const code = normalizeCodeInput(d.code.trim());
  if (!CODE_RE.test(code)) errors.code = "Use 2 to 40 capital letters, numbers, - or _ with no spaces, like PZ10.";

  let value = 0;
  let maxDiscountPercent = 0;
  const fixedAmounts: Record<string, number> = {};
  if (d.type === "percent") {
    const v = num(d.value);
    if (v === null || Number.isNaN(v) || !Number.isInteger(v) || v < 1 || v > 100) errors.value = "Enter a whole percentage from 1 to 100.";
    else value = v;
    const cap = num(d.maxDiscountPercent);
    if (cap !== null && (Number.isNaN(cap) || cap < 0 || cap > 100)) errors.maxDiscountPercent = "Enter a percentage from 0 to 100, or leave it empty.";
    else maxDiscountPercent = cap ?? 0;
  } else {
    for (const cur of PROMO_CURRENCIES) {
      const a = num(d.fixedAmounts[cur]);
      if (a === null) continue;
      if (Number.isNaN(a) || a <= 0) {
        if (!errors.fixedAmounts) errors.fixedAmounts = `Enter an amount above 0 for ${cur}, or leave it empty.`;
        continue;
      }
      if (!Number.isInteger(a)) {
        if (!errors.fixedAmounts) errors.fixedAmounts = `Enter a whole amount for ${cur}, with no decimals.`;
        continue;
      }
      if (a > PROMO_MAX_FIXED_AMOUNT) {
        if (!errors.fixedAmounts) errors.fixedAmounts = `The most you can take off in ${cur} is ${PROMO_MAX_FIXED_AMOUNT.toLocaleString("en-US")}.`;
        continue;
      }
      fixedAmounts[cur] = a;
    }
    if (!errors.fixedAmounts && Object.keys(fixedAmounts).length === 0) {
      errors.fixedAmounts = "Enter the discount for at least one currency, for example PKR 500.";
    }
  }

  const pageIds = d.scope === "pages" ? Array.from(new Set(d.pageIds)) : [];
  if (d.scope === "pages" && pageIds.length === 0) errors.pageIds = "Choose at least one page, or choose All pages.";

  let maxUses: number | null = null;
  const mu = num(d.maxUses);
  if (mu !== null) {
    if (Number.isNaN(mu) || !Number.isInteger(mu) || mu < 1) errors.maxUses = "Enter a whole number of 1 or more, or leave it empty.";
    else if (mu > PROMO_MAX_USES) errors.maxUses = `Enter a number up to ${PROMO_MAX_USES.toLocaleString("en-US")}, or leave it empty.`;
    else maxUses = mu;
  }

  const startsAt = d.startsAt ? pktLocalToIso(d.startsAt) : null;
  const endsAt = d.endsAt ? pktLocalToIso(d.endsAt) : null;
  if (d.startsAt && !startsAt) errors.startsAt = "Enter a valid date and time.";
  if (d.endsAt && !endsAt) errors.endsAt = "Enter a valid date and time.";
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) errors.endsAt = "The end must be after the start.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      code, type: d.type, value, fixedAmounts, maxDiscountPercent, pageIds, optionKeys: Array.from(new Set(d.optionKeys)),
      maxUses, oneperEmail: d.oneperEmail, startsAt, endsAt, active: d.active, ownerAgentId,
    },
  };
}

/** What an edit sends: everything except the code (codes are never renamed) and the owner. */
export function patchFromInput(i: PromoCodeInput): Omit<PromoCodeInput, "code" | "ownerAgentId"> {
  return {
    type: i.type, value: i.value, fixedAmounts: i.fixedAmounts, maxDiscountPercent: i.maxDiscountPercent, pageIds: i.pageIds,
    optionKeys: i.optionKeys, maxUses: i.maxUses, oneperEmail: i.oneperEmail, startsAt: i.startsAt, endsAt: i.endsAt, active: i.active,
  };
}

export function promoState(p: Pick<PromoCode, "active" | "maxUses" | "usedCount" | "startsAt" | "endsAt">, now: Date): PromoStateKey {
  if (!p.active) return "paused";
  if (p.maxUses !== null && p.usedCount >= p.maxUses) return "used_up";
  if (p.endsAt && Date.parse(p.endsAt) <= now.getTime()) return "expired";
  if (p.startsAt && Date.parse(p.startsAt) > now.getTime()) return "scheduled";
  return "active";
}

export function describeDiscount(p: Pick<PromoCode, "type" | "value" | "fixedAmounts" | "maxDiscountPercent">): string {
  if (p.type === "percent") {
    return p.maxDiscountPercent > 0 && p.maxDiscountPercent < p.value ? `${p.value}% off (at most ${p.maxDiscountPercent}%)` : `${p.value}% off`;
  }
  const parts = PROMO_CURRENCIES
    .filter((c) => typeof p.fixedAmounts[c] === "number")
    .map((c) => `${c} ${p.fixedAmounts[c].toLocaleString("en-US")}`);
  return parts.length > 0 ? `${parts.join(" / ")} off` : "No amount set";
}

/** Options of the chosen pages (or every page), one entry per option key. */
export function optionChoices(pages: PromoPageOption[], pageIds: string[]): { key: string; label: string }[] {
  const scoped = pageIds.length > 0 ? pages.filter((p) => pageIds.includes(p.id)) : pages;
  const byKey = new Map<string, { label: string; titles: string[] }>();
  for (const p of scoped) {
    for (const o of p.options) {
      const hit = byKey.get(o.key);
      if (hit) {
        if (!hit.titles.includes(p.title)) hit.titles.push(p.title);
      } else {
        byKey.set(o.key, { label: o.label, titles: [p.title] });
      }
    }
  }
  return Array.from(byKey, ([key, v]) => ({ key, label: `${v.label} · ${v.titles.join(", ")}` }));
}

/** Agent links (ruling 8): one code per sales agent, shared as /e/<slug>?ref=<code> for any published page. */
export interface AgentChoice { id: string; name: string }
export interface LinkPage { slug: string; title: string }

export function agentLinkUrl(origin: string, slug: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/e/${encodeURIComponent(slug)}?ref=${encodeURIComponent(code)}`;
}
