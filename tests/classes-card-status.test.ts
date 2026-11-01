import { describe, it, expect } from "vitest";
import { attendanceStatus, quizStatus, feedbackStatus, nextAction } from "@/lib/classes/card-status";
import type { ClassSummary } from "@/lib/data/class-overview";

const cls = (over: Partial<ClassSummary> = {}): ClassSummary => ({
  id: "s1", number: 1, title: "Sample Topic", speaker: "Sample Speaker",
  startsAt: "2026-11-10T14:00:00.000Z", endsAt: "2026-11-10T16:00:00.000Z",
  status: "today", presentCount: 42, enrolledLive: 60,
  attendanceLink: "https://x.test/attend/c", feedbackLink: "https://x.test/fb/s", feedbackSessionId: "f1",
  feedbackCount: 0, feedbackAvg: null, quiz: { saved: false, players: 0 }, ...over,
});

describe("attendanceStatus", () => {
  it("says how many are present", () => {
    expect(attendanceStatus(cls())).toEqual({ line: "42 of 60 present", badge: "70% present", tone: "ok" });
  });
  it("never shows 0 of 0 or NaN", () => {
    const s = attendanceStatus(cls({ enrolledLive: 0, presentCount: 0 }));
    expect(s.line).toBe("No live students yet");
    expect(s.badge).toBeNull();
  });
  it("is idle when under half are present", () => {
    expect(attendanceStatus(cls({ presentCount: 10 })).tone).toBe("idle");
  });
});

describe("quizStatus", () => {
  it("saved", () => {
    expect(quizStatus(cls({ quiz: { saved: true, players: 54 } }))).toEqual({ line: "Saved · 54 players", badge: "Done", tone: "ok" });
  });
  it("not saved today needs attention", () => {
    expect(quizStatus(cls())).toEqual({ line: "Not uploaded yet", badge: "Needs attention", tone: "warn" });
  });
  it("not saved for an upcoming class is calm", () => {
    expect(quizStatus(cls({ status: "upcoming" }))).toEqual({ line: "Not uploaded yet", badge: null, tone: "idle" });
  });
});

describe("feedbackStatus", () => {
  it("no link", () => {
    expect(feedbackStatus(cls({ feedbackLink: null })).line).toBe("No feedback link yet");
  });
  it("link but no answers", () => {
    expect(feedbackStatus(cls()).line).toBe("No answers yet");
  });
  it("one answer with no average has no null in it", () => {
    expect(feedbackStatus(cls({ feedbackCount: 1 })).line).toBe("1 answer");
  });
  it("answers with an average", () => {
    expect(feedbackStatus(cls({ feedbackCount: 18, feedbackAvg: 4.6 }))).toEqual({
      line: "18 answers · 4.6 average", badge: "Collecting responses", tone: "ok",
    });
  });
});

describe("nextAction", () => {
  it("upcoming opens the attendance link", () => {
    expect(nextAction(cls({ status: "upcoming" }))).toEqual({ label: "Show attendance link", target: "attendance" });
  });
  it("quiz missing", () => {
    expect(nextAction(cls())).toEqual({ label: "Upload quiz results", target: "quiz" });
  });
  it("no feedback link", () => {
    expect(nextAction(cls({ quiz: { saved: true, players: 5 }, feedbackLink: null }))).toEqual({ label: "Create feedback link", target: "feedback" });
  });
  it("no feedback answers", () => {
    expect(nextAction(cls({ quiz: { saved: true, players: 5 } }))).toEqual({ label: "Open feedback", target: "feedback" });
  });
  it("all done has no action", () => {
    expect(nextAction(cls({ quiz: { saved: true, players: 5 }, feedbackCount: 3, feedbackAvg: 4 }))).toEqual({ label: "", target: null });
  });
});
