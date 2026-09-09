import { describe, it, expect } from "vitest";
import { guessColumnMapping, parseSheetRow } from "@/lib/crm/import-mapping";

// Verbatim header row from the MDC3 Master Sheet, tab "Form Responses 1".
const HEADERS = ["Name", "Email", "WhatsApp", "Profession", "Discovery", "Registration Option", "Consent", "Row Type", "Promo Code"];

describe("guessColumnMapping", () => {
  it("maps every known header by index", () => {
    expect(guessColumnMapping(HEADERS)).toEqual({
      name: 0, email: 1, phone: 2, profession: 3,
      discovery: 4, product: 5, rowType: 7, promoCode: 8, purchasedAt: null,
    });
  });

  it("matches headers case-insensitively and ignores surrounding whitespace", () => {
    const mapping = guessColumnMapping(["  FULL NAME ", "E-mail Address", "Phone Number"]);
    expect(mapping.name).toBe(0);
    expect(mapping.email).toBe(1);
    expect(mapping.phone).toBe(2);
  });

  it("leaves unknown fields null rather than guessing a column", () => {
    const mapping = guessColumnMapping(["Timestamp", "Notes"]);
    expect(mapping.name).toBeNull();
    expect(mapping.email).toBeNull();
    expect(mapping.phone).toBeNull();
  });

  it("matches camelCase form-builder headers (rowType, regOption, promoCode)", () => {
    // The website form sheets use camelCase headers with no spaces; the older
    // master sheets use spaced Title Case. The guess must handle both.
    const headers = ["Name", "Email", "whatsapp", "profession", "discovery", "regOption", "consent", "rowType", "promoCode", "voucherUrl", "groupLeadEmail"];
    const mapping = guessColumnMapping(headers);
    expect(mapping).toEqual({
      name: 0, email: 1, phone: 2, profession: 3,
      discovery: 4, product: 5, rowType: 7, promoCode: 8, purchasedAt: null,
    });
  });

  it("maps a Timestamp or submittedAt header to purchasedAt", () => {
    expect(guessColumnMapping(["Timestamp", "Name", "Email"]).purchasedAt).toBe(0);
    expect(guessColumnMapping(["Name", "Email", "submittedAt"]).purchasedAt).toBe(2);
  });
});

describe("parseSheetRow", () => {
  const mapping = guessColumnMapping(HEADERS);

  it("parses a complete individual row", () => {
    const row = ["Almas Raza", "almasraza07@gmail.com", "3234267102", "Fresh Graduate", "Instagram", "Individual — PKR 2,700", "Yes — accepted T&C", "Individual", ""];
    const parsed = parseSheetRow(row, mapping, 0, "Form Responses 1");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rowRef).toBe("Form Responses 1!2");
    expect(parsed.contact).toEqual({
      email: "almasraza07@gmail.com",
      phoneE164: "+923234267102",
      phoneRaw: "3234267102",
      fullName: "Almas Raza",
      profession: "Fresh Graduate",
      country: "PK",
      discoverySource: "instagram",
    });
    expect(parsed.purchase.amount).toBe(2700);
    expect(parsed.purchase.currency).toBe("PKR");
    expect(parsed.purchase.rowType).toBe("individual");
    expect(parsed.purchase.isEarlyBird).toBe(false);
  });

  it("builds a row ref that accounts for the header row", () => {
    // Data row 0 is sheet row 2. This ref is the idempotency key, so an
    // off-by-one here means re-importing silently duplicates everything.
    const row = ["X", "x@y.com", "3234267102", "", "", "", "", "", ""];
    expect(parseSheetRow(row, mapping, 5, "Sheet1").rowRef).toBe("Sheet1!7");
  });

  it("keeps the raw phone and leaves e164 null when normalization is ambiguous", () => {
    const row = ["Bad Phone", "bad@x.com", "N/A", "", "Facebook", "Individual — PKR 2,700", "", "Individual", ""];
    const parsed = parseSheetRow(row, mapping, 0, "S");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.contact.phoneE164).toBeNull();
    expect(parsed.contact.phoneRaw).toBe("N/A");
  });

  it("reads the explicit Row Type column in preference to the label hint", () => {
    // The label says "Group" (leader) but the sheet marks this person a
    // member. The explicit column is authoritative.
    const row = ["Aneera", "aneera188@gmail.com", "92 370 5109810", "PharmD Student", "Instagram", "Group — PKR 6,480 (3 × PKR 2,160/person) [Early Bird]", "Covered by Group Leader", "Group Member", "PZ-AHMED"];
    const parsed = parseSheetRow(row, mapping, 0, "S");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.purchase.rowType).toBe("group_member");
    expect(parsed.purchase.amount).toBe(2160);
    expect(parsed.purchase.promoCode).toBe("PZ-AHMED");
  });

  it("reads Group Lead / Group Member from the explicit column on a camelCase sheet", () => {
    // Verbatim from the MEP Batch 1 Master Sheet: the row-type column is
    // "rowType" and its values are "Group Lead" / "Group Member", not the
    // "leader" spelling the older sheets use.
    const mepHeaders = ["Name", "Email", "whatsapp", "profession", "discovery", "regOption", "consent", "rowType", "promoCode"];
    const mepMapping = guessColumnMapping(mepHeaders);
    const groupLabel = "Complete Course — Module 1 & Module 2 — Group — PKR 8,400 (3 × PKR 2,800/person)";
    const rowTypeFor = (rowType: string) => {
      const row = ["A Person", "person@x.com", "3001234567", "", "", groupLabel, "", rowType, ""];
      const parsed = parseSheetRow(row, mepMapping, 0, "S");
      return parsed.ok ? parsed.purchase.rowType : null;
    };
    expect(rowTypeFor("Group Lead")).toBe("group_leader");
    expect(rowTypeFor("Group Member")).toBe("group_member");
    expect(rowTypeFor("Individual")).toBe("individual");
    expect(rowTypeFor("")).toBe("group_leader"); // falls back to the label hint
  });

  it("normalizes the discovery source to a known enum value", () => {
    const build = (discovery: string) => {
      const row = ["N", "n@x.com", "3234267102", "", discovery, "", "", "", ""];
      const parsed = parseSheetRow(row, mapping, 0, "S");
      return parsed.ok ? parsed.contact.discoverySource : null;
    };
    expect(build("Instagram")).toBe("instagram");
    expect(build("facebook")).toBe("facebook");
    expect(build("WhatsApp Group")).toBe("whatsapp");
    expect(build("A friend told me")).toBe("other");
    expect(build("")).toBe("unknown");
  });

  it("parses a mapped Timestamp cell into an ISO purchasedAt", () => {
    const tsHeaders = ["Timestamp", "Name", "Email", "WhatsApp"];
    const tsMapping = guessColumnMapping(tsHeaders);
    const row = ["8/5/2026 11:36:02", "Almas", "almas@x.com", "3234267102"];
    const parsed = parseSheetRow(row, tsMapping, 0, "S");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.purchase.purchasedAt).toBe(new Date("8/5/2026 11:36:02").toISOString());
  });

  it("leaves purchasedAt null when the timestamp cell is unparseable", () => {
    const tsHeaders = ["Timestamp", "Name", "Email", "WhatsApp"];
    const tsMapping = guessColumnMapping(tsHeaders);
    const row = ["not a date", "Almas", "almas@x.com", "3234267102"];
    const parsed = parseSheetRow(row, tsMapping, 0, "S");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.purchase.purchasedAt).toBeNull();
  });

  it("leaves purchasedAt null when no timestamp column is mapped", () => {
    const row = ["Almas Raza", "almasraza07@gmail.com", "3234267102", "", "", "", "", "", ""];
    const parsed = parseSheetRow(row, mapping, 0, "Form Responses 1");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.purchase.purchasedAt).toBeNull();
  });

  it("rejects a row with neither a usable email nor a usable phone", () => {
    // Such a row cannot be deduplicated or contacted, so importing it would
    // create an unreachable orphan that pollutes every future count.
    const row = ["Ghost", "not-an-email", "N/A", "", "", "", "", "", ""];
    const parsed = parseSheetRow(row, mapping, 3, "S");
    expect(parsed).toEqual({ ok: false, rowRef: "S!5", reason: "no-identity" });
  });
});
