import { describe, expect, it } from "vitest";
import { masterPrompt } from "@/lib/lms/course-import/prompts";
import { analyzeCourseFile } from "@/lib/lms/course-import/analyze";
import { COURSE_IMPORT_FORMAT_ID, COURSE_IMPORT_LIMITS } from "@/lib/lms/course-import/format";
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
