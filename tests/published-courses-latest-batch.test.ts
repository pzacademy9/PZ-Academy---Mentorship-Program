import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, filterValue } from "./helpers/supabase-mock";
import type { Op, Res } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => db.client }));

import { pickLatestPerFamily } from "@/lib/data/lms-listing";
import { getPublishedCourses } from "@/lib/data/lms";

const row = (id: string, family_id: string | null, created_at: string, type = "course", batch_label: string | null = null) => ({
  id, slug: id, title: id, type, status: "open", tagline: null, thumbnail_url: null, level: null,
  duration_text: null, duration_weeks: null, price_pkr: null, mentor_name: null, mentor_title: null,
  mentor_avatar_url: null, public_video_url: null, timings: null, family_id, batch_label, created_at,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

beforeEach(() => db.reset());

describe("pickLatestPerFamily", () => {
  it("keeps only the newest of a family", () => {
    const rows = [row("b1", "F", "2026-01-01"), row("b3", "F", "2026-03-01"), row("b2", "F", "2026-02-01")];
    expect(ids(pickLatestPerFamily(rows))).toEqual(["b3"]);
  });
  it("keeps the older one when the newer copy is not in the input (unpublished)", () => {
    expect(ids(pickLatestPerFamily([row("b1", "F", "2026-01-01")]))).toEqual(["b1"]);
  });
  it("always keeps courses with no family", () => {
    const rows = [row("a", null, "2026-01-01"), row("b", null, "2026-02-01"), row("c", "F", "2026-01-01")];
    expect(ids(pickLatestPerFamily(rows))).toEqual(["a", "b", "c"]);
  });
  it("keeps the newest of each family", () => {
    const rows = [row("f1a", "F1", "2026-01-01"), row("f2a", "F2", "2026-01-02"), row("f1b", "F1", "2026-02-01"), row("f2b", "F2", "2026-02-02")];
    expect(ids(pickLatestPerFamily(rows))).toEqual(["f1b", "f2b"]);
  });
  it("breaks ties by id, whatever the input order", () => {
    const a = row("a", "F", "2026-01-01");
    const b = row("b", "F", "2026-01-01");
    expect(ids(pickLatestPerFamily([a, b]))).toEqual(["b"]);
    expect(ids(pickLatestPerFamily([b, a]))).toEqual(["b"]);
  });
});

describe("batch portals with a batch label", () => {
  it("are never listed, even when they are the only course of their family", () => {
    const rows = [row("ppc", null, "2026-01-01"), row("b3", "F", "2026-11-20", "course", "3")];
    expect(ids(pickLatestPerFamily(rows))).toEqual(["ppc"]);
  });
  it("do not push out an unlabelled course of the same family", () => {
    const rows = [row("rec", "F", "2026-01-01"), row("b3", "F", "2026-11-20", "course", "3")];
    expect(ids(pickLatestPerFamily(rows))).toEqual(["rec"]);
  });
  it("a blank label counts as no label", () => {
    expect(ids(pickLatestPerFamily([row("a", "F", "2026-01-01", "course", "  ")]))).toEqual(["a"]);
  });
});

describe("getPublishedCourses", () => {
  const rows = [
    row("old", "F", "2026-01-01", "course"),
    row("solo", null, "2026-02-01", "course"),
    row("new", "F", "2026-03-01", "webinar"),
  ];
  const handler = (withFamily: boolean) => (op: Op): Res => {
    if (op.columns?.includes("topic")) return { data: [], error: null };
    if (op.columns?.includes("family_id") && !withFamily) {
      return { data: null, error: { message: "column family_id does not exist" } };
    }
    const data = withFamily ? rows : rows.map(({ family_id: _f, ...rest }) => rest);
    return { data, error: null };
  };

  it("falls back to all published rows when the family select errors", async () => {
    db.state.handler = handler(false);
    expect((await getPublishedCourses()).map((c) => c.id)).toEqual(["old", "solo", "new"]);
    const selects = db.find("courses", "select").filter((o) => !o.columns?.includes("topic"));
    expect(selects).toHaveLength(2);
    expect(selects[0].columns).toContain("family_id");
    expect(selects[1].columns).not.toContain("family_id");
    for (const o of selects) expect(filterValue(o, "eq", "is_published")).toBe(true);
  });

  it("hides older batch portals when family_id is available", async () => {
    db.state.handler = handler(true);
    expect((await getPublishedCourses()).map((c) => c.id)).toEqual(["solo", "new"]);
  });

  it("applies the type filter after the family rule", async () => {
    db.state.handler = handler(true);
    // "new" is a webinar and hides "old"; asking for courses must not bring "old" back.
    expect((await getPublishedCourses("course")).map((c) => c.id)).toEqual(["solo"]);
    expect((await getPublishedCourses("webinar")).map((c) => c.id)).toEqual(["new"]);
  });

  it("returns [] when both selects fail", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    expect(await getPublishedCourses()).toEqual([]);
  });
});
