import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RESUME_KEY } from "@/lib/resume-path";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import ResumePage from "@/app/resume/page";

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  vi.restoreAllMocks();
});

describe("/resume page", () => {
  it("goes to the saved page", () => {
    localStorage.setItem(RESUME_KEY, "/dashboard/courses?a=1");
    render(<ResumePage />);
    expect(replace).toHaveBeenCalledWith("/dashboard/courses?a=1");
  });
  it("falls back to /dashboard for a hostile value", () => {
    localStorage.setItem(RESUME_KEY, "//evil.com");
    render(<ResumePage />);
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });
  it("falls back to /dashboard when nothing is saved", () => {
    render(<ResumePage />);
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });
  it("falls back to /dashboard when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<ResumePage />);
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });
  it("shows a message and a plain fallback link", () => {
    render(<ResumePage />);
    expect(screen.getByText(/Opening your portal/)).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/dashboard");
  });
});
