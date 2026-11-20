import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/progress/portal/SharePodium", () => ({
  SharePodium: (p: { pick: string; label: string; title: string; slug: string }) => (
    <button type="button" data-pick={p.pick} data-label={p.label} data-title={p.title} data-slug={p.slug}>Share podium</button>
  ),
}));

import { QuizTab } from "@/components/admin/classes/QuizTab";
import { podiumImageUrl } from "@/lib/progress/leaderboard";
import type { ClassSummary } from "@/lib/data/class-overview";

const base = {
  id: "s1", number: 3, title: "Intro", speaker: "", startsAt: "2026-11-10T14:00:00.000Z", endsAt: null,
  status: "today", presentCount: 1, enrolledLive: 3, attendanceLink: "x", feedbackLink: null, feedbackSessionId: null,
  feedbackCount: 0, feedbackAvg: null,
} as const;
const mk = (saved: boolean) => ({ ...base, quiz: { saved, players: saved ? 12 : 0 } }) as unknown as ClassSummary;
const QUIZ_HREF = "/dashboard/admin/enrollments/registrations/campaign/p1/sessions/s1/quiz";

describe("QuizTab", () => {
  it("not saved: upload link and waiting line, no podium", () => {
    render(<QuizTab pageId="p1" cls={mk(false)} slug="b1" batchTitle="Batch" />);
    expect(screen.getByRole("link", { name: /upload kahoot file/i }).getAttribute("href")).toBe(QUIZ_HREF);
    expect(screen.getByText("The podium appears after you save the quiz results.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /share podium/i })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("saved with slug: preview image and share button", () => {
    render(<QuizTab pageId="p1" cls={mk(true)} slug="b1" batchTitle="Batch" />);
    const img = screen.getByRole("img", { name: "Top three students for Class 3" });
    expect(img.getAttribute("src")).toBe(podiumImageUrl("b1", "square", "s1"));
    expect(img.getAttribute("loading")).toBe("lazy");
    const b = screen.getByRole("button", { name: /share podium/i });
    expect(b.getAttribute("data-pick")).toBe("s1");
    expect(b.getAttribute("data-label")).toBe("Class 3");
    expect(b.getAttribute("data-title")).toBe("Batch");
    expect(screen.getByRole("link", { name: /open quiz results/i }).getAttribute("href")).toBe(QUIZ_HREF);
    expect(screen.getByText("12 players")).toBeTruthy();
  });
  it("saved without slug: fallback line, no image or share", () => {
    render(<QuizTab pageId="p1" cls={mk(true)} slug={null} batchTitle="Batch" />);
    expect(screen.getByText(/ready once this batch is shown on the Progress page and quiz results are saved/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: /share podium/i })).toBeNull();
  });
  it("image error swaps to the fallback line", () => {
    render(<QuizTab pageId="p1" cls={mk(true)} slug="b1" batchTitle="Batch" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/ready once this batch is shown on the Progress page/)).toBeTruthy();
  });
});
