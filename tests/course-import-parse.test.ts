import { describe, it, expect } from "vitest";
import { parseCourseFile } from "@/lib/lms/course-import/parse";
import { COURSE_IMPORT_LIMITS } from "@/lib/lms/course-import/format";

const COURSE = [
  "format: pz-course/1",
  "title: Practical Pharmacology",
  "type: course",
  "",
  "## Module: Basics",
  "notes: Module handout | https://x.y/mod",
  "### Session: Intro",
  "video: https://v.example/1",
  "video2: https://v.example/1b",
  "notes: Slides | https://x.y/slides",
  "quiz:",
  "1. What is a drug?",
  "A) One",
  "B) Two",
  "",
  "Answer: A",
  "### Session: Dosing",
  "video: https://v.example/2",
  "## Module: Advanced",
  "### Session: Interactions",
].join("\n");

function fail(text: string): string[] {
  const r = parseCourseFile(text);
  if (r.ok) throw new Error("expected failure");
  return r.errors;
}

function pass(text: string) {
  const r = parseCourseFile(text);
  if (!r.ok) throw new Error("expected success: " + r.errors.join(" / "));
  return r;
}

describe("parseCourseFile", () => {
  it("reads a course file with two modules", () => {
    const { raw, warnings } = pass(COURSE);
    expect(warnings).toEqual([]);
    expect(raw.title).toBe("Practical Pharmacology");
    expect(raw.type).toBe("course");
    expect(raw.modules.map((m) => m.title)).toEqual(["Basics", "Advanced"]);
    expect(raw.modules[0].sessions.map((s) => s.title)).toEqual(["Intro", "Dosing"]);
    expect(raw.modules[0].notes).toEqual([
      { label: "Module handout", url: "https://x.y/mod", line: 6 },
    ]);
    const intro = raw.modules[0].sessions[0];
    expect(intro.video).toBe("https://v.example/1");
    expect(intro.video2).toBe("https://v.example/1b");
    expect(intro.notes).toEqual([{ label: "Slides", url: "https://x.y/slides", line: 10 }]);
    expect(intro.quizLine).toBe(12);
    expect(intro.quizText).toBe("1. What is a drug?\nA) One\nB) Two\n\nAnswer: A");
    expect(raw.modules[0].sessions[1].quizText).toBe("");
    expect(raw.modules[1].sessions[0].title).toBe("Interactions");
    expect(raw.unassignedNotes).toEqual([]);
  });

  it("a note with no label keeps the link", () => {
    const { raw } = pass(
      "format: pz-course/1\ntitle: T\ntype: course\n## Module: M\n### Session: S\nnotes: https://x.y/z",
    );
    expect(raw.modules[0].sessions[0].notes[0]).toMatchObject({ label: "", url: "https://x.y/z" });
  });

  it("session titles may contain colons", () => {
    const { raw } = pass(
      "format: pz-course/1\ntitle: T\ntype: course\n## Module: M\n### Session: Day 1: Intro",
    );
    expect(raw.modules[0].sessions[0].title).toBe("Day 1: Intro");
  });

  it("workshop file has sessions straight under the top lines", () => {
    const { raw } = pass(
      "format: pz-course/1\ntitle: W\ntype: workshop\nnotes: Pack | https://x.y/p\n### Session: One\nvideo: https://v/1\n### Session: Two",
    );
    expect(raw.type).toBe("workshop");
    expect(raw.modules).toHaveLength(1);
    expect(raw.modules[0].title).toBe("");
    expect(raw.modules[0].notes).toEqual([{ label: "Pack", url: "https://x.y/p", line: 4 }]);
    expect(raw.modules[0].sessions.map((s) => s.title)).toEqual(["One", "Two"]);
  });

  it("strips a code fence and chat text around it", () => {
    const text = [
      "Sure! Here is your course:",
      "```",
      "not the file",
      "```",
      "```text",
      "format: pz-course/1",
      "title: Fenced",
      "type: webinar",
      "### Session: Live",
      "```",
      "Hope that helps!",
    ].join("\n");
    const { raw } = pass(text);
    expect(raw.title).toBe("Fenced");
    expect(raw.type).toBe("webinar");
    expect(raw.modules[0].sessions[0].title).toBe("Live");
  });

  it("accepts CRLF, a BOM, smart quotes and non-Latin titles", () => {
    const text =
      "﻿format: pz-course/1\r\ntitle: پریکٹیکل فارماکولوجی – Batch 2\r\ntype: course\r\n## Module: “Smart” module\r\n### Session: It’s fine\r\n";
    const { raw } = pass(text);
    expect(raw.title).toBe("پریکٹیکل فارماکولوجی – Batch 2");
    expect(raw.modules[0].title).toBe("“Smart” module");
    expect(raw.modules[0].sessions[0].title).toBe("It’s fine");
  });

  it("keys are case-insensitive", () => {
    const { raw } = pass(
      "Format: pz-course/1\nTITLE: T\nType: Course\n## module: M\n### SESSION: S\nVideo: https://v/1\nQUIZ:\nQ1",
    );
    expect(raw.title).toBe("T");
    expect(raw.modules[0].sessions[0].video).toBe("https://v/1");
    expect(raw.modules[0].sessions[0].quizText).toBe("Q1");
  });

  it("unknown lines before the first heading are a warning, not an error", () => {
    const r = pass("format: pz-course/1\ntitle: T\ntype: course\nrandom words\n## Module: M\n### Session: S");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("Line 4");
  });

  it("top-level video and notes lines in a course file are warnings", () => {
    const r = pass(
      "format: pz-course/1\ntitle: T\ntype: course\nvideo: https://v/1\nnotes: A | https://x/y\n## Module: M\n### Session: S",
    );
    expect(r.warnings).toHaveLength(2);
    expect(r.raw.unassignedNotes).toEqual([]);
    expect(r.raw.modules[0].notes).toEqual([]);
  });

  it("collects unassigned notes", () => {
    const r = pass(
      "format: pz-course/1\ntitle: T\ntype: course\n## Module: M\n### Session: S\n## Unassigned notes\nnotes: Loose | https://x/l",
    );
    expect(r.raw.unassignedNotes).toEqual([{ label: "Loose", url: "https://x/l", line: 7 }]);
  });

  it("quiz stops at the next heading and swallows notes lines", () => {
    const r = pass(
      [
        "format: pz-course/1",
        "title: T",
        "type: course",
        "## Module: M",
        "### Session: A",
        "quiz:",
        "Q1",
        "notes: not a note | https://x/n",
        "title: still quiz",
        "### Session: B",
        "notes: Real | https://x/r",
      ].join("\n"),
    );
    const [a, b] = r.raw.modules[0].sessions;
    expect(a.quizText).toBe("Q1\nnotes: not a note | https://x/n\ntitle: still quiz");
    expect(a.notes).toEqual([]);
    expect(b.notes).toEqual([{ label: "Real", url: "https://x/r", line: 11 }]);
    expect(b.quizText).toBe("");
  });
});

describe("parseCourseFile blocking errors", () => {
  it("rejects empty text", () => {
    expect(fail("   \n \n")).toEqual(["The file is empty."]);
  });

  it("rejects a missing format line", () => {
    expect(fail("title: T\ntype: course")).toEqual([
      "This file is not in the right layout. The first line must say format: pz-course/1.",
    ]);
  });

  it("rejects a wrong format", () => {
    expect(fail("format: pz-course/9\ntitle: T\ntype: course")).toEqual([
      "This file is not in the right layout. The first line must say format: pz-course/1.",
    ]);
  });

  it("rejects a missing title", () => {
    expect(fail("format: pz-course/1\ntype: course\n## Module: M")).toContain(
      "The course needs a title.",
    );
  });

  it("rejects an unknown type", () => {
    expect(fail("format: pz-course/1\ntitle: T\ntype: bootcamp")).toContain(
      "The type must be course, workshop or webinar.",
    );
  });

  it("rejects a module heading in a workshop file", () => {
    expect(fail("format: pz-course/1\ntitle: T\ntype: workshop\n## Module: M")).toContain(
      "Workshops and webinars have sessions only, no modules.",
    );
  });

  it("rejects a session before any module in a course file", () => {
    expect(fail("format: pz-course/1\ntitle: T\ntype: course\n\n### Session: S")).toContain(
      "A session at line 5 is not inside a module.",
    );
  });

  it("rejects a module heading with no title", () => {
    expect(fail("format: pz-course/1\ntitle: T\ntype: course\n## Module:  ")).toContain(
      "The module at line 4 has no title.",
    );
  });

  it("rejects a session heading with no title", () => {
    expect(
      fail("format: pz-course/1\ntitle: T\ntype: course\n## Module: M\n### Session:"),
    ).toContain("The session at line 5 has no title.");
  });

  it("rejects text over the size limit", () => {
    const text = "format: pz-course/1\ntitle: T\ntype: course\n" + "x".repeat(COURSE_IMPORT_LIMITS.maxChars);
    expect(fail(text)).toEqual(["The file is too long to import."]);
  });
});
