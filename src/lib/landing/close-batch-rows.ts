/**
 * Maps landing registrations to the `p_rows` shape consumed by the
 * `landing_close_batch` Postgres function (migration 0086). Pure: no I/O.
 * Never logs raw emails or phone numbers.
 */

import { normalizePhone } from "@/lib/crm/phone";

export type RegRow = {
  id: string;
  row_type: "individual" | "lead" | "member";
  lead_registration_id: string | null;
  name: string;
  email: string;
  whatsapp: string;
  profession: string;
  discovery: string;
  consent: boolean;
  status: string;
  expected_amount: number;
  currency: string;
  promo_code_text: string;
  created_at: string;
  status_changed_at: string | null;
  is_test: boolean;
};

export type CloseRow = {
  rowRef: string;
  bucket: "paid" | "interested";
  contact: {
    email: string | null;
    phoneE164: string | null;
    phoneRaw: string | null;
    fullName: string;
    profession: string | null;
    country: string | null;
    discoverySource: "instagram" | "facebook" | "whatsapp" | "other" | "unknown";
  };
  purchase: {
    amount: number | null;
    currency: string | null;
    rowType: "individual" | "group_leader" | "group_member";
    promoCode: string | null;
    purchasedAt: string;
  };
};

export type SkipReason = "test" | "no-contact-details" | "interested-without-consent";

export type MapResult = {
  rows: CloseRow[];
  paid: number;
  interested: number;
  skipped: { id: string; reason: SkipReason }[];
};

const ROW_TYPE = {
  individual: "individual",
  lead: "group_leader",
  member: "group_member",
} as const;

function discoverySource(text: string): CloseRow["contact"]["discoverySource"] {
  const t = text.trim().toLowerCase();
  if (t === "") return "unknown";
  if (t.includes("instagram")) return "instagram";
  if (t.includes("facebook")) return "facebook";
  if (t.includes("whatsapp")) return "whatsapp";
  return "other";
}

export function mapRegistrations(regs: RegRow[]): MapResult {
  const byId = new Map(regs.map((r) => [r.id, r]));
  const rows: CloseRow[] = [];
  const skipped: MapResult["skipped"] = [];
  let paid = 0;
  let interested = 0;

  for (const r of regs) {
    if (r.is_test) {
      skipped.push({ id: r.id, reason: "test" });
      continue;
    }

    const bucket: CloseRow["bucket"] = r.status === "paid" ? "paid" : "interested";

    if (bucket === "interested") {
      const consent =
        r.row_type === "member"
          ? (r.lead_registration_id ? byId.get(r.lead_registration_id)?.consent : undefined) === true
          : r.consent === true;
      if (!consent) {
        skipped.push({ id: r.id, reason: "interested-without-consent" });
        continue;
      }
    }

    const email = r.email.trim().toLowerCase();
    const phone = normalizePhone(r.whatsapp);
    if (email === "" && !phone.ok) {
      skipped.push({ id: r.id, reason: "no-contact-details" });
      continue;
    }

    const rawPhone = r.whatsapp.trim();
    rows.push({
      rowRef: r.id,
      bucket,
      contact: {
        email: email === "" ? null : email,
        phoneE164: phone.ok ? phone.e164 : null,
        phoneRaw: rawPhone === "" ? null : rawPhone,
        fullName: r.name.trim(),
        profession: r.profession.trim() === "" ? null : r.profession.trim(),
        country: phone.ok ? phone.country : null,
        discoverySource: discoverySource(r.discovery),
      },
      purchase: {
        amount: r.row_type === "member" ? null : r.expected_amount,
        currency: r.currency.trim() === "" ? null : r.currency.trim(),
        rowType: ROW_TYPE[r.row_type],
        promoCode: r.promo_code_text.trim() === "" ? null : r.promo_code_text.trim(),
        purchasedAt: r.status_changed_at ?? r.created_at,
      },
    });
    if (bucket === "paid") paid += 1;
    else interested += 1;
  }

  return { rows, paid, interested, skipped };
}
