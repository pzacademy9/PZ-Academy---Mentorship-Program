import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const h = vi.hoisted(() => ({
  candidates: [] as unknown[],
  unsub: new Set<string>(),
  send: vi.fn(),
}));
vi.mock("@/lib/data/participant-campaigns", () => ({ resolveCandidates: async () => h.candidates }));
vi.mock("@/lib/data/participant-prefs", () => ({
  getOrCreateToken: async (email: string) => `tok-${email}`,
  listUnsubscribed: async () => h.unsub,
}));
vi.mock("@/lib/brevo-participants", () => ({ sendParticipantEmail: h.send }));

import { createSend, runEmailSend, retryFailed, markWhatsAppSent, previewSend, sendTestToMe, listMessagesForRegistrations } from "@/lib/data/participant-sends";

const PAGE = "page-1";
const cand = (id: string, o: Record<string, unknown> = {}) => ({
  registrationId: id, leadId: id, isMember: false, name: `Name ${id}`, email: `${id}@x.com`, phone: "0300", refId: `R-${id}`, status: "paid", ...o,
});
const input = (o: Record<string, unknown> = {}) => ({
  pageId: PAGE, channel: "email" as const, subject: "Hi {{ first_name }}", body: "Hello {{ first_name }}, ref {{ ref_id }}", expectedCount: 3,
  confirmNotPaid: false, actorId: "admin-1", ...o,
});

let store: Store;
function setup(courseId: string | null = "course-1") {
  store = {
    landing_pages: [{ id: PAGE, course_id: courseId }],
    courses: [{ id: "course-1", slug: "pmh" }],
    landing_registrations: ["a", "b", "c", "m1"].map((id) => ({ id, ref_id: `R-${id}`, lead_registration_id: null })),
    participant_sends: [],
    participant_send_recipients: [],
  };
  db.state.handler = memoryHandler(store);
}
const states = () => store.participant_send_recipients.map((r) => `${r.registration_id}:${r.state}`);

beforeEach(() => {
  db.reset();
  h.candidates = [cand("a"), cand("b"), cand("c")];
  h.unsub = new Set();
  h.send.mockReset();
  h.send.mockResolvedValue({ ok: true });
  process.env.BREVO_API_KEY_PARTICIPANTS = "test-key";
  setup();
});

describe("createSend", () => {
  it("refuses when someone has not paid, allows with confirmation and records it", async () => {
    h.candidates = [cand("a"), cand("b", { status: "pending" }), cand("c")];
    const refused = await createSend(input());
    expect(refused).toMatchObject({ ok: false, code: "not_paid_unconfirmed" });
    expect(store.participant_sends).toHaveLength(0);
    expect(store.participant_send_recipients).toHaveLength(0);
    const ok = await createSend(input({ confirmNotPaid: true }));
    expect(ok).toMatchObject({ ok: true, count: 3 });
    expect(store.participant_sends[0]).toMatchObject({ not_paid_confirmed: true, not_paid_count: 1, recipient_count: 3, created_by: "admin-1" });
  });

  it("refuses with count_changed and inserts nothing", async () => {
    const r = await createSend(input({ expectedCount: 5 }));
    expect(r).toMatchObject({ ok: false, code: "count_changed" });
    expect(store.participant_sends).toHaveLength(0);
    expect(store.participant_send_recipients).toHaveLength(0);
  });

  it("refuses when nobody is left", async () => {
    h.candidates = [];
    expect(await createSend(input({ expectedCount: 0 }))).toMatchObject({ ok: false, code: "no_recipients" });
  });

  it("refuses the portal link on a page without a course", async () => {
    setup(null);
    const r = await createSend(input({ body: "Go {{ portal_link }}" }));
    expect(r).toMatchObject({ ok: false, code: "no_course_for_portal_link" });
    expect(store.participant_sends).toHaveLength(0);
  });

  it("refuses email when the participant key is missing, but not whatsapp", async () => {
    delete process.env.BREVO_API_KEY_PARTICIPANTS;
    expect(await createSend(input())).toMatchObject({ ok: false, code: "not_set_up" });
    expect(await createSend(input({ channel: "whatsapp" }))).toMatchObject({ ok: true });
  });

  it("stores unsubscribed people as skipped and never sends to them", async () => {
    h.unsub = new Set(["b@x.com"]);
    const r = await createSend(input({ expectedCount: 2 }));
    expect(r).toMatchObject({ ok: true, count: 2 });
    expect(states().sort()).toEqual(["a:pending", "b:skipped", "c:pending"]);
    expect(store.participant_send_recipients.find((x) => x.registration_id === "b")?.reason).toBe("unsubscribed");
    await runEmailSend((r as { sendId: string }).sendId);
    expect(h.send.mock.calls.map((c) => c[0].to).sort()).toEqual(["a@x.com", "c@x.com"]);
  });

  it("deletes the send when the recipient insert fails", async () => {
    const real = db.state.handler;
    db.state.handler = (op) => (op.table === "participant_send_recipients" && op.op === "insert" ? { data: null, error: { message: "boom" } } : real(op));
    await expect(createSend(input())).rejects.toThrow(/recipient insert failed/);
    expect(store.participant_sends).toHaveLength(0);
  });

  it("previewSend reads only", async () => {
    const p = await previewSend({ pageId: PAGE, channel: "email" });
    expect(p.count).toBe(3);
    expect(db.find("participant_sends", "insert")).toHaveLength(0);
  });
});

describe("runEmailSend", () => {
  async function made(o: Record<string, unknown> = {}) {
    const r = await createSend(input(o));
    if (!r.ok) throw new Error(r.code);
    return r.sendId;
  }

  it("sends each recipient once even with two runs at the same time", async () => {
    const id = await made();
    await Promise.all([runEmailSend(id), runEmailSend(id)]);
    expect(h.send).toHaveBeenCalledTimes(3);
    expect(states().every((s) => s.endsWith(":sent"))).toBe(true);
  });

  it("marks failures with the reason and never resends sent rows", async () => {
    const id = await made();
    h.send.mockImplementation(async (o: { to: string }) => (o.to === "b@x.com" ? { ok: false, error: "bounced" } : { ok: true }));
    expect(await runEmailSend(id)).toEqual({ sent: 2, failed: 1, pending: 0 });
    expect(store.participant_send_recipients.find((r) => r.registration_id === "b")).toMatchObject({ state: "failed", reason: "bounced" });
    h.send.mockClear();
    await runEmailSend(id);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("retryFailed makes only failed rows pending", async () => {
    const id = await made();
    h.send.mockImplementation(async (o: { to: string }) => (o.to === "b@x.com" ? { ok: false, error: "bounced" } : { ok: true }));
    await runEmailSend(id);
    expect(await retryFailed(id)).toBe(1);
    expect(states().sort()).toEqual(["a:sent", "b:pending", "c:sent"]);
  });

  it("returns the remaining pending count for a limited chunk", async () => {
    const id = await made();
    expect(await runEmailSend(id, 2)).toEqual({ sent: 2, failed: 0, pending: 1 });
  });

  it("treats rows claimed over 15 minutes ago as pending, but not fresh ones", async () => {
    const id = await made();
    const [first, second] = store.participant_send_recipients;
    Object.assign(first, { state: "claimed", claimed_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() });
    Object.assign(second, { state: "claimed", claimed_at: new Date().toISOString() });
    const r = await runEmailSend(id);
    expect(r.sent).toBe(2);
    expect(second.state).toBe("claimed");
  });

  it("renders per recipient, includes the portal URL and that recipient's unsubscribe URL", async () => {
    const id = await made({ body: "Hello {{ first_name }}, ref {{ ref_id }}\n{{ portal_link }}" });
    await runEmailSend(id);
    const call = h.send.mock.calls.find((c) => c[0].to === "a@x.com")![0];
    expect(call.subject).toBe("Hi Name");
    expect(call.htmlContent).toContain("Hello Name, ref R-a");
    expect(call.htmlContent).toContain("/portal/pmh");
    expect(call.htmlContent).toContain("/unsubscribe/participants/tok-a@x.com");
    for (const c of h.send.mock.calls) {
      const who = (c[0].to as string);
      expect(c[0].htmlContent).toContain(`/unsubscribe/participants/tok-${who}`);
    }
  });

  it("escapes a name like A&B once", async () => {
    h.candidates = [cand("a", { name: "A&B Co" })];
    const id = await made({ expectedCount: 1, body: "Dear {{ full_name }}" });
    await runEmailSend(id);
    const html = h.send.mock.calls[0][0].htmlContent as string;
    expect(html).toContain("A&amp;B Co");
    expect(html).not.toContain("A&amp;amp;B");
  });

  it("skips someone who unsubscribed after the send was created", async () => {
    const id = await made();
    h.unsub = new Set(["c@x.com"]);
    await runEmailSend(id);
    expect(h.send.mock.calls.map((c) => c[0].to)).not.toContain("c@x.com");
    expect(store.participant_send_recipients.find((r) => r.registration_id === "c")).toMatchObject({ state: "skipped", reason: "unsubscribed" });
  });

  it("does nothing for a whatsapp send", async () => {
    const r = await createSend(input({ channel: "whatsapp" }));
    expect(await runEmailSend((r as { sendId: string }).sendId)).toEqual({ sent: 0, failed: 0, pending: 0 });
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("whatsapp, messages and test send", () => {
  it("markWhatsAppSent toggles one recipient", async () => {
    const r = await createSend(input({ channel: "whatsapp" }));
    const sendId = (r as { sendId: string }).sendId;
    const rec = store.participant_send_recipients[0];
    await markWhatsAppSent(sendId, rec.id as string, true);
    expect(rec.state).toBe("sent");
    expect(rec.sent_at).toBeTruthy();
    await markWhatsAppSent(sendId, rec.id as string, false);
    expect(rec.state).toBe("pending");
    expect(rec.sent_at).toBeNull();
    expect(h.send).not.toHaveBeenCalled();
  });

  it("listMessagesForRegistrations joins sends", async () => {
    const r = await createSend(input());
    const sendId = (r as { sendId: string }).sendId;
    const rows = await listMessagesForRegistrations(["a"]);
    expect(rows).toEqual([expect.objectContaining({ registrationId: "a", channel: "email", subject: "Hi {{ first_name }}", state: "pending" })]);
    expect(sendId).toBeTruthy();
  });

  it("sendTestToMe prefixes [TEST], uses the preview footer and writes no rows", async () => {
    const r = await sendTestToMe({ subject: "Hello {{ first_name }}", body: "Body", toEmail: "me@x.com", pageId: PAGE });
    expect(r).toEqual({ ok: true });
    const call = h.send.mock.calls[0][0];
    expect(call.subject).toBe("[TEST] Hello Sample");
    expect(call.htmlContent).toContain("/unsubscribe/participants/preview");
    expect(store.participant_sends).toHaveLength(0);
    expect(store.participant_send_recipients).toHaveLength(0);
  });
});
