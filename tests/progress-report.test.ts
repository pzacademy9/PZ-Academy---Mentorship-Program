import { describe, expect, it } from "vitest";
import { buildBatchReport, type ReportInput } from "@/lib/progress/report-build";
import { renderReportEmail } from "@/lib/progress/report-email";

// 12 live students with scores (p1 best), one live student who never took a quiz (p13),
// one recorded student with a score (p14). Two quiz classes, one later class with no quiz yet.
function input(): ReportInput {
  const people = Array.from({ length: 14 }, (_, i) => ({ id: `p${i + 1}`, pzId: `Fake${i + 1}-10${String(i + 1).padStart(2, "0")}`, displayName: `Fake Student ${i + 1}` }));
  const regs = people.map((p, i) => ({ personId: p.id, mode: (i === 13 ? "recorded" : "live") as "live" | "recorded", optionLabel: "" }));
  const sessions = [
    { id: "s1", number: 1, title: "Fake Class 1", startsAt: "2026-10-01T10:00:00Z", audience: null, quizMax: 20000 },
    { id: "s2", number: 2, title: "Fake Class 2", startsAt: "2026-10-08T10:00:00Z", audience: null, quizMax: 20000 },
    { id: "s3", number: 3, title: "Fake Class 3", startsAt: "2026-12-01T10:00:00Z", audience: null, quizMax: 20000 },
  ];
  const quiz: ReportInput["quiz"] = [];
  for (let i = 1; i <= 12; i++) {
    // Totals: p_i = 24500 - 1000*i (p1 23500, p10 14500, p11 13500); p12 only took class 1 (7000).
    quiz.push({ sessionId: "s1", personId: `p${i}`, score: 13000 - i * 500, correct: 15 - i, incorrect: 5 + (i % 3) });
    if (i < 12) quiz.push({ sessionId: "s2", personId: `p${i}`, score: 11500 - i * 500, correct: 14 - i, incorrect: 6 });
  }
  quiz.push({ sessionId: "s1", personId: "p14", score: 19000, correct: 19, incorrect: 1 });
  const emails = Object.fromEntries(people.map((p) => [p.id, `fake.${p.id}@example.com`]));
  return {
    pageId: "page1",
    title: "Fake Diabetes Course B1",
    slug: "fake-dmc-b1",
    kind: "course",
    minPct: 75,
    sessions,
    people,
    regs,
    marks: [
      { sessionId: "s1", personId: "p1" },
      { sessionId: "s2", personId: "p1" },
      { sessionId: "s1", personId: "p11" },
    ],
    quiz,
    emails,
    now: new Date("2026-11-05T10:00:00Z"),
  };
}

const by = (pz: string) => buildBatchReport(input()).students.find((s) => s.pzId.startsWith(`${pz}-`))!;

describe("progress report builder", () => {
  it("covers every enrolled student, including the ones with no quiz", () => {
    const r = buildBatchReport(input());
    expect(r.students).toHaveLength(14);
    expect(r.quizClasses).toBe(2);
    expect(r.rankedCount).toBe(12);
  });

  it("ranks live students only, matching the website", () => {
    expect(by("Fake1")).toMatchObject({ rank: 1, score: 23500, hasData: true, mode: "live" });
    expect(by("Fake14")).toMatchObject({ rank: null, mode: "recorded", score: 19000, chase: { kind: "recorded" } });
    expect(by("Fake13")).toMatchObject({ rank: null, hasData: false, chase: { kind: "start", leaderScore: 23500 } });
  });

  it("totals correct and wrong answers and works out accuracy", () => {
    const s = by("Fake1");
    expect(s.correct).toBe(14 + 13);
    expect(s.incorrect).toBe(6 + 6);
    expect(s.accuracy).toBe(Math.round((27 / 39) * 100));
  });

  it("tells the leader how far ahead they are", () => {
    expect(by("Fake1").chase).toEqual({ kind: "leader", leadOverNext: 1000 });
  });

  it("tells a top-10 student the gap to the student above", () => {
    expect(by("Fake4").chase).toMatchObject({ kind: "climb", aboveRank: 3, aboveName: "Fake Student 3", gap: 1000, inTop10: true });
  });

  it("puts a student below the top 10 after the table, with the cutoff and quizzes missed", () => {
    const s = by("Fake12");
    expect(s.rank).toBe(12);
    expect(s.top).toHaveLength(10);
    expect(s.top.some((t) => t.isMe)).toBe(false);
    expect(s.meBelow).toEqual({ rank: 12, score: 7000, positionsBelow: 2 });
    expect(s.chase).toMatchObject({ kind: "climb", inTop10: false, top10Cutoff: 14500, quizzesMissed: 1 });
  });

  it("marks the student in their own top-10 row", () => {
    expect(by("Fake3").top.filter((t) => t.isMe).map((t) => t.rank)).toEqual([3]);
  });

  it("lists every quiz class, with dashes for the ones missed", () => {
    expect(by("Fake12").classes.map((c) => [c.number, c.attempted])).toEqual([[1, true], [2, false]]);
  });

  it("shows attendance for live students only", () => {
    expect(by("Fake1").attendance).toMatchObject({ attended: 2, held: 2, pct: 100, meetsMin: true });
    expect(by("Fake11").attendance).toMatchObject({ attended: 1, held: 2, pct: 50, meetsMin: false });
    expect(by("Fake14").attendance).toBeNull();
  });

  it("uses each student's batch email", () => {
    expect(by("Fake5").email).toBe("fake.p5@example.com");
  });
});

describe("progress report email", () => {
  const links = { portalUrl: "https://example.com/progress/fake-dmc-b1", youtubeUrl: "https://www.youtube.com/@Pharmacozyme", unsubscribeUrl: "https://example.com/unsub/x" };
  const render = (pz: string) => renderReportEmail({ title: "Fake Diabetes Course B1", minPct: 75 }, by(pz), links);

  it("has the subject, greeting, ID, rank and leaderboard", () => {
    const { subject, html } = render("Fake4");
    expect(subject).toBe("Fake Diabetes Course B1: your progress report");
    expect(html).toContain("Hello, Fake 👋");
    expect(html).toContain("Fake4-1004");
    expect(html).toContain("#4");
    expect(html).toContain("Overall rank out of 12");
    expect(html).toContain("Top 10 leaderboard");
    expect(html).toContain("YOU");
    expect(html).toContain("How to pass #3");
    expect(html).toContain("Class by class");
    expect(html).toContain(links.portalUrl);
    expect(html).toContain(links.unsubscribeUrl);
  });

  it("gives the leader the crown message", () => {
    const { html } = render("Fake1");
    expect(html).toContain("You are #1. Outstanding!");
    expect(html).toContain("Defend your crown!");
  });

  it("gives a student with no quiz the get-started version without a class table", () => {
    const { html } = render("Fake13");
    expect(html).toContain("It's time to start!");
    expect(html).toContain("How to get on this board");
    expect(html).not.toContain("Class by class");
  });

  it("does not rank a recorded student", () => {
    const { html } = render("Fake14");
    expect(html).toContain("Recorded student");
    expect(html).not.toContain("Overall rank out of");
  });

  it("never shows anyone's email and escapes names", () => {
    const i = input();
    i.people[0].displayName = "<b>Fake</b> Person";
    const r = buildBatchReport(i);
    const s = r.students.find((x) => x.personId === "p2")!;
    const { html } = renderReportEmail({ title: "Fake & Co", minPct: 75 }, s, links);
    expect(html).not.toMatch(/fake\.p\d+@example\.com/);
    expect(html).not.toContain("<b>Fake</b>");
    expect(html).toContain("Fake &amp; Co");
  });
});
