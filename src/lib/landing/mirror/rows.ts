// src/lib/landing/mirror/rows.ts
// Maps one CSV row of the registrations sheet to a typed row, or says why it was skipped.
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { parseSheetAmount, parseSheetStatus } from "@/lib/landing/registration/sheet-sync-engine";

export interface MirrorSheetRow {
  key: string; email: string; submittedAt: Date; name: string; whatsapp: string; profession: string; discovery: string;
  consent: boolean; rowType: "individual" | "lead" | "member"; leadEmail: string; optionLabel: string;
  mode: "live" | "recorded"; tierKey: string; groupSize: number; region: string; currency: string; promoCodeText: string;
  expectedAmount: number; paymentMethod: string; voucherUrl: string; status: RegistrationStatus;
  amountReceived: number | null; emailStatusText: string; refId: string;
}

export type MapResult =
  | { ok: true; row: MirrorSheetRow }
  | { ok: false; reason: "no-email" | "bad-status" | "bad-time" | "no-name" | "bad-option" };

// Region keys and currencies match REGION_PRESETS in registration/admin-edit.ts.
const CURRENCY: Record<string, string> = { PK: "PKR", UAE: "AED", KSA: "SAR", PH: "PHP", IN: "INR", INTL: "USD" };

export function rowKey(email: string, submittedAt: Date): string {
  return email.trim().toLowerCase() + "|" + submittedAt.toISOString().slice(0, 16);
}

// The sheet writes Submitted At as US-order "M/D/YYYY H:mm:ss" (e.g. 9/15/2026 19:17:27), in Pakistan time (UTC+5).
function parseSubmittedAt(text: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [mo, d, y, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h - 5, mi, s);
  const back = new Date(t + 5 * 3600_000);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null; // e.g. 2/31
  return new Date(t);
}

// "Live — Full Course – Individual", "Recorded — Modules: M1 – Individual", "Live — Full Course – Group of 3".
function parseOption(label: string): { mode: "live" | "recorded"; tierKey: string; groupSize: number } | null {
  const t = label.trim().toLowerCase();
  const mode = t.startsWith("live") ? "live" : t.startsWith("recorded") ? "recorded" : null;
  if (!mode) return null;
  if (/[–-]\s*individual\s*$/.test(t)) return { mode, tierKey: "individual", groupSize: 1 };
  const g = /group of (\d+)(\s+or more)?\s*$/.exec(t);
  if (g) {
    const n = Number(g[1]);
    return { mode, tierKey: g[2] ? "group3plus" : `group${n}`, groupSize: n };
  }
  const p = /group \((\d+) or more\)\s*$/.exec(t);
  if (p) return { mode, tierKey: "group3plus", groupSize: Number(p[1]) };
  return null;
}

function regionFromSource(source: string): string {
  const m = /-(PK|UAE|KSA|PH|IN|INTL)(?:#|$)/i.exec(source.trim());
  return m ? m[1].toUpperCase() : "PK"; // assumption: unlabelled sources are Pakistan
}

export function mapSheetRow(header: string[], cells: string[]): MapResult {
  const idx = new Map<string, number>();
  header.forEach((h, i) => { if (!idx.has(h.trim())) idx.set(h.trim(), i); });
  const get = (name: string) => {
    const i = idx.get(name);
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };

  const email = get("Email").toLowerCase();
  if (!email) return { ok: false, reason: "no-email" };
  const submittedAt = parseSubmittedAt(get("Submitted At"));
  if (!submittedAt) return { ok: false, reason: "bad-time" };
  const name = get("Name");
  if (!name) return { ok: false, reason: "no-name" };
  const status = parseSheetStatus(get("Payment Confirmation"));
  if (!status) return { ok: false, reason: "bad-status" };
  const opt = parseOption(get("Registration Option"));
  if (!opt) return { ok: false, reason: "bad-option" };

  const rt = get("Row Type").toLowerCase();
  const rowType = rt === "group lead" ? "lead" : rt === "group member" ? "member" : "individual";
  const amt = parseSheetAmount(get("Amount"));
  const expectedDigits = get("Expected Amount").replace(/[^\d.]/g, "");
  const expected = Number(expectedDigits);
  const region = regionFromSource(get("Source"));

  return {
    ok: true,
    row: {
      key: rowKey(email, submittedAt), email, submittedAt, name, whatsapp: get("WhatsApp"), profession: get("Profession"),
      discovery: get("Discovery"), consent: get("Consent").toLowerCase().startsWith("yes"), rowType,
      leadEmail: get("Group Lead Email").toLowerCase(), optionLabel: get("Registration Option"),
      mode: opt.mode, tierKey: opt.tierKey, groupSize: opt.groupSize, region, currency: CURRENCY[region],
      promoCodeText: get("Promo Code"), expectedAmount: Number.isFinite(expected) ? expected : 0,
      paymentMethod: get("Payment Method"), voucherUrl: get("Voucher URL"), status,
      amountReceived: typeof amt === "number" ? amt : null, emailStatusText: get("Email Confirmation"), refId: get("Ref ID"),
    },
  };
}
