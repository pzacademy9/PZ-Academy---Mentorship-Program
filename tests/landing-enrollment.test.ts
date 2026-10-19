import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { isBatchFinished } from "@/lib/data/landing-enrollment";

const PAGE = "page-1";
const COURSE = "course-1";
const store = (state: Record<string, unknown>[], modules: string[] = []): Store => ({
  landing_batch_state: state,
  modules: modules.map((id) => ({ id, course_id: COURSE })),
});
const use = (s: Store) => { db.state.handler = memoryHandler(s); };
const row = (module_id: string | null, page_id = PAGE) => ({ page_id, module_id, finished_at: "2026-10-19T00:00:00Z", finished_by: null });

beforeEach(() => db.reset());

describe("isBatchFinished", () => {
  it("is false with no rows", async () => {
    use(store([], ["a", "b"]));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(false);
    expect(await isBatchFinished(PAGE, COURSE, ["a"])).toBe(false);
  });
  it("is true when a whole-course row exists", async () => {
    use(store([row(null)], ["a"]));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(true);
    expect(await isBatchFinished(PAGE, COURSE, ["a"])).toBe(true);
  });
  it("ignores rows of other pages", async () => {
    use(store([row(null, "other")], ["a"]));
    expect(await isBatchFinished(PAGE, COURSE, ["a"])).toBe(false);
  });
  it("module buyer: true only when every bought module has a row", async () => {
    use(store([row("a"), row("b")], ["a", "b", "c"]));
    expect(await isBatchFinished(PAGE, COURSE, ["a", "b"])).toBe(true);
    expect(await isBatchFinished(PAGE, COURSE, ["a", "c"])).toBe(false);
  });
  it("whole-course buyer without a course row: true only when every module of the course has a row", async () => {
    use(store([row("a"), row("b")], ["a", "b"]));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(true);
    use(store([row("a")], ["a", "b"]));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(false);
  });
  it("whole-course buyer, course with no modules: false", async () => {
    use(store([row("a")], []));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(false);
  });
  it("throws on a query error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(isBatchFinished(PAGE, COURSE, [])).rejects.toThrow(/boom/);
  });
});
