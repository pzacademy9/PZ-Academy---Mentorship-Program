import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, notCalls: [] as unknown[][] }));

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
        not: (...args: unknown[]) => {
          store.notCalls.push(args);
          const [k, op, v] = args as [string, string, unknown];
          if (op === "is" && v === null) rows = rows.filter((r) => r[k] != null);
          return b;
        },
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      };
      return b;
    },
  }),
}));

import { listDueReminderSessionIds } from "@/lib/data/session-cron";

const NOW = new Date("2026-11-10T12:00:00Z");
const sess = (id: string, over: Row = {}) => ({
  id, starts_at: new Date(NOW.getTime() + 30 * 60000).toISOString(), email_enabled: true, email_lead_minutes: 60,
  audience: { mode: "live", modules: "all" }, ...over,
});

beforeEach(() => { store.tables = {}; store.notCalls = []; });

describe("listDueReminderSessionIds with audiences", () => {
  it("asks the database to skip classes with no audience, and skips them silently", async () => {
    store.tables.batch_sessions = [sess("with"), sess("without", { audience: null })];
    expect(await listDueReminderSessionIds(NOW)).toEqual(["with"]);
    expect(store.notCalls).toContainEqual(["audience", "is", null]);
  });
});
