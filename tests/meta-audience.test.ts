import { describe, it, expect } from "vitest";
import { sha256Lower } from "@/lib/meta/capi-payload";
import {
  buildMetaRows,
  toMetaCsv,
  metaCsvFilename,
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
});
