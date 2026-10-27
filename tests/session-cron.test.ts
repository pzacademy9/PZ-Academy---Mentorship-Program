import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, calls: [] as string[] }));

/** Tiny chainable fake: eq/gt/lte/in/not on top-level columns, plus the participant_sends join. */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      let rows = [...(store.tables[table] ?? [])];
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return b; },
        gt: (k: string, v: string) => { rows = rows.filter((r) => String(r[k]) > v); return b; },
        lte: (k: string, v: string) => { rows = rows.filter((r) => String(r[k]) <= v); return b; },
        in: (k: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[k])); return b; },
        not: (k: string) => {
          if (k.startsWith("participant_sends.")) rows = rows.filter((r) => (r.participant_sends as Row | null)?.session_id != null);
          return b;
        },
        limit: () => b,
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      };
      store.calls.push(table);
      return b;
    },
  }),
}));

import { listDueReminderSessionIds, listSessionSendsWithPending } from "@/lib/data/session-cron";

const NOW = new Date("2026-11-10T12:00:00Z");
const at = (minutesFromNow: number) => new Date(NOW.getTime() + minutesFromNow * 60000).toISOString();
const sess = (id: string, startsInMin: number, over: Row = {}) => ({
  id, starts_at: at(startsInMin), email_enabled: true, email_lead_minutes: 60, ...over,
});

beforeEach(() => { store.tables = {}; store.calls = []; });

describe("listDueReminderSessionIds", () => {
  it("applies the lead boundary, started, disabled and existing-reminder rules", async () => {
    store.tables.batch_sessions = [
      sess("exact", 60),            // exactly lead minutes before: due
      sess("early", 61),            // one minute earlier: not due
      sess("started", -5),          // already started
      sess("disabled", 30, { email_enabled: false }),
      sess("sent", 30),             // reminder exists
      sess("inside", 10),           // well inside the lead: due
    ];
    store.tables.participant_sends = [
      { session_id: "sent", session_kind: "reminder" },
      { session_id: "early", session_kind: "update" },
    ];
    expect((await listDueReminderSessionIds(NOW)).sort()).toEqual(["exact", "inside"]);
  });
  it("an update send does not count as a reminder", async () => {
    store.tables.batch_sessions = [sess("a", 30)];
    store.tables.participant_sends = [{ session_id: "a", session_kind: "update" }];
    expect(await listDueReminderSessionIds(NOW)).toEqual(["a"]);
  });
  it("returns nothing when no session is in range", async () => {
    store.tables.batch_sessions = [sess("far", 60 * 24 * 30)];
    expect(await listDueReminderSessionIds(NOW)).toEqual([]);
  });
});

describe("listSessionSendsWithPending", () => {
  const rec = (sendId: string, state: string, sessionId: string | null, createdAt: string) =>
    ({ send_id: sendId, state, participant_sends: { session_id: sessionId, created_at: createdAt } });

  it("returns only session sends with pending recipients, oldest first, distinct, capped, in one query", async () => {
    store.tables.participant_send_recipients = [
      rec("new", "pending", "s1", "2026-11-03T00:00:00Z"),
      rec("old", "pending", "s2", "2026-11-01T00:00:00Z"),
      rec("old", "pending", "s2", "2026-11-01T00:00:00Z"),
      rec("mid", "pending", "s3", "2026-11-02T00:00:00Z"),
      rec("done", "sent", "s4", "2026-10-01T00:00:00Z"),
      rec("manual", "pending", null, "2026-10-01T00:00:00Z"),
    ];
    expect(await listSessionSendsWithPending(5)).toEqual(["old", "mid", "new"]);
    expect(await listSessionSendsWithPending(2)).toEqual(["old", "mid"]);
    expect(store.calls.filter((t) => t === "participant_send_recipients")).toHaveLength(2);
  });
});
