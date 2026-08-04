import { describe, it, expect } from "vitest";
import {
  slugify,
  usesFlatSessions,
  publishEligibility,
  typeSwitchEligibility,
  reorderIndexes,
  reorderSchema,
  courseCreateSchema,
  quizQuestionCreateSchema,
  COURSE_TYPES,
} from "@/lib/validations/admin-lms";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Advanced Data Analysis with Excel")).toBe("advanced-data-analysis-with-excel");
  });

  it("strips punctuation", () => {
    expect(slugify("PPC: Batch #2!")).toBe("ppc-batch-2");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  --Mastering Dose Calculations--  ")).toBe("mastering-dose-calculations");
  });
});

describe("usesFlatSessions", () => {
  it("is true for workshop, webinar, mentorship", () => {
    expect(usesFlatSessions("workshop")).toBe(true);
    expect(usesFlatSessions("webinar")).toBe(true);
    expect(usesFlatSessions("mentorship")).toBe(true);
  });

  it("is false for course", () => {
    expect(usesFlatSessions("course")).toBe(false);
  });
});

describe("publishEligibility", () => {
  it("hard-blocks zero sessions for every type", () => {
    for (const type of COURSE_TYPES) {
      const result = publishEligibility(type, 0);
      expect(result.ok).toBe(false);
    }
  });

  it("warns below the type's expected minimum but still allows publishing", () => {
    const result = publishEligibility("course", 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toMatch(/6 or more/);
  });

  it("has no warning at or above the expected minimum", () => {
    const result = publishEligibility("webinar", 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning).toBeNull();
  });

  it("never blocks on count alone, only on zero", () => {
    const result = publishEligibility("workshop", 1);
    expect(result.ok).toBe(true);
  });
});

describe("typeSwitchEligibility", () => {
  it("allows switching into course regardless of module count", () => {
    expect(typeSwitchEligibility("course", 5).ok).toBe(true);
  });

  it("allows switching into a flat type with 0 or 1 modules", () => {
    expect(typeSwitchEligibility("workshop", 0).ok).toBe(true);
    expect(typeSwitchEligibility("webinar", 1).ok).toBe(true);
  });

  it("blocks switching into a flat type with more than 1 module", () => {
    const result = typeSwitchEligibility("workshop", 4);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/4 modules/);
  });
});

describe("reorderIndexes", () => {
  it("produces a dense 0..n-1 sequence matching input order", () => {
    const ids = ["c", "a", "b"];
    expect(reorderIndexes(ids)).toEqual([
      { id: "c", orderIndex: 0 },
      { id: "a", orderIndex: 1 },
      { id: "b", orderIndex: 2 },
    ]);
  });

  it("never produces duplicate indexes", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `id-${i}`);
    const result = reorderIndexes(ids);
    const indexes = result.map((r) => r.orderIndex);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it("handles a single item", () => {
    expect(reorderIndexes(["only"])).toEqual([{ id: "only", orderIndex: 0 }]);
  });
});

describe("reorderSchema", () => {
  it("accepts an array of UUIDs", () => {
    expect(
      reorderSchema.safeParse({ orderedIds: ["11111111-1111-4111-8111-111111111111"] }).success,
    ).toBe(true);
  });

  it("rejects an empty array", () => {
    expect(reorderSchema.safeParse({ orderedIds: [] }).success).toBe(false);
  });

  it("rejects non-UUID strings", () => {
    expect(reorderSchema.safeParse({ orderedIds: ["not-a-uuid"] }).success).toBe(false);
  });
});

describe("courseCreateSchema", () => {
  it("accepts a title and a valid type", () => {
    expect(courseCreateSchema.safeParse({ title: "New Program", type: "workshop" }).success).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(courseCreateSchema.safeParse({ title: "", type: "course" }).success).toBe(false);
  });

  it("rejects an invalid type", () => {
    expect(courseCreateSchema.safeParse({ title: "X", type: "bootcamp" }).success).toBe(false);
  });
});

describe("quizQuestionCreateSchema", () => {
  it("accepts a valid question", () => {
    expect(
      quizQuestionCreateSchema.safeParse({
        question: "What is 2+2?",
        options: ["3", "4", "5"],
        correctIndex: 1,
      }).success,
    ).toBe(true);
  });

  it("rejects fewer than 2 options", () => {
    expect(
      quizQuestionCreateSchema.safeParse({ question: "Q", options: ["only one"], correctIndex: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects a negative correctIndex", () => {
    expect(
      quizQuestionCreateSchema.safeParse({ question: "Q", options: ["a", "b"], correctIndex: -1 })
        .success,
    ).toBe(false);
  });
});
