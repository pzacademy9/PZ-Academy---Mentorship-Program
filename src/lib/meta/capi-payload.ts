import { createHash } from "node:crypto";

export type MetaEvent = {
  event_name: "Purchase";
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: Record<string, string | string[]>;
  custom_data: { value: number; currency: string };
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function sha256Lower(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length < 7 ? "" : digits;
}

export function buildPurchaseEvent(p: {
  registrationId: string;
  email: string;
  whatsapp: string;
  name: string;
  fbp: string;
  fbc: string;
  value: number;
  currency: string;
  eventTimeIso: string;
  sourceUrl: string;
}): MetaEvent {
  const user_data: Record<string, string | string[]> = {};
  const email = p.email.trim();
  if (email) user_data.em = [sha256Lower(email)];
  const phone = normalizePhone(p.whatsapp);
  if (phone) user_data.ph = [sha256Lower(phone)];

  const name = p.name.trim();
  const space = name.indexOf(" ");
  const first = space === -1 ? name : name.slice(0, space);
  const last = space === -1 ? "" : name.slice(space + 1).trim();
  if (first) user_data.fn = [sha256Lower(first)];
  if (last) user_data.ln = [sha256Lower(last)];

  user_data.external_id = [sha256Lower(p.registrationId)];
  if (p.fbp) user_data.fbp = p.fbp;
  if (p.fbc) user_data.fbc = p.fbc;

  return {
    event_name: "Purchase",
    event_time: Math.floor(Date.parse(p.eventTimeIso) / 1000),
    event_id: `purchase-${p.registrationId}`,
    action_source: "website",
    event_source_url: p.sourceUrl,
    user_data,
    custom_data: { value: p.value, currency: p.currency.toUpperCase() },
  };
}

export function isTooOld(eventTimeIso: string, now: Date): boolean {
  return now.getTime() - Date.parse(eventTimeIso) > SEVEN_DAYS_MS;
}
