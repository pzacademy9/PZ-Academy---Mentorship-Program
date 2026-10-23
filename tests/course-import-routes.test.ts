// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const gate = vi.hoisted(() => ({ ok: true, status: 403 }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.status }) }),
}));
const m = vi.hoisted(() => ({ createCourseFromPlan: vi.fn() }));
vi.mock("@/lib/data/course-import", () => ({ createCourseFromPlan: m.createCourseFromPlan }));

import { POST as preview } from "@/app/api/admin/courses/import/preview/route";
import { POST as create } from "@/app/api/admin/courses/import/route";

const GOOD = [
  "format: pz-course/1",
  "title: Test Course",
  "type: course",
  "",
  "## Module: Basics",
  "### Session: Intro",
  "video: https://www.youtube.com/watch?v=abc123",
  "quiz:",
  "1. Question number 1?",
  "A) One",
  "B) Two",
  "Answer: A",
  "",
].join("\n");

const BAD = "format: pz-course/1\ntype: course\n";

const req = (body: unknown) =>
  new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;

const TOO_BIG = { errors: ["That file is too big to import."] };
const NO_TEXT = { errors: ["Choose a file or paste the text first."] };

beforeEach(() => {
  gate.ok = true; gate.status = 403;
  m.createCourseFromPlan.mockReset();
});

describe("POST /api/admin/courses/import/preview", () => {
  it("blocks non-admin", async () => {
    gate.ok = false;
    const res = await preview(req({ text: GOOD }));
    expect(res.status).toBe(403);
    expect(m.createCourseFromPlan).not.toHaveBeenCalled();
  });

  it("returns title, type, warnings and summary without creating", async () => {
    const res = await preview(req({ text: GOOD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Test Course");
    expect(body.type).toBe("course");
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.summary).toBeTruthy();
    expect(m.createCourseFromPlan).not.toHaveBeenCalled();
  });

  it("returns 400 with errors for a bad file", async () => {
    const res = await preview(req({ text: BAD }));
    expect(res.status).toBe(400);
    expect((await res.json()).errors.length).toBeGreaterThan(0);
  });

  it.each([
    ["not json", "{nope"],
    ["missing text", {}],
    ["empty text", { text: "" }],
    ["wrong type", { text: 5 }],
  ])("returns 400 for invalid body: %s", async (_n, body) => {
    const res = await preview(req(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(NO_TEXT);
  });

  it("returns too-big 400 for long text", async () => {
    const res = await preview(req({ text: "a".repeat(400_001) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(TOO_BIG);
  });
});

describe("POST /api/admin/courses/import", () => {
  it("blocks non-admin and never creates", async () => {
    gate.ok = false;
    const res = await create(req({ text: GOOD }));
    expect(res.status).toBe(403);
    expect(m.createCourseFromPlan).not.toHaveBeenCalled();
  });

  it("creates from re-analysed text and returns 201", async () => {
    m.createCourseFromPlan.mockResolvedValue({ ok: true, id: "c1", slug: "test-course" });
    const res = await create(req({ text: GOOD, plan: { title: "evil" } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("c1");
    expect(body.slug).toBe("test-course");
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.summary).toBeTruthy();
    expect(m.createCourseFromPlan).toHaveBeenCalledTimes(1);
    expect(m.createCourseFromPlan.mock.calls[0][0].title).toBe("Test Course");
  });

  it("returns 400 on analysis errors and never creates", async () => {
    const res = await create(req({ text: BAD }));
    expect(res.status).toBe(400);
    expect((await res.json()).errors.length).toBeGreaterThan(0);
    expect(m.createCourseFromPlan).not.toHaveBeenCalled();
  });

  it("returns the 500 message when creation fails", async () => {
    m.createCourseFromPlan.mockResolvedValue({ ok: false, reason: "db-error" });
    const res = await create(req({ text: GOOD }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      errors: ["Something went wrong while creating the course. Nothing was saved; please try again."],
    });
  });

  it("returns the 500 message when creation throws", async () => {
    m.createCourseFromPlan.mockRejectedValue(new Error("secret"));
    const res = await create(req({ text: GOOD }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/secret/);
  });

  it("rejects oversize bodies and missing text", async () => {
    for (const r of [req({ text: "a".repeat(400_001) }), req("x".repeat(1_700_000))]) {
      const res = await create(r);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(TOO_BIG);
    }
    const res = await create(req({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(NO_TEXT);
    expect(m.createCourseFromPlan).not.toHaveBeenCalled();
  });
});
