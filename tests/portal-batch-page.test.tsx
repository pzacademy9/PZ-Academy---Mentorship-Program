import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
// React's request cache only exists in the server build.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
const getPortalBatch = vi.fn();
const callerAllowed = vi.fn();
vi.mock("@/lib/data/portal", () => ({ getPortalBatch: (...a: unknown[]) => getPortalBatch(...a) }));
vi.mock("@/lib/pzid/caller-allowed", () => ({ callerAllowed: () => callerAllowed() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import BatchRoute, { generateMetadata } from "@/app/progress/[slug]/page";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const sample = {
  title: "Sample Batch",
  slug: "sample-batch",
  kind: "course",
  minPct: 75,
  state: "live",
  coverUrl: null,
  students: 0,
  classesHeld: 0,
  sessions: [],
  attendance: [],
  overall: [],
  perClass: {},
};

beforeEach(() => {
  getPortalBatch.mockReset();
  callerAllowed.mockReset().mockResolvedValue(true);
});

describe("batch page route", () => {
  it("renders the batch for an allowed caller", async () => {
    getPortalBatch.mockResolvedValue(sample);
    render(await BatchRoute(params("sample-batch")));
    expect(getPortalBatch).toHaveBeenCalledWith("sample-batch");
    expect(screen.getByRole("heading", { level: 1, name: "Sample Batch" })).toBeTruthy();
  });

  it("unknown slug calls notFound", async () => {
    getPortalBatch.mockResolvedValue(null);
    await expect(BatchRoute(params("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rate-limited caller sees the friendly message and nothing is loaded", async () => {
    callerAllowed.mockResolvedValue(false);
    render(await BatchRoute(params("sample-batch")));
    expect(screen.getByText("Too many requests, try again in a few minutes.")).toBeTruthy();
    expect(getPortalBatch).not.toHaveBeenCalled();
  });

  it("a thrown loader error shows only the generic message", async () => {
    getPortalBatch.mockRejectedValue(new Error("secret db detail"));
    const { container } = render(await BatchRoute(params("sample-batch")));
    expect(screen.getByRole("alert").textContent).toMatch(/could not load this batch/i);
    expect(container.textContent).not.toContain("secret db detail");
  });

  it("metadata carries the batch title only", async () => {
    getPortalBatch.mockResolvedValue(sample);
    expect((await generateMetadata(params("sample-batch"))).title).toBe("Sample Batch | PZ Academy");
  });
});
