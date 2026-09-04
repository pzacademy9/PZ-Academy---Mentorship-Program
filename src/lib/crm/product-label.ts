/**
 * Best-effort parse of the free-text "Registration Option" column into
 * structured price data. Pure — no I/O.
 *
 * Best-effort is the contract: the raw label is always stored alongside
 * whatever this extracts, so an unparsed label costs nothing and never
 * blocks an import. Returning nulls is always preferable to guessing.
 */

export type ParsedProduct = {
  amount: number | null;
  currency: "PKR" | "AED" | "SAR" | null;
  isEarlyBird: boolean;
  rowTypeHint: "individual" | "group_leader" | "group_member" | null;
};

const EMPTY: ParsedProduct = { amount: null, currency: null, isEarlyBird: false, rowTypeHint: null };

const CURRENCIES = ["PKR", "AED", "SAR"] as const;

function toNumber(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function parseProductLabel(raw: string | null | undefined): ParsedProduct {
  if (raw == null) return { ...EMPTY };
  const label = raw.trim();
  if (label === "") return { ...EMPTY };

  const isEarlyBird = /\[early bird\]/i.test(label);

  let rowTypeHint: ParsedProduct["rowTypeHint"] = null;
  if (/^individual\b/i.test(label)) rowTypeHint = "individual";
  else if (/^group\b/i.test(label)) rowTypeHint = "group_leader";

  let currency: ParsedProduct["currency"] = null;
  for (const c of CURRENCIES) {
    if (label.includes(c)) {
      currency = c;
      break;
    }
  }

  let amount: number | null = null;
  if (currency) {
    // A group label carries two prices: the bundle total and the per-person
    // rate. The per-person rate is the one that belongs on a contact, so it
    // is matched first and wins.
    const perPerson = label.match(
      new RegExp(`${currency}\\s*([\\d,]+(?:\\.\\d+)?)\\s*/\\s*person`, "i"),
    );
    if (perPerson?.[1]) {
      amount = toNumber(perPerson[1]);
    } else {
      const first = label.match(new RegExp(`${currency}\\s*([\\d,]+(?:\\.\\d+)?)`, "i"));
      if (first?.[1]) amount = toNumber(first[1]);
    }
  }

  return { amount, currency, isEarlyBird, rowTypeHint };
}
