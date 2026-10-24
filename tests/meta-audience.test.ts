import { describe, it, expect } from "vitest";
import { sha256Lower } from "@/lib/meta/capi-payload";
import {
  buildMetaRows,
  toMetaCsv,
  metaCsvFilename,
  buildPlainRows,
  toPlainCsv,
  type AudienceContact,
} from "@/lib/crm/meta-audience";

const contact = (over: Partial<AudienceContact> = {}): AudienceContact => ({
  id: "c1",
  email: "ali@example.com",
  phoneE164: "+923001234567",
  fullName: "Ali Raza Khan",
  country: "PK",
  emailUnsubscribedAt: null,
  whatsappUnsubscribedAt: null,
  doNotContactAt: null,
  emailSuppressed: false,
  ...over,
});

describe("buildMetaRows", () => {
  it("splits the name into first word and the rest, hashed", () => {
    const { rows } = buildMetaRows([contact()]);
    expect(rows[0].fn).toBe(sha256Lower("ali"));
    expect(rows[0].ln).toBe(sha256Lower("raza khan"));
  });

  it("hashes the phone as digits without the plus", () => {
    const { rows } = buildMetaRows([contact()]);
    expect(rows[0].phone).toBe(sha256Lower("923001234567"));
  });

  it("blanks email but keeps phone when email is unsubscribed", () => {
    const { rows, dropped } = buildMetaRows([
      contact({ emailUnsubscribedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(rows[0].email).toBe("");
    expect(rows[0].phone).toBe(sha256Lower("923001234567"));
    expect(dropped).toBe(0);
  });

  it("blanks email when suppressed", () => {
    const { rows } = buildMetaRows([contact({ emailSuppressed: true })]);
    expect(rows[0].email).toBe("");
  });

  it("blanks phone but keeps email when whatsapp is unsubscribed", () => {
    const { rows } = buildMetaRows([
      contact({ whatsappUnsubscribedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(rows[0].phone).toBe("");
    expect(rows[0].email).toBe(sha256Lower("ali@example.com"));
  });

  it("drops do-not-contact rows and counts them", () => {
    const { rows, dropped } = buildMetaRows([
      contact({ doNotContactAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(rows).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it("drops rows with no identifier left", () => {
    const { rows, dropped } = buildMetaRows([
      contact({ email: null, phoneE164: null }),
      contact({
        id: "c2",
        emailUnsubscribedAt: "2026-01-01T00:00:00Z",
        whatsappUnsubscribedAt: "2026-01-01T00:00:00Z",
      }),
    ]);
    expect(rows).toHaveLength(0);
    expect(dropped).toBe(2);
  });

  it("dedupes by hashed email", () => {
    const { rows } = buildMetaRows([
      contact(),
      contact({ id: "c2", email: " ALI@example.com ", phoneE164: null }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("dedupes by hashed phone when there is no email", () => {
    const { rows } = buildMetaRows([
      contact({ email: null }),
      contact({ id: "c2", email: null }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("hashes a two-letter country in lowercase and blanks others", () => {
    expect(buildMetaRows([contact()]).rows[0].country).toBe(sha256Lower("pk"));
    expect(
      buildMetaRows([contact({ country: "Pakistan" })]).rows[0].country,
    ).toBe("");
    expect(buildMetaRows([contact({ country: null })]).rows[0].country).toBe(
      "",
    );
  });
});

describe("toMetaCsv", () => {
  it("starts with Meta's exact header and uses newline separators", () => {
    const { rows } = buildMetaRows([contact()]);
    const csv = toMetaCsv(rows);
    expect(csv.split("\n")[0]).toBe("email,phone,fn,ln,country");
    expect(csv).not.toContain("\r");
    expect(csv.split("\n")[1].split(",")).toHaveLength(5);
  });
});

describe("metaCsvFilename", () => {
  it("slugs the names and appends the dated suffix", () => {
    const name = metaCsvFilename(
      ["DIT Batch 1 (paid)"],
      new Date("2026-10-24T10:00:00Z"),
    );
    expect(name).toBe("dit-batch-1-paid-meta-audience-2026-10-24.csv");
  });

  it("caps the slug at 80 characters", () => {
    const name = metaCsvFilename(
      ["x".repeat(200)],
      new Date("2026-10-24T10:00:00Z"),
    );
    expect(name.replace("-meta-audience-2026-10-24.csv", "").length).toBe(80);
  });

  it("plain variant adds -plain- before meta-audience; hashed unchanged", () => {
    const d = new Date("2026-10-24T10:00:00Z");
    expect(metaCsvFilename(["DIT Batch 1 (paid)"], d, "plain")).toBe(
      "dit-batch-1-paid-plain-meta-audience-2026-10-24.csv",
    );
    expect(metaCsvFilename(["DIT Batch 1 (paid)"], d, "hashed")).toBe(
      "dit-batch-1-paid-meta-audience-2026-10-24.csv",
    );
  });
});

describe("buildPlainRows", () => {
  it("returns plain lowercased email, +E.164 phone, split name and uppercase country", () => {
    const { rows } = buildPlainRows([contact({ email: " Ali@Example.COM " })]);
    expect(rows[0]).toEqual({
      email: "ali@example.com",
      phone: "+923001234567",
      fn: "Ali",
      ln: "Raza Khan",
      country: "PK",
    });
  });

  it("collapses whitespace in names and handles single names", () => {
    expect(
      buildPlainRows([contact({ fullName: "  Ali   Raza    Khan " })]).rows[0].ln,
    ).toBe("Raza Khan");
    const single = buildPlainRows([contact({ fullName: "Madonna" })]).rows[0];
    expect(single.fn).toBe("Madonna");
    expect(single.ln).toBe("");
  });

  it("uppercases a two-letter country and blanks others", () => {
    expect(buildPlainRows([contact({ country: "pk" })]).rows[0].country).toBe("PK");
    expect(buildPlainRows([contact({ country: "Pakistan" })]).rows[0].country).toBe("");
    expect(buildPlainRows([contact({ country: null })]).rows[0].country).toBe("");
  });

  it("blank phone when there is none", () => {
    expect(buildPlainRows([contact({ phoneE164: null })]).rows[0].phone).toBe("");
  });

  it("blanks email when unsubscribed or suppressed", () => {
    expect(
      buildPlainRows([contact({ emailUnsubscribedAt: "2026-01-01T00:00:00Z" })]).rows[0].email,
    ).toBe("");
    expect(buildPlainRows([contact({ emailSuppressed: true })]).rows[0].email).toBe("");
  });

  it("blanks phone but keeps email when whatsapp is unsubscribed", () => {
    const { rows } = buildPlainRows([
      contact({ whatsappUnsubscribedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(rows[0].phone).toBe("");
    expect(rows[0].email).toBe("ali@example.com");
  });

  it("drops do-not-contact and empty rows, counting them", () => {
    const { rows, dropped } = buildPlainRows([
      contact({ doNotContactAt: "2026-01-01T00:00:00Z" }),
      contact({ id: "c2", email: null, phoneE164: null }),
      contact({
        id: "c3",
        emailUnsubscribedAt: "2026-01-01T00:00:00Z",
        whatsappUnsubscribedAt: "2026-01-01T00:00:00Z",
      }),
    ]);
    expect(rows).toHaveLength(0);
    expect(dropped).toBe(3);
  });

  it("dedupes by email, else by phone", () => {
    expect(
      buildPlainRows([
        contact(),
        contact({ id: "c2", email: " ALI@example.com ", phoneE164: null }),
      ]).rows,
    ).toHaveLength(1);
    expect(
      buildPlainRows([contact({ email: null }), contact({ id: "c2", email: null })]).rows,
    ).toHaveLength(1);
  });

  it("matches the hashed builder on row count and dropped count", () => {
    const input = [
      contact(),
      contact({ id: "c2", email: "ALI@example.com" }),
      contact({ id: "c3", doNotContactAt: "2026-01-01T00:00:00Z" }),
      contact({ id: "c4", email: null, phoneE164: null }),
      contact({ id: "c5", email: "b@x.com", phoneE164: null, emailSuppressed: true }),
      contact({ id: "c6", email: null, whatsappUnsubscribedAt: "2026-01-01T00:00:00Z" }),
    ];
    const h = buildMetaRows(input);
    const p = buildPlainRows(input);
    expect(p.rows).toHaveLength(h.rows.length);
    expect(p.dropped).toBe(h.dropped);
  });
});

describe("toPlainCsv", () => {
  const row = (over: Partial<ReturnType<typeof buildPlainRows>["rows"][number]> = {}) => ({
    email: "a@x.com",
    phone: "+923001234567",
    fn: "Ali",
    ln: "Khan",
    country: "PK",
    ...over,
  });

  it("uses the exact header, newline endings and a trailing newline", () => {
    const csv = toPlainCsv([row()]);
    expect(csv).toBe("email,phone,fn,ln,country\na@x.com,+923001234567,Ali,Khan,PK\n");
    expect(csv).not.toContain("\r");
  });

  it("quotes values containing comma, quote or newline and doubles quotes", () => {
    const csv = toPlainCsv([row({ ln: 'Khan, "Jr"' }), row({ fn: "A\nB" })]);
    expect(csv).toContain('"Khan, ""Jr"""');
    expect(csv).toContain('"A\nB"');
  });

  it("strips formula-injection leading characters from names", () => {
    const csv = toPlainCsv([row({ fn: "=cmd", ln: "@SUM(1)" }), row({ fn: "\tx", ln: "\rY" })]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("a@x.com,+923001234567,cmd,SUM(1),PK");
    expect(lines[2]).toBe("a@x.com,+923001234567,x,Y,PK");
    expect(csv).not.toMatch(/,[=@]/);
  });

  it("never touches the leading plus of a phone", () => {
    expect(toPlainCsv([row()])).toContain(",+923001234567,");
  });

  it("header only for no rows", () => {
    expect(toPlainCsv([])).toBe("email,phone,fn,ln,country\n");
  });
});
