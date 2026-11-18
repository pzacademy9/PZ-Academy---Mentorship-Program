import { describe, expect, it } from "vitest";
import { mapRegistrations, type RegRow } from "@/lib/landing/close-batch-rows";

function reg(over: Partial<RegRow> = {}): RegRow {
  return {
    id: "r1",
    row_type: "individual",
    lead_registration_id: null,
    name: "Ayesha Khan",
    email: "Ayesha@Example.com",
    whatsapp: "03001234567",
    profession: "Pharmacist",
    discovery: "Found on Instagram",
    consent: true,
    status: "paid",
    expected_amount: 5000,
    currency: "PKR",
    promo_code_text: "EARLY",
    created_at: "2026-10-01T10:00:00Z",
    status_changed_at: "2026-10-02T10:00:00Z",
    is_test: false,
    mode: "live",
    option_keys: null,
    region: "",
    ...over,
  };
}

describe("mapRegistrations", () => {
  it("maps a paid individual with amount and no consent_basis", () => {
    const out = mapRegistrations([reg()]);
    expect(out.paid).toBe(1);
    expect(out.interested).toBe(0);
    const row = out.rows[0];
    expect(row.bucket).toBe("paid");
    expect(row.rowRef).toBe("r1");
    expect(row.purchase.amount).toBe(5000);
    expect(row.purchase.rowType).toBe("individual");
    expect(row.purchase.purchasedAt).toBe("2026-10-02T10:00:00Z");
    expect(row.contact.discoverySource).toBe("instagram");
    expect(row.contact.phoneE164).toBe("+923001234567");
    expect(row.contact.country).toBe("PK");
    expect(row.contact.email).toBe("ayesha@example.com");
    expect(JSON.stringify(row)).not.toContain("consent_basis");
  });

  it("maps a paid member with null amount and group_member", () => {
    const lead = reg({ id: "L", row_type: "lead" });
    const member = reg({ id: "M", row_type: "member", lead_registration_id: "L", email: "m@x.com" });
    const out = mapRegistrations([lead, member]);
    const m = out.rows.find((r) => r.rowRef === "M")!;
    expect(m.purchase.amount).toBeNull();
    expect(m.purchase.rowType).toBe("group_member");
    expect(out.rows.find((r) => r.rowRef === "L")!.purchase.rowType).toBe("group_leader");
    expect(out.rows.find((r) => r.rowRef === "L")!.purchase.amount).toBe(5000);
  });

  it("excludes a member of an unconsented unpaid lead", () => {
    const lead = reg({ id: "L", row_type: "lead", status: "pending", consent: false });
    const member = reg({ id: "M", row_type: "member", lead_registration_id: "L", status: "pending", consent: true });
    const out = mapRegistrations([lead, member]);
    expect(out.rows).toHaveLength(0);
    expect(out.skipped).toContainEqual({ id: "M", reason: "interested-without-consent" });
    expect(out.skipped).toContainEqual({ id: "L", reason: "interested-without-consent" });
  });

  it("uses the lead's consent for an interested member", () => {
    const lead = reg({ id: "L", row_type: "lead", status: "pending", consent: true });
    const member = reg({ id: "M", row_type: "member", lead_registration_id: "L", status: "pending", consent: false });
    const out = mapRegistrations([lead, member]);
    expect(out.interested).toBe(2);
  });

  it("treats a member whose lead is missing as no consent", () => {
    const member = reg({ id: "M", row_type: "member", lead_registration_id: "gone", status: "pending", consent: true });
    expect(mapRegistrations([member]).skipped[0].reason).toBe("interested-without-consent");
  });

  it("lets paid rows ignore consent", () => {
    expect(mapRegistrations([reg({ consent: false })]).paid).toBe(1);
  });

  it("skips test rows", () => {
    const out = mapRegistrations([reg({ is_test: true })]);
    expect(out.rows).toHaveLength(0);
    expect(out.skipped).toEqual([{ id: "r1", reason: "test" }]);
  });

  it("nulls an invalid phone but keeps the row", () => {
    const out = mapRegistrations([reg({ whatsapp: "abc" })]);
    expect(out.rows[0].contact.phoneE164).toBeNull();
    expect(out.rows[0].contact.country).toBeNull();
  });

  it("skips a row with no email and no valid phone", () => {
    const out = mapRegistrations([reg({ email: " ", whatsapp: "abc" })]);
    expect(out.skipped).toEqual([{ id: "r1", reason: "no-contact-details" }]);
  });

  it("maps discovery text and falls back to purchasedAt created_at", () => {
    const a = mapRegistrations([reg({ discovery: "a friend", status_changed_at: null })]).rows[0];
    expect(a.contact.discoverySource).toBe("other");
    expect(a.purchase.purchasedAt).toBe("2026-10-01T10:00:00Z");
    expect(mapRegistrations([reg({ discovery: "" })]).rows[0].contact.discoverySource).toBe("unknown");
  });

  it("carries mode, option keys and region on the row", () => {
    const row = mapRegistrations([reg({ mode: "recorded", option_keys: ["m1", "m2"], region: "UK" })]).rows[0];
    expect(row.purchase.mode).toBe("recorded");
    expect(row.optionKeys).toEqual(["m1", "m2"]);
    expect(row.region).toBe("UK");
  });

  it("turns an empty region into null and null option keys into []", () => {
    const row = mapRegistrations([reg({ region: "", option_keys: null })]).rows[0];
    expect(row.region).toBeNull();
    expect(row.optionKeys).toEqual([]);
  });

  it("lets a member with blank values inherit its lead's", () => {
    const lead = reg({ id: "L", row_type: "lead", mode: "recorded", option_keys: ["m3"], region: "UAE" });
    const member = reg({ id: "M", row_type: "member", lead_registration_id: "L", email: "m@x.com", mode: "" as RegRow["mode"], option_keys: null, region: "" });
    const m = mapRegistrations([lead, member]).rows.find((r) => r.rowRef === "M")!;
    expect(m.optionKeys).toEqual(["m3"]);
    expect(m.region).toBe("UAE");
    expect(m.purchase.mode).toBe("recorded");
  });

  it("keeps a member's own values when it has them", () => {
    const lead = reg({ id: "L", row_type: "lead", mode: "recorded", option_keys: ["m3"], region: "UAE" });
    const member = reg({ id: "M", row_type: "member", lead_registration_id: "L", email: "m@x.com", mode: "live", option_keys: ["m9"], region: "US" });
    const m = mapRegistrations([lead, member]).rows.find((r) => r.rowRef === "M")!;
    expect(m.optionKeys).toEqual(["m9"]);
    expect(m.region).toBe("US");
    expect(m.purchase.mode).toBe("live");
  });

  it("carries registeredAt equal to created_at on an interested row", () => {
    const row = mapRegistrations([reg({ status: "pending" })]).rows[0];
    expect(row.bucket).toBe("interested");
    expect(row.registeredAt).toBe("2026-10-01T10:00:00Z");
  });
});
