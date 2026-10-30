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
import { presetLiveWithModule } from "@/lib/classes/audience";

const PERSON = "11111111-1111-1111-1111-111111111111";
const FUTURE = new Date(Date.now() + 86400_000).toISOString();
const PAST = new Date(Date.now() - 3600_000).toISOString();
const sessRow = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1", page_id: "pg1", number: 1, title: "Day 1", starts_at: FUTURE, zoom_url: "https://zoom.test/j/1", kahoot_url: "",
  include_kahoot: false, include_attendance_link: true, email_enabled: true, email_lead_minutes: 60, public_code: "code0001", window_override: "auto",
  created_at: "2026-10-01T00:00:00Z", audience: { mode: "live", modules: "all" }, ...over,
} as SessionRow);
const cand = (id: string, o: Record<string, unknown> = {}) => ({
  registrationId: id, leadId: id, isMember: false, name: `Name ${id}`, email: `${id}@x.com`, phone: "+923001234567", refId: `R-${id}`, status: "paid", optionLabel: "Live - Full Course", ...o,
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
      ...["f", "u", "p", "fullLive", "m1", "m4", "rec", "recm1", "blank", "live"].map((id, i) => ({ id, ref_id: `R-${id}`, lead_registration_id: null, person_id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}` })),
    ],
    pz_people: [
      { id: PERSON, pz_id: "Zed-1", display_name: "a" },
      ...["f", "u", "p", "fullLive", "m1", "m4", "rec", "recm1", "blank", "live"].map((id, i) => ({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, pz_id: `Id-${id}`, display_name: id })),
    ],
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
  it("resend wording is neutral: no updated or changed, same links", () => {
    const m = buildSessionEmail(sessRow({ include_kahoot: true, kahoot_url: "https://kahoot.it/x" }), "update", { resend: true });
    expect(m.subject.startsWith("Your class details:")).toBe(true);
    const all = `${m.subject} ${m.body}`.toLowerCase();
    expect(all).not.toContain("updated");
    expect(all).not.toContain("changed");
    for (const t of ["{{zoom_link}}", "{{attendance_link}}", "{{kahoot_link}}", "{{session_time}}"]) expect(m.body).toContain(t);
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
  it("a paid person with no PZ ID is not emailed, one with an ID is", async () => {
    h.candidates = [cand("a"), cand("b")];
    const r = await createSessionSend("s1");
    expect(r).toMatchObject({ ok: true, count: 1 });
    expect(store.participant_send_recipients.map((x) => x.registration_id)).toEqual(["a"]);
    expect(await (async () => { setup(); h.candidates = [cand("b")]; return createSessionSend("s1"); })()).toEqual({ ok: false, reason: "no_recipients" });
  });
  it("with the real resolver, recorded leads and their members are excluded and test rows never appear", async () => {
    h.real = true;
    const reg = (o: Record<string, unknown>) => ({
      page_id: "pg1", row_type: "individual", lead_registration_id: null, ref_id: null, name: "N", email: `${(o.id as string).toLowerCase()}@x.com`, whatsapp: "0300",
      option_label: "Live - Full Course", mode: "live", region: "PK", status: "paid", is_test: false, agent_id: null, created_at: "2026-10-01T00:00:00Z", person_id: null, ...o,
    });
    store.landing_registrations = [
      reg({ id: "L", row_type: "lead", ref_id: "R-L", person_id: "00000000-0000-4000-8000-000000000201" }),
      reg({ id: "lm", row_type: "member", lead_registration_id: "L", person_id: "00000000-0000-4000-8000-000000000202" }),
      reg({ id: "R", row_type: "lead", ref_id: "R-R", mode: "recorded" }),
      reg({ id: "rm", row_type: "member", lead_registration_id: "R", mode: "recorded" }),
      reg({ id: "T", row_type: "lead", ref_id: "R-T", is_test: true }),
      reg({ id: "P", row_type: "lead", ref_id: "R-P", status: "pending" }),
    ];
    store.pz_people.push(
      { id: "00000000-0000-4000-8000-000000000201", pz_id: "Id-L", display_name: "L" },
      { id: "00000000-0000-4000-8000-000000000202", pz_id: "Id-lm", display_name: "lm" },
    );
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
  it("returns no_audience for every kind and creates no send when the class has no audience", async () => {
    setup({ audience: null, feedback_session_id: "f1" });
    for (const kind of ["reminder", "update", "feedback"] as const) {
      expect(await createSessionSend("s1", kind)).toEqual({ ok: false, reason: "no_audience" });
    }
    expect(store.participant_sends).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });
  it("with a live Module 1 audience only live full-course and live Module 1 people are planned", async () => {
    setup({ audience: presetLiveWithModule(1) });
    h.candidates = [
      cand("fullLive"),
      cand("m1", { optionLabel: "Live - Modules: M1, M2" }),
      cand("m4", { optionLabel: "Live - Modules: M4" }),
      cand("rec", { optionLabel: "Recorded - Full Course" }),
      cand("recm1", { optionLabel: "Recorded - Modules: M1" }),
      cand("blank", { optionLabel: undefined }),
    ];
    const r = await createSessionSend("s1");
    expect(r).toMatchObject({ ok: true, count: 2 });
    expect(store.participant_send_recipients.map((x) => x.registration_id).sort()).toEqual(["fullLive", "m1"]);
  });
  it("an audience of mode any is not narrowed to live and includes recorded people", async () => {
    setup({ audience: { mode: "any", modules: "all" } });
    h.candidates = [cand("live"), cand("rec", { optionLabel: "Recorded - Full Course" })];
    expect(await createSessionSend("s1")).toMatchObject({ ok: true, count: 2 });
    expect((h.calls[0] as { filters: Record<string, unknown> }).filters.mode).toBeUndefined();
  });
  it("a live audience keeps the live filter", async () => {
    await createSessionSend("s1");
    expect(h.calls[0]).toMatchObject({ filters: { mode: "live" } });
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
  it("renders the per-person attendance link and PKT time, and fails a recipient with no PZ ID instead of emailing a blank one", async () => {
    await createSessionSend("s1");
    // "b" has no PZ ID, so the send itself leaves them out; add them as a recipient anyway to prove the sender still fails them safely.
    store.participant_send_recipients.push({ ...store.participant_send_recipients[0], id: "rb", registration_id: "b", email: "b@x.com", state: "pending" });
    const out = await runEmailSend(store.participant_sends[0].id as string);
    expect(out).toMatchObject({ sent: 1, failed: 1 });
    const token = signCheckinToken("s1", PERSON, checkinSecret()!);
    expect(htmlTo("a@x.com")).toContain(`https://app.test/attend/code0001?t=${token}`);
    expect(htmlTo("a@x.com")).toContain("https://zoom.test/j/1");
    expect(htmlTo("a@x.com")).toContain("Zed-1");
    expect(htmlTo("a@x.com")).toContain("PKT");
    expect(h.send.mock.calls.some((c) => c[0].to === "b@x.com")).toBe(false);
    expect(store.participant_send_recipients.find((x) => x.registration_id === "b")).toMatchObject({ state: "failed", reason: "No PZ ID yet" });
  });
  it("skips every pending recipient when the session was deleted after the send was created", async () => {
    await createSessionSend("s1");
    store.participant_sends[0].session_id = null; // FK on delete set null; session_kind stays
    const out = await runEmailSend(store.participant_sends[0].id as string);
    expect(out).toEqual({ sent: 0, failed: 0, pending: 0 });
    expect(h.send).not.toHaveBeenCalled();
    expect(store.participant_send_recipients.map((x) => `${x.state}:${x.reason}`)).toEqual(["skipped:Session was deleted"]);
  });
  it("fails closed to the shared link when there is no signing secret", async () => {
    await createSessionSend("s1");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await runEmailSend(store.participant_sends[0].id as string);
    expect(htmlTo("a@x.com")).toContain("https://app.test/attend/code0001");
    expect(htmlTo("a@x.com")).not.toContain("?t=");
  });
});

describe("listSessionSendState", () => {
  it("returns when the reminder and the latest update went out, per session", async () => {
    const { listSessionSendState } = await import("@/lib/data/session-emails");
    store.participant_sends.push(
      { id: "x1", session_id: "s1", session_kind: "reminder", created_at: "2026-10-30T10:00:00Z" },
      { id: "x2", session_id: "s1", session_kind: "update", created_at: "2026-10-31T10:00:00Z" },
      { id: "x3", session_id: "s1", session_kind: "update", created_at: "2026-11-01T10:00:00Z" },
      { id: "x4", session_id: "other", session_kind: "reminder", created_at: "2026-10-30T10:00:00Z" },
      { id: "x5", session_id: null, session_kind: null, created_at: "2026-10-30T10:00:00Z" },
    );
    expect(await listSessionSendState(["s1", "s2"])).toEqual({
      s1: { reminderAt: "2026-10-30T10:00:00Z", updateAt: "2026-11-01T10:00:00Z" },
    });
    expect(await listSessionSendState([])).toEqual({});
  });
});
