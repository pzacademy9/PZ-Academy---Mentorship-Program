// Pure attendance rules. No server-only imports: also used in client components.

export type WindowOverride = "auto" | "open" | "closed";
export type WindowState = "before" | "open" | "closed";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // PKT is a fixed UTC+5
const WINDOW_MS = 15 * 60 * 1000;

export function checkinWindow(
  startsAtIso: string,
  override: WindowOverride,
  now: Date,
): WindowState {
  if (override === "open") return "open";
  if (override === "closed") return "closed";
  const start = new Date(startsAtIso).getTime();
  if (Number.isNaN(start)) return "closed";
  const t = now.getTime();
  if (t < start - WINDOW_MS) return "before";
  if (t > start + WINDOW_MS) return "closed";
  return "open";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DDTHH:mm` typed in PKT -> UTC ISO, or null if malformed / not a real date. */
export function pktToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (
    asUtc.getUTCFullYear() !== y ||
    asUtc.getUTCMonth() !== mo - 1 ||
    asUtc.getUTCDate() !== d ||
    asUtc.getUTCHours() !== h ||
    asUtc.getUTCMinutes() !== mi
  ) {
    return null;
  }
  return new Date(asUtc.getTime() - PKT_OFFSET_MS).toISOString();
}

/** UTC ISO -> `YYYY-MM-DDTHH:mm` in PKT. */
export function isoToPktInput(iso: string): string {
  const p = new Date(new Date(iso).getTime() + PKT_OFFSET_MS);
  return `${p.getUTCFullYear()}-${pad(p.getUTCMonth() + 1)}-${pad(p.getUTCDate())}T${pad(p.getUTCHours())}:${pad(p.getUTCMinutes())}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** e.g. `Tue 3 Nov, 8:00 pm PKT` */
export function formatPkt(iso: string): string {
  const p = new Date(new Date(iso).getTime() + PKT_OFFSET_MS);
  const h = p.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "am" : "pm";
  return `${DAYS[p.getUTCDay()]} ${p.getUTCDate()} ${MONTHS[p.getUTCMonth()]}, ${h12}:${pad(p.getUTCMinutes())} ${ampm} PKT`;
}

/** Whole percent, rounded half up, capped at 100; null when no session has started. */
export function attendancePercent(marked: number, started: number): number | null {
  if (started <= 0) return null;
  return Math.min(100, Math.round((marked * 100) / started));
}

export function meetsMinimum(pct: number | null, min: number): boolean {
  return pct !== null && pct >= min;
}

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateSessionCode(): string {
  // Rejection sampling: 252 = 7 * 36, so bytes >= 252 are discarded to keep each char equally likely.
  let out = "";
  const buf = new Uint8Array(16);
  while (out.length < 8) {
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (b >= 252) continue;
      out += CODE_CHARS[b % 36];
      if (out.length === 8) break;
    }
  }
  return out;
}
