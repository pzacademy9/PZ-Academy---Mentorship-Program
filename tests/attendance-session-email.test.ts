// tests/attendance-session-email.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Res, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const h = vi.hoisted(() => ({
  candidates: [] as unknown[],
  real: false,
  calls: [] as unknown[],
  unsub: new Set<string>(),
  send: vi.fn(),
}));
vi.mock("@/lib/data/participant-campaigns", async (orig) => {
  const real = await orig<typeof import("@/lib/data/participant-campaigns")>();
  return {
    ...real,
    resolveCandidates: async (i: Parameters<typeof real.resolveCandidates>[0]) => {
      h.calls.push(i);
      return h.real ? real.resolveCandidates(i) : h.candidates;
    },
  };
});
vi.mock("@/lib/data/participant-prefs", () => ({
  getOrCreateToken: async (email: string) => `tok-${email}`,
  listUnsubscribed: async () => h.unsub,
}));
vi.mock("@/lib/brevo-participants", () => ({ sendParticipantEmail: h.send }));

import { buildSessionEmail } from "@/lib/attendance/session-email";
import { createSessionSend } from "@/lib/data/session-emails";
import { runEmailSend } from "@/lib/data/participant-sends";
import { signCheckinToken, checkinSecret } from "@/lib/attendance/link-token";
import type { SessionRow } from "@/lib/data/attendance";

const PERSON = "11111111-1111-1111-1111-111111111111";
const FUTURE = new Date(Date.now() + 86400_000).toISOString();
const PAST = new Date(Date.now() - 3600_000).toISOString();
const sessRow = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1", page_id: "pg1", number: 1, title: "Day 1", starts_at: FUTURE, zoom_url: "https://zoom.test/j/1", kahoot_url: "",
  include_kahoot: false, include_attendance_link: true, email_enabled: true, email_lead_minutes: 60, public_code: "code0001", window_override: "auto",
  created_at: "2026-10-01T00:00:00Z", ...over,
} as SessionRow);
const cand = (id: string, o: Record<string, unknown> = {}) => ({
  registrationId: id, leadId: id, isMember: false, name: `Name ${id}`, email: `${id}@x.com`, phone: "+923001234567", refId: `R-${id}`, status: "paid", ...o,
});

let store: Store;
/** Memory handler plus the partial unique index participant_sends_reminder_key (one reminder per session). */
function handler(): (op: Op) => Res {
  const base = memoryHandler(store);
  return (op) => {
    if (op.table === "participant_sends" && op.op === "insert") {
      const p = op.payload as Record<string, unknown>;
      if (p.session_kind === "reminder" && store.participant_sends.some((r) => r.session_id === p.session_id && r.session_kind === "reminder")) {
        return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "participant_sends_reminder_key"' } };
      }
    }
    return base(op);
  };
}
function setup(session: Partial<SessionRow> = {}) {
  store = {
    batch_sessions: [sessRow(session)],
    landing_pages: [{ id: "pg1", course_id: null }],
    courses: [],
    landing_registrations: [
      { id: "a", ref_id: "R-a", lead_registration_id: null, person_id: PERSON },
      { id: "b", ref_id: "R-b", lead_registration_id: null, person_id: null },
    ],
    pz_people: [{ id: PERSON, pz_id: "Zed-1", display_name: "a" }],
    participant_sends: [],
    participant_send_recipients: [],
  };
  db.state.handler = handler();
}

beforeEach(() => {
  db.reset();
  h.candidates = [cand("a"), cand("b")];
  h.real = false;
  h.calls = [];
  h.unsub = new Set();
  h.send.mockReset();
  h.send.mockResolvedValue({ ok: true });
  process.env.BREVO_API_KEY_PARTICIPANTS = "test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  setup();
});
afterEach(() => { vi.useRealTimers(); });

describe("buildSessionEmail", () => {
  it("always has pz_id, zoom_link and session_time", () => {
    const m = buildSessionEmail(sessRow({ include_attendance_link: false }));
    for (const t of ["{{pz_id}}", "{{zoom_link}}", "{{session_time}}"]) expect(m.body).toContain(t);
    expect(m.subject.length).toBeGreaterThan(0);
  });
  it("adds the Kahoot line only when included and a URL exists", () => {
    expect(buildSessionEmail(sessRow({ include_kahoot: true, kahoot_url: "https://kahoot.it/x" })).body).toContain("{{kahoot_link}}");
    expect(buildSessionEmail(sessRow({ include_kahoot: true, kahoot_url: "" })).body).not.toContain("kahoot_link");
    expect(buildSessionEmail(sessRow({ include_kahoot: false, kahoot_url: "https://kahoot.it/x" })).body).not.toContain("kahoot_link");
  });
  it("adds the attendance line only when included", () => {
    expect(buildSessionEmail(sessRow({ include_attendance_link: true })).body).toContain("{{attendance_link}}");
    expect(buildSessionEmail(sessRow({ include_attendance_link: false })).body).not.toContain("attendance_link");
  });
  it("update kind says Updated: and that the time changed", () => {
    const m = buildSessionEmail(sessRow(), "update");
    expect(m.subject.startsWith("Updated:")).toBe(true);
    expect(m.body.toLowerCase()).toContain("time");
    expect(m.body.toLowerCase()).toContain("changed");
  });
});

describe("createSessionSend", () => {
  it("refuses with no_zoom for an empty Zoom URL", async () => {
    setup({ zoom_url: "" });
    expect(await createSessionSend("s1")).toEqual({ ok: false, reason: "no_zoom" });
    expect(store.participant_sends).toHaveLength(0);
  });
  it("refuses a reminder with started once starts_at has passed", async () => {
    setup({ starts_at: PAST });
    expect(await createSessionSend("s1")).toEqual({ ok: false, reason: "started" });
  });
  it("refuses a reminder with disabled when email_enabled is false", async () => {
    setup({ email_enabled: false });
    expect(await createSessionSend("s1")).toEqual({ ok: false, reason: "disabled" });
  });
  it("returns not_set_up without the Brevo key", async () => {
    delete process.env.BREVO_API_KEY_PARTICIPANTS;
    expect(await createSessionSend("s1")).toEqual({ ok: false, reason: "not_set_up" });
    expect(store.participant_sends).toHaveLength(0);
  });
  it("returns no_recipients when nobody qualifies", async () => {
    h.candidates = [];
    expect(await createSessionSend("s1")).toEqual({ ok: false, reason: "no_recipients" });
  });
  it("sends a reminder to enrolled live people, freezes them, and a second call is already_sent", async () => {
    h.candidates = [cand("a"), cand("b"), cand("p", { status: "pending" }), cand("f", { status: "free" }), cand("u", { status: "underpaid" })];
    h.unsub = new Set(["b@x.com"]);
    const r = await createSessionSend("s1");
    expect(r).toMatchObject({ ok: true, count: 2 });
    expect(h.calls[0]).toMatchObject({ pageId: "pg1", filters: { mode: "live" } });
    expect(store.participant_sends[0]).toMatchObject({
      page_id: "pg1", channel: "email", session_id: "s1", session_kind: "reminder", created_by: null, recipient_count: 2, not_paid_count: 1, not_paid_confirmed: false,
    });
    const pending = store.participant_send_recipients.filter((x) => x.state === "pending").map((x) => x.registration_id).sort();
    expect(pending).toEqual(["a", "f"]);
    expect(await createSessionSend("s1")).toEqual({ ok: false, reason: "already_sent" });
    expect(store.participant_sends).toHaveLength(1);
  });
  it("with the real resolver, recorded leads and their members are excluded and test rows never appear", async () => {
    h.real = true;
    const reg = (o: Record<string, unknown>) => ({
      page_id: "pg1", row_type: "individual", lead_registration_id: null, ref_id: null, name: "N", email: `${(o.id as string).toLowerCase()}@x.com`, whatsapp: "0300",
      option_label: "Live", mode: "live", region: "PK", status: "paid", is_test: false, agent_id: null, created_at: "2026-10-01T00:00:00Z", person_id: null, ...o,
    });
    store.landing_registrations = [
      reg({ id: "L", row_type: "lead", ref_id: "R-L" }),
      reg({ id: "lm", row_type: "member", lead_registration_id: "L" }),
      reg({ id: "R", row_type: "lead", ref_id: "R-R", mode: "recorded" }),
      reg({ id: "rm", row_type: "member", lead_registration_id: "R", mode: "recorded" }),
      reg({ id: "T", row_type: "lead", ref_id: "R-T", is_test: true }),
      reg({ id: "P", row_type: "lead", ref_id: "R-P", status: "pending" }),
    ];
    const r = await createSessionSend("s1");
    expect(r).toMatchObject({ ok: true, count: 2 });
    expect(store.participant_send_recipients.filter((x) => x.state === "pending").map((x) => x.registration_id).sort()).toEqual(["L", "lm"]);
  });
  it("sends an update for a started session, then refuses another within 60 seconds", async () => {
    setup({ starts_at: PAST, email_enabled: false });
    expect(await createSessionSend("s1", "update")).toMatchObject({ ok: true });
    expect(store.participant_sends[0]).toMatchObject({ session_kind: "update", subject: expect.stringMatching(/^Updated:/) });
    expect(await createSessionSend("s1", "update")).toEqual({ ok: false, reason: "too_soon" });
    store.participant_sends[0].created_at = new Date(Date.now() - 61_000).toISOString();
    expect(await createSessionSend("s1", "update")).toMatchObject({ ok: true });
  });
  it("a reminder does not block an update, and an update still needs a Zoom URL", async () => {
    expect(await createSessionSend("s1")).toMatchObject({ ok: true });
    expect(await createSessionSend("s1", "update")).toMatchObject({ ok: true });
    setup({ zoom_url: "  " });
    expect(await createSessionSend("s1", "update")).toEqual({ ok: false, reason: "no_zoom" });
  });
});

describe("runEmailSend with a session", () => {
  const htmlTo = (to: string) => String(h.send.mock.calls.map((c) => c[0]).find((c) => c.to === to).htmlContent);
  it("renders per-person attendance links, the shared link for a person-less recipient, and the PKT time", async () => {
    await createSessionSend("s1");
    const out = await runEmailSend(store.participant_sends[0].id as string);
    expect(out).toMatchObject({ sent: 2, failed: 0 });
    const token = signCheckinToken("s1", PERSON, checkinSecret()!);
    expect(htmlTo("a@x.com")).toContain(`https://app.test/attend/code0001?t=${token}`);
    expect(htmlTo("a@x.com")).toContain("https://zoom.test/j/1");
    expect(htmlTo("a@x.com")).toContain("Zed-1");
    expect(htmlTo("a@x.com")).toContain("PKT");
    expect(htmlTo("b@x.com")).toContain("https://app.test/attend/code0001");
    expect(htmlTo("b@x.com")).not.toContain("code0001?t=");
  });
  it("fails closed to the shared link when there is no signing secret", async () => {
    await createSessionSend("s1");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await runEmailSend(store.participant_sends[0].id as string);
    expect(htmlTo("a@x.com")).toContain("https://app.test/attend/code0001");
    expect(htmlTo("a@x.com")).not.toContain("?t=");
  });
});
