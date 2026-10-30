import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const h = vi.hoisted(() => ({
  candidates: [] as unknown[],
  real: false,
  throwErr: null as Error | null,
  unsub: new Set<string>(),
  send: vi.fn(),
}));
vi.mock("@/lib/data/participant-campaigns", async (orig) => {
  const real = await orig<typeof import("@/lib/data/participant-campaigns")>();
  return {
    ...real,
    resolveCandidates: async (i: Parameters<typeof real.resolveCandidates>[0]) => {
      if (h.throwErr) throw h.throwErr;
      return h.real ? real.resolveCandidates(i) : h.candidates;
    },
  };
});
vi.mock("@/lib/data/participant-prefs", () => ({
  getOrCreateToken: async (email: string) => `tok-${email}`,
  listUnsubscribed: async () => h.unsub,
}));
vi.mock("@/lib/brevo-participants", () => ({ sendParticipantEmail: h.send }));

import { createSend, runEmailSend, retryFailed, markWhatsAppSent, getSend, previewSend, sendTestToMe, listMessagesForRegistrations, listSendSummaries } from "@/lib/data/participant-sends";

const PAGE = "page-1";
const cand = (id: string, o: Record<string, unknown> = {}) => ({
  registrationId: id, leadId: id, isMember: false, name: `Name ${id}`, email: `${id}@x.com`, phone: "+923001234567", refId: `R-${id}`, status: "paid", ...o,
});
const input = (o: Record<string, unknown> = {}) => ({
  pageId: PAGE, channel: "email" as const, subject: "Hi {{ first_name }}", body: "Hello {{ first_name }}, ref {{ ref_id }}", expectedCount: 3, expectedNotPaid: 0,
  confirmNotPaid: false, actorId: "admin-1", ...o,
});

let store: Store;
function setup(courseId: string | null = "course-1") {
  store = {
    landing_pages: [{ id: PAGE, course_id: courseId }],
    courses: [{ id: "course-1", slug: "pmh" }],
    landing_registrations: ["a", "b", "c", "m1"].map((id) => ({ id, ref_id: `R-${id}`, lead_registration_id: null, person_id: id === "c" ? null : `p-${id}` })),
    pz_people: ["a", "b", "m1"].map((id) => ({ id: `p-${id}`, pz_id: `Zed-${id}`, display_name: id })),
    participant_sends: [],
    participant_send_recipients: [],
  };
  db.state.handler = memoryHandler(store);
}
const states = () => store.participant_send_recipients.map((r) => `${r.registration_id}:${r.state}`);

beforeEach(() => {
  db.reset();
  h.candidates = [cand("a"), cand("b"), cand("c")];
  h.real = false;
  h.throwErr = null;
  h.unsub = new Set();
  h.send.mockReset();
  h.send.mockResolvedValue({ ok: true });
  process.env.BREVO_API_KEY_PARTICIPANTS = "test-key";
  setup();
});

describe("createSend", () => {
  it("refuses when someone has not paid, allows with confirmation and records it", async () => {
    h.candidates = [cand("a"), cand("b", { status: "pending" }), cand("c")];
    const refused = await createSend(input({ expectedNotPaid: 1 }));
    expect(refused).toMatchObject({ ok: false, code: "not_paid_unconfirmed" });
    expect(store.participant_sends).toHaveLength(0);
    expect(store.participant_send_recipients).toHaveLength(0);
    const ok = await createSend(input({ confirmNotPaid: true, expectedNotPaid: 1 }));
    expect(ok).toMatchObject({ ok: true, count: 3 });
    expect(store.participant_sends[0]).toMatchObject({ not_paid_confirmed: true, not_paid_count: 1, recipient_count: 3, created_by: "admin-1" });
  });

  it("refuses with count_changed and inserts nothing", async () => {
    const r = await createSend(input({ expectedCount: 5 }));
    expect(r).toMatchObject({ ok: false, code: "count_changed" });
    expect(store.participant_sends).toHaveLength(0);
    expect(store.participant_send_recipients).toHaveLength(0);
  });

  it("refuses with count_changed when the not-paid count differs from the preview", async () => {
    h.candidates = [cand("a", { status: "pending" }), cand("b", { status: "pending" }), cand("c", { status: "pending" })];
    const r = await createSend(input({ expectedNotPaid: 1, confirmNotPaid: true }));
    expect(r).toMatchObject({ ok: false, code: "count_changed" });
    expect(store.participant_sends).toHaveLength(0);
  });

  it("returns count_changed (not a throw) when a ticked row is no longer a valid head", async () => {
    h.throwErr = new Error("A selected registration is not on this campaign");
    expect(await createSend(input({ ids: ["a"] }))).toMatchObject({ ok: false, code: "count_changed" });
    h.throwErr = new Error("database down");
    await expect(createSend(input({ ids: ["a"] }))).rejects.toThrow(/database down/);
  });

  it("with the real resolver: test-lead members never appear and a pending lead member counts as not paid", async () => {
    h.real = true;
    const reg = (o: Record<string, unknown>) => ({
      page_id: PAGE, row_type: "individual", lead_registration_id: null, ref_id: null, name: "N", email: "n@x.com", whatsapp: "0300",
      option_label: "Live", mode: "live", region: "PK", status: "paid", is_test: false, agent_id: null, created_at: "2026-10-01T00:00:00Z", ...o,
    });
    store.landing_registrations = [
      reg({ id: "L", row_type: "lead", name: "Lead", email: "l@x.com", ref_id: "R-L", status: "paid" }),
      reg({ id: "mt", row_type: "member", lead_registration_id: "L", name: "Test Member", email: "mt@x.com", is_test: true }),
      reg({ id: "P", row_type: "lead", name: "Pend", email: "p@x.com", ref_id: "R-P", status: "pending" }),
      reg({ id: "pm", row_type: "member", lead_registration_id: "P", name: "Pend Member", email: "pm@x.com", status: "pending" }),
    ];
    const refused = await createSend(input({ expectedCount: 3, expectedNotPaid: 2 }));
    expect(refused).toMatchObject({ ok: false, code: "not_paid_unconfirmed" });
    const ok = await createSend(input({ expectedCount: 3, expectedNotPaid: 2, confirmNotPaid: true }));
    expect(ok).toMatchObject({ ok: true, count: 3 });
    expect(store.participant_send_recipients.map((r) => r.registration_id).sort()).toEqual(["L", "P", "pm"]);
  });

  it("refuses a repeat of the same message within 60 seconds, allows it later or with another body", async () => {
    const first = await createSend(input());
    expect(first.ok).toBe(true);
    const sends = store.participant_sends.length, recs = store.participant_send_recipients.length;
    expect(await createSend(input())).toMatchObject({ ok: false, code: "duplicate_send" });
    expect(store.participant_sends).toHaveLength(sends);
    expect(store.participant_send_recipients).toHaveLength(recs);
    expect(await createSend(input({ body: "Different {{ first_name }}" }))).toMatchObject({ ok: true });
    store.participant_sends[0].created_at = new Date(Date.now() - 61 * 1000).toISOString();
    expect(await createSend(input())).toMatchObject({ ok: true });
  });

  it("handles a 20,000 character body: still refuses an identical repeat and allows a different one", async () => {
    const big = "ا".repeat(20000);
    expect(await createSend(input({ body: big }))).toMatchObject({ ok: true });
    expect(await createSend(input({ body: big }))).toMatchObject({ ok: false, code: "duplicate_send" });
    expect(await createSend(input({ body: big.slice(1) }))).toMatchObject({ ok: true });
    const dup = db.state.ops.filter((o) => o.table === "participant_sends" && o.op === "select").flatMap((o) => o.filters.map((f) => f[1]));
    expect(dup).not.toContain("body");
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

  it("turns rows claimed over 15 minutes ago into failed (never sent), and retryFailed makes them pending", async () => {
    const id = await made();
    const [first, second] = store.participant_send_recipients;
    Object.assign(first, { state: "claimed", claimed_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() });
    Object.assign(second, { state: "claimed", claimed_at: new Date().toISOString() });
    const r = await runEmailSend(id);
    expect(r.sent).toBe(1);
    expect(h.send.mock.calls.map((c) => c[0].to)).not.toContain(first.email);
    expect(first).toMatchObject({ state: "failed", reason: "May have been sent. Check before sending again." });
    expect(second.state).toBe("claimed");
    expect(await retryFailed(id)).toBe(1);
    expect(first.state).toBe("pending");
  });

  it("retries the sent mark when it fails after the email went out", async () => {
    const id = await made({ expectedCount: 3 });
    const real = db.state.handler;
    let failures = 2;
    db.state.handler = (op) => {
      const p = op.payload as { state?: string } | undefined;
      if (op.table === "participant_send_recipients" && op.op === "update" && p?.state === "sent" && failures-- > 0) return { data: null, error: { message: "blip" } };
      return real(op);
    };
    await runEmailSend(id);
    expect(states().every((x) => x.endsWith(":sent"))).toBe(true);
    expect(h.send).toHaveBeenCalledTimes(3);
  });

  it("fails a recipient whose portal link cannot be built instead of sending a blank link", async () => {
    const id = await made({ body: "Go {{ portal_link }}" });
    store.landing_pages[0].course_id = null;
    expect(await runEmailSend(id)).toEqual({ sent: 0, failed: 3, pending: 0 });
    expect(h.send).not.toHaveBeenCalled();
    expect(store.participant_send_recipients[0]).toMatchObject({ state: "failed", reason: "No portal link available" });
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

  it("renders the PZ ID per recipient, and never sends a PZ ID message to someone with no person", async () => {
    // c has no person, so no PZ ID: since the PZ ID requirement, c is left out when the send is created.
    const id = await made({ body: "ID [{{ pz_id }}]", expectedCount: 2 });
    await runEmailSend(id);
    const html = (to: string) => h.send.mock.calls.find((c) => c[0].to === to)![0].htmlContent as string;
    expect(html("a@x.com")).toContain("ID [Zed-a]");
    expect(html("b@x.com")).toContain("ID [Zed-b]");
    expect(h.send.mock.calls.find((c) => c[0].to === "c@x.com")).toBeUndefined();
  });

  it("a member gets their own PZ ID, not the lead's", async () => {
    store.landing_registrations.find((r) => r.id === "m1")!.lead_registration_id = "a";
    h.candidates = [cand("m1", { leadId: "a", isMember: true, refId: "R-a" })];
    const id = await made({ expectedCount: 1, body: "[{{ ref_id }}|{{ pz_id }}]" });
    await runEmailSend(id);
    expect(h.send.mock.calls[0][0].htmlContent as string).toContain("[R-a|Zed-m1]");
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
    await expect(markWhatsAppSent(sendId, "nope", true)).rejects.toThrow("Recipient not found");
    store.participant_send_recipients[1].state = "skipped";
    await expect(markWhatsAppSent(sendId, store.participant_send_recipients[1].id as string, true)).rejects.toThrow("Recipient not found");
  });

  it("getSend adds each registration's ref id and the portal link for the rendered message", async () => {
    const r = await createSend(input({ channel: "whatsapp" }));
    const got = await getSend((r as { sendId: string }).sendId);
    expect(got?.recipients).toHaveLength(3);
    expect(got?.refIds).toEqual({ a: "R-a", b: "R-b", c: "R-c" });
    expect(got?.pzIds).toEqual({ a: "Zed-a", b: "Zed-b" });
    expect(got?.portalUrl).toMatch(/\/portal\/pmh$/);
  });

  it("listMessagesForRegistrations joins sends", async () => {
    const r = await createSend(input());
    expect(r.ok).toBe(true);
    const rows = await listMessagesForRegistrations(["a"]);
    expect(rows).toEqual([expect.objectContaining({ registrationId: "a", channel: "email", subject: "Hi {{ first_name }}", state: "pending" })]);
  });

  it("listSendSummaries counts each state per send and names the sender", async () => {
    store.profiles = [{ id: "admin-1", full_name: "Sarah Jenkins" }];
    const r = await createSend(input());
    expect(r.ok).toBe(true);
    const id = (r as { sendId: string }).sendId;
    store.participant_send_recipients[0].state = "sent";
    store.participant_send_recipients[1].state = "failed";
    store.participant_send_recipients.push({ id: "x1", send_id: id, registration_id: "z", state: "skipped", reason: "unsubscribed" });
    store.participant_send_recipients.push({ id: "x2", send_id: "other-send", registration_id: "z", state: "sent", reason: "" });
    const rows = await listSendSummaries(PAGE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, senderName: "Sarah Jenkins", counts: { sent: 1, failed: 1, skipped: 1, waiting: 1 } });
  });

  it("listSendSummaries leaves the sender out when no name is known and counts claimed as waiting", async () => {
    const r = await createSend(input());
    store.participant_send_recipients[0].state = "claimed";
    const rows = await listSendSummaries(PAGE);
    expect(rows[0].senderName).toBeNull();
    expect(rows[0].counts.waiting).toBe(3);
    expect(r.ok).toBe(true);
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
