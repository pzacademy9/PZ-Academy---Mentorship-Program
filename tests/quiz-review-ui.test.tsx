import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  save: vi.fn(),
  mark: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/quiz-actions", () => ({
  uploadKahootReport: h.upload,
  saveReview: h.save,
  markFromQuiz: h.mark,
}));

import { QuizScreen } from "@/components/admin/quiz/QuizScreen";
import { buildBase, type PersonInfo } from "@/lib/quiz/review";

const PAGE = "00000000-0000-4000-8000-000000000001";
const SESS = "00000000-0000-4000-8000-000000000002";
const hamid: PersonInfo = { personId: "p-hamid", pzId: "Hamid-4821", name: "Hamid Khan", mode: "live" };
const sami: PersonInfo = { personId: "p-sami", pzId: "Sami-FUUAST89", name: "Sami Ullah", mode: "live" };
const rana: PersonInfo = { personId: "p-rana", pzId: "Rana-1111", name: "Rana Bibi", mode: "recorded" };
const row = (line: number, player: string, score: number) => ({ line, rank: null, player, score, correct: 1, incorrect: 0, hint: "" });

function base(rows: ReturnType<typeof row>[]) {
  return buildBase(
    rows,
    new Map([["hamid-4821", "p-hamid"], ["sami-fuuast89", "p-sami"], ["rana-1111", "p-rana"]]),
    new Map([hamid, sami, rana].map((p) => [p.personId, p])),
    [],
    20,
  );
}

const props = (over: Record<string, unknown> = {}) => ({
  pageId: PAGE,
  sessionId: SESS,
  sessionTitle: "Day 1",
  startsAt: "2026-11-03T15:00:00.000Z",
  saved: { maxScore: null, fileName: null, savedAt: null, rows: [] },
  noCheckin: [],
  leaderboard: { rows: [], sessionCount: 4 },
  ...over,
});

async function upload(rows: ReturnType<typeof row>[]) {
  const b = base(rows);
  h.upload.mockResolvedValue({ ok: true, base: b, prior: b.prior, skipped: 0, fileName: "r.xlsx", sheetName: "Final Scores" });
  const { container } = render(<QuizScreen {...props()} />);
  fireEvent.submit(container.querySelector("form") as HTMLFormElement);
  await screen.findByText(/rows in the file/);
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.save.mockResolvedValue({ ok: true, saved: 1, summary: { saved: 1, merged: 1, dropped: 0, skipped: 0 }, noCheckin: 0, notes: [] });
});

describe("QuizScreen review", () => {
  it("keeps Save off while a problem is undecided, shows the count, and turns on after the answer", async () => {
    await upload([row(4, "Hamid-4821", 100), row(5, "Hamid-4821n", 50)]);
    const save = screen.getByRole("button", { name: "Save results" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("1 problem still waiting")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add the scores together" }));
    expect((screen.getByRole("button", { name: "Save results" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/still waiting/)).toBeNull();
  });

  it("sends the choices and the default maximum (questions x 1000) on save, then shows the summary", async () => {
    await upload([row(4, "Hamid-4821", 100), row(5, "Hamid-4821n", 50)]);
    fireEvent.click(screen.getByRole("button", { name: "Add the scores together" }));
    fireEvent.click(screen.getByRole("button", { name: "Save results" }));
    await screen.findByText(/Added together 1/);
    const arg = h.save.mock.calls[0][2];
    expect(arg.maxScore).toBe(20000);
    expect(arg.choices.duplicate).toEqual({ "p-hamid": "merge" });
    expect(h.refresh).toHaveBeenCalled();
  });

  it("clicking a suggestion answers an unknown row", async () => {
    await upload([row(4, "Sami_FUUAST89", 900)]);
    expect((screen.getByRole("button", { name: "Save results" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sami Ullah (Sami-FUUAST89)" }));
    expect((screen.getByRole("button", { name: "Save results" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Counted for Sami Ullah/)).toBeTruthy();
  });

  it("'Skip all unknown players with 0 points' answers only the 0-point unknown rows", async () => {
    await upload([row(4, "Zeb", 0), row(5, "Saira", 9000)]);
    expect(screen.getByText("2 problems still waiting")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip all unknown players with 0 points" }));
    expect(screen.getByText("1 problem still waiting")).toBeTruthy();
  });

  it("tags rejoined and recorded rows in the fine list", async () => {
    await upload([row(4, "Hamid-4821nn", 10), row(5, "Rana-1111", 20)]);
    expect(screen.getByText("Rejoined")).toBeTruthy();
    expect(screen.getAllByText("Recorded").length).toBeGreaterThan(0);
  });

  it("blocks Save when the maximum is below the top score", async () => {
    await upload([row(4, "Hamid-4821", 15000)]);
    fireEvent.change(screen.getByLabelText("Quiz maximum score"), { target: { value: "100" } });
    expect((screen.getByRole("button", { name: "Save results" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the refusal text when upload fails", async () => {
    h.upload.mockResolvedValue({ ok: false, message: "The file is empty." });
    const { container } = render(<QuizScreen {...props()} />);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect((await screen.findByRole("alert")).textContent).toContain("The file is empty.");
  });
});

describe("QuizScreen lists", () => {
  it("tags recorded students in saved results and never shows an email", () => {
    render(
      <QuizScreen
        {...props({
          saved: {
            maxScore: 20000, fileName: "a.xlsx", savedAt: "2026-11-03T16:00:00.000Z",
            rows: [
              { personId: "p1", pzId: "Hamid-4821", name: "Hamid Khan", mode: "live", score: 900, correct: 9, incorrect: 1, email: "secret@x.com" },
              { personId: "p3", pzId: "Rana-1111", name: "Rana Bibi", mode: "recorded", score: 500, correct: 5, incorrect: 5 },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("Recorded")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/@/);
  });

  it("marks a no-check-in student present with one click", async () => {
    h.mark.mockResolvedValue({ ok: true });
    render(<QuizScreen {...props({ noCheckin: [{ personId: "p1", pzId: "Hamid-4821", name: "Hamid Khan" }] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark present" }));
    await waitFor(() => expect(h.mark).toHaveBeenCalledWith(PAGE, SESS, "p1"));
  });

  it("shows empty states and the ranking with a projection label", () => {
    render(
      <QuizScreen
        {...props({ leaderboard: { sessionCount: 4, rows: [{ rank: 1, personId: "p1", pzId: "Hamid-4821", name: "Hamid Khan", total: 1400, quizzes: 2, avgPct: 70, projectedTotal: 2800 }] } })}
      />,
    );
    expect(screen.getByText("Nothing saved yet.")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("2,800")).toBeTruthy();
  });
});
