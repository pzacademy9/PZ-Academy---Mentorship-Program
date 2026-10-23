import { describe, it, expect } from "vitest";
import { analyzeCourseFile } from "@/lib/lms/course-import/analyze";
import { COURSE_IMPORT_LIMITS } from "@/lib/lms/course-import/format";

const YT = "https://www.youtube.com/watch?v=abc123";
const YT2 = "https://youtu.be/def456";
const VIM = "https://vimeo.com/123456";

function q(n: number, withAnswer = true): string {
  return [`${n}. Question number ${n}?`, "A) One", "B) Two", withAnswer ? "Answer: A" : "", ""].join("\n");
}

function quiz(count: number, badAt = 0): string {
  const parts: string[] = [];
  for (let i = 1; i <= count; i++) parts.push(q(i, i !== badAt));
  return "quiz:\n" + parts.join("\n");
}

function courseFile(body: string[]): string {
  return ["format: pz-course/1", "title: Test Course", "type: course", "", ...body].join("\n");
}

function workshopFile(body: string[]): string {
  return ["format: pz-course/1", "title: Test Workshop", "type: workshop", "", ...body].join("\n");
}

function ok(text: string) {
  const r = analyzeCourseFile(text);
  if (!r.ok) throw new Error("expected ok, got: " + r.errors.join(" | "));
  return r;
}

function errs(text: string): string[] {
  const r = analyzeCourseFile(text);
  if (r.ok) throw new Error("expected failure");
  return r.errors;
}

const GOOD = courseFile([
  "## Module: Basics",
  "### Session: Intro",
  `video: ${YT}`,
  quiz(2),
  "### Session: Dosing",
  `video: ${YT2}`,
  `video2: ${VIM}`,
  quiz(1),
  "## Module: Advanced",
  "### Session: Interactions",
  `video: ${YT}`,
  quiz(3),
]);

describe("analyzeCourseFile", () => {
  it("good file gives plan, counts and session list", () => {
    const r = ok(GOOD);
    expect(r.warnings).toEqual([]);
    expect(r.plan.title).toBe("Test Course");
    expect(r.plan.type).toBe("course");
    expect(r.plan.modules).toHaveLength(2);
    expect(r.plan.modules[0].sessions[0].questions).toHaveLength(2);
    expect(r.summary.modules).toBe(2);
    expect(r.summary.sessions).toBe(3);
    expect(r.summary.videos).toBe(4);
    expect(r.summary.questions).toBe(6);
    expect(r.summary.sessionList).toHaveLength(3);
    expect(r.summary.sessionList[0]).toEqual({
      module: "Basics",
      title: "Intro",
      videoUrl: YT,
      firstQuestion: "Question number 1?",
    });
  });

  it("session without a video link warns and is still created", () => {
    const r = ok(courseFile(["## Module: Module 2", "### Session: Day 7", quiz(1)]));
    expect(r.warnings).toContain("Day 7 (Module 2): needs a video link.");
    expect(r.plan.modules[0].sessions).toHaveLength(1);
    expect(r.plan.modules[0].sessions[0].videoUrl).toBe("");
  });

  it("Drive link as a video is dropped and named", () => {
    const r = ok(
      courseFile(["## Module: M", "### Session: S1", "video: https://drive.google.com/file/d/1/view", quiz(1)]),
    );
    expect(r.plan.modules[0].sessions[0].videoUrl).toBe("");
    expect(r.warnings.join("\n")).toContain("S1 (M)");
    expect(r.warnings.join("\n")).toContain("Google Drive");
  });

  it("invalid link dropped", () => {
    const r = ok(courseFile(["## Module: M", "### Session: S1", `video: ${YT}`, "video2: not a link", quiz(1)]));
    expect(r.plan.modules[0].sessions[0].videoUrl).toBe(YT);
    expect(r.plan.modules[0].sessions[0].videoUrl2).toBe("");
    expect(r.warnings.some((w) => w.startsWith("S1 (M)") && w.includes("not a link"))).toBe(true);
  });

  it("Vimeo and YouTube kept for video and video2", () => {
    const r = ok(courseFile(["## Module: M", "### Session: S1", `video: ${VIM}`, `video2: ${YT}`, quiz(1)]));
    const s = r.plan.modules[0].sessions[0];
    expect(s.videoUrl).toBe(VIM);
    expect(s.videoUrl2).toBe(YT);
    expect(r.summary.videos).toBe(2);
  });

  it("one bad question in the middle keeps the others", () => {
    const r = ok(courseFile(["## Module: M", "### Session: Day 4", `video: ${YT}`, quiz(10, 6)]));
    expect(r.plan.modules[0].sessions[0].questions).toHaveLength(9);
    expect(r.summary.questions).toBe(9);
    expect(r.warnings).toContain("Day 4 (M), question 6: left out (no correct answer marked).");
  });

  it("session with no quiz warns", () => {
    const r = ok(courseFile(["## Module: M", "### Session: S1", `video: ${YT}`]));
    expect(r.warnings).toContain("S1 (M): has no quiz.");
    expect(r.summary.sessionList[0].firstQuestion).toBe("");
  });

  it("session whose quiz has no good question warns and has zero questions", () => {
    const r = ok(courseFile(["## Module: M", "### Session: S1", `video: ${YT}`, quiz(1, 1)]));
    expect(r.plan.modules[0].sessions[0].questions).toHaveLength(0);
    expect(r.warnings).toContain("S1 (M): the quiz has no usable questions.");
  });

  it("note with no label gets the site name", () => {
    const r = ok(
      courseFile([
        "## Module: M",
        "### Session: S1",
        `video: ${YT}`,
        "notes: https://www.drive.google.com/file/d/1",
        "notes: https://drive.google.com/file/d/2",
        quiz(1),
      ]),
    );
    const notes = r.plan.modules[0].sessions[0].notes;
    expect(notes[0].label).toBe("drive.google.com");
    expect(notes[1]).toEqual({ label: "drive.google.com", url: "https://drive.google.com/file/d/2" });
  });

  it("non-web note link (mailto:) dropped and named", () => {
    const r = ok(
      courseFile(["## Module: M", "### Session: S1", `video: ${YT}`, "notes: Mail | mailto:a@b.c", quiz(1)]),
    );
    expect(r.plan.modules[0].sessions[0].notes).toEqual([]);
    expect(r.warnings.some((w) => w.includes("S1 (M)") && w.includes("mailto:a@b.c"))).toBe(true);
  });

  it("empty note link is dropped with a warning", () => {
    const text = courseFile(["## Module: M", "### Session: S1", `video: ${YT}`, "notes:", quiz(1)]);
    const r = ok(text);
    expect(r.plan.modules[0].sessions[0].notes).toEqual([]);
    expect(r.warnings).toContain("A notes link at line 8 is empty and was left out.");
  });

  it("note label over 150 characters dropped and named", () => {
    const label = "L".repeat(COURSE_IMPORT_LIMITS.maxLabel + 1);
    const r = ok(
      courseFile([
        "## Module: M",
        "### Session: S1",
        `video: ${YT}`,
        `notes: ${label} | https://x.y/z`,
        quiz(1),
      ]),
    );
    expect(r.plan.modules[0].sessions[0].notes).toEqual([]);
    expect(r.warnings.some((w) => w.includes("S1 (M)") && w.includes("150"))).toBe(true);
  });

  it("more than 20 notes on one session: first 20 kept, warning", () => {
    const notes = Array.from({ length: 22 }, (_, i) => `notes: N${i} | https://x.y/${i}`);
    const r = ok(courseFile(["## Module: M", "### Session: S1", `video: ${YT}`, ...notes, quiz(1)]));
    const kept = r.plan.modules[0].sessions[0].notes;
    expect(kept).toHaveLength(20);
    expect(kept[0].label).toBe("N0");
    expect(kept[19].label).toBe("N19");
    expect(r.warnings.some((w) => w.includes("S1 (M)") && w.includes("20"))).toBe(true);
  });

  it("flat type with notes before the first session warns and lists them as unassigned", () => {
    const r = ok(
      workshopFile(["notes: Pre | https://x.y/pre", "### Session: Day 1", `video: ${YT}`, quiz(1)]),
    );
    expect(r.plan.modules).toHaveLength(1);
    expect(r.plan.modules[0].notes).toEqual([]);
    expect(r.summary.unassignedNotes).toEqual([{ label: "Pre", url: "https://x.y/pre" }]);
    expect(r.warnings.length).toBeGreaterThan(0);
    // flat type: no module title in brackets
    const r2 = ok(workshopFile(["### Session: Day 1", quiz(1)]));
    expect(r2.warnings).toContain("Day 1: needs a video link.");
  });

  it("module with no sessions warns", () => {
    const r = ok(courseFile(["## Module: Empty", "## Module: Full", "### Session: S1", `video: ${YT}`, quiz(1)]));
    expect(r.warnings.some((w) => w.includes("Empty") && w.includes("no sessions"))).toBe(true);
  });

  it("unassigned notes are returned in summary and not in the plan", () => {
    const r = ok(
      courseFile([
        "## Module: M",
        "### Session: S1",
        `video: ${YT}`,
        quiz(1),
        "## Unassigned notes",
        "notes: Loose | https://x.y/loose",
      ]),
    );
    expect(r.summary.unassignedNotes).toEqual([{ label: "Loose", url: "https://x.y/loose" }]);
    expect(JSON.stringify(r.plan)).not.toContain("loose");
  });

  it("module notes are kept for a course", () => {
    const r = ok(
      courseFile(["## Module: M", "notes: Handout | https://x.y/h", "### Session: S1", `video: ${YT}`, quiz(1)]),
    );
    expect(r.plan.modules[0].notes).toEqual([{ label: "Handout", url: "https://x.y/h" }]);
  });

  describe("blocking", () => {
    it("no sessions at all", () => {
      expect(errs(courseFile(["## Module: M"]))).toContain("The file has no sessions.");
    });

    it("title over 200 characters", () => {
      const long = "T".repeat(201);
      const e = errs(`format: pz-course/1\ntitle: ${long}\ntype: course\n## Module: M\n### Session: S\n`);
      expect(e.some((m) => m.includes("200"))).toBe(true);
      const e2 = errs(courseFile(["## Module: M", `### Session: ${long}`]));
      expect(e2.some((m) => m.includes("200"))).toBe(true);
    });

    it("13 modules", () => {
      const body: string[] = [];
      for (let i = 1; i <= 13; i++) body.push(`## Module: M${i}`, `### Session: S${i}`);
      expect(errs(courseFile(body)).some((m) => m.includes("12"))).toBe(true);
    });

    it("61 sessions", () => {
      const body = ["## Module: M"];
      for (let i = 1; i <= 61; i++) body.push(`### Session: S${i}`);
      expect(errs(courseFile(body)).some((m) => m.includes("60"))).toBe(true);
    });

    it("201 questions in a session", () => {
      const e = errs(courseFile(["## Module: M", "### Session: Big", `video: ${YT}`, quiz(201)]));
      expect(e.some((m) => m.includes("Big") && m.includes("200"))).toBe(true);
    });

    it("2,001 questions in the course", () => {
      const body = ["## Module: M"];
      for (let i = 1; i <= 11; i++) body.push(`### Session: S${i}`, quiz(i === 11 ? 1 : 200));
      const e = errs(courseFile(body));
      expect(e.some((m) => m.includes("2,000"))).toBe(true);
    });

    it("parser errors pass through unchanged", () => {
      expect(errs("hello")[0]).toContain("format: pz-course/1");
      expect(errs("")).toEqual(["The file is empty."]);
    });
  });
});
