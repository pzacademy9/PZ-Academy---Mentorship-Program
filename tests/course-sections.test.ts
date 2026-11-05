import { describe, it, expect } from "vitest";
import { SECTION_KEYS, normalizeSections, sectionTitle, pageFieldsPatch } from "@/lib/marketing/course-sections";
import { courseConfigSchema } from "@/lib/validations/admin-lms";

const base = { title: "Fake", type: "course" as const, status: "open" as const, pricePkr: 0 };

describe("normalizeSections", () => {
  it("nothing saved: every section, default order, all shown", () => {
    expect(normalizeSections(null)).toEqual(SECTION_KEYS.map((key) => ({ key, visible: true })));
    expect(normalizeSections([])).toEqual(SECTION_KEYS.map((key) => ({ key, visible: true })));
  });

  it("keeps the saved order and hidden flags, adds any missing section at the end", () => {
    const out = normalizeSections([{ key: "faq", visible: true }, { key: "about", visible: false, title: "  Fake heading  " }]);
    expect(out.slice(0, 2)).toEqual([{ key: "faq", visible: true }, { key: "about", visible: false, title: "Fake heading" }]);
    expect(out.map((s) => s.key).sort()).toEqual([...SECTION_KEYS].sort());
    expect(out.slice(2).every((s) => s.visible)).toBe(true);
  });

  it("drops unknown keys, repeats and junk", () => {
    const out = normalizeSections([{ key: "zzz", visible: true }, { key: "faq", visible: true }, { key: "faq", visible: false }, "bad", null]);
    expect(out.filter((s) => s.key === "faq")).toEqual([{ key: "faq", visible: true }]);
    expect(out).toHaveLength(SECTION_KEYS.length);
  });

  it("an empty custom heading means the normal heading", () => {
    expect(normalizeSections([{ key: "about", visible: true, title: "   " }])[0]).toEqual({ key: "about", visible: true });
  });
});

describe("sectionTitle", () => {
  it("uses the custom heading, else the normal one for this type", () => {
    expect(sectionTitle({ key: "about", visible: true, title: "Fake" }, "workshop")).toBe("Fake");
    expect(sectionTitle({ key: "about", visible: true }, "workshop")).toBe("About this workshop");
    expect(sectionTitle({ key: "curriculum", visible: true }, "webinar")).toBe("What's Covered");
  });
});

describe("pageFieldsPatch (only what the admin actually sent is written)", () => {
  it("writes nothing when the new fields are left out", () => {
    expect(pageFieldsPatch({})).toEqual({});
  });
  it("an empty link clears it", () => {
    expect(pageFieldsPatch({ publicVideoUrl: "", certificateImageUrl: "" })).toEqual({ public_video_url: null, certificate_image_url: null });
  });
  it("writes the section list cleaned up", () => {
    const p = pageFieldsPatch({ pageSections: [{ key: "faq", visible: false }] });
    expect((p.page_sections as { key: string }[])[0]).toEqual({ key: "faq", visible: false });
    expect(p.page_sections).toHaveLength(SECTION_KEYS.length);
  });
});

describe("courseConfigSchema new fields", () => {
  it("accepts sections, a video link and a certificate picture", () => {
    const r = courseConfigSchema.safeParse({ ...base, pageSections: [{ key: "about", visible: false, title: "Fake" }], publicVideoUrl: "https://youtu.be/abcDEF12345", certificateImageUrl: "" });
    expect(r.success).toBe(true);
  });
  it("rejects an unknown section and a non-https link", () => {
    expect(courseConfigSchema.safeParse({ ...base, pageSections: [{ key: "zzz", visible: true }] }).success).toBe(false);
    expect(courseConfigSchema.safeParse({ ...base, publicVideoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(courseConfigSchema.safeParse({ ...base, certificateImageUrl: "http://fake.example/x.png" }).success).toBe(false);
  });
  it("a heading longer than 80 letters is refused", () => {
    expect(courseConfigSchema.safeParse({ ...base, pageSections: [{ key: "about", visible: true, title: "x".repeat(81) }] }).success).toBe(false);
  });
});

import { changedPageFields } from "@/lib/marketing/course-sections";

describe("changedPageFields (the editor only sends what changed)", () => {
  const v = { publicVideoUrl: "", certificateImageUrl: "", outcomes: ["A"], features: [], faqs: [], pageSections: normalizeSections(null), topic: "", startsAt: "" };
  it("nothing changed: nothing sent, so a page saved before the database step still saves", () => {
    expect(changedPageFields(v, structuredClone(v))).toEqual({});
  });
  it("sends only the changed parts, with blank lines dropped", () => {
    const next = { ...structuredClone(v), outcomes: ["A", "  ", "B "], certificateImageUrl: "https://fake.example/c.png" };
    expect(changedPageFields(v, next)).toEqual({ outcomes: ["A", "B"], certificateImageUrl: "https://fake.example/c.png" });
  });
  it("drops half-filled questions", () => {
    const next = { ...structuredClone(v), faqs: [{ question: "Q?", answer: "" }, { question: " Q2? ", answer: " A2 " }] };
    expect(changedPageFields(v, next)).toEqual({ faqs: [{ question: "Q2?", answer: "A2" }] });
  });
});
