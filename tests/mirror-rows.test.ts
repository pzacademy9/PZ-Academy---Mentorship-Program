import { describe, expect, it } from "vitest";
import { mapSheetRow, rowKey } from "@/lib/landing/mirror/rows";

const HEADER = ["Name", "Email", "WhatsApp", "Profession", "Discovery", "Registration Option", "Consent", "Row Type", "Promo Code", "Voucher URL", "Submitted At", "Expected Amount", "Group Lead Email", "Payment Method", "Amount", "Payment Confirmation", "Email Confirmation", "Source", "Ref ID", "SyncedAt", "AppSyncValue", "Amount Status", "Column 1"];

function cells(over: Record<string, string>): string[] {
  const base: Record<string, string> = {
    Name: "Test Person", Email: "  Test.Person@Example.com ", WhatsApp: "+10000000000", Profession: "Tester", Discovery: "Friend",
    "Registration Option": "Live — Full Course – Individual", Consent: "Yes — accepted T&C", "Row Type": "Individual",
    "Promo Code": "EARLY", "Voucher URL": "https://example.com/v", "Submitted At": "9/15/2026 19:17:27", "Expected Amount": "5000",
    "Group Lead Email": "", "Payment Method": "Bank", Amount: "5000", "Payment Confirmation": "Paid", "Email Confirmation": "",
    Source: "ppc-v2-PK#PZA-PPC-001", "Ref ID": "PZA-PPC-001",
  };
  const m = { ...base, ...over };
  return HEADER.map((h) => m[h] ?? "");
}
const ok = (over: Record<string, string>) => {
  const r = mapSheetRow(HEADER, cells(over));
  if (!r.ok) throw new Error("expected ok, got " + r.reason);
  return r.row;
};
const reason = (over: Record<string, string>) => {
  const r = mapSheetRow(HEADER, cells(over));
  return r.ok ? "ok" : r.reason;
};

describe("mapSheetRow", () => {
  it("maps an individual live full-course row", () => {
    const r = ok({});
    expect(r).toMatchObject({
      email: "test.person@example.com", name: "Test Person", rowType: "individual", mode: "live", tierKey: "individual", groupSize: 1,
      region: "PK", currency: "PKR", expectedAmount: 5000, amountReceived: 5000, status: "paid", consent: true, refId: "PZA-PPC-001",
      promoCodeText: "EARLY", paymentMethod: "Bank", voucherUrl: "https://example.com/v", optionLabel: "Live — Full Course – Individual",
    });
  });
  it("parses Submitted At as M/D/YYYY in Pakistan time", () => {
    expect(ok({}).submittedAt.toISOString()).toBe("2026-09-15T14:17:27.000Z");
    expect(ok({ "Submitted At": "10/3/2026 0:05:09" }).submittedAt.toISOString()).toBe("2026-10-02T19:05:09.000Z");
  });
  it("maps recorded modules", () => {
    expect(ok({ "Registration Option": "Recorded — Modules: M1 – Individual" })).toMatchObject({ mode: "recorded", tierKey: "individual", groupSize: 1 });
  });
  it("maps a group of 3 lead", () => {
    const r = ok({ "Registration Option": "Live — Full Course – Group of 3", "Row Type": "Group Lead" });
    expect(r).toMatchObject({ rowType: "lead", tierKey: "group3", groupSize: 3, mode: "live" });
  });
  it("maps a member with the lead email lowercased", () => {
    const r = ok({ "Row Type": "Group Member", "Group Lead Email": " Lead@Example.com ", Consent: "Covered by Group Lead consent" });
    expect(r).toMatchObject({ rowType: "member", leadEmail: "lead@example.com", consent: false });
  });
  it("derives region and currency from Source", () => {
    expect(ok({ Source: "ppc-v2-UAE#PZA-PPC-009" })).toMatchObject({ region: "UAE", currency: "AED" });
    expect(ok({ Source: "ppc-v2-KSA#X" })).toMatchObject({ region: "KSA", currency: "SAR" });
    expect(ok({ Source: "ppc-v2-PK#X" })).toMatchObject({ region: "PK", currency: "PKR" });
  });
  it("maps the five statuses", () => {
    for (const [t, s] of [["Paid", "paid"], ["Pending", "pending"], ["Reserved", "reserved"], ["Underpaid", "underpaid"], ["Free", "free"]] as const) {
      expect(ok({ "Payment Confirmation": t }).status).toBe(s);
    }
  });
  it("treats a blank status as pending", () => {
    expect(ok({ "Payment Confirmation": "" }).status).toBe("pending");
    expect(ok({ "Payment Confirmation": "   " }).status).toBe("pending");
  });
  it("handles blank amounts and prefixed expected amounts", () => {
    expect(ok({ Amount: "" }).amountReceived).toBeNull();
    expect(ok({ "Expected Amount": "INR 1,200" }).expectedAmount).toBe(1200);
  });
  it("parses Expected Amount after any prefix", () => {
    expect(ok({ "Expected Amount": "Rs. 5000" }).expectedAmount).toBe(5000);
    expect(ok({ "Expected Amount": "PKR. 1,200" }).expectedAmount).toBe(1200);
    expect(ok({ "Expected Amount": "INR 1,200" }).expectedAmount).toBe(1200);
    expect(ok({ "Expected Amount": "4800.50" }).expectedAmount).toBe(4800.5);
    expect(ok({ "Expected Amount": "" }).expectedAmount).toBe(0);
    expect(reason({ "Expected Amount": "abc" })).toBe("bad-amount");
  });
  it("pins the PK/PKR fallback for a blank or unknown Source", () => {
    expect(ok({ Source: "" })).toMatchObject({ region: "PK", currency: "PKR" });
    expect(ok({ Source: "something-else" })).toMatchObject({ region: "PK", currency: "PKR" });
  });
  it("rejects bad rows with a reason", () => {
    expect(reason({ "Payment Confirmation": "Maybe" })).toBe("bad-status");
    expect(reason({ Email: "  " })).toBe("no-email");
    expect(reason({ "Submitted At": "not a date" })).toBe("bad-time");
    expect(reason({ Name: " " })).toBe("no-name");
    expect(reason({ "Registration Option": "Something odd" })).toBe("bad-option");
  });
  it("finds columns by header name, not position", () => {
    const h = [...HEADER].reverse();
    const c = cells({}).reverse();
    expect(mapSheetRow(h, c).ok).toBe(true);
  });
});

describe("rowKey", () => {
  it("lowercases the email and ignores seconds", () => {
    const a = rowKey(" A@B.com ", new Date("2026-09-15T14:17:27Z"));
    const b = rowKey("a@b.COM", new Date("2026-09-15T14:17:59Z"));
    expect(a).toBe("a@b.com|2026-09-15T14:17");
    expect(a).toBe(b);
  });
});
