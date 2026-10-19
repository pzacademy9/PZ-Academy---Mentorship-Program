// tests/landing-registration-modules.test.ts: saving a page rejects module links outside the page's course.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => ({ ok: true, user: { id: "admin-user" } }) }));

const saveDraft = vi.fn();
vi.mock("@/lib/data/landing-pages", () => ({ saveDraft: (...a: unknown[]) => saveDraft(...a) }));
const getPageCourseModuleIds = vi.fn();
vi.mock("@/lib/data/landing-course-modules", () => ({ getPageCourseModuleIds: (...a: unknown[]) => getPageCourseModuleIds(...a) }));

import { PATCH as patchDraft } from "@/app/api/admin/landing-pages/[id]/route";
import { emptyContent } from "@/lib/landing/content";
import { ppcConfig } from "./fixtures/landing-registration";

const ID = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: ID }) };
const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "Pick modules from this page's course.";

function save(moduleIds: string[]) {
  const c = emptyContent("course");
  const reg = ppcConfig();
  reg.options[0].moduleIds = moduleIds;
  c.registration = reg;
  return patchDraft(new Request("http://x", { method: "PATCH", body: JSON.stringify({ content: c, baseRevision: 1 }) }) as never, ctx);
}

beforeEach(() => {
  saveDraft.mockReset().mockResolvedValue({ ok: true, revision: 2 });
  getPageCourseModuleIds.mockReset();
});

describe("PATCH draft: option module links", () => {
  it("accepts modules that belong to the page's course", async () => {
    getPageCourseModuleIds.mockResolvedValue([M1, M2]);
    expect((await save([M1, M2])).status).toBe(200);
    expect(saveDraft).toHaveBeenCalled();
  });
  it("rejects a module from another course with a plain message", async () => {
    getPageCourseModuleIds.mockResolvedValue([M1, M2]);
    const res = await save([M1, FOREIGN]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(MESSAGE);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it("accepts empty module lists without looking anything up", async () => {
    expect((await save([])).status).toBe(200);
    expect(getPageCourseModuleIds).not.toHaveBeenCalled();
  });
  it("rejects module links on a page with no course", async () => {
    getPageCourseModuleIds.mockResolvedValue(null);
    const res = await save([M1]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(MESSAGE);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it("answers 404 when the page does not exist", async () => {
    getPageCourseModuleIds.mockResolvedValue(undefined);
    expect((await save([M1])).status).toBe(404);
  });
});
