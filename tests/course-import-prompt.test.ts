import { describe, expect, it } from "vitest";
import { curriculumPrompt, masterPrompt } from "@/lib/lms/course-import/prompts";
import { analyzeCourseFile } from "@/lib/lms/course-import/analyze";
import { COURSE_IMPORT_FORMAT_ID, COURSE_IMPORT_LIMITS, PAGE_LIST_HEADINGS } from "@/lib/lms/course-import/format";
import { QUIZ_PASTE_EXAMPLE } from "@/lib/lms/quiz-paste";

describe("masterPrompt", () => {
  const prompt = masterPrompt();

  it("names the format and carries the quiz example verbatim", () => {
    expect(prompt).toContain(COURSE_IMPORT_FORMAT_ID);
    expect(prompt).toContain(QUIZ_PASTE_EXAMPLE);
  });

  it("states each limit", () => {
    const L = COURSE_IMPORT_LIMITS;
    for (const n of [L.maxModules, L.maxSessions, L.maxQuestionsPerSession, L.maxQuestionsPerCourse, L.maxNotesPerSession]) {
      expect(prompt).toContain(n.toLocaleString("en-US"));
    }
  });

  it("carries the key rules", () => {
    expect(prompt.toLowerCase()).toContain("never invent");
    expect(prompt).toContain("## Unassigned notes");
  });

  it("has an example that passes the checker", () => {
    const m = /```\n(format: [\s\S]*?)\n```/.exec(prompt);
    expect(m).not.toBeNull();
    const result = analyzeCourseFile(m![1]);
    expect(result.ok).toBe(true);
  });
});

describe("curriculumPrompt", () => {
  const prompt = curriculumPrompt();

  it("names the format and carries the quiz example", () => {
    expect(prompt).toContain(COURSE_IMPORT_FORMAT_ID);
    expect(prompt).toContain(QUIZ_PASTE_EXAMPLE);
  });

  it("has no page parts or course details", () => {
    for (const h of Object.values(PAGE_LIST_HEADINGS)) expect(prompt).not.toContain(h);
    expect(prompt).not.toContain("price:");
    expect(prompt).not.toContain("tagline:");
    expect(prompt).not.toContain("description:");
  });

  it("tells the AI to keep names exactly and to ask for them", () => {
    expect(prompt).toContain("exactly as they are in the program");
    expect(prompt.toLowerCase()).toContain("ask me for the current");
  });

  it("states each limit", () => {
    const L = COURSE_IMPORT_LIMITS;
    for (const n of [L.maxModules, L.maxSessions, L.maxQuestionsPerSession, L.maxQuestionsPerCourse, L.maxNotesPerSession]) {
      expect(prompt).toContain(n.toLocaleString("en-US"));
    }
  });

  it("has an example that passes the checker", () => {
    const m = /```\n(format: [\s\S]*?)\n```/.exec(prompt);
    expect(m).not.toBeNull();
    expect(analyzeCourseFile(m![1]).ok).toBe(true);
  });
});
