import { describe, it, expect } from "vitest";
import { parseOldAffiliates, buildInsertSql, summarize } from "../scripts/lib/old-affiliates.mjs";

// Fake people only. Header row mimics the real sheet's names (including its odd spacing).
const HEADER = ["Timestamp", "Full Name", "STATUS", "PROMOCODE", " TEAM COLOR", "Target", "Secured", "Email Address", "Amount ", "Comission Withdral", "Contact Number (with WhatsApp availability)", "City & Country"];
const row = (o: Partial<Record<string, string>>) => [
  o.ts ?? "45686.5", o.name ?? "Fake Person", o.status ?? "SELECTED", o.code ?? "FP12", o.team ?? "Blue", "10", o.secured ?? "3",
  o.email ?? "fake.person@example.com", o.amount ?? "1500", o.withdrawn ?? "500", o.wa ?? "+920000000000", o.city ?? "Lahore, Pakistan",
];
const sheet = (...rows: string[][]) => [["Title row"], HEADER, ...rows];

describe("parseOldAffiliates", () => {
  it("reads code, status, team, secured and money from a good row", () => {
    const { rows, skipped } = parseOldAffiliates(sheet(row({})));
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Fake Person", status: "accepted", code: "FP12", team: "Blue", openingSecured: 3,
      openingCommission: 1500, openingWithdrawn: 500, email: "fake.person@example.com",
    });
  });

  it("keeps an old code like AS47 unchanged", () => {
    const { rows } = parseOldAffiliates(sheet(row({ code: "AS47" })));
    expect(rows[0].code).toBe("AS47");
  });

  it("maps the status words, including the sheet's own spelling DROPED", () => {
    const { rows } = parseOldAffiliates(sheet(row({ code: "AA1", email: "a@example.com", status: "DROPED" }), row({ code: "BB2", email: "b@example.com", status: "Droped" }), row({ code: "CC3", email: "c@example.com", status: "LEFT" })));
    expect(rows.map((r: { status: string }) => r.status)).toEqual(["dropped", "dropped", "left"]);
  });

  it("skips a row without a valid email and says why", () => {
    const { rows, skipped } = parseOldAffiliates(sheet(row({ email: "" }), row({ code: "ZZ9", email: "not-an-email" })));
    expect(rows).toHaveLength(0);
    expect(skipped.map((s: { reason: string }) => s.reason)).toEqual(["no valid email", "no valid email"]);
  });

  it("reports a duplicate email (any capitals) and keeps only the first", () => {
    const { rows, skipped } = parseOldAffiliates(sheet(row({ code: "AA1" }), row({ code: "BB2", email: "FAKE.PERSON@example.com" })));
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe("duplicate email");
  });

  it("never imports a code that is not letters then digits", () => {
    const bad = ["RF283 10%", "12AB", "ABCD1", "AB", "A B1", "", "ab12"];
    const { rows, skipped } = parseOldAffiliates(sheet(...bad.map((code, i) => row({ code, email: `x${i}@example.com` }))));
    expect(rows).toHaveLength(0);
    expect(skipped.every((s: { reason: string }) => s.reason === "odd code")).toBe(true);
    expect(skipped).toHaveLength(bad.length);
  });

  it("reports a repeated code", () => {
    const { rows, skipped } = parseOldAffiliates(sheet(row({ code: "AA1" }), row({ code: "AA1", email: "other@example.com" })));
    expect(rows).toHaveLength(1);
    expect(skipped[0].reason).toBe("duplicate code");
  });

  it("skips PENDING and empty-status rows, and an unknown team becomes none", () => {
    const { rows, skipped } = parseOldAffiliates(sheet(row({ status: "PENDING" }), row({ code: "QQ5", email: "q@example.com", team: "Purple" })));
    expect(skipped[0].reason).toBe("not selected, dropped or left");
    expect(rows[0].team).toBeNull();
  });

  it("trims a code with a trailing space and reads money with commas", () => {
    const { rows } = parseOldAffiliates(sheet(row({ code: "AB123 ", amount: "PKR 12,500" })));
    expect(rows[0].code).toBe("AB123");
    expect(rows[0].openingCommission).toBe(12500);
  });
});

describe("buildInsertSql / summarize", () => {
  const { rows } = parseOldAffiliates(sheet(row({ name: "O'Brien Fake", code: "OB1" })));
  const sql = buildInsertSql(rows, () => "tok-fixed");

  it("inserts imported rows, doing nothing on a repeat, with quotes escaped", () => {
    expect(sql).toMatch(/insert into public\.affiliates/i);
    expect(sql).toMatch(/on conflict do nothing/i);
    expect(sql).toContain("'O''Brien Fake'");
    expect(sql).toContain("'tok-fixed'");
    expect(sql).toMatch(/true/);
    expect(sql).toContain("'OB1'");
  });
  it("writes nothing for no rows", () => {
    expect(buildInsertSql([], () => "t")).toBe("");
  });
  it("summary has counts and totals but no names or emails", () => {
    const text = summarize(rows, [{ rowNumber: 5, reason: "odd code" }]);
    expect(text).toContain("accepted");
    expect(text).toContain("1500");
    expect(text).toContain("odd code");
    expect(text).not.toMatch(/O'Brien|example\.com/);
  });
});
