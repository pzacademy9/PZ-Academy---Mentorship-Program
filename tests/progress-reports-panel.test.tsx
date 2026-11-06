import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: nav.refresh }) }));

import { ReportsPanel, type ReportActions } from "@/components/admin/reports/ReportsPanel";
import type { ReportRound } from "@/lib/data/progress-reports";

afterEach(() => {
  cleanup();
  nav.refresh.mockReset();
});

const summary = { students: 3, withEmail: 3, ranked: 2, noQuiz: 1, recorded: 0, quizClasses: 1 };
const students = [
  { personId: "p1", label: "Fake One (Fakeone-1001) · #1", hasEmail: true, labels: ["Live - Full Course"] },
  { personId: "p2", label: "Fake Two (Faketwo-1002) · #2", hasEmail: true, labels: ["Live - Modules: M2"] },
  { personId: "p3", label: "Fake Three (Fakethree-1003) · no quiz yet", hasEmail: true, labels: ["Live - Modules: M7"] },
];

function actions(over: Partial<ReportActions> = {}): ReportActions {
  let calls = 0;
  return {
    preview: vi.fn(async () => ({ ok: true as const, subject: "Fake Course B1: your progress report", html: "<p>Fake preview</p>" })),
    sendTest: vi.fn(async () => ({ ok: true as const, to: "fake.admin@example.com" })),
    start: vi.fn(async () => ({ ok: true as const, sendId: "send-1", count: 3 })),
    // Two runs: first sends 2, second sends the last one.
    run: vi.fn(async () => (++calls === 1 ? { ok: true as const, sent: 2, failed: 0, pending: 1 } : { ok: true as const, sent: 1, failed: 0, pending: 0 })),
    retry: vi.fn(async () => ({ ok: true as const, count: 1 })),
    ...over,
  };
}

describe("progress reports panel", () => {
  it("shows the counts and a sandboxed preview of the chosen student's email", async () => {
    const a = actions();
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[]} actions={a} />);
    expect(screen.getByText("On the leaderboard").nextSibling?.textContent).toBe("2");
    const frame = (await screen.findByTitle("Email preview")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(a.preview).toHaveBeenCalledWith("page-1", "p1");
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "p2" } });
    await waitFor(() => expect(a.preview).toHaveBeenCalledWith("page-1", "p2"));
  });

  it("sends a test to the admin", async () => {
    const a = actions();
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[]} actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Send a test to me" }));
    expect(await screen.findByText("Test sent to fake.admin@example.com.")).toBeTruthy();
  });

  it("asks before sending, then sends in groups until everyone is done", async () => {
    const a = actions();
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[]} actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to all 3 students" }));
    expect(a.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, send now" }));
    expect(await screen.findByText("All reports are done. See the list below.")).toBeTruthy();
    expect(a.run).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Done: 3 of 3")).toBeTruthy();
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("cannot send to everyone before the SQL is pasted", () => {
    render(<ReportsPanel pageId="page-1" ready={false} summary={summary} students={students} rounds={[]} actions={actions()} />);
    expect(screen.getByRole("status").textContent).toMatch(/paste the SQL/);
    expect((screen.getByRole("button", { name: "Send to all 3 students" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers to continue an unfinished round and to retry failed emails", async () => {
    const round: ReportRound = {
      id: "send-9",
      createdAt: "2026-11-05T10:00:00Z",
      total: 3,
      counts: { sent: 1, failed: 1, skipped: 0, waiting: 1 },
      recipients: [
        { name: "Fake One", email: "fake.one@example.com", state: "sent", reason: "" },
        { name: "Fake Two", email: "fake.two@example.com", state: "failed", reason: "Brevo down" },
        { name: "Fake Three", email: "fake.three@example.com", state: "pending", reason: "" },
      ],
    };
    const a = actions();
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[round]} actions={a} />);
    expect(screen.getByText("1 sent · 1 failed · 0 skipped · 1 waiting")).toBeTruthy();
    expect(screen.getByText("Failed · could not be sent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue sending (1 waiting)" }));
    await waitFor(() => expect(a.run).toHaveBeenCalledWith("send-9"));
  });
});

describe("choosing who gets the report", () => {
  it("with no module ticked the send button is off and a hint says what to do", () => {
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[]} actions={actions()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Chosen modules only/ }));
    expect((screen.getByRole("button", { name: /^Send to/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Tick at least one module.")).toBeTruthy();
  });

  it("shows plain words for a failed student, never the email service's text", () => {
    const round: ReportRound = {
      id: "send-8", createdAt: "2026-11-05T10:00:00Z", total: 1,
      counts: { sent: 0, failed: 1, skipped: 0, waiting: 0 },
      recipients: [{ name: "Fake Two", email: "fake.two@example.com", state: "failed", reason: "Brevo key 123 rejected" }],
    };
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[round]} actions={actions()} />);
    expect(screen.queryByText(/Brevo key 123/)).toBeNull();
    expect(screen.getByText("Failed · could not be sent")).toBeTruthy();
  });

  it("full course only: shows the count and sends that group", async () => {
    const a = actions();
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[]} actions={a} />);
    fireEvent.click(screen.getByRole("radio", { name: /Full course students only/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send to 1 student" }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/1 student.*full course students/);
    fireEvent.click(screen.getByRole("button", { name: "Yes, send now" }));
    await waitFor(() => expect(a.start).toHaveBeenCalledWith("page-1", { kind: "full" }));
  });

  it("chosen modules only: ticking a module sends just that module's students", async () => {
    const a = actions();
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[]} actions={a} />);
    fireEvent.click(screen.getByRole("radio", { name: /Chosen modules only/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Module 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to 1 student" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, send now" }));
    await waitFor(() => expect(a.start).toHaveBeenCalledWith("page-1", { kind: "modules", modules: [2] }));
  });

  it("everyone is still the default and sends the all choice", async () => {
    const a = actions();
    render(<ReportsPanel pageId="page-1" ready summary={summary} students={students} rounds={[]} actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to all 3 students" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, send now" }));
    await waitFor(() => expect(a.start).toHaveBeenCalledWith("page-1", { kind: "all" }));
  });
});
