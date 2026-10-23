// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Res, type Store } from "./helpers/supabase-mock";
import { parseCourseFile } from "@/lib/lms/course-import/parse";
import { analyzeCourseFile, type ImportPlan } from "@/lib/lms/course-import/analyze";
import { COURSE_DETAIL_FIELDS } from "@/lib/lms/course-import/format";
import { masterPrompt } from "@/lib/lms/course-import/prompts";

vi.mock("server-only", () => ({}));

const admin = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => admin.client }));

import { createCourseFromPlan } from "@/lib/data/course-import";

const YT = "https://www.youtube.com/watch?v=abc123";
const QUIZ = "quiz:\n1. Q one?\nA) One\nB) Two\nAnswer: A\n";

function file(header: string[], type = "course"): string {
  const body =
    type === "course"
      ? ["## Module: Basics", "### Session: Intro", `video: ${YT}`, QUIZ]
      : ["### Session: Intro", `video: ${YT}`, QUIZ];
  return ["format: pz-course/1", "title: Test", `type: ${type}`, ...header, "", ...body].join("\n");
}

function pass(text: string) {
  const r = parseCourseFile(text);
  if (!r.ok) throw new Error("expected success: " + r.errors.join(" / "));
  return r;
}

function ok(text: string) {
  const r = analyzeCourseFile(text);
  if (!r.ok) throw new Error("expected ok: " + r.errors.join(" / "));
  return r;
}

describe("parser: course details in the header", () => {
  it("reads every detail key", () => {
    const r = pass(
      file([
        "tagline: Learn it fast",
        "description: About the course",
        "level: Beginner",
        "duration: 1 Month",
        "timings: 6:30 PM - 7:30 PM",
        "mentor_name: Dr Jane",
        "mentor_title: Clinical Pharmacist",
        "mentor_bio: Ten years of practice",
      ]),
    );
    expect(r.raw.details).toEqual({
      tagline: "Learn it fast",
      description: "About the course",
      level: "Beginner",
      duration: "1 Month",
      timings: "6:30 PM - 7:30 PM",
      mentorName: "Dr Jane",
      mentorTitle: "Clinical Pharmacist",
      mentorBio: "Ten years of practice",
    });
    expect(r.warnings).toEqual([]);
  });

  it("has empty details when the file has none", () => {
    const r = pass(file([]));
    expect(Object.values(r.raw.details).every((v) => v === "")).toBe(true);
  });

  it("keys are case-insensitive and bold markers are tolerated", () => {
    const r = pass(file(["**Tagline:** Short line", "LEVEL: Intermediate", "**mentor_name**: Dr Ali"]));
    expect(r.raw.details.tagline).toBe("Short line");
    expect(r.raw.details.level).toBe("Intermediate");
    expect(r.raw.details.mentorName).toBe("Dr Ali");
    expect(r.warnings).toEqual([]);
  });

  it("description and mentor_bio continue over following lines", () => {
    const r = pass(
      file([
        "description: First line",
        "second line",
        "",
        "second paragraph",
        "level: Beginner",
        "mentor_bio: Bio start",
        "bio more",
      ]),
    );
    expect(r.raw.details.description).toBe("First line\nsecond line\n\nsecond paragraph");
    expect(r.raw.details.mentorBio).toBe("Bio start\nbio more");
    expect(r.raw.details.level).toBe("Beginner");
    expect(r.warnings).toEqual([]);
  });

  it("a continuation can start on the line after an empty description key", () => {
    const r = pass(file(["description:", "Text on next line"]));
    expect(r.raw.details.description).toBe("Text on next line");
  });

  it("other keys do not continue; stray lines after them are not understood", () => {
    const r = pass(file(["tagline: One", "stray text"]));
    expect(r.raw.details.tagline).toBe("One");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/not understood/);
  });

  it("a heading ends a continuation and later detail keys are not details", () => {
    const r = pass(
      ["format: pz-course/1", "title: T", "type: course", "description: Desc", "", "## Module: M", "### Session: S", `video: ${YT}`, "tagline: late"].join("\n"),
    );
    expect(r.raw.details.description).toBe("Desc");
    expect(r.raw.details.tagline).toBe("");
    expect(r.warnings.some((w) => /not understood/.test(w))).toBe(true);
  });

  it("a repeated key keeps the first value with a plain warning", () => {
    const r = pass(file(["level: Beginner", "level: Advanced"]));
    expect(r.raw.details.level).toBe("Beginner");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/level/i);
    expect(r.warnings[0]).toMatch(/more than once/);
  });

  it("lines continuing a repeated description are dropped", () => {
    const r = pass(file(["description: First", "description: Second", "second more"]));
    expect(r.raw.details.description).toBe("First");
  });

  it("works in workshop files", () => {
    const r = pass(file(["tagline: Live day", "duration: 4 Days"], "workshop"));
    expect(r.raw.details.tagline).toBe("Live day");
    expect(r.raw.details.duration).toBe("4 Days");
  });
});

describe("analyzer: course details", () => {
  it("puts only non-empty details in the plan and lists their labels", () => {
    const r = ok(file(["tagline: Short", "level:", "mentor_name:   ", "duration: 1 Month"]));
    expect(r.plan.details).toEqual({ tagline: "Short", duration: "1 Month" });
    expect(r.summary.detailsFilled).toEqual(["Tagline", "Duration"]);
    expect(r.warnings).toEqual([]);
  });

  it("a file without details has an empty plan.details and no labels", () => {
    const r = ok(file([]));
    expect(r.plan.details).toEqual({});
    expect(r.summary.detailsFilled).toEqual([]);
  });

  it("labels come out in a fixed order", () => {
    const r = ok(
      file([
        "mentor_bio: Bio",
        "mentor_title: Pharmacist",
        "mentor_name: Dr Jane",
        "timings: Evenings",
        "duration: 1 Month",
        "level: Beginner",
        "description: Desc",
        "tagline: Tag",
      ]),
    );
    expect(r.summary.detailsFilled).toEqual([
      "Tagline",
      "Description",
      "Level",
      "Duration",
      "Timings",
      "Mentor name",
      "Mentor designation",
      "Mentor bio",
    ]);
  });

  it("a detail over its limit is left out with a plain warning, never cut", () => {
    const r = ok(file([`description: ${"x".repeat(5001)}`, `tagline: ${"y".repeat(301)}`, "level: Beginner"]));
    expect(r.plan.details).toEqual({ level: "Beginner" });
    expect(r.summary.detailsFilled).toEqual(["Level"]);
    expect(r.warnings).toContain("The description is longer than 5000 letters, so it was left out.");
    expect(r.warnings).toContain("The tagline is longer than 300 letters, so it was left out.");
  });

  it("a detail exactly at its limit is kept in full", () => {
    const r = ok(file([`level: ${"z".repeat(50)}`]));
    expect(r.plan.details.level).toBe("z".repeat(50));
    expect(r.warnings).toEqual([]);
  });

  it("the limits match the course settings form", () => {
    const max = Object.fromEntries(COURSE_DETAIL_FIELDS.map((f) => [f.field, f.max]));
    expect(max).toEqual({
      tagline: 300,
      description: 5000,
      level: 50,
      duration: 50,
      timings: 200,
      mentorName: 120,
      mentorTitle: 120,
      mentorBio: 2000,
    });
  });
});

describe("prompt: course details", () => {
  const prompt = masterPrompt();

  it("mentions every key and the never-invent rule for mentor details", () => {
    for (const f of COURSE_DETAIL_FIELDS) expect(prompt).toContain(`${f.key}:`);
    expect(prompt.toLowerCase()).toContain("never invent");
    expect(prompt).toMatch(/mentor[\s\S]{0,400}never invent/i);
  });

  it("states the detail limits", () => {
    for (const f of COURSE_DETAIL_FIELDS) expect(prompt).toContain(f.max.toLocaleString("en-US"));
  });

  it("its example details end up in the plan", () => {
    const m = /```\n(format: [\s\S]*?)\n```/.exec(prompt);
    expect(m).not.toBeNull();
    const r = ok(m![1]);
    expect(Object.keys(r.plan.details).sort()).toEqual(COURSE_DETAIL_FIELDS.map((f) => f.field).sort());
    expect(r.summary.detailsFilled).toHaveLength(8);
    expect(r.warnings.filter((w) => /left out|more than once|not understood/.test(w))).toEqual([]);
    expect(r.plan.details.timings).toContain("UAE Time");
  });
});

describe("createCourseFromPlan: course details", () => {
  let store: Store;
  beforeEach(() => {
    admin.reset();
    store = { courses: [], modules: [], lessons: [], quiz_questions: [], module_notes: [] };
    admin.state.handler = memoryHandler(store);
  });

  const session = { title: "S", videoUrl: "https://youtu.be/a", videoUrl2: "", notes: [], questions: [] };
  const coursePlan = (details: ImportPlan["details"]): ImportPlan => ({
    title: "C",
    type: "course",
    details,
    modules: [{ title: "M", notes: [], sessions: [session] }],
  });
  const workshopPlan = (details: ImportPlan["details"]): ImportPlan => ({
    title: "W",
    type: "workshop",
    details,
    modules: [{ title: "", notes: [], sessions: [session] }],
  });
  const ALL = {
    tagline: "T",
    description: "D",
    level: "L",
    duration: "1 Month",
    timings: "Evenings",
    mentorName: "Dr J",
    mentorTitle: "Pharmacist",
    mentorBio: "Bio",
  };
  const courseUpdates = () => admin.find("courses", "update");

  it("writes all details with one update by id, on exact columns", async () => {
    const res = await createCourseFromPlan(coursePlan(ALL));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ups = courseUpdates();
    expect(ups).toHaveLength(1);
    expect(ups[0].payload).toEqual({
      tagline: "T",
      description: "D",
      level: "L",
      duration_text: "1 Month",
      timings: "Evenings",
      mentor_name: "Dr J",
      mentor_title: "Pharmacist",
      mentor_bio: "Bio",
    });
    expect(ups[0].filters).toEqual([["eq", "id", res.id]]);
    expect(store.courses.find((c) => c.id === res.id)).toMatchObject({ duration_text: "1 Month", mentor_title: "Pharmacist" });
  });

  it("writes only the details that are present", async () => {
    await createCourseFromPlan(coursePlan({ level: "Beginner" }));
    const ups = courseUpdates();
    expect(ups).toHaveLength(1);
    expect(ups[0].payload).toEqual({ level: "Beginner" });
  });

  it("makes no update when there are no details", async () => {
    const res = await createCourseFromPlan(coursePlan({}));
    expect(res.ok).toBe(true);
    expect(courseUpdates()).toHaveLength(0);
  });

  it("works for workshops and webinars too", async () => {
    const res = await createCourseFromPlan(workshopPlan({ tagline: "Live", duration: "4 Days" }));
    expect(res.ok).toBe(true);
    const ups = courseUpdates();
    expect(ups).toHaveLength(1);
    expect(ups[0].payload).toEqual({ tagline: "Live", duration_text: "4 Days" });
  });

  it("a failing details update deletes the draft course", async () => {
    const mem = memoryHandler(store);
    admin.state.handler = (op: Op): Res =>
      op.table === "courses" && op.op === "update" ? { data: null, error: { message: "boom" } } : mem(op);
    expect(await createCourseFromPlan(coursePlan(ALL))).toEqual({ ok: false, reason: "db-error" });
    expect(store.courses).toHaveLength(0);
    expect(store.modules).toHaveLength(0);
  });

  it("a thrown error in the details update deletes the draft course", async () => {
    const mem = memoryHandler(store);
    admin.state.handler = (op: Op): Res => {
      if (op.table === "courses" && op.op === "update") throw new Error("network");
      return mem(op);
    };
    expect(await createCourseFromPlan(workshopPlan(ALL))).toEqual({ ok: false, reason: "db-error" });
    expect(store.courses).toHaveLength(0);
  });
});
