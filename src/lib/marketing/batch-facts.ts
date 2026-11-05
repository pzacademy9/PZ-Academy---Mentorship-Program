// Pure: the extra facts the public website shows for an open live batch.
// All price maths comes from cardPrice / computeQuote; nothing is recomputed here.
// No server-only, React or zod imports: the course cards (client) import the types.
import { cardPrice } from "@/lib/landing/registration/card-price";
import type { RegistrationView } from "@/lib/landing/registration/types";
import { PKT_OFFSET_MS } from "@/lib/attendance/rules";

/** "N seats left" shows only when this many seats or fewer remain (owner's choice, 2026-11-04). */
export const SEATS_SHOWN_AT = 20;

/** Seats left to show, or null (no limit, unknown count, or still plenty of room). */
export function seatsLeft(capacity: number, taken: number): number | null {
  if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(taken)) return null;
  const left = Math.max(0, Math.floor(capacity - taken));
  return left <= SEATS_SHOWN_AT ? left : null;
}

export function seatsLeftText(n: number): string {
  return n === 1 ? "1 seat left" : `${n} seats left`;
}

export type BatchEarlyBird = { price: string; was: string; until: string | null };

/**
 * The option whose price stands for "the batch": the whole-course bundle when
 * modules can be mixed, else the first paid bundle, else the first paid option,
 * offered in the region.
 */
function batchOptionKey(config: RegistrationView, regionKey: string): string | null {
  const offered = config.options.filter((o) => !o.free && config.prices[o.key]?.[regionKey] !== undefined);
  const mm = config.moduleMix;
  if (mm.enabled && offered.some((o) => o.key === mm.bundleOptionKey)) return mm.bundleOptionKey;
  return (offered.find((o) => o.kind === "bundle") ?? offered[0])?.key ?? null;
}

/** The Early Bird price of the batch in its main country, or null when no Early Bird is running. */
export function batchEarlyBird(config: RegistrationView, now: Date): BatchEarlyBird | null {
  const region = config.defaultRegionKey;
  const key = batchOptionKey(config, region);
  if (!key) return null;
  const p = cardPrice(config, key, region, now);
  if (!p || p.kind !== "price" || p.strike === null) return null;
  return { price: p.current, was: p.strike, until: p.earlyEnds };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * "Sat 12 December 2026, 7:00 pm PKT" in Pakistan time. A time of exactly
 * midnight is read as "no time given" and shows the date only. "" when invalid.
 */
export function startsAtLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!iso.trim() || Number.isNaN(t)) return "";
  const p = new Date(t + PKT_OFFSET_MS);
  const date = `${DAYS[p.getUTCDay()]} ${p.getUTCDate()} ${MONTHS[p.getUTCMonth()]} ${p.getUTCFullYear()}`;
  const h = p.getUTCHours();
  const m = p.getUTCMinutes();
  if (h === 0 && m === 0) return date;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${date}, ${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"} PKT`;
}
