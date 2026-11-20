import { describe, expect, it } from "vitest";
import {
  attendanceMessage,
  clockWindowPkt,
  feedbackMessage,
  podiumMessage,
} from "@/lib/classes/share-messages";

describe("clockWindowPkt", () => {
  it("drops am/pm on the open time when it matches", () => {
    expect(clockWindowPkt("2026-11-20T14:30:00Z", 15, 15)).toEqual({ open: "7:15", close: "7:45 pm" });
  });
  it("shows both when they differ", () => {
    expect(clockWindowPkt("2026-11-19T19:10:00Z", 15, 15)).toEqual({ open: "11:55 pm", close: "12:25 am" });
  });
});

describe("attendanceMessage", () => {
  it("matches the spec text", () => {
    expect(
      attendanceMessage({ batchTitle: "PPC Batch 3", link: "https://x/attend/abc", startsAtIso: "2026-11-20T14:30:00Z" }),
    ).toBe(
      [
        "📊 PPC Batch 3 | _Attendance Portal_",
        "",
        "Dear Members, this is the official link for attendance",
        "https://x/attend/abc",
        "",
        "*Important Note*",
        "Attendance Open at 7:15 and Closes at 7:45 pm PKT.",
      ].join("\n"),
    );
  });
});

describe("feedbackMessage", () => {
  it("fills class number and batch title", () => {
    const m = feedbackMessage({ batchTitle: "PPC Batch 3", link: "https://x/f", classNumber: 9 });
    expect(m).toContain("🔗 Day 9 Feedback Form:\nhttps://x/f");
    expect(m).toContain("Thank you for being part of PPC Batch 3!");
    expect(m.endsWith("Regards,\nTeam Pharmacozyme\nPZ Academy")).toBe(true);
  });
});

describe("podiumMessage", () => {
  const base = { batchTitle: "PPC Batch 3", boardLabel: "Overall", progressLink: "https://x/progress/s" };
  it("matches the spec text with three entries", () => {
    expect(
      podiumMessage({
        ...base,
        entries: [
          { rank: 1, name: "Ann", score: 154372 },
          { rank: 2, name: "Bob", score: 900 },
          { rank: 3, name: "Cy", score: 5 },
        ],
      }),
    ).toBe(
      [
        "A huge congratulations to our top three performers on the Overall Leaderboard of PPC Batch 3.",
        "",
        "🥇 1st Position – Ann",
        "⭐ 154,372 Points",
        "",
        "🥈 2nd Position – Bob",
        "⭐ 900 Points",
        "",
        "🥉 3rd Position – Cy",
        "⭐ 5 Points",
        "",
        "Check your rank: https://x/progress/s",
        "",
        "👏 Congratulations to all three achievers for their outstanding performance!",
        "",
        "Your dedication and active participation continue to make PPC Batch 3 a success.",
        "",
        "Keep learning, keep competing, and keep excelling! 🚀",
        "",
        "PZ Academy",
        "Educating with Innovation 💚",
      ].join("\n"),
    );
  });
  it("lists ties as two 2nd positions", () => {
    const m = podiumMessage({
      ...base,
      entries: [
        { rank: 1, name: "A", score: 3 },
        { rank: 2, name: "B", score: 2 },
        { rank: 2, name: "C", score: 2 },
      ],
    });
    expect(m.match(/🥈 2nd Position/g)).toHaveLength(2);
    expect(m).not.toContain("3rd Position");
  });
  it("omits the third block with two entries", () => {
    const m = podiumMessage({ ...base, entries: [{ rank: 1, name: "A", score: 3 }, { rank: 2, name: "B", score: 2 }] });
    expect(m).not.toContain("🥉");
    expect(m).not.toContain("\n\n\n");
  });
  it("still returns the heading with no entries", () => {
    const m = podiumMessage({ ...base, entries: [] });
    expect(m).toContain("A huge congratulations");
    expect(m).not.toContain("\n\n\n");
  });
});
