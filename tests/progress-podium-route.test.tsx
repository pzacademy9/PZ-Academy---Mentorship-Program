import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({
  getPortalBatch: vi.fn(),
  callerAllowed: vi.fn(),
  images: [] as { element: unknown; options: { width: number; height: number } }[],
  drawFails: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/portal", () => ({ getPortalBatch: (...a: unknown[]) => h.getPortalBatch(...a) }));
vi.mock("@/lib/pzid/caller-allowed", () => ({ portalCallerAllowed: () => h.callerAllowed() }));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: unknown, options: { width: number; height: number }) {
      h.images.push({ element, options });
    }
    // Like the real ImageResponse, drawing happens while the body is read.
    async arrayBuffer() {
      if (h.drawFails) throw new Error("satori exploded");
      return new TextEncoder().encode("png-bytes").buffer;
    }
  },
}));

import { GET } from "@/app/api/progress-podium/[slug]/route";

// Fake people only. The extra email/phone fields stand for anything a future loader might add by mistake.
const row = (name: string, score: number, rank: number | null, mode: "live" | "recorded" = "live") => ({
  name,
  pzId: `${name}-0001`,
  mode,
  score,
  rank,
  email: `${name.toLowerCase()}@example.test`,
  phone: "03001234567",
});

const sample = () => ({
  title: "Sample Batch",
  slug: "sample-batch",
  kind: "course",
  minPct: 75,
  state: "live",
  coverUrl: null,
  students: 5,
  classesHeld: 2,
  sessions: [
    { id: "s1", number: 1, title: "One", quizMax: 100 },
    { id: "s2", number: 2, title: "Two", quizMax: null },
  ],
  attendance: [],
  overall: [row("Alpha", 300, 1), row("Bravo", 250, 2), row("Charlie", 250, 2), row("Delta", 100, 4), row("Taped", 999, null, "recorded")],
  perClass: { s1: [row("Bravo", 90, 1)], s2: [row("Taped", 50, null, "recorded")] },
});

const call = (query = "", slug = "sample-batch") =>
  GET(new Request(`http://localhost/api/progress-podium/${slug}${query}`), { params: Promise.resolve({ slug }) });

const lastMarkup = () => renderToStaticMarkup(h.images[h.images.length - 1].element as ReactElement);

beforeEach(() => {
  h.images.length = 0;
  h.drawFails = false;
  h.getPortalBatch.mockReset().mockResolvedValue(sample());
  h.callerAllowed.mockReset().mockResolvedValue(true);
});

describe("GET /api/progress-podium/[slug]", () => {
  it("draws a square overall podium of the top three live students", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("png-bytes");
    expect(h.getPortalBatch).toHaveBeenCalledWith("sample-batch");
    expect(h.images[0].options).toEqual({ width: 1080, height: 1080 });
    const html = lastMarkup();
    expect(html).toContain("Sample Batch");
    expect(html).toContain("Overall");
    expect(html).toContain("PZ Academy");
    for (const n of ["Alpha", "Bravo", "Charlie"]) expect(html).toContain(n);
    expect(html).not.toContain("Delta");
    expect(html).not.toContain("Taped");
    expect(html).toContain("300");
  });

  it("story size is 1080 x 1920 and names a png file", async () => {
    const res = await call("?size=story");
    expect(h.images[0].options).toEqual({ width: 1080, height: 1920 });
    expect(res.headers.get("content-disposition")).toMatch(/filename="pz-academy-sample-batch-overall-story\.png"/);
  });

  it("a class can be picked by id or by number", async () => {
    await call("?class=s1");
    expect(lastMarkup()).toContain("Class 1");
    expect(lastMarkup()).toContain("Bravo");
    await call("?class=1&size=square");
    expect(lastMarkup()).toContain("Class 1");
  });

  it("never shows an email or phone number", async () => {
    await call();
    const html = lastMarkup();
    expect(html).not.toContain("@");
    expect(html).not.toContain("03001234567");
  });

  it("bad size is a 400, unknown batch or class a 404", async () => {
    expect((await call("?size=huge")).status).toBe(400);
    expect((await call("?class=9")).status).toBe(404);
    h.getPortalBatch.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(h.images).toHaveLength(0);
  });

  it("no ranked students gives a clear 404, not a broken image", async () => {
    const res = await call("?class=s2");
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/no ranked students/i);
    expect(h.images).toHaveLength(0);
  });

  it("a rate-limited caller gets 429 and nothing is loaded", async () => {
    h.callerAllowed.mockResolvedValue(false);
    expect((await call()).status).toBe(429);
    expect(h.getPortalBatch).not.toHaveBeenCalled();
  });

  it("a drawing failure gives the generic 500, not a broken image", async () => {
    h.drawFails = true;
    const res = await call();
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).not.toBe("image/png");
    expect(await res.text()).not.toContain("satori");
  });

  it("a loader error gives a generic 500 without details", async () => {
    h.getPortalBatch.mockRejectedValue(new Error("secret db detail"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
  });
});
