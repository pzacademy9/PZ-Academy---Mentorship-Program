import { describe, it, expect } from "vitest";
import { maskEmail, buildAudiencePreview } from "@/lib/crm/audience-preview";
import { metaCsvFilename, type AudienceContact } from "@/lib/crm/meta-audience";
import {
  DEFAULT_AUDIENCE_FILTER,
  describeAudienceFilter,
} from "@/lib/crm/audience-filter";

function contact(i: number, over: Partial<AudienceContact> = {}): AudienceContact {
  return {
    id: `c${i}`,
    email: `person${i}@example.com`,
    phoneE164: null,
    fullName: `Given${i} Family${i}`,
    country: "PK",
    emailUnsubscribedAt: null,
    whatsappUnsubscribedAt: null,
    doNotContactAt: null,
    emailSuppressed: false,
    ...over,
  };
}

describe("maskEmail", () => {
  it("masks the local part", () => {
    expect(maskEmail("anna@gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("x@y.com")).toBe("x***@y.com");
  });
  it("handles odd input", () => {
    expect(maskEmail(null)).toBe("");
    expect(maskEmail("")).toBe("");
    expect(maskEmail("nodomain")).toBe("n***");
  });
});

describe("buildAudiencePreview", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  const twelve = Array.from({ length: 12 }, (_, i) => contact(i));

  it("shows 10 people and counts all in the file", () => {
    const p = buildAudiencePreview(twelve, DEFAULT_AUDIENCE_FILTER, now);
    expect(p.people).toHaveLength(10);
    expect(p.inFile).toBe(12);
  });

  it("counts left-out people", () => {
    const p = buildAudiencePreview(
      [
        ...twelve,
        contact(100, { doNotContactAt: "2026-01-01" }),
        contact(101, { email: null, phoneE164: null }),
      ],
      DEFAULT_AUDIENCE_FILTER,
      now,
    );
    expect(p.leftOut.doNotContact).toBe(1);
    expect(p.leftOut.noContact).toBe(1);
    expect(p.inFile).toBe(12);
    expect(JSON.stringify(p.people)).not.toContain("person100");
  });

  it("has the fixed columns and file name", () => {
    const p = buildAudiencePreview(twelve, DEFAULT_AUDIENCE_FILTER, now);
    expect(p.columns).toEqual(["Email", "Phone", "First name", "Last name", "Country"]);
    expect(p.fileName).toBe(
      metaCsvFilename(describeAudienceFilter(DEFAULT_AUDIENCE_FILTER), now, "hashed"),
    );
  });

  it("handles phone-only people", () => {
    const p = buildAudiencePreview(
      [contact(1, { email: null, phoneE164: "+923001234567" })],
      DEFAULT_AUDIENCE_FILTER,
      now,
    );
    expect(p.people[0].email).toBe("");
    expect(p.people[0].name).not.toBe("");
  });

  it("never exposes a full email", () => {
    const p = buildAudiencePreview(twelve, DEFAULT_AUDIENCE_FILTER, now);
    const json = JSON.stringify(p.people);
    for (const c of twelve) expect(json).not.toContain(c.email as string);
    expect(p.people[0].email).toBe("p***@example.com");
  });
});
