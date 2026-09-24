import { describe, it, expect } from "vitest";
import { resolveConversions, type ConversionPurchase, type ConversionRecipient } from "@/lib/crm/conversion";

const SENT_AT = "2026-01-01T00:00:00.000Z";
const RECIPIENT: ConversionRecipient = { contactId: "contact-1", sentAt: SENT_AT };

function purchase(overrides: Partial<ConversionPurchase>): ConversionPurchase {
  return {
    contactId: "contact-1",
    purchasedAt: null,
    createdAt: SENT_AT,
    courseId: null,
    productLabel: "",
    ...overrides,
  };
}

describe("resolveConversions", () => {
  it("returns null convertedAt for every recipient when the tag is 'none', without needing purchases", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", courseId: "course-1" })],
      { kind: "none" },
    );
    expect(results).toEqual([{ contactId: "contact-1", convertedAt: null }]);
  });

  it("matches a course-tagged purchase by course_id", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("does not match a purchase of a different course", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", courseId: "course-2" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBeNull();
  });

  it("matches a label-tagged purchase by case-insensitive substring", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", productLabel: "Advanced Mixing Course – Batch 3" })],
      { kind: "label", pattern: "advanced mixing" },
    );
    expect(results[0].convertedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("does not match a label pattern that isn't present in product_label", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", productLabel: "Beginner Course" })],
      { kind: "label", pattern: "advanced mixing" },
    );
    expect(results[0].convertedAt).toBeNull();
  });

  it("counts a purchase exactly at the window boundary (sentAt + 30 days) as converted", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-31T00:00:00.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBe("2026-01-31T00:00:00.000Z");
  });

  it("does not count a purchase one second past the window boundary", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-31T00:00:01.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBeNull();
  });

  it("does not count a purchase before sentAt", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2025-12-31T23:59:59.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBeNull();
  });

  it("falls back to created_at when purchased_at is null", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: null, createdAt: "2026-01-05T00:00:00.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("resolves to the earliest qualifying purchase when a contact has more than one", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [
        purchase({ purchasedAt: "2026-01-10T00:00:00.000Z", courseId: "course-1" }),
        purchase({ purchasedAt: "2026-01-03T00:00:00.000Z", courseId: "course-1" }),
      ],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("does not cross-match a purchase belonging to a different contact", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ contactId: "contact-2", purchasedAt: "2026-01-05T00:00:00.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBeNull();
  });
});
