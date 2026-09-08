import { normalizePhone } from "./phone";
import { normalizeEmail, normalizeName } from "./identity";
import { parseProductLabel } from "./product-label";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Column mapping and row parsing for the sheet import. Pure — no I/O.
 *
 * Header names are consistent enough across the 25 cohort sheets that
 * guessing lands most of the time, but the guess is always presented to an
 * admin for confirmation before anything is written. An unrecognised header
 * maps to null rather than to a plausible-looking column: a silently
 * mis-mapped column is far more expensive than an unmapped one.
 */

export type DiscoverySource = Database["public"]["Enums"]["crm_discovery_source"];
export type RowType = Database["public"]["Enums"]["crm_row_type"];

export type ColumnMapping = {
  name: number | null;
  email: number | null;
  phone: number | null;
  profession: number | null;
  discovery: number | null;
  product: number | null;
  rowType: number | null;
  promoCode: number | null;
};

export type ParsedContact = {
  email: string | null;
  phoneE164: string | null;
  phoneRaw: string | null;
  fullName: string;
  profession: string | null;
  country: string | null;
  discoverySource: DiscoverySource;
};

export type ParsedPurchase = {
  productLabel: string;
  amount: number | null;
  currency: string | null;
  isEarlyBird: boolean;
  rowType: RowType;
  promoCode: string | null;
};

export type ParsedRow =
  | { ok: true; rowRef: string; contact: ParsedContact; purchase: ParsedPurchase }
  | { ok: false; rowRef: string; reason: "no-identity" };

/**
 * Header aliases, checked as substrings of the lowercased header. Ordering
 * within each list does not matter; ordering BETWEEN fields does not either,
 * because each field scans all headers independently.
 */
const ALIASES: Record<keyof ColumnMapping, string[]> = {
  name: ["full name", "name"],
  email: ["e-mail", "email"],
  phone: ["whatsapp", "phone", "mobile", "contact number"],
  profession: ["profession", "occupation", "designation"],
  discovery: ["discovery", "how did you", "hear about", "source"],
  product: ["registration option", "registration", "package", "option"],
  rowType: ["row type", "registration type"],
  promoCode: ["promo code", "promo", "referral code", "coupon"],
};

// Strip everything but letters and digits so a spaced Title Case header
// ("Row Type") and its camelCase equivalent ("rowType") compare equal. The
// website form sheets use camelCase; the older master sheets use spaces.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(squash);

  function find(field: keyof ColumnMapping): number | null {
    for (const alias of ALIASES[field]) {
      const needle = squash(alias);
      const index = normalized.findIndex((h) => h.includes(needle));
      if (index !== -1) return index;
    }
    return null;
  }

  return {
    name: find("name"),
    email: find("email"),
    phone: find("phone"),
    profession: find("profession"),
    discovery: find("discovery"),
    product: find("product"),
    rowType: find("rowType"),
    promoCode: find("promoCode"),
  };
}

function cell(row: string[], index: number | null): string {
  if (index == null) return "";
  return (row[index] ?? "").trim();
}

function toDiscoverySource(raw: string): DiscoverySource {
  const value = raw.trim().toLowerCase();
  if (value === "") return "unknown";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("whatsapp")) return "whatsapp";
  return "other";
}

function toRowType(explicit: string, hint: ReturnType<typeof parseProductLabel>["rowTypeHint"]): RowType {
  // The explicit "Row Type" column wins over the label hint: a group member
  // shares the group leader's product label but is not a leader.
  const value = explicit.trim().toLowerCase();
  // "lead" not "leader": the form sheets say "Group Lead", the older sheets
  // "Group Leader". Member is checked first so a stray "lead" in a member
  // label can never win.
  if (value.includes("member")) return "group_member";
  if (value.includes("lead")) return "group_leader";
  if (value.includes("individual")) return "individual";
  return hint ?? "individual";
}

export function parseSheetRow(
  row: string[],
  mapping: ColumnMapping,
  rowIndex: number,
  tabName: string,
): ParsedRow {
  // Data row 0 is sheet row 2 — row 1 is the header. This ref is the
  // idempotency key stored on contact_purchases, so it must stay stable
  // across re-imports of the same sheet.
  const rowRef = `${tabName}!${rowIndex + 2}`;

  const email = normalizeEmail(cell(row, mapping.email));
  const phoneRawValue = cell(row, mapping.phone);
  const phone = normalizePhone(phoneRawValue);
  const phoneE164 = phone.ok ? phone.e164 : null;

  // A row with no usable identifier can be neither deduplicated nor
  // contacted. Importing it would create an unreachable orphan.
  if (!email && !phoneE164) return { ok: false, rowRef, reason: "no-identity" };

  const productLabel = cell(row, mapping.product);
  const parsedProduct = parseProductLabel(productLabel);

  const currencyCountry = parsedProduct.currency === "AED" ? "AE" : parsedProduct.currency === "SAR" ? "SA" : null;

  return {
    ok: true,
    rowRef,
    contact: {
      email,
      phoneE164,
      phoneRaw: phoneRawValue === "" ? null : phoneRawValue,
      fullName: normalizeName(cell(row, mapping.name)),
      profession: cell(row, mapping.profession) || null,
      country: phone.ok ? phone.country : currencyCountry,
      discoverySource: toDiscoverySource(cell(row, mapping.discovery)),
    },
    purchase: {
      productLabel,
      amount: parsedProduct.amount,
      currency: parsedProduct.currency,
      isEarlyBird: parsedProduct.isEarlyBird,
      rowType: toRowType(cell(row, mapping.rowType), parsedProduct.rowTypeHint),
      promoCode: cell(row, mapping.promoCode) || null,
    },
  };
}
