// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const gate = vi.hoisted(() => ({ ok: true, status: 403 }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (gate.ok
    ? { ok: true, user: { id: "admin-1" } }
    : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.status }) }),
}));
const m = vi.hoisted(() => ({ loadCurrentCurriculum: vi.fn(), applyCurriculumChanges: vi.fn() }));
vi.mock("@/lib/data/course-curriculum-import", () => ({
  loadCurrentCurriculum: m.loadCurrentCurriculum,
  applyCurriculumChanges: m.applyCurriculumChanges,
}));

import { POST as check } from "@/app/api/admin/courses/[id]/import-curriculum/check/route";
import { POST as apply } from "@/app/api/admin/courses/[id]/import-curriculum/apply/route";

const GOOD = [
  "format: pz-course/1",
  "title: Test Course",
  "type: course",
  "",
  "## Module: Basics",
  "### Session: Intro",
  "video: https://www.youtube.com/watch?v=abc123",
  "",
].join("\n");

const BAD = "format: pz-course/1\ntype: course\n";

const CURRENT = {
  type: "course",
  curriculum: {
    flat: false,
    modules: [
      { id: "m1", title: "Basics", notes: [], lessons: [
        { id: "l1", title: "Intro", videoUrl: "", videoUrl2: "", notes: [], questions: [] },
      ] },
      { id: "m2", title: "Extra", notes: [], lessons: [] },
    ],
  },
};

const ctx = { params: Promise.resolve({ id: "c1" }) };
const req = (body: unknown) =>
  new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;

beforeEach(() => {
  gate.ok = true; gate.status = 403;
  m.loadCurrentCurriculum.mockReset();
  m.applyCurriculumChanges.mockReset();
  m.loadCurrentCurriculum.mockResolvedValue(CURRENT);
});

describe("POST import-curriculum/check", () => {
  it("blocks non-admin", async () => {
    gate.ok = false;
    const res = await check(req({ text: GOOD }), ctx);
    expect(res.status).toBe(403);
    expect(m.loadCurrentCurriculum).not.toHaveBeenCalled();
  });

  it("returns 404 when the program is missing", async () => {
    m.loadCurrentCurriculum.mockResolvedValue(null);
    const res = await check(req({ text: GOOD }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 with errors for a bad file", async () => {
    const res = await check(req({ text: BAD }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).errors.length).toBeGreaterThan(0);
  });

  it("returns 400 with a plain message for the wrong type", async () => {
    m.loadCurrentCurriculum.mockResolvedValue({ ...CURRENT, type: "workshop" });
    const res = await check(req({ text: GOOD }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: ["This file is for a different kind of program."] });
  });

  it("returns the change rows", async () => {
    const res = await check(req({ text: GOOD }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("course");
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.changes.map((c: { id: string }) => c.id)).toEqual(["update-session:l1", "remove-module:m2"]);
    for (const c of body.changes) expect(c.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

// Runs Check and returns the fingerprints it handed out.
async function prints(current = CURRENT): Promise<Record<string, string>> {
  m.loadCurrentCurriculum.mockResolvedValueOnce(current);
  const body = await (await check(req({ text: GOOD }), ctx)).json();
  return Object.fromEntries(body.changes.map((c: { id: string; fingerprint: string }) => [c.id, c.fingerprint]));
}

describe("POST import-curriculum/apply", () => {
  it("blocks non-admin and never applies", async () => {
    gate.ok = false;
    const res = await apply(req({ text: GOOD, ids: ["update-session:l1"] }), ctx);
    expect(res.status).toBe(403);
    expect(m.applyCurriculumChanges).not.toHaveBeenCalled();
  });

  it("returns 400 when nothing is ticked", async () => {
    const res = await apply(req({ text: GOOD, ids: [] }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: ["Nothing is ticked."] });
    expect(m.applyCurriculumChanges).not.toHaveBeenCalled();
  });

  it("returns 409 for an id that is not in the recomputed rows", async () => {
    const fingerprints = await prints();
    const res = await apply(req({ text: GOOD, ids: ["update-session:l1", "remove-session:gone"], fingerprints, confirmRemove: true }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ errors: ["The program changed. Check the file again."] });
    expect(m.applyCurriculumChanges).not.toHaveBeenCalled();
  });

  it("returns 409 when a ticked row's fingerprint is missing", async () => {
    const res = await apply(req({ text: GOOD, ids: ["update-session:l1"] }), ctx);
    expect(res.status).toBe(409);
    expect(m.applyCurriculumChanges).not.toHaveBeenCalled();
  });

  it("returns 409 when the same id now points at changed content", async () => {
    const fingerprints = await prints();
    const edited = structuredClone(CURRENT);
    edited.curriculum.modules[1].lessons.push(
      { id: "l9", title: "Added later", videoUrl: "", videoUrl2: "", notes: [], questions: [] } as never,
    );
    m.loadCurrentCurriculum.mockResolvedValue(edited);
    const res = await apply(req({ text: GOOD, ids: ["remove-module:m2"], fingerprints, confirmRemove: true }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ errors: ["The program changed. Check the file again."] });
    expect(m.applyCurriculumChanges).not.toHaveBeenCalled();
  });

  it("returns 409 when a matched lesson's quiz changed after Check", async () => {
    const fingerprints = await prints();
    const edited = structuredClone(CURRENT);
    edited.curriculum.modules[0].lessons[0].questions.push({ question: "Q?", options: ["A", "B"], correctIndex: 0 } as never);
    m.loadCurrentCurriculum.mockResolvedValue(edited);
    const res = await apply(req({ text: GOOD, ids: ["update-session:l1"], fingerprints }), ctx);
    expect(res.status).toBe(409);
    expect(m.applyCurriculumChanges).not.toHaveBeenCalled();
  });

  it("asks for the removal to be confirmed", async () => {
    const fingerprints = await prints();
    const res = await apply(req({ text: GOOD, ids: ["remove-module:m2"], fingerprints }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ errors: ["Please confirm the removal."] });
    expect(m.applyCurriculumChanges).not.toHaveBeenCalled();
  });

  it("applies a confirmed removal and returns its notes", async () => {
    const fingerprints = await prints();
    m.applyCurriculumChanges.mockResolvedValue({ ok: true, applied: 0, notes: ["Extra was kept."] });
    const res = await apply(req({ text: GOOD, ids: ["remove-module:m2"], fingerprints, confirmRemove: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: 0, notes: ["Extra was kept."] });
  });

  it("applies only the ticked row", async () => {
    const fingerprints = await prints();
    m.applyCurriculumChanges.mockResolvedValue({ ok: true, applied: 1, notes: [] });
    const res = await apply(req({ text: GOOD, ids: ["update-session:l1"], fingerprints }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: 1, notes: [] });
    expect(m.applyCurriculumChanges).toHaveBeenCalledTimes(1);
    const [courseId, plan, changes] = m.applyCurriculumChanges.mock.calls[0];
    expect(courseId).toBe("c1");
    expect(plan.title).toBe("Test Course");
    expect(changes.map((c: { id: string }) => c.id)).toEqual(["update-session:l1"]);
  });

  it("reports a partial failure without leaking details", async () => {
    const fingerprints = await prints();
    m.applyCurriculumChanges.mockResolvedValue({ ok: false, applied: 0, notes: [], message: "Could not save." });
    const res = await apply(req({ text: GOOD, ids: ["update-session:l1"], fingerprints }), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ errors: ["Could not save."], applied: 0, notes: [] });
  });

  it("returns 404 when the program is missing", async () => {
    m.loadCurrentCurriculum.mockResolvedValue(null);
    const res = await apply(req({ text: GOOD, ids: ["x"] }), ctx);
    expect(res.status).toBe(404);
  });
});
