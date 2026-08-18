import { describe, it, expect } from "vitest";
import { isUuid, diffFeedbackQuestions, type ExistingQuestion, type IncomingQuestion } from "@/lib/data/feedback-sessions";

// Regression test for the getFeedbackSessionBySlug bug: a non-UUID slug sent into
// an `.or("id.eq....")` filter fails Postgres's uuid cast (22P02) and silently
// swallows the whole query. isUuid is the shape check that lets the caller branch
// to `.eq("slug", ...)` instead of ever comparing a non-UUID string against the
// uuid-typed `id` column.
describe("isUuid", () => {
  it("accepts a real feedback_sessions.id", () => {
    expect(isUuid("a865759b-8780-4755-9122-9fcce575a016")).toBe(true);
  });

  it("accepts an uppercase UUID", () => {
    expect(isUuid("A865759B-8780-4755-9122-9FCCE575A016")).toBe(true);
  });

  it("rejects a real generated slug", () => {
    expect(isUuid("mentorship-session-2026-08-15t13-13-38-546715-00-00")).toBe(false);
  });

  it("rejects a short hand-picked slug", () => {
    expect(isUuid("ams-batch-1-day-2")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isUuid("")).toBe(false);
  });

  it("rejects a uuid-length string with invalid characters", () => {
    expect(isUuid("g865759b-8780-4755-9122-9fcce575a016")).toBe(false);
  });
});

function q(id: string, text: string, type: "stars" | "video", hasRealAnswer: boolean): ExistingQuestion {
  return { id, text, type, hasRealAnswer };
}

describe("diffFeedbackQuestions", () => {
  it("inserts every incoming question with no id as toInsert, 1-indexed order", () => {
    const incoming: IncomingQuestion[] = [
      { text: "How was the pacing?", type: "stars" },
      { text: "Any final thoughts?", type: "video" },
    ];
    const diff = diffFeedbackQuestions([], incoming);
    expect(diff.toDelete).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toInsert).toEqual([
      { text: "How was the pacing?", type: "stars", order: 1 },
      { text: "Any final thoughts?", type: "video", order: 2 },
    ]);
  });

  it("removes an existing question with zero real answers when it's missing from incoming", () => {
    const existing = [q("q1", "Old question", "stars", false)];
    const diff = diffFeedbackQuestions(existing, []);
    expect(diff.toDelete).toEqual(["q1"]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toInsert).toEqual([]);
  });

  it("throws instead of removing an answered question, naming it in the message", () => {
    const existing = [q("q1", "How was the pacing?", "stars", true)];
    expect(() => diffFeedbackQuestions(existing, [])).toThrow(
      '"How was the pacing?" already has responses and can\'t be removed.',
    );
  });

  it("updates text/type/order for a kept, unanswered question", () => {
    const existing = [q("q1", "Old text", "stars", false)];
    const incoming: IncomingQuestion[] = [{ id: "q1", text: "New text", type: "video" }];
    const diff = diffFeedbackQuestions(existing, incoming);
    expect(diff.toUpdate).toEqual([{ id: "q1", text: "New text", type: "video", order: 1 }]);
    expect(diff.toDelete).toEqual([]);
  });

  it("allows a text-only edit on an answered question (type unchanged)", () => {
    const existing = [q("q1", "Old text", "stars", true)];
    const incoming: IncomingQuestion[] = [{ id: "q1", text: "Fixed typo", type: "stars" }];
    const diff = diffFeedbackQuestions(existing, incoming);
    expect(diff.toUpdate).toEqual([{ id: "q1", text: "Fixed typo", type: "stars", order: 1 }]);
  });

  it("throws instead of changing type on an answered question, naming it in the message", () => {
    const existing = [q("q1", "How was the pacing?", "stars", true)];
    const incoming: IncomingQuestion[] = [{ id: "q1", text: "How was the pacing?", type: "video" }];
    expect(() => diffFeedbackQuestions(existing, incoming)).toThrow(
      '"How was the pacing?" already has responses — its type can\'t change.',
    );
  });

  it("reassigns order when reordering kept questions", () => {
    const existing = [q("q1", "First", "stars", false), q("q2", "Second", "stars", false)];
    const incoming: IncomingQuestion[] = [
      { id: "q2", text: "Second", type: "stars" },
      { id: "q1", text: "First", type: "stars" },
    ];
    const diff = diffFeedbackQuestions(existing, incoming);
    expect(diff.toUpdate).toEqual([
      { id: "q2", text: "Second", type: "stars", order: 1 },
      { id: "q1", text: "First", type: "stars", order: 2 },
    ]);
  });

  it("throws when an incoming id doesn't belong to any existing question", () => {
    const incoming: IncomingQuestion[] = [{ id: "not-real", text: "Ghost", type: "stars" }];
    expect(() => diffFeedbackQuestions([], incoming)).toThrow("Question not-real does not belong to this session.");
  });

  it("handles a combined insert + delete + reorder + text edit in one call", () => {
    const existing = [
      q("q1", "Keep me, reorder me", "stars", false),
      q("q2", "Delete me", "stars", false),
      q("q3", "Edit my text", "stars", true),
    ];
    const incoming: IncomingQuestion[] = [
      { text: "Brand new question", type: "video" },
      { id: "q3", text: "Edited text", type: "stars" },
      { id: "q1", text: "Keep me, reorder me", type: "stars" },
    ];
    const diff = diffFeedbackQuestions(existing, incoming);
    expect(diff.toInsert).toEqual([{ text: "Brand new question", type: "video", order: 1 }]);
    expect(diff.toUpdate).toEqual([
      { id: "q3", text: "Edited text", type: "stars", order: 2 },
      { id: "q1", text: "Keep me, reorder me", type: "stars", order: 3 },
    ]);
    expect(diff.toDelete).toEqual(["q2"]);
  });
});
