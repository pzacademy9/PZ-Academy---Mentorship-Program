import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  gate: { result: null as unknown, area: null as unknown },
  getAffiliateBoard: vi.fn(),
  images: [] as { element: unknown; options: { width: number; height: number } }[],
  drawFails: false,
}));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async (area: unknown) => {
    h.gate.area = area;
    return h.gate.result;
  },
}));
vi.mock("@/lib/data/affiliate-leaderboard", () => ({ getAffiliateBoard: (...a: unknown[]) => h.getAffiliateBoard(...a) }));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: unknown, options: { width: number; height: number }) {
      h.images.push({ element, options });
    }
    async arrayBuffer() {
      if (h.drawFails) throw new Error("satori exploded");
      return new TextEncoder().encode("png-bytes").buffer;
    }
  },
}));

import { GET, maxDuration } from "@/app/api/admin/affiliates/podium/route";

// Fake people only. Extra fields stand for anything a loader might add by mistake.
const r = (rank: number, name: string, paid: number, over: Record<string, unknown> = {}) => ({
  affiliateId: `id-${rank}-${name}`,
  name: `${name} Fullsurname`,
  publicName: `${name} F.`,
  team: "Blue",
  registered: 40,
  paid,
  rank,
  email: `${name.toLowerCase()}@example.test`,
  code: "ZZ999",
  ...over,
});
const board = (rows: unknown[]) => ({ period: "all", rows, teams: [] });
const call = (q = "") => GET(new Request(`http://x/api/admin/affiliates/podium${q}`) as never);
const markup = () => renderToStaticMarkup(h.images[h.images.length - 1].element as ReactElement);

beforeEach(() => {
  h.images.length = 0;
  h.drawFails = false;
  h.gate.result = { ok: true, user: { id: "u" } };
  h.getAffiliateBoard.mockReset().mockResolvedValue(board([r(1, "Alpha", 9), r(2, "Bravo", 5), r(3, "Charlie", 4), r(4, "Delta", 2), r(5, "Echo", 0)]));
});

describe("GET /api/admin/affiliates/podium", () => {
  it("is for the sales_hub area and refuses others before loading anything", async () => {
    h.gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    expect((await call()).status).toBe(403);
    expect(h.gate.area).toBe("sales_hub");
    expect(h.getAffiliateBoard).not.toHaveBeenCalled();
    h.gate.result = { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    expect((await call()).status).toBe(401);
  });

  it("draws a square png of the top three for this month by default", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("png-bytes");
    expect(h.getAffiliateBoard).toHaveBeenCalledWith("month");
    expect(h.images[0].options).toMatchObject({ width: 1080, height: 1080 });
    const html = markup();
    expect(html).toContain("Affiliate leaderboard · This month");
    expect(html).toContain("paid sales");
    for (const n of ["Alpha F.", "Bravo F.", "Charlie F."]) expect(html).toContain(n);
    expect(html).not.toContain("Delta");
    expect(html).not.toContain("Echo");
  });

  it("all time and story size", async () => {
    const res = await call("?period=all&size=story");
    expect(h.getAffiliateBoard).toHaveBeenCalledWith("all");
    expect(h.images[0].options).toMatchObject({ width: 1080, height: 1920 });
    expect(markup()).toContain("Affiliate leaderboard · All time");
    expect(res.headers.get("content-disposition")).toMatch(/filename="pz-academy-affiliates-all-time-story\.png"/);
  });

  it("carries only the public name, rank and paid: no full name, email, code, team or money", async () => {
    await call();
    const html = markup();
    expect(html).not.toContain("Fullsurname");
    expect(html).not.toContain("@");
    expect(html).not.toContain("ZZ999");
    expect(html).not.toContain("Blue");
    expect(html).not.toMatch(/Rs\.?\s|PKR|\$/);
    const el = h.images[0].element as ReactElement<{ entries: Record<string, unknown>[] }>;
    for (const e of el.props.entries) expect(Object.keys(e).sort()).toEqual(["name", "rank", "score"]);
  });

  it("a tie at the edge gives at most three entries with the real rank numbers", async () => {
    h.getAffiliateBoard.mockResolvedValue(board([r(1, "Alpha", 5), r(1, "Bravo", 5), r(1, "Charlie", 5), r(4, "Delta", 3)]));
    await call();
    const el = h.images[0].element as ReactElement<{ entries: { name: string; rank: number }[] }>;
    expect(el.props.entries.map((e) => e.rank)).toEqual([1, 1, 1]);
    expect(markup()).not.toContain("Delta");
  });
  it("one paid affiliate gives a one-entry podium", async () => {
    h.getAffiliateBoard.mockResolvedValue(board([r(1, "Alpha", 2), r(2, "Echo", 0)]));
    await call();
    const el = h.images[0].element as ReactElement<{ entries: unknown[] }>;
    expect(el.props.entries).toHaveLength(1);
  });

  it("a non-Latin name reads Affiliate #rank", async () => {
    h.getAffiliateBoard.mockResolvedValue(board([r(1, "Alpha", 3), { ...r(2, "x", 2), publicName: "علي" }]));
    await call();
    expect(markup()).toContain("Affiliate #2");
    expect(markup()).not.toContain("Student #");
  });

  it("a bad size or period is a 400 and draws nothing", async () => {
    expect((await call("?period=week")).status).toBe(400);
    expect((await call("?size=huge")).status).toBe(400);
    expect(h.images).toHaveLength(0);
    expect(h.getAffiliateBoard).not.toHaveBeenCalled();
  });

  it("nobody with a paid sale gives a clear 404 and no picture", async () => {
    h.getAffiliateBoard.mockResolvedValue(board([r(1, "Echo", 0)]));
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("No paid sales yet.");
    h.getAffiliateBoard.mockResolvedValue(board([]));
    expect((await call()).status).toBe(404);
    expect(h.images).toHaveLength(0);
  });

  it("a drawing failure or loader error gives the generic 500", async () => {
    h.drawFails = true;
    const a = await call();
    expect(a.status).toBe(500);
    expect(await a.text()).toBe("We could not make this picture right now. Please try again in a minute.");
    h.drawFails = false;
    h.getAffiliateBoard.mockRejectedValue(new Error("secret db detail"));
    const b = await call();
    expect(b.status).toBe(500);
    expect(await b.text()).not.toContain("secret");
  });

  it("allows up to 30 seconds to draw", () => {
    expect(maxDuration).toBe(30);
  });
});
