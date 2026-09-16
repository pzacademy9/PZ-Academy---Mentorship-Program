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

/**
 * The course portion of a registration label, with the tier, price, early-bird
 * and promo suffixes removed — "Complete Course — Module 1 & Module 2 —
 * Individual — PKR 1,960 [Early Bird]" becomes "Complete Course — Module 1 &
 * Module 2", so every price variant of one course collapses to one name.
 *
 * Returns "" when the label names no course (labels like "Individual — PKR
 * 2,700" come from sheets where the cohort itself identified the course).
 * The result is always a PREFIX of the raw label, which is what lets a caller
 * match every variant with a single prefix comparison.
 *
 * A course whose own name contained the word "Individual" or "Group" would be
 * truncated at that word. No such course exists here, and the raw label is
 * always kept alongside, so the cost of being wrong is a filter that groups
 * oddly, never lost data.
 */
export function courseNameFromLabel(raw: string | null | undefined): string {
  if (raw == null) return "";
  const label = raw.trim();
  if (label === "") return "";

  const cutPoints = [
    label.search(/\b(individual|group)\b/i),
    label.search(new RegExp(`\\b(${CURRENCIES.join("|")}|USD)\\b`)),
    label.indexOf("["),
  ].filter((i) => i >= 0);

  const name = cutPoints.length === 0 ? label : label.slice(0, Math.min(...cutPoints));

  // Whatever separator led into the part just removed ("— ", "- ", ", ").
  return name.replace(/[\s—–\-,:|]+$/, "").trim();
}

export function parseProductLabel(raw: string | null | undefined): ParsedProduct {
  if (raw == null) return { ...EMPTY };
  const label = raw.trim();
  if (label === "") return { ...EMPTY };

  const isEarlyBird = /\[early bird\]/i.test(label);

  // The Individual/Group token can lead the label ("Group — PKR …") or sit
  // mid-label ("Complete Course — … — Group — PKR …"), so match it as a
  // whole word anywhere. Individual is tested first: a label carrying both
  // words is an individual seat.
  let rowTypeHint: ParsedProduct["rowTypeHint"] = null;
  if (/\bindividual\b/i.test(label)) rowTypeHint = "individual";
  else if (/\bgroup\b/i.test(label)) rowTypeHint = "group_leader";

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
