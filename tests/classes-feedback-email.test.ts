// tests/classes-feedback-email.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const h = vi.hoisted(() => ({ admin: true, candidates: [] as unknown[], send: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (h.admin ? { ok: true, user: { id: "admin-1" } } : { ok: false, response: {} }),
}));
vi.mock("@/lib/data/participant-campaigns", async (orig) => {
  const real = await orig<typeof import("@/lib/data/participant-campaigns")>();
  return { ...real, resolveCandidates: async () => h.candidates };
});
vi.mock("@/lib/data/participant-prefs", () => ({
  getOrCreateToken: async (email: string) => `tok-${email}`,
  listUnsubscribed: async () => new Set<string>(),
}));
vi.mock("@/lib/brevo-participants", () => ({ sendParticipantEmail: h.send }));

import { buildFeedbackEmail } from "@/lib/attendance/session-email";
import { createSessionSend, sendSessionTest, listSessionEmailHistory } from "@/lib/data/session-emails";
import { emailFeedbackLink } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

const SESS = "00000000-0000-4000-8000-000000000002";
const PAGE = "00000000-0000-4000-8000-000000000001";
const PERSON = "11111111-1111-1111-1111-111111111111";
const cand = (id: string) => ({
  registrationId: id, leadId: id, isMember: false, name: `Name ${id}`, email: `${id}@x.com`, phone: "+923001234567", refId: `R-${id}`, status: "paid", optionLabel: "Live - Full Course",
});

let store: Store;
function setup(over: Record<string, unknown> = {}) {
  store = {
    batch_sessions: [{
      id: SESS, page_id: PAGE, number: 1, title: "Intro", starts_at: new Date(Date.now() - 3600_000).toISOString(),
      zoom_url: "https://zoom.test/j/1", kahoot_url: "", include_kahoot: false, include_attendance_link: true,
      email_enabled: true, public_code: "code0001", window_override: "auto", feedback_session_id: "f1",
      audience: { mode: "live", modules: "all" }, ...over,
    }],
    feedback_sessions: [{ id: "f1", slug: "slug-one" }],
    landing_pages: [{ id: PAGE, course_id: null }],
    courses: [],
    landing_registrations: [
      { id: "a", ref_id: "R-a", lead_registration_id: null, person_id: PERSON },
      { id: "b", ref_id: "R-b", lead_registration_id: null, person_id: PERSON },
    ],
    pz_people: [{ id: PERSON, pz_id: "Zed-1", display_name: "a" }],
    participant_sends: [],
    participant_send_recipients: [],
  };
  db.state.handler = memoryHandler(store);
}

beforeEach(() => {
  db.reset();
  h.admin = true;
  h.candidates = [cand("a"), cand("b")];
  h.send.mockReset();
  h.send.mockResolvedValue({ ok: true });
  process.env.BREVO_API_KEY_PARTICIPANTS = "test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  setup();
});

const src = { batchTitle: "Batch 4", classTitle: "Intro to Pharmacology", feedbackUrl: "https://app.test/feedback/slug-one", firstName: "Ayesha" };

describe("buildFeedbackEmail", () => {
  it("feedback email contains the link and the class name", () => {
    const m = buildFeedbackEmail(src);
    expect(m.subject).toBe("How was Intro to Pharmacology? Share your feedback");
    expect(m.html).toContain('href="https://app.test/feedback/slug-one"');
    expect(m.html).toContain("Give your feedback");
    expect(m.html).toContain("Ayesha");
    expect(m.html).toContain("Intro to Pharmacology");
    expect(m.text).toContain("https://app.test/feedback/slug-one");
    expect(m.text).toContain("Intro to Pharmacology");
  });
  it("feedback email escapes html in names and titles", () => {
    const m = buildFeedbackEmail({ ...src, firstName: "<b>Eve</b>", classTitle: "A & <script>x</script>", batchTitle: "<i>B</i>", feedbackUrl: 'https://a.test/f?x="1"&y=2' });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<b>Eve");
    expect(m.html).not.toContain("<i>B");
    expect(m.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(m.html).toContain("A &amp; &lt;script&gt;");
    expect(m.html).toContain('href="https://a.test/f?x=&quot;1&quot;&amp;y=2"');
  });
});

describe("createSessionSend feedback", () => {
  it("refuses when no feedback link exists", async () => {
    setup({ feedback_session_id: null });
    expect(await createSessionSend(SESS, "feedback")).toEqual({ ok: false, reason: "no_feedback_link" });
    expect(store.participant_sends).toHaveLength(0);
    h.admin = true;
    const res = await emailFeedbackLink(SESS);
    expect(res).toEqual({ ok: false, message: "This class has no feedback link yet" });
  });
  it("refuses a second press while one is sending", async () => {
    expect(await createSessionSend(SESS, "feedback")).toMatchObject({ ok: true });
    expect(await createSessionSend(SESS, "feedback")).toEqual({ ok: false, reason: "too_soon" });
    expect(store.participant_sends).toHaveLength(1);
    store.participant_sends[0].created_at = new Date(Date.now() - 61_000).toISOString();
    expect(await createSessionSend(SESS, "feedback")).toEqual({ ok: false, reason: "still_sending" });
    for (const r of store.participant_send_recipients) r.state = "sent";
    expect(await createSessionSend(SESS, "feedback")).toMatchObject({ ok: true });
  });
  it("refuses while an older feedback send for this class still has people waiting", async () => {
    store.participant_sends.push({ id: "old", session_id: SESS, session_kind: "feedback", created_at: new Date(Date.now() - 600_000).toISOString() });
    store.participant_send_recipients.push({ id: "r1", send_id: "old", state: "sent" }, { id: "r2", send_id: "old", state: "pending" });
    expect(await createSessionSend(SESS, "feedback")).toEqual({ ok: false, reason: "still_sending" });
    store.participant_send_recipients[1].state = "claimed";
    expect(await createSessionSend(SESS, "feedback")).toEqual({ ok: false, reason: "still_sending" });
    expect(store.participant_sends).toHaveLength(1);
  });
  it("allows again once the earlier feedback send is fully sent", async () => {
    store.participant_sends.push({ id: "old", session_id: SESS, session_kind: "feedback", created_at: new Date(Date.now() - 600_000).toISOString() });
    store.participant_send_recipients.push({ id: "r1", send_id: "old", state: "sent" }, { id: "r2", send_id: "old", state: "failed" });
    expect(await createSessionSend(SESS, "feedback")).toMatchObject({ ok: true });
  });
  it("another class's unfinished send does not block this class", async () => {
    store.participant_sends.push({ id: "other", session_id: "other-session", session_kind: "feedback", created_at: new Date(Date.now() - 600_000).toISOString() });
    store.participant_send_recipients.push({ id: "r1", send_id: "other", state: "pending" });
    expect(await createSessionSend(SESS, "feedback")).toMatchObject({ ok: true });
  });
  it("puts the batch name in the email", async () => {
    store.landing_pages[0].title = "Pharmacology Batch 4";
    await createSessionSend(SESS, "feedback");
    expect(store.participant_sends[0].body).toContain("Pharmacology Batch 4");
  });
  it("does not need a Zoom link and is allowed after the class started", async () => {
    setup({ zoom_url: "", email_enabled: false });
    expect(await createSessionSend(SESS, "feedback")).toMatchObject({ ok: true });
  });
});

describe("emailFeedbackLink", () => {
  it("non-admin refused", async () => {
    h.admin = false;
    const res = await emailFeedbackLink(SESS);
    expect(res.ok).toBe(false);
    expect(res.message).toBe("You do not have permission to do this.");
    expect(store.participant_sends).toHaveLength(0);
    expect(h.send).not.toHaveBeenCalled();
  });
  it("sends to every enrolled student and logs kind feedback", async () => {
    const res = await emailFeedbackLink(SESS);
    expect(res).toEqual({ ok: true, message: "Email sent to 2 students" });
    expect(store.participant_sends[0]).toMatchObject({ session_id: SESS, session_kind: "feedback", channel: "email", recipient_count: 2 });
    expect(store.participant_sends[0].subject).toBe("How was Intro? Share your feedback");
    expect(h.send).toHaveBeenCalledTimes(2);
    const html = String(h.send.mock.calls[0][0].htmlContent);
    expect(html).toContain("https://app.test/feedback/slug-one");
    expect(html).toContain("Hi Name");
  });
});

describe("Email now with the reminder switch off", () => {
  it("is refused for the automatic reminder but allowed when pressed by hand", async () => {
    setup({ email_enabled: false, starts_at: new Date(Date.now() + 3600_000).toISOString() });
    expect(await createSessionSend(SESS, "reminder")).toEqual({ ok: false, reason: "disabled" });
    expect(await createSessionSend(SESS, "reminder", { manual: true })).toMatchObject({ ok: true });
  });
});

describe("sendSessionTest", () => {
  it("sends one [TEST] email with the real Zoom link and records nothing", async () => {
    setup({ email_enabled: false });
    const r = await sendSessionTest(SESS, "boss@pz.test");
    expect(r).toEqual({ ok: true });
    expect(h.send).toHaveBeenCalledTimes(1);
    const arg = h.send.mock.calls[0][0];
    expect(arg.to).toBe("boss@pz.test");
    expect(arg.subject).toMatch(/^\[TEST\]/);
    expect(arg.htmlContent).toContain("https://zoom.test/j/1");
    expect(store.participant_sends).toHaveLength(0);
  });
  it("refuses when the class has no Zoom link", async () => {
    setup({ zoom_url: "" });
    expect(await sendSessionTest(SESS, "boss@pz.test")).toEqual({ ok: false, reason: "no_zoom" });
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("listSessionEmailHistory", () => {
  it("lists each email sent for the class with counts and who got it", async () => {
    await createSessionSend(SESS, "feedback");
    const rows = store.participant_send_recipients as { state: string; reason: string }[];
    rows[0].state = "sent";
    rows[1].state = "skipped";
    rows[1].reason = "unsubscribed";
    const out = await listSessionEmailHistory(SESS);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "feedback", total: 2, counts: { sent: 1, failed: 0, skipped: 1, waiting: 0 } });
    expect(out[0].recipients.map((r) => r.state).sort()).toEqual(["sent", "skipped"]);
    expect(out[0].recipients.find((r) => r.state === "skipped")!.reason).toBe("unsubscribed");
  });
  it("is empty when nothing was sent, and ignores other classes", async () => {
    expect(await listSessionEmailHistory(SESS)).toEqual([]);
    (store.participant_sends as unknown[]).push({ id: "x", session_id: "other", session_kind: "reminder", created_at: new Date().toISOString(), recipient_count: 1, subject: "s", channel: "email" });
    expect(await listSessionEmailHistory(SESS)).toEqual([]);
  });
});

describe("Zoom link emails for people who have not got it", () => {
  const future = () => ({ starts_at: new Date(Date.now() + 3600_000).toISOString() });
  const recs = () => store.participant_send_recipients as { registration_id: string; state: string }[];
  it("skips people already sent or still waiting, and tries failed ones again", async () => {
    setup(future());
    h.candidates = [cand("a"), cand("b"), cand("c")];
    await createSessionSend(SESS, "reminder");
    recs().find((r) => r.registration_id === "a")!.state = "sent";
    recs().find((r) => r.registration_id === "b")!.state = "failed";
    // c stays pending: it is queued and will get the first email
    (store.participant_sends[0] as { created_at: string }).created_at = new Date(Date.now() - 5 * 60_000).toISOString();
    const res = await createSessionSend(SESS, "update", { resend: true, onlyMissing: true });
    expect(res).toMatchObject({ ok: true, count: 1 });
    const added = recs().filter((r) => r.registration_id === "b");
    expect(added).toHaveLength(2);
    expect(store.participant_sends[1]).toMatchObject({ session_kind: "update" });
    expect(String(store.participant_sends[1].body)).toMatch(/Here are the details/);
  });
  it("says so when everyone has it already", async () => {
    setup(future());
    await createSessionSend(SESS, "reminder");
    for (const r of recs()) r.state = "sent";
    (store.participant_sends[0] as { created_at: string }).created_at = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(await createSessionSend(SESS, "update", { resend: true, onlyMissing: true })).toEqual({ ok: false, reason: "nobody_missing" });
    expect(store.participant_sends).toHaveLength(1);
  });
  it("without the option it still goes to everyone", async () => {
    setup(future());
    await createSessionSend(SESS, "reminder");
    for (const r of recs()) r.state = "sent";
    (store.participant_sends[0] as { created_at: string }).created_at = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(await createSessionSend(SESS, "update", { resend: true })).toMatchObject({ ok: true, count: 2 });
  });
});

describe("new Zoom link email", () => {
  it("goes to everyone, even people who already got the old link, with changed-link wording", async () => {
    setup({ starts_at: new Date(Date.now() + 3600_000).toISOString() });
    await createSessionSend(SESS, "reminder");
    for (const r of store.participant_send_recipients as { state: string }[]) r.state = "sent";
    (store.participant_sends[0] as { created_at: string }).created_at = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(await createSessionSend(SESS, "update", { zoomChanged: true })).toMatchObject({ ok: true, count: 2 });
    expect(String(store.participant_sends[1].subject)).toMatch(/^New Zoom link/);
  });
});

describe("only-missing review fixes", () => {
  const future = () => ({ starts_at: new Date(Date.now() + 3600_000).toISOString() });
  const recs = () => store.participant_send_recipients as { registration_id: string; state: string; claimed_at?: string | null; reason?: string }[];
  const age = (i: number, ms = 5 * 60_000) => { (store.participant_sends[i] as { created_at: string }).created_at = new Date(Date.now() - ms).toISOString(); };

  it("a person who shares an email with someone already sent is not emailed again", async () => {
    setup(future());
    h.candidates = [{ ...cand("a"), email: "same@x.com" }, { ...cand("b"), email: "same@x.com" }];
    await createSessionSend(SESS, "reminder");
    recs().find((r) => r.state === "pending")!.state = "sent";
    age(0);
    expect(await createSessionSend(SESS, "update", { resend: true, onlyMissing: true })).toEqual({ ok: false, reason: "nobody_missing" });
  });

  it("a row stuck as claimed for over 15 minutes does not count as got it", async () => {
    setup(future());
    await createSessionSend(SESS, "reminder");
    const [first, second] = recs();
    first.state = "claimed"; first.claimed_at = new Date(Date.now() - 30 * 60_000).toISOString();
    second.state = "claimed"; second.claimed_at = new Date().toISOString();
    age(0);
    const res = await createSessionSend(SESS, "update", { resend: true, onlyMissing: true });
    expect(res).toMatchObject({ ok: true, count: 1 });
  });

  it("after a new-Zoom-link email, only people who got that newer email are skipped", async () => {
    setup(future());
    await createSessionSend(SESS, "reminder");
    for (const r of recs()) r.state = "sent";
    age(0, 10 * 60_000);
    await createSessionSend(SESS, "update", { zoomChanged: true });
    const newer = recs().filter((r, i) => i >= 2);
    newer.find((r) => r.registration_id === "a")!.state = "sent";
    newer.find((r) => r.registration_id === "b")!.state = "failed";
    age(1);
    const res = await createSessionSend(SESS, "update", { resend: true, onlyMissing: true });
    expect(res).toMatchObject({ ok: true, count: 1 });
    expect(recs().filter((r) => r.registration_id === "b")).toHaveLength(3);
  });

  it("a time-change email a moment ago does not block the new-Zoom-link email", async () => {
    setup(future());
    await createSessionSend(SESS, "update");
    expect(await createSessionSend(SESS, "update", { zoomChanged: true })).toMatchObject({ ok: true });
    expect(await createSessionSend(SESS, "update", { zoomChanged: true })).toEqual({ ok: false, reason: "too_soon" });
  });

  it("the history shows each email's subject so the kinds can be told apart", async () => {
    setup(future());
    await createSessionSend(SESS, "update", { zoomChanged: true });
    const out = await listSessionEmailHistory(SESS);
    expect(out[0].subject).toMatch(/^New Zoom link/);
  });
});