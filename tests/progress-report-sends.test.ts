import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseMock, memoryHandler, type Op, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const h = vi.hoisted(() => ({
  unsub: new Set<string>(),
  send: vi.fn(async (_o: { to: string; subject: string; htmlContent: string }) => ({ ok: true as const })),
}));
vi.mock("@/lib/data/participant-prefs", () => ({
  getOrCreateToken: async () => "fake-token",
  listUnsubscribed: async () => h.unsub,
}));
vi.mock("@/lib/brevo-participants", () => ({ sendParticipantEmail: h.send }));

import { createReportSend, loadBatchReport, retryReportFailed, runReportSend, sendReportTest } from "@/lib/data/progress-reports";

const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let store: Store;
let tablesMissing = false;

beforeEach(() => {
  db.reset();
  h.send.mockClear();
  h.unsub = new Set();
  tablesMissing = false;
  store = {
    landing_pages: [{ id: PAGE, title: "Fake Course B1", slug: "fake-b1", kind: "course", attendance_min_pct: 75 }],
    landing_registrations: [
      { id: "r1", page_id: PAGE, person_id: "p1", email: "Fake.One@example.com", mode: "live", option_label: "", status: "paid", is_test: false, created_at: "2026-10-01" },
      { id: "r2", page_id: PAGE, person_id: "p2", email: "fake.two@example.com", mode: "live", option_label: "", status: "free", is_test: false, created_at: "2026-10-01" },
      { id: "r3", page_id: PAGE, person_id: "p3", email: "fake.three@example.com", mode: "live", option_label: "", status: "paid", is_test: false, created_at: "2026-10-01" },
      { id: "r4", page_id: PAGE, person_id: "p4", email: "fake.pending@example.com", mode: "live", option_label: "", status: "pending", is_test: false, created_at: "2026-10-01" },
      { id: "r5", page_id: PAGE, person_id: "p5", email: "fake.test@example.com", mode: "live", option_label: "", status: "paid", is_test: true, created_at: "2026-10-01" },
      { id: "r6", page_id: PAGE, person_id: "p1", email: "fake.one.new@example.com", mode: "live", option_label: "", status: "paid", is_test: false, created_at: "2026-10-05" },
    ],
    pz_people: [
      { id: "p1", pz_id: "Fakeone-1001", display_name: "Fake One" },
      { id: "p2", pz_id: "Faketwo-1002", display_name: "Fake Two" },
      { id: "p3", pz_id: "Fakethree-1003", display_name: "Fake Three" },
      { id: "p4", pz_id: "Fakefour-1004", display_name: "Fake Four" },
      { id: "p5", pz_id: "Fakefive-1005", display_name: "Fake Five" },
    ],
    batch_sessions: [{ id: "s1", page_id: PAGE, number: 1, title: "Fake Class", starts_at: "2026-10-02T10:00:00Z", audience: null, quiz_max_score: 10000 }],
    batch_session_marks: [],
    batch_quiz_results: [
      { id: "q1", session_id: "s1", person_id: "p1", score: 9000, correct: 9, incorrect: 1 },
      { id: "q2", session_id: "s1", person_id: "p2", score: 7000, correct: 7, incorrect: 3 },
    ],
    progress_report_sends: [],
    progress_report_recipients: [],
  };
  const mem = memoryHandler(store);
  db.state.handler = (op: Op) => {
    if (tablesMissing && op.table.startsWith("progress_report")) return { data: null, error: { message: "relation does not exist", code: "42P01" } };
    return mem(op);
  };
});

describe("migration 0105", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0105_progress_report_sends.sql"), "utf8");
  it("creates both tables idempotently, RLS on, no policies, nothing dropped", () => {
    for (const t of ["progress_report_sends", "progress_report_recipients"]) {
      expect(sql).toContain(`create table if not exists public.${t} (`);
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
    }
    expect(sql).toContain("unique (send_id, person_id)");
    expect(sql).not.toMatch(/create policy|drop table|delete from/i);
  });
});

describe("loading a batch report", () => {
  it("includes only paid or free, non-test students, with their newest batch email", async () => {
    const loaded = await loadBatchReport(PAGE);
    const ids = loaded!.report.students.map((s) => s.pzId).sort();
    expect(ids).toEqual(["Fakeone-1001", "Fakethree-1003", "Faketwo-1002"]);
    expect(loaded!.report.students.find((s) => s.personId === "p1")!.email).toBe("fake.one.new@example.com");
    expect(loaded!.report.students.find((s) => s.personId === "p1")!.rank).toBe(1);
  });
  it("is null for an unknown batch", async () => {
    expect(await loadBatchReport("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBeNull();
    expect(await loadBatchReport("bad")).toBeNull();
  });
});

describe("sending", () => {
  it("sends a marked test to the admin", async () => {
    expect(await sendReportTest(PAGE, "p2", "fake.admin@example.com")).toEqual({ ok: true });
    expect(h.send.mock.calls[0][0]).toMatchObject({ to: "fake.admin@example.com", subject: "[TEST] Fake Course B1: your progress report" });
  });

  it("asks for the SQL when the tables are missing", async () => {
    tablesMissing = true;
    const res = await createReportSend(PAGE, null);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.message).toMatch(/SQL/);
  });

  it("freezes one row per student and sends each report exactly once", async () => {
    const res = await createReportSend(PAGE, "admin-1");
    expect(res).toMatchObject({ ok: true, count: 3 });
    const sendId = (res as { sendId: string }).sendId;
    expect(store.progress_report_recipients.every((r) => r.state === "pending")).toBe(true);

    const run = await runReportSend(sendId);
    expect(run).toEqual({ sent: 3, failed: 0, pending: 0 });
    expect(h.send).toHaveBeenCalledTimes(3);
    const first = h.send.mock.calls.find((c) => c[0].to === "fake.one.new@example.com")![0];
    expect(first.subject).toBe("Fake Course B1: your progress report");
    expect(first.htmlContent).toContain("Fakeone-1001");
    expect(first.htmlContent).toContain("/unsubscribe/participants/fake-token");

    // Pressing again sends nothing more.
    expect(await runReportSend(sendId)).toEqual({ sent: 0, failed: 0, pending: 0 });
    expect(h.send).toHaveBeenCalledTimes(3);
  });

  it("refuses a second round within a minute", async () => {
    await createReportSend(PAGE, null);
    const again = await createReportSend(PAGE, null);
    expect(again.ok).toBe(false);
  });

  it("skips unsubscribed students", async () => {
    h.unsub = new Set(["fake.two@example.com"]);
    const res = (await createReportSend(PAGE, null)) as { sendId: string };
    expect(await runReportSend(res.sendId)).toEqual({ sent: 2, failed: 0, pending: 0 });
    expect(store.progress_report_recipients.find((r) => r.email === "fake.two@example.com")).toMatchObject({ state: "skipped", reason: "unsubscribed" });
  });

  it("marks failed sends and lets them be tried again", async () => {
    h.send.mockImplementationOnce(async () => ({ ok: false, error: "Brevo down" }) as never);
    const res = (await createReportSend(PAGE, null)) as { sendId: string };
    const run = await runReportSend(res.sendId);
    expect(run.failed).toBe(1);
    expect(await retryReportFailed(res.sendId)).toBe(1);
    expect(await runReportSend(res.sendId)).toEqual({ sent: 1, failed: 0, pending: 0 });
  });
});
