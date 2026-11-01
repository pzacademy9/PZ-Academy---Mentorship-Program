import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Progress } from "@/lib/progress/build";

const getUser = vi.fn();
const getProgressForEmail = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/data/portal", () => ({
  getProgressForUser: async (u: { email?: string | null; email_confirmed_at?: string | null }) => {
    if (!u.email || !u.email_confirmed_at) return { status: "unconfirmed" };
    return { status: "ok", progress: await getProgressForEmail(u.email) };
  },
}));
const CONFIRMED = "2026-10-01T00:00:00Z";

import MyProgressPage from "@/app/dashboard/progress/page";

const progress: Progress = {
  firstName: "Sample",
  pzId: "Sample-4821",
  groups: [
    {
      kind: "course",
      batches: [
        {
          title: "Sample Batch 4",
          slug: "sample-batch-4",
          latest: true,
          mode: "live",
          attendance: { attended: 10, held: 12, pct: 83, meetsMin: true, minPct: 75, rows: [] },
          results: { total: 0, rows: [] },
        },
      ],
    },
  ],
} as unknown as Progress;

beforeEach(() => {
  getUser.mockReset();
  getProgressForEmail.mockReset();
  redirect.mockClear();
});
afterEach(cleanup);

describe("My Progress page", () => {
  it("shows the signed-in student's batches and the portal link", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "sample.person@example.com", email_confirmed_at: CONFIRMED } } });
    getProgressForEmail.mockResolvedValue(progress);
    render(await MyProgressPage());
    expect(getProgressForEmail).toHaveBeenCalledWith("sample.person@example.com");
    expect(screen.getByRole("heading", { level: 1, name: /Hello, Sample/ })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Sample-4821")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
    expect(screen.getByText(/Sample Batch 4/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /full batch lists/i }).getAttribute("href")).toBe("/progress");
  });

  it("shows a friendly empty state when no person is found", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "nobody@example.com", email_confirmed_at: CONFIRMED } } });
    getProgressForEmail.mockResolvedValue(null);
    render(await MyProgressPage());
    expect(screen.getByText(/cannot find your enrolment yet/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /full batch lists/i }).getAttribute("href")).toBe("/progress");
  });

  it("shows only a generic message when the loader throws", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "sample.person@example.com", email_confirmed_at: CONFIRMED } } });
    getProgressForEmail.mockRejectedValue(new Error("secret db detail xyz"));
    const { container } = render(await MyProgressPage());
    expect(screen.getByText(/could not load your progress/i)).toBeTruthy();
    expect(container.textContent).not.toContain("secret db detail");
  });

  it("asks an unconfirmed user to confirm their email and loads nothing", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "sample.person@example.com", email_confirmed_at: null } } });
    render(await MyProgressPage());
    expect(screen.getByText(/Please confirm your email address to see your progress/)).toBeTruthy();
    expect(getProgressForEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /full batch lists/i }).getAttribute("href")).toBe("/progress");
  });

  it("redirects a signed-out user to /login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(MyProgressPage()).rejects.toThrow("REDIRECT:/login");
    expect(getProgressForEmail).not.toHaveBeenCalled();
  });
});
