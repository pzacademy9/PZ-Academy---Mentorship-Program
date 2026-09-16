import { describe, it, expect } from "vitest";
import { parseProductLabel, courseNameFromLabel } from "@/lib/crm/product-label";

describe("parseProductLabel", () => {
  // Literals below are verbatim from the MDC3 Master Sheet's
  // "Registration Option" column.
  it("parses a plain individual PKR registration", () => {
    expect(parseProductLabel("Individual — PKR 2,700")).toEqual({
      amount: 2700,
      currency: "PKR",
      isEarlyBird: false,
      rowTypeHint: "individual",
    });
  });

  it("detects the early bird marker", () => {
    expect(parseProductLabel("Individual — PKR 2,700 [Early Bird]")).toEqual({
      amount: 2700,
      currency: "PKR",
      isEarlyBird: true,
      rowTypeHint: "individual",
    });
  });

  it("uses the per-person price for a group registration, not the total", () => {
    // 6,480 is what the group leader paid for three seats. The per-contact
    // value is 2,160 — using the total would triple every group member's
    // recorded spend and corrupt lifetime-value reporting.
    expect(parseProductLabel("Group — PKR 6,480 (3 × PKR 2,160/person) [Early Bird]")).toEqual({
      amount: 2160,
      currency: "PKR",
      isEarlyBird: true,
      rowTypeHint: "group_leader",
    });
  });

  it("parses an AED registration", () => {
    expect(parseProductLabel("Individual — AED 80 [Early Bird]")).toEqual({
      amount: 80,
      currency: "AED",
      isEarlyBird: true,
      rowTypeHint: "individual",
    });
  });

  it("detects the row-type hint mid-label, not only at the start", () => {
    // MEP Batch 1 labels lead with the course name, so the Individual/Group
    // token sits in the middle: "Complete Course — … — Group — PKR …".
    expect(parseProductLabel("Complete Course — Module 1 & Module 2 — Group — PKR 8,400 (3 × PKR 2,800/person)").rowTypeHint).toBe("group_leader");
    expect(parseProductLabel("Complete Course — Module 1 & Module 2 — Individual — PKR 3,500").rowTypeHint).toBe("individual");
    expect(parseProductLabel("Single Module — Module 1 — Understanding Medication Errors & High-Alert Medications — Individual — PKR 1,800").rowTypeHint).toBe("individual");
  });

  it("returns nulls rather than guessing on an unrecognised label", () => {
    expect(parseProductLabel("Scholarship")).toEqual({
      amount: null,
      currency: null,
      isEarlyBird: false,
      rowTypeHint: null,
    });
  });

  it("handles blank input", () => {
    expect(parseProductLabel("")).toEqual({ amount: null, currency: null, isEarlyBird: false, rowTypeHint: null });
    expect(parseProductLabel(null)).toEqual({ amount: null, currency: null, isEarlyBird: false, rowTypeHint: null });
  });
});

describe("courseNameFromLabel", () => {
  // Literals below are verbatim distinct product_label values read from the
  // live contact_purchases table — the same label describes one course across
  // a dozen price/promo variants, which is what this collapses.
  it("drops tier, price, early-bird and promo from a full course label", () => {
    expect(courseNameFromLabel("Complete Course — Module 1 & Module 2 — Individual — PKR 1,960 [Early Bird] [Promo: 20% OFF]"))
      .toBe("Complete Course — Module 1 & Module 2");
  });

  it("collapses individual and group variants of one course to the same name", () => {
    expect(courseNameFromLabel("Complete Course — Module 1 & Module 2 — Individual — PKR 3,500"))
      .toBe(courseNameFromLabel("Complete Course — Module 1 & Module 2 — Group — PKR 8,400 (3 × PKR 2,800/person)"));
  });

  it("keeps a long single-module name intact", () => {
    expect(courseNameFromLabel("Single Module — Module 1 — Understanding Medication Errors & High-Alert Medications — Individual — PKR 1,800"))
      .toBe("Single Module — Module 1 — Understanding Medication Errors & High-Alert Medications");
  });

  it("handles a tier token that follows the name without a separator", () => {
    expect(courseNameFromLabel("Recorded (Self-Paced) Individual — AED 85")).toBe("Recorded (Self-Paced)");
  });

  it("returns a label that names no course at all as empty", () => {
    // These come from sheets where the cohort itself identified the course, so
    // the label carries only the tier and price.
    expect(courseNameFromLabel("Individual — AED 80 [Early Bird]")).toBe("");
    expect(courseNameFromLabel("Group — PKR 6,000 (3 × PKR 2,000/person) [Early Bird]")).toBe("");
  });

  it("keeps a bare access-tier label as its own name", () => {
    expect(courseNameFromLabel("Free Access")).toBe("Free Access");
    expect(courseNameFromLabel("Pro Access")).toBe("Pro Access");
  });

  it("cuts at a currency even when no tier token is present", () => {
    expect(courseNameFromLabel("Workshop Replay — PKR 1,500")).toBe("Workshop Replay");
  });

  it("handles blank input", () => {
    expect(courseNameFromLabel("")).toBe("");
    expect(courseNameFromLabel(null)).toBe("");
  });
});
