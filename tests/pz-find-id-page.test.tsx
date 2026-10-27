import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const searchBatchIds = vi.fn();
const getBatchTitle = vi.fn();
vi.mock("@/lib/data/pz-people", () => ({
  searchBatchIds: (...a: unknown[]) => searchBatchIds(...a),
  getBatchTitle: (...a: unknown[]) => getBatchTitle(...a),
}));
vi.mock("@/app/ids/[slug]/actions", () => ({ findMyId: vi.fn() }));
vi.mock("@/components/marketing/FindMyId", () => ({ FindMyId: () => <div>finder</div> }));
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import FindIdPage from "@/app/ids/[slug]/page";

const params = Promise.resolve({ slug: "batch-1" });

beforeEach(() => {
  searchBatchIds.mockReset();
  getBatchTitle.mockReset();
  notFound.mockClear();
});

describe("FindIdPage", () => {
  it("calls notFound for an unknown or draft slug", async () => {
    searchBatchIds.mockResolvedValue(null);
    await expect(FindIdPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("shows a plain-words page when the database is down", async () => {
    searchBatchIds.mockRejectedValue(new Error("connection refused"));
    render(await FindIdPage({ params }));
    expect(screen.getByText("We could not load this page. Please try again in a minute.")).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("shows the plain-words page when the title lookup fails", async () => {
    searchBatchIds.mockResolvedValue({ found: false, rows: [] });
    getBatchTitle.mockRejectedValue(new Error("boom"));
    render(await FindIdPage({ params }));
    expect(screen.getByText("We could not load this page. Please try again in a minute.")).toBeTruthy();
  });

  it("renders the finder for a known batch", async () => {
    searchBatchIds.mockResolvedValue({ found: false, rows: [] });
    getBatchTitle.mockResolvedValue("DIT Batch 1");
    render(await FindIdPage({ params }));
    expect(screen.getByText("DIT Batch 1")).toBeTruthy();
    expect(screen.getByText("finder")).toBeTruthy();
  });
});
