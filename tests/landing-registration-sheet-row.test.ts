// tests/landing-registration-sheet-row.test.ts
import { describe, it, expect } from "vitest";
import { SHEET_HEADERS, toSheetRow, sheetSafe, formatSubmittedAt, type SheetRegistration } from "@/lib/landing/registration/sheet-row";

const lead = (over: Partial<SheetRegistration> = {}): SheetRegistration => ({
  rowType: "lead", name: "Ayesha Khan", email: "ayesha@example.com", whatsapp: "923001234567", profession: "Pharmacist",
  discovery: "WhatsApp", optionLabel: "Live - Full Course - Group of 3", promoCodeText: "ppc10", promoCodeUsed: "PPC10",
  voucherUrl: "https://drive.google.com/file/d/abc/view", submittedAt: "2026-10-13T14:30:00Z", expectedAmount: 11500,
  currency: "PKR", groupLeadEmail: "ayesha@example.com", paymentMethodLabel: "Faysal Bank", amountReceived: null,
  status: "pending", emailStatus: "", source: "landing:ppc-batch-4", refId: "PZA-PPC-001", regionKey: "PK",
  agentName: "Bilal", utmCampaign: "ppc-b4", variantKey: "", ...over,
});

describe("SHEET_HEADERS", () => {
  it("is the legacy A-T layout plus Agent, Promo Code Used, UTM Campaign and Link", () => {
    expect(SHEET_HEADERS).toEqual([
      "Name", "Email", "WhatsApp", "Profession", "Discovery", "Registration Option", "Consent", "Row Type", "Promo Code",
      "Voucher URL", "Submitted At", "Expected Amount", "Group Lead Email", "Payment Method", "Amount", "Payment Confirmation",
      "Email Confirmation", "Source", "Ref ID", "Region", "Agent", "Promo Code Used", "UTM Campaign", "Link",
    ]);
  });
  it("keeps columns A-W at their original indexes and appends Link as X", () => {
    expect(SHEET_HEADERS).toHaveLength(24);
    expect(SHEET_HEADERS[0]).toBe("Name");
    expect(SHEET_HEADERS[18]).toBe("Ref ID");
    expect(SHEET_HEADERS[20]).toBe("Agent");
    expect(SHEET_HEADERS[21]).toBe("Promo Code Used");
    expect(SHEET_HEADERS[22]).toBe("UTM Campaign");
    expect(SHEET_HEADERS[23]).toBe("Link");
  });
});

describe("toSheetRow", () => {
  it("maps a group lead to columns A-X in order", () => {
    expect(toSheetRow(lead())).toEqual([
      "Ayesha Khan", "ayesha@example.com", "923001234567", "Pharmacist", "WhatsApp", "Live - Full Course - Group of 3",
      "Yes — accepted T&C", "Group Lead", "ppc10", "https://drive.google.com/file/d/abc/view", "13 Oct 2026, 19:30 PKT",
      "PKR 11500", "ayesha@example.com", "Faysal Bank", "", "Pending", "", "landing:ppc-batch-4", "PZA-PPC-001", "PK",
      "Bilal", "PPC10", "ppc-b4", "",
    ]);
  });
  it("a member row shows the lead's ref, the lead's consent note and no amount", () => {
    const row = toSheetRow(lead({ rowType: "member", name: "Member One", email: "m1@example.com", expectedAmount: 0 }));
    expect(row).toHaveLength(24);
    expect(row[SHEET_HEADERS.indexOf("Row Type")]).toBe("Group Member");
    expect(row[SHEET_HEADERS.indexOf("Consent")]).toBe("Covered by Group Lead consent");
    expect(row[SHEET_HEADERS.indexOf("Expected Amount")]).toBe("");
    expect(row[SHEET_HEADERS.indexOf("Group Lead Email")]).toBe("ayesha@example.com");
    expect(row[SHEET_HEADERS.indexOf("Ref ID")]).toBe("PZA-PPC-001");
  });
  it("labels individuals, free rows and received amounts", () => {
    const row = toSheetRow(lead({ rowType: "individual", status: "free", amountReceived: 4800 }));
    expect(row[SHEET_HEADERS.indexOf("Row Type")]).toBe("Individual");
    expect(row[SHEET_HEADERS.indexOf("Payment Confirmation")]).toBe("Free");
    expect(row[SHEET_HEADERS.indexOf("Amount")]).toBe("4800");
  });
  it("never lets a typed value become a Sheets formula", () => {
    const row = toSheetRow(lead({ name: '=HYPERLINK("http://evil","x")', whatsapp: "+923001234567" }));
    expect(row[0]).toBe('\'=HYPERLINK("http://evil","x")');
    expect(row[2]).toBe("'+923001234567");
  });
});

describe("Link column", () => {
  it("carries the variant key for a variant registration and blank for the main page", () => {
    const v = toSheetRow(lead({ variantKey: "uae/module-2" }));
    expect(v[23]).toBe("uae/module-2");
    expect(v[SHEET_HEADERS.indexOf("Link")]).toBe("uae/module-2");
    expect(v.slice(0, 23)).toEqual(toSheetRow(lead()).slice(0, 23));
    expect(toSheetRow(lead())[23]).toBe("");
  });
});

describe("sheetSafe and formatSubmittedAt", () => {
  it("prefixes only dangerous leading characters", () => {
    for (const v of ["=1+1", "+92", "-5", "@SUM(A1)", "\tx", "\rx"]) expect(sheetSafe(v)).toBe(`'${v}`);
    for (const v of ["a=b", "Ayesha", "", "92-300"]) expect(sheetSafe(v)).toBe(v);
  });
  it("shows the submit time in Pakistan time and passes junk through", () => {
    expect(formatSubmittedAt("2026-10-13T14:30:00Z")).toBe("13 Oct 2026, 19:30 PKT");
    expect(formatSubmittedAt("not a date")).toBe("not a date");
  });
});
