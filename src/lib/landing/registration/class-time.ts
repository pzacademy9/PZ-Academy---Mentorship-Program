// src/lib/landing/registration/class-time.ts
// Converts one class time, set in Pakistan time, into each country's local time.
// Only countries that never change their clocks are listed (UK, US, Canada, Australia, Egypt are left to be typed by hand).
import type { RegistrationConfig } from "./config";

/** Minutes ahead of UTC, by region key. */
const OFFSET_MIN: Record<string, number> = {
  PK: 300, UAE: 240, KSA: 180, PH: 480, IN: 330,
  QA: 180, KW: 180, BH: 180, OM: 240, BD: 360, LK: 330, MY: 480, SG: 480, NG: 60, KE: 180,
};

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function toMinutes(t: string): number | null {
  const m = TIME_RE.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

function format(total: number): string {
  const day = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(day / 60);
  const min = day % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "19:30", "20:30" (Pakistan time) -> "6:30 PM – 7:30 PM" for UAE. null when the start is invalid or the country has no fixed offset. End is optional. */
export function convertClassTime(startPk: string, endPk: string, regionKey: string): string | null {
  const offset = OFFSET_MIN[regionKey];
  const start = toMinutes(startPk);
  if (offset === undefined || start === null) return null;
  const shift = offset - OFFSET_MIN.PK;
  const end = endPk.trim() === "" ? null : toMinutes(endPk);
  if (endPk.trim() !== "" && end === null) return null;
  return end === null ? format(start + shift) : `${format(start + shift)} – ${format(end + shift)}`;
}

const TZ_TO_REGION: Record<string, string> = {
  "Asia/Karachi": "PK", "Asia/Dubai": "UAE", "Asia/Muscat": "UAE", "Asia/Riyadh": "KSA",
  "Asia/Manila": "PH", "Asia/Calcutta": "IN", "Asia/Kolkata": "IN",
};

/** Which of the page's countries matches the visitor's clock (their IANA time zone): that country, else International, else the default, else the first. */
export function regionFromTimeZone(timeZone: string, regions: { key: string }[], defaultKey: string): string {
  const has = (k: string) => regions.some((g) => g.key === k);
  const mapped = TZ_TO_REGION[timeZone];
  if (mapped && has(mapped)) return mapped;
  if (!mapped && has("INTL")) return "INTL";
  if (has(defaultKey)) return defaultKey;
  return regions[0]?.key ?? "";
}

/** Writes the converted time into every country of the page. International shows the Pakistan time with "PKT". Countries it cannot convert are left as they are. */
export function applyPakistanClassTime(r: RegistrationConfig, startPk: string, endPk: string): RegistrationConfig {
  const pk = convertClassTime(startPk, endPk, "PK");
  if (pk === null) return r;
  return {
    ...r,
    regions: r.regions.map((g) => {
      const t = g.key === "INTL" ? `${pk} PKT` : convertClassTime(startPk, endPk, g.key);
      return t === null ? g : { ...g, classTime: t };
    }),
  };
}
