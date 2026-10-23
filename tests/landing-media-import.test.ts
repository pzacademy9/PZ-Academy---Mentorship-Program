import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Res = { data: unknown; error: unknown };
interface Op {
  table: string;
  op: "select" | "upsert";
  columns?: string;
  payload?: Record<string, unknown>[];
  options?: Record<string, unknown>;
  range?: [number, number];
}
let ops: Op[] = [];
let source: Record<string, Record<string, unknown>[]> = {};
let existing: string[] = [];
let failInsert = false;
let failRead: string | null = null;
let inserted: Record<string, unknown>[] = [];

function builder(table: string) {
  const op: Op = { table, op: "select" };
  const done = (): Promise<Res> => {
    ops.push(op);
    if (failRead === table) return Promise.resolve({ data: null, error: { message: "down" } });
    if (op.op === "upsert") {
      if (failInsert) return Promise.resolve({ data: null, error: { message: "bad" } });
      const fresh = (op.payload ?? []).filter(
        (r) => !existing.includes(r.drive_file_id as string) && !inserted.some((i) => i.drive_file_id === r.drive_file_id),
      );
      inserted.push(...fresh);
      return Promise.resolve({ data: fresh.map((r) => ({ drive_file_id: r.drive_file_id })), error: null });
    }
    const all =
      table === "landing_media"
        ? [...existing.map((d) => ({ drive_file_id: d })), ...inserted]
        : source[table] ?? [];
    const [from, to] = op.range ?? [0, 999];
    return Promise.resolve({ data: all.slice(from, Math.min(to, from + 999) + 1), error: null });
  };
  const b: Record<string, unknown> = {
    select: (c?: string) => { op.columns = c; return b; },
    upsert: (p: Record<string, unknown>[], o: Record<string, unknown>) => { op.op = "upsert"; op.payload = p; op.options = o; return b; },
    order: () => b,
    range: (a: number, z: number) => { op.range = [a, z]; return b; },
    then: (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => done().then(res, rej),
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: builder }) }));

import { importExistingMedia } from "@/lib/data/landing-media";

const d = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
const F = (n: number) => `FILEID${String(n).padStart(6, "0")}`;
const upserts = () => ops.filter((o) => o.op === "upsert");
const rowFor = (id: string) => inserted.find((r) => r.drive_file_id === id);
const course = (i: number, over: Record<string, unknown> = {}) => ({
  id: `c${i}`, title: "C", thumbnail_url: d(F(i)), banner_url: null, mentor_avatar_url: null, ...over,
});

beforeEach(() => {
  ops = []; inserted = []; existing = []; failInsert = false; failRead = null;
  source = { courses: [], mentors: [], banners: [], landing_pages: [], landing_page_variants: [] };
});

describe("importExistingMedia", () => {
  it("collects every source with the right folder and name", async () => {
    source.courses = [course(1, { title: "DIT", banner_url: d(F(2)), mentor_avatar_url: d(F(3)) })];
    source.mentors = [{ id: "m1", name: "Dr Sara", photo_url: d(F(4)) }];
    source.banners = [{ id: "b1", slot: "home_hero", image_url: d(F(5)) }];
    source.landing_pages = [{ id: "p1", title: "Spring", draft: { a: { b: [d(F(6))] } }, published: null }];
    source.landing_page_variants = [{ id: "v1", page_id: "p1", draft: {}, published: { x: d(F(7)) } }];
    const r = await importExistingMedia("u1");
    expect(r).toEqual({ added: 7, alreadyThere: 0, skipped: 0 });
    expect(rowFor(F(1))).toMatchObject({ folder: "heroes", name: "DIT thumbnail", url: d(F(1)), created_by: "u1", width: null, height: null, size_bytes: null, orientation: null });
    expect(rowFor(F(2))).toMatchObject({ folder: "heroes", name: "DIT banner" });
    expect(rowFor(F(3))).toMatchObject({ folder: "instructors", name: "DIT instructor" });
    expect(rowFor(F(4))).toMatchObject({ folder: "instructors", name: "Dr Sara photo" });
    expect(rowFor(F(5))).toMatchObject({ folder: "heroes", name: "Website banner home_hero" });
    expect(rowFor(F(6))).toMatchObject({ folder: "misc", name: "Spring picture" });
    expect(rowFor(F(7))).toMatchObject({ folder: "misc", name: "Spring picture" });
  });

  it("uses upsert with onConflict drive_file_id ignoring duplicates", async () => {
    source.courses = [course(1)];
    await importExistingMedia("u1");
    expect(upserts()[0].options).toEqual({ onConflict: "drive_file_id", ignoreDuplicates: true });
  });

  it("dedupes by file id, first source wins", async () => {
    source.courses = [course(1, { title: "A", banner_url: d(F(1)) })];
    source.landing_pages = [{ id: "p1", title: "P", draft: { i: d(F(1)) }, published: { i: d(F(1)) } }];
    const r = await importExistingMedia("u1");
    expect(r.added).toBe(1);
    expect(rowFor(F(1))).toMatchObject({ name: "A thumbnail", folder: "heroes" });
  });

  it("counts pictures already in the library and does not send them", async () => {
    existing = [F(1)];
    source.courses = [course(1, { title: "A", banner_url: d(F(2)) })];
    const r = await importExistingMedia("u1");
    expect(r).toEqual({ added: 1, alreadyThere: 1, skipped: 0 });
    expect(upserts()[0].payload).toHaveLength(1);
  });

  it("counts non-Drive links as skipped and ignores empty values", async () => {
    source.courses = [course(1, { thumbnail_url: "https://example.com/a.png", banner_url: "" })];
    source.mentors = [{ id: "m1", name: "S", photo_url: "https://example.com/s.png" }];
    const r = await importExistingMedia("u1");
    expect(r).toEqual({ added: 0, alreadyThere: 0, skipped: 2 });
    expect(upserts()).toHaveLength(0);
  });

  it("walks landing JSON generically, only Drive links in strings", async () => {
    source.landing_pages = [{
      id: "p1", title: "Spring",
      draft: {
        s: [{ deep: { img: d(F(1)) } }, "plain text", 5, null, `see ${d(F(9))} now`],
        link: "https://example.com/?id=abcdefghijkl",
      },
      published: null,
    }];
    source.landing_page_variants = [{ id: "v1", page_id: "p1", draft: { z: [[d(F(2))]] }, published: null }];
    const r = await importExistingMedia("u1");
    expect(r.added).toBe(2);
    expect(rowFor(F(1))).toBeTruthy();
    expect(rowFor(F(2))).toMatchObject({ name: "Spring picture" });
    expect(rowFor(F(9))).toBeUndefined();
  });

  it("truncates generated names to 80 and never leaves one empty", async () => {
    source.courses = [course(1, { title: "T".repeat(120) }), course(2, { title: "" })];
    await importExistingMedia("u1");
    expect((rowFor(F(1))?.name as string).length).toBe(80);
    expect(rowFor(F(2))?.name).toBe("Course thumbnail");
  });

  it("uses the exact fallback name when the title or name is blank", async () => {
    source.courses = [course(1, { title: "  ", banner_url: d(F(2)), mentor_avatar_url: d(F(3)) })];
    source.mentors = [{ id: "m1", name: null, photo_url: d(F(4)) }];
    source.banners = [{ id: "b1", slot: null, image_url: d(F(5)) }];
    source.landing_pages = [{ id: "p1", title: "", draft: { i: d(F(6)) }, published: null }];
    source.landing_page_variants = [{ id: "v1", page_id: "nope", draft: { i: d(F(7)) }, published: null }];
    await importExistingMedia("u1");
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => rowFor(F(n))?.name)).toEqual([
      "Course thumbnail", "Course banner", "Course instructor", "Mentor photo",
      "Website banner", "Landing page picture", "Landing page picture",
    ]);
  });

  it("never splits an emoji at the 80 boundary and strips NUL", async () => {
    const title = "a".repeat(70) + "\u0000" + "😀".repeat(20);
    source.courses = [course(1, { title })];
    await importExistingMedia("u1");
    const name = rowFor(F(1))?.name as string;
    expect(Array.from(name)).toHaveLength(80);
    expect(name).not.toContain("\u0000");
    expect(name.endsWith("😀")).toBe(true);
    expect(name.isWellFormed()).toBe(true);
  });

  it("only accepts Drive or Google image hosts, with no whitespace, for columns too", async () => {
    source.courses = [course(1, { thumbnail_url: "https://evil.example.com/x?id=" + F(8), banner_url: `${d(F(9))} extra`, mentor_avatar_url: `https://lh3.googleusercontent.com/d/${F(2)}` })];
    const r = await importExistingMedia("u1");
    expect(r).toEqual({ added: 1, alreadyThere: 0, skipped: 2 });
    expect(rowFor(F(2))).toBeTruthy();
  });

  it("stores the normalised thumbnail url, also for old uc?export=view and /file/d links", async () => {
    source.courses = [course(1, { thumbnail_url: `https://drive.google.com/uc?export=view&id=${F(1)}`, banner_url: `https://drive.google.com/file/d/${F(2)}/view` })];
    await importExistingMedia("u1");
    expect(rowFor(F(1))?.url).toBe(`https://drive.google.com/thumbnail?id=${F(1)}&sz=w1600`);
    expect(rowFor(F(2))?.url).toBe(`https://drive.google.com/thumbnail?id=${F(2)}&sz=w1600`);
  });

  it("inserts in chunks of 200", async () => {
    source.courses = Array.from({ length: 450 }, (_, i) => course(i));
    const r = await importExistingMedia("u1");
    expect(r.added).toBe(450);
    expect(upserts().map((o) => o.payload?.length)).toEqual([200, 200, 50]);
  });

  it("pages source reads past the 1000-row cap", async () => {
    source.courses = Array.from({ length: 1500 }, (_, i) => course(i));
    const r = await importExistingMedia("u1");
    expect(r.added).toBe(1500);
  });

  it("is idempotent: a second run adds nothing", async () => {
    source.courses = [course(1, { title: "A", banner_url: d(F(2)) })];
    expect(await importExistingMedia("u1")).toEqual({ added: 2, alreadyThere: 0, skipped: 0 });
    ops = [];
    expect(await importExistingMedia("u1")).toEqual({ added: 0, alreadyThere: 2, skipped: 0 });
    expect(upserts()).toHaveLength(0);
  });

  it("throws when an insert fails", async () => {
    source.courses = [course(1)];
    failInsert = true;
    await expect(importExistingMedia("u1")).rejects.toBeTruthy();
  });

  it("throws when a read fails, writing nothing", async () => {
    source.courses = [course(1)];
    failRead = "banners";
    await expect(importExistingMedia("u1")).rejects.toBeTruthy();
    expect(upserts()).toHaveLength(0);
  });
});
