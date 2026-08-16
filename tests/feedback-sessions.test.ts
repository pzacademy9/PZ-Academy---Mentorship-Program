import { describe, it, expect } from "vitest";
import { isUuid } from "@/lib/data/feedback-sessions";

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
