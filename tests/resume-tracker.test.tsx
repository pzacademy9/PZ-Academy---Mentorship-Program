import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { RESUME_KEY } from "@/lib/resume-path";

let pathname = "/dashboard/courses";
let search = "a=1";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

import { ResumeTracker } from "@/components/ResumeTracker";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  pathname = "/dashboard/courses";
  search = "a=1";
});

describe("ResumeTracker", () => {
  it("stores the current portal path with its query", () => {
    render(<ResumeTracker />);
    expect(localStorage.getItem(RESUME_KEY)).toBe("/dashboard/courses?a=1");
  });
  it("stores a path without a query as is", () => {
    search = "";
    render(<ResumeTracker />);
    expect(localStorage.getItem(RESUME_KEY)).toBe("/dashboard/courses");
  });
  it("stores nothing for a path that is not rememberable", () => {
    pathname = "/login";
    render(<ResumeTracker />);
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  });
  it("does not throw when storage fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => render(<ResumeTracker />)).not.toThrow();
  });
});
