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
import { createSessionSend } from "@/lib/data/session-emails";
import { emailFeedbackLink } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

const SESS = "00000000-0000-4000-8000-000000000002";
const PAGE = "00000000-0000-4000-8000-000000000001";
const PERSON = "11111111-1111-1111-1111-111111111111";
const cand = (id: string) => ({
  registrationId: id, leadId: id, isMember: false, name: `Name ${id}`, email: `${id}@x.com`, phone: "+923001234567", refId: `R-${id}`, status: "paid",
});

let store: Store;
function setup(over: Record<string, unknown> = {}) {
  store = {
    batch_sessions: [{
      id: SESS, page_id: PAGE, number: 1, title: "Intro", starts_at: new Date(Date.now() - 3600_000).toISOString(),
      zoom_url: "https://zoom.test/j/1", kahoot_url: "", include_kahoot: false, include_attendance_link: true,
      email_enabled: true, public_code: "code0001", window_override: "auto", feedback_session_id: "f1", ...over,
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
    expect(await createSessionSend(SESS, "feedback")).toMatchObject({ ok: true });
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
