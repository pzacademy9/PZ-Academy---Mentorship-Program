import { describe, it, expect } from "vitest";
import { parseCourseFile } from "@/lib/lms/course-import/parse";
import { analyzeCourseFile } from "@/lib/lms/course-import/analyze";
import { masterPrompt } from "@/lib/lms/course-import/prompts";

const YT = "https://youtu.be/AAAAAAAAAAA";
const YT2 = "https://youtu.be/BBBBBBBBBBB";
const Q = ["quiz:", "1. Q one?", "A) a", "B) b", "Answer: A"];

function head(extra = "type: course") {
  return ["format: pz-course/1", "title: T", extra, ""];
}
function parseOk(lines: string[]) {
  const r = parseCourseFile(lines.join("\n"));
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r;
}

describe("forgiving headings", () => {
  it("accepts numbered, dashed and bold module and session headings", () => {
    const r = parseOk([
      ...head(),
      "## Module 1: Basics",
      "### Session 1: Day 1 - Intro",
      `video: ${YT}`,
      "## Module 2 - Systems",
      "### Session 2: Day 2 - Cardio",
      `video: ${YT2}`,
      "## **Module: Third**",
      "### Session: Day 3 \u2013 Title",
      "### **Session 4 \u2014 Four**",
    ]);
    expect(r.raw.modules.map((m) => m.title)).toEqual(["Basics", "Systems", "Third"]);
    expect(r.raw.modules[0].sessions[0].title).toBe("Day 1 - Intro");
    expect(r.raw.modules[1].sessions[0].title).toBe("Day 2 - Cardio");
    expect(r.raw.modules[2].sessions.map((s) => s.title)).toEqual(["Day 3 \u2013 Title", "Four"]);
    expect(r.warnings).toEqual([]);
  });

  it("accepts Unassigned Notes: in any case", () => {
    const r = parseOk([...head(), "## Module: M", "### Session: S", "## Unassigned Notes:", "notes: Extra | https://x.y/z"]);
    expect(r.raw.unassignedNotes).toHaveLength(1);
    expect(r.raw.modules[0].sessions[0].notes).toHaveLength(0);
  });

  it("an unrecognised heading cannot overwrite the previous session", () => {
    const r = parseOk([
      ...head(),
      "## Module: M",
      "### Session: Day 1",
      `video: ${YT}`,
      "### Lesson Two",
      `video: ${YT2}`,
      "notes: Late | https://x.y/late",
    ]);
    const s = r.raw.modules[0].sessions[0];
    expect(s.video).toBe(YT);
    expect(s.notes).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("an unrecognised module-level heading ends module attachment", () => {
    const r = parseOk([
      ...head(),
      "## Module: M",
      "### Session: Day 1",
      `video: ${YT}`,
      "## Appendix",
      "notes: Late | https://x.y/late",
    ]);
    expect(r.raw.modules[0].notes).toHaveLength(0);
    expect(r.raw.modules[0].sessions[0].notes).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("repeated keys", () => {
  it("warns and keeps the first video, second video and quiz", () => {
    const r = parseOk([
      ...head(),
      "## Module: M",
      "### Session: Day 1",
      `video: ${YT}`,
      `video: ${YT2}`,
      "video2: https://youtu.be/CCCCCCCCCCC",
      "video2: https://youtu.be/DDDDDDDDDDD",
      ...Q,
      "quiz:",
      "1. Other?",
      "A) a",
      "B) b",
      "Answer: B",
    ]);
    const s = r.raw.modules[0].sessions[0];
    expect(s.video).toBe(YT);
    expect(s.video2).toBe("https://youtu.be/CCCCCCCCCCC");
    expect(s.quizText).toContain("Q one?");
    expect(s.quizText).not.toContain("Other?");
    const w = r.warnings.join("\n");
    expect(w).toContain("Day 1");
    expect(r.warnings.length).toBe(3);
  });
});

describe("bold markers", () => {
  it("strips bold from titles and key names", () => {
    const r = parseOk([
      "format: pz-course/1",
      "**title:** **Big Course**",
      "type: **course**",
      "## Module: M",
      "### Session: **S**",
      `**video2:** ${YT2}`,
      `**video**: ${YT}`,
    ]);
    expect(r.raw.title).toBe("Big Course");
    const s = r.raw.modules[0].sessions[0];
    expect(s.title).toBe("S");
    expect(s.video2).toBe(YT2);
    expect(s.video).toBe(YT);
  });
});

describe("notes forms", () => {
  it("recovers label with dash, colon or space", () => {
    const r = parseOk([
      ...head(),
      "## Module: M",
      "### Session: S",
      "notes: Slides - https://x.y/a",
      "notes: Handout: https://x.y/b",
      "notes: Sheet https://x.y/c",
      "notes: Kept | https://x.y/d",
      "notes: https://x.y/e",
    ]);
    const n = r.raw.modules[0].sessions[0].notes;
    expect(n.map((x) => [x.label, x.url])).toEqual([
      ["Slides", "https://x.y/a"],
      ["Handout", "https://x.y/b"],
      ["Sheet", "https://x.y/c"],
      ["Kept", "https://x.y/d"],
      ["", "https://x.y/e"],
    ]);
  });
});

describe("video link cleanup", () => {
  const file = (v: string) =>
    [...head(), "## Module: M", "### Session: Day 1", `video: ${v}`, ...Q].join("\n");

  it("keeps only the link and warns when extra text is dropped", () => {
    const r = analyzeCourseFile(file(`${YT} (Lecture 1)`));
    if (!r.ok) throw new Error(r.errors.join(";"));
    expect(r.plan.modules[0].sessions[0].videoUrl).toBe(YT);
    expect(r.warnings.some((w) => w.includes("Day 1") && /video/i.test(w) && /extra/i.test(w))).toBe(true);
  });

  it("strips a trailing slash without a warning", () => {
    const r = analyzeCourseFile(file(`${YT}/`));
    if (!r.ok) throw new Error(r.errors.join(";"));
    expect(r.plan.modules[0].sessions[0].videoUrl).toBe(YT);
    expect(r.warnings.some((w) => /extra/i.test(w))).toBe(false);
  });
});

describe("module title limit", () => {
  it("rejects a module title over 150 but allows a session title of 200", () => {
    const mk = (m: string, s: string) =>
      [...head(), `## Module: ${m}`, `### Session: ${s}`, `video: ${YT}`, ...Q].join("\n");
    const bad = analyzeCourseFile(mk("M".repeat(151), "S"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.some((e) => e.includes("150"))).toBe(true);
    expect(analyzeCourseFile(mk("M".repeat(150), "S".repeat(200))).ok).toBe(true);
  });
});

describe("prompt guidance", () => {
  it("tells the AI quiz goes last and to omit module lines for workshops", () => {
    const p = masterPrompt();
    expect(p).toMatch(/quiz:[^\n]*LAST|LAST[^\n]*quiz:/i);
    expect(p).toMatch(/workshop or webinar[^\n]*(leave out|omit)[^\n]*## Module/i);
  });
});
