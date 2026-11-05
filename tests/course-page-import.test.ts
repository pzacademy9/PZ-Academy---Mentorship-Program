// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyzeCourseFile, analyzePageFile } from "@/lib/lms/course-import/analyze";
import { parseCourseFile } from "@/lib/lms/course-import/parse";
import { readPrice, readWebinarDate } from "@/lib/lms/course-import/page-parts";
import { writePageFile, type PageFileInput } from "@/lib/lms/course-import/write";
import { exampleFile, improvePrompt, masterPrompt, pagePrompt } from "@/lib/lms/course-import/prompts";
import { PAGE_LIMITS } from "@/lib/marketing/page-limits";
import { TOPIC_MAX } from "@/lib/marketing/topics";
import { SECTION_KEYS, SECTION_TITLE_MAX, normalizeSections } from "@/lib/marketing/course-sections";

const OLD_FILE = `format: pz-course/1
title: Fake Course
type: course
tagline: Fake line

## Module: Fake Module
### Session: Fake Day 1
video: https://youtu.be/AAAAAAAAAAA
quiz:
Which is fake?
A) One
B) Two
Answer: B
`;

const PAGE_PARTS = `price: PKR 9,000
topic:  Clinical   Pharmacy
preview_video: https://youtu.be/DDDDDDDDDDD

## What you'll learn
- Fake skill one
* Fake skill two

## This course includes
1. 8 fake classes

## Questions and answers
Q: Fake question?
A: Fake answer
that runs on.
Q: Half question?

## Page sections
faq | show | Fake FAQ heading
about | hide
`;

describe("old files keep working", () => {
  it("an old file has no page parts and imports as before", () => {
    const r = analyzeCourseFile(OLD_FILE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.page).toEqual({});
    expect(r.summary.pageFilled).toEqual([]);
    expect(r.summary.sessions).toBe(1);
  });
});

describe("page parts in a whole course file", () => {
  const file = OLD_FILE.replace("tagline: Fake line\n", `tagline: Fake line\n${PAGE_PARTS}\n`);
  it("reads and checks every part, and the sessions still import", () => {
    const r = analyzeCourseFile(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.sessions).toBe(1);
    expect(r.plan.page).toMatchObject({
      pricePkr: 9000,
      topic: "Clinical Pharmacy",
      publicVideoUrl: "https://youtu.be/DDDDDDDDDDD",
      outcomes: ["Fake skill one", "Fake skill two"],
      features: ["8 fake classes"],
      faqs: [{ question: "Fake question?", answer: "Fake answer\nthat runs on." }],
    });
    expect(r.plan.page?.pageSections?.slice(0, 2)).toEqual([{ key: "faq", visible: true, title: "Fake FAQ heading" }, { key: "about", visible: false }]);
    expect(r.plan.page?.pageSections).toHaveLength(SECTION_KEYS.length);
    expect(r.warnings.some((w) => w.includes("has no answer"))).toBe(true);
    expect(r.summary.pageFilled).toEqual(["Price", "Topic", "Preview video", "What you'll learn", "This course includes", "Questions and answers", "Page sections"]);
  });
  it("lists after the sessions end the last session (no quiz text swallowed)", () => {
    const r = analyzeCourseFile(OLD_FILE + "\n## What you'll learn\n- After skill\n");
    expect(r.ok && r.plan.modules[0].sessions[0].questions).toHaveLength(1);
    expect(r.ok && r.plan.page?.outcomes).toEqual(["After skill"]);
  });
  it("a webinar date is kept on webinars only", () => {
    const web = `format: pz-course/1\ntitle: Fake Webinar\ntype: webinar\nwebinar_date: 2026-11-10 19:00\n\n### Session: Live\nvideo: https://youtu.be/AAAAAAAAAAA\n`;
    const r = analyzeCourseFile(web);
    expect(r.ok && r.plan.page?.startsAt).toBe("2026-11-10T14:00:00.000Z");
    const c = analyzeCourseFile(OLD_FILE.replace("tagline:", "webinar_date: 2026-11-10 19:00\ntagline:"));
    expect(c.ok && c.plan.page?.startsAt).toBeUndefined();
    expect(c.ok && c.warnings.some((w) => w.includes("only used on webinars"))).toBe(true);
  });
});

describe("checks", () => {
  it("reads prices in common ways and refuses odd ones", () => {
    expect(readPrice("9000")).toBe(9000);
    expect(readPrice("Rs. 12,500/-")).toBe(12500);
    expect(readPrice("Free")).toBe(0);
    expect(readPrice("9000.50")).toBeNull();
    expect(readPrice("around 9000")).toBeNull();
  });
  it("reads a webinar date in Pakistan time", () => {
    expect(readWebinarDate("2026-11-10 9:05")).toBe("2026-11-10T04:05:00.000Z");
    expect(readWebinarDate("10 Nov 2026")).toBeNull();
  });
  it("drops what breaks the limits, with a warning", () => {
    const lines = Array.from({ length: PAGE_LIMITS.maxLines + 2 }, (_, i) => `- Fake ${i}`).join("\n");
    const file = `format: pz-course/1\ntopic: ${"x".repeat(TOPIC_MAX + 1)}\nprice: ${PAGE_LIMITS.maxPricePkr + 1}\npreview_video: javascript:alert(1)\n\n## What you'll learn\n${lines}\n- ${"y".repeat(PAGE_LIMITS.maxLine + 1)}\n\n## Page sections\nnope | show\nlearn | maybe | ${"z".repeat(SECTION_TITLE_MAX + 1)}\nlearn | hide\n`;
    const r = analyzePageFile(file, "course");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.page.topic).toBeUndefined();
    expect(r.plan.page.pricePkr).toBeUndefined();
    expect(r.plan.page.publicVideoUrl).toBeUndefined();
    expect(r.plan.page.outcomes).toHaveLength(PAGE_LIMITS.maxLines);
    expect(r.plan.page.pageSections?.[0]).toEqual({ key: "learn", visible: true });
    expect(r.warnings.length).toBeGreaterThanOrEqual(7);
  });
});

describe("Import page from a file (course editor)", () => {
  it("takes a page-only file without title, type or sessions", () => {
    const r = analyzePageFile(`format: pz-course/1\ntagline: New fake line\n${PAGE_PARTS}`, "course");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.title).toBeUndefined();
    expect(r.plan.details).toEqual({ tagline: "New fake line" });
    expect(r.plan.page.pricePkr).toBe(9000);
  });
  it("leaves out sessions in a whole course file, with a note", () => {
    const r = analyzePageFile(OLD_FILE, "course");
    expect(r.ok && r.plan.title).toBe("Fake Course");
    expect(r.ok && r.warnings.some((w) => w.includes("Curriculum Builder"))).toBe(true);
  });
  it("refuses a file with nothing for the page, or the wrong layout", () => {
    expect(analyzePageFile("format: pz-course/1\n", "course").ok).toBe(false);
    expect(analyzePageFile("hello", "course").ok).toBe(false);
  });
  it("a list heading with no lines clears that list", () => {
    const r = analyzePageFile(`format: pz-course/1\n\n## This course includes\n`, "course");
    expect(r.ok && r.plan.page.features).toEqual([]);
    expect(r.ok && r.plan.page.outcomes).toBeUndefined();
  });
});

describe("Download my page as a file", () => {
  const input: PageFileInput = {
    title: "Fake Webinar",
    type: "webinar",
    details: { tagline: "Fake line", description: "Fake first paragraph.\n\nFake second paragraph.", mentorName: "Dr Fake" },
    pricePkr: 0,
    topic: "Fake Topic",
    startsAt: "2026-11-10T14:00:00.000Z",
    publicVideoUrl: "https://youtu.be/DDDDDDDDDDD",
    outcomes: ["Fake skill", ""],
    features: ["Fake include"],
    faqs: [{ question: "Fake Q?", answer: "Fake A\nline two" }, { question: "", answer: "dropped" }],
    pageSections: normalizeSections([{ key: "faq", visible: false, title: "Fake heading" }]),
  };
  it("reads back to the same values", () => {
    const text = writePageFile(input);
    const r = analyzePageFile(text, "webinar");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.plan.title).toBe("Fake Webinar");
    expect(r.plan.details).toEqual(input.details);
    expect(r.plan.page).toEqual({
      pricePkr: 0, topic: "Fake Topic", startsAt: input.startsAt, publicVideoUrl: input.publicVideoUrl,
      outcomes: ["Fake skill"], features: ["Fake include"], faqs: [{ question: "Fake Q?", answer: "Fake A\nline two" }],
      pageSections: input.pageSections,
    });
  });
});

describe("AI prompts", () => {
  it("the example file and the prompt examples import cleanly", () => {
    const r = analyzeCourseFile(exampleFile());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.pageFilled).toContain("Questions and answers");
    for (const p of [pagePrompt(), masterPrompt()]) {
      const block = /```\n([\s\S]*?)```/.exec(p)![1];
      expect(parseCourseFile(block, { pageOnly: true }).ok).toBe(true);
    }
  });
  it("take their numbers from the shared limit tables", () => {
    for (const p of [masterPrompt(), pagePrompt(), improvePrompt()]) {
      expect(p).toContain(`at most ${PAGE_LIMITS.maxLines} lines, ${PAGE_LIMITS.maxLine} characters each`);
      expect(p).toContain(`at most ${PAGE_LIMITS.maxFaqs} questions`);
      expect(p).toContain(`at most ${TOPIC_MAX} characters`);
      expect(p).toMatch(/Never invent a number, a price, a date, a student review/);
    }
    expect(improvePrompt()).toMatch(/Never add or change links/);
  });
});
