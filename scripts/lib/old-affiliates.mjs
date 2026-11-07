// scripts/lib/old-affiliates.mjs
// Turns the old affiliate sheet (rows of strings) into import rows, and those into SQL. Pure: no files, no database.
const TEAMS = ["Green", "White", "Yellow", "Blue", "Pink"];
const CODE_RE = /^[A-Z]{1,3}\d{1,4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

function statusFor(raw) {
  const s = norm(raw);
  if (s === "selected") return "accepted";
  if (s === "droped" || s === "dropped") return "dropped";
  if (s === "left") return "left";
  return null;
}

function money(raw) {
  const n = Number(String(raw ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Excel stores dates as days since 1899-12-30. */
function isoFromSerial(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 30000 || n > 80000) return null;
  return new Date(Math.round((n - 25569) * 86400000)).toISOString();
}

/**
 * @typedef {{ name: string, email: string, whatsapp: string, cityCountry: string, status: "accepted" | "dropped" | "left", code: string, team: string | null, openingSecured: number, openingCommission: number, openingWithdrawn: number, createdAt: string | null }} OldAffiliate
 * @typedef {{ rowNumber: number, reason: string }} Skipped
 */

/**
 * @param {string[][]} rows sheet rows; the header is on row 2 (index 1).
 * @returns {{ rows: OldAffiliate[], skipped: Skipped[] }}
 */
export function parseOldAffiliates(rows) {
  const header = (rows[1] ?? []).map(norm);
  const col = (test) => header.findIndex(test);
  const colsOf = (test) => header.map((h, i) => (test(h) ? i : -1)).filter((i) => i >= 0);
  const c = {
    ts: col((h) => h === "timestamp"),
    name: col((h) => h === "full name"),
    status: col((h) => h === "status"),
    code: col((h) => h === "promocode"),
    team: col((h) => h === "team color"),
    secured: col((h) => h === "secured"),
    amount: col((h) => h === "amount"),
    withdrawn: col((h) => h === "comission withdral" || h === "commission withdrawal" || h === "commission withdrawn"),
    wa: col((h) => h.startsWith("contact number")),
    city: col((h) => h === "city & country"),
  };
  const emailCols = colsOf((h) => h === "email address");
  const at = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");

  /** @type {OldAffiliate[]} */
  const out = [];
  /** @type {Skipped[]} */
  const skipped = [];
  const seenEmail = new Set();
  const seenCode = new Set();

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowNumber = i + 1;
    if (r.every((v) => String(v ?? "").trim() === "")) continue;
    const skip = (reason) => skipped.push({ rowNumber, reason });

    const status = statusFor(at(r, c.status));
    if (!status) { skip("not selected, dropped or left"); continue; }

    const email = emailCols.map((ci) => at(r, ci).toLowerCase()).find((e) => EMAIL_RE.test(e));
    if (!email) { skip("no valid email"); continue; }

    const code = at(r, c.code);
    if (!CODE_RE.test(code)) { skip("odd code"); continue; }

    if (seenEmail.has(email)) { skip("duplicate email"); continue; }
    if (seenCode.has(code)) { skip("duplicate code"); continue; }
    seenEmail.add(email);
    seenCode.add(code);

    const teamRaw = at(r, c.team).toLowerCase();
    const team = TEAMS.find((t) => t.toLowerCase() === teamRaw) ?? null;

    out.push({
      name: at(r, c.name) || email,
      email,
      whatsapp: at(r, c.wa),
      cityCountry: at(r, c.city),
      status,
      code,
      team,
      openingSecured: Math.max(0, Math.round(money(at(r, c.secured)))),
      openingCommission: money(at(r, c.amount)),
      openingWithdrawn: money(at(r, c.withdrawn)),
      createdAt: isoFromSerial(at(r, c.ts)),
    });
  }
  return { rows: out, skipped };
}

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

/**
 * @param {OldAffiliate[]} rows
 * @param {() => string} makeToken
 * @returns {string}
 */
/** One insert for every row. Repeats (same email or code already in the table) are skipped, never overwritten. */
export function buildInsertSql(rows, makeToken) {
  if (rows.length === 0) return "";
  const values = rows.map((r) => {
    const when = r.createdAt ? q(r.createdAt) : "now()";
    return `  (${[
      q(r.status), q(r.name), q(r.email), q(r.whatsapp), q(r.cityCountry), "'{}'::jsonb", q(r.code), q(makeToken()), q(r.team),
      r.openingSecured, r.openingCommission, r.openingWithdrawn, "true",
      r.status === "accepted" ? when : "null", r.status === "dropped" ? when : "null", r.status === "left" ? when : "null", when,
    ].join(", ")})`;
  });
  return (
    "insert into public.affiliates\n" +
    "  (status, name, email, whatsapp, city_country, answers, code, token, team, opening_secured, opening_commission, opening_withdrawn, is_imported, accepted_at, dropped_at, left_at, created_at)\n" +
    "values\n" +
    values.join(",\n") +
    "\non conflict do nothing;\n"
  );
}

/**
 * Counts and totals only: no names, no emails.
 * @param {OldAffiliate[]} rows
 * @param {Skipped[]} skipped
 * @returns {string}
 */
export function summarize(rows, skipped) {
  /** @type {Record<string, number>} */
  const by = {};
  for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
  /** @param {"openingCommission" | "openingWithdrawn" | "openingSecured"} k */
  const total = (k) => rows.reduce((s, r) => s + r[k], 0);
  /** @type {Record<string, number>} */
  const why = {};
  for (const s of skipped) why[s.reason] = (why[s.reason] ?? 0) + 1;
  const lines = [
    `Rows to import: ${rows.length}`,
    ...Object.entries(by).map(([k, v]) => `  ${k}: ${v}`),
    `Total opening commission: ${total("openingCommission")}`,
    `Total already withdrawn: ${total("openingWithdrawn")}`,
    `Total participants secured: ${total("openingSecured")}`,
    `Rows with no team: ${rows.filter((r) => !r.team).length}`,
    `Rows skipped: ${skipped.length}`,
    ...Object.entries(why).map(([k, v]) => `  ${k}: ${v}`),
  ];
  return lines.join("\n");
}
