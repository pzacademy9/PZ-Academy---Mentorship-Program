import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const h = vi.hoisted(() => ({ candidates: [] as unknown[] }));
vi.mock("@/lib/data/participant-campaigns", async (orig) => {
  const real = await orig<typeof import("@/lib/data/participant-campaigns")>();
  return { ...real, resolveCandidates: async () => h.candidates };
});
vi.mock("@/lib/data/participant-prefs", () => ({
  getOrCreateToken: async (email: string) => `tok-${email}`,
  listUnsubscribed: async () => new Set<string>(),
}));
vi.mock("@/lib/brevo-participants", () => ({ sendParticipantEmail: vi.fn() }));

import { plan, previewSend, createSend } from "@/lib/data/participant-sends";

const PAGE = "page-1";
const cand = (id: string) => ({
  registrationId: id, leadId: id, isMember: false, name: `Name ${id}`, email: `${id}@x.com`, phone: "+923001234567", refId: `R-${id}`, status: "paid",
});

let store: Store;
beforeEach(() => {
  db.reset();
  process.env.BREVO_API_KEY_PARTICIPANTS = "k";
  h.candidates = [cand("a"), cand("b"), cand("c")];
  store = {
    landing_pages: [{ id: PAGE, course_id: null }],
    courses: [],
    // c has no person, so no PZ ID
    landing_registrations: ["a", "b", "c"].map((id) => ({ id, ref_id: `R-${id}`, lead_registration_id: null, person_id: id === "c" ? null : `p-${id}` })),
    pz_people: ["a", "b"].map((id) => ({ id: `p-${id}`, pz_id: `Zed-${id}`, display_name: id })),
    participant_sends: [],
    participant_send_recipients: [],
  };
  db.state.handler = memoryHandler(store);
});

const sent = (p: Awaited<ReturnType<typeof plan>>) => p.planned.send.map((c) => c.registrationId);

describe("PZ ID requirement", () => {
  it("plan with requirePzId never includes a person without a PZ ID", async () => {
    expect(sent(await plan({ pageId: PAGE, channel: "email", requirePzId: true }))).toEqual(["a", "b"]);
  });
  it("plan without it keeps everyone", async () => {
    expect(sent(await plan({ pageId: PAGE, channel: "email" }))).toEqual(["a", "b", "c"]);
  });
  it("previewSend applies the filter only when the message uses the tag (spaces allowed)", async () => {
    expect((await previewSend({ pageId: PAGE, channel: "email", body: "ID {{pz_id}}" })).count).toBe(2);
    expect((await previewSend({ pageId: PAGE, channel: "email", subject: "{{ pz_id }}", body: "x" })).count).toBe(2);
    expect((await previewSend({ pageId: PAGE, channel: "email", body: "Hi {{first_name}}" })).count).toBe(3);
  });
  it("createSend freezes only people with an ID, and its count matches the preview", async () => {
    const r = await createSend({
      pageId: PAGE, channel: "email", subject: "Your PZ ID", body: "Your PZ ID is {{pz_id}}", expectedCount: 2, expectedNotPaid: 0, confirmNotPaid: false, actorId: "admin-1",
    });
    expect(r).toMatchObject({ ok: true, count: 2 });
    expect(store.participant_send_recipients.map((x) => x.registration_id).sort()).toEqual(["a", "b"]);
  });
  it("createSend with a count that ignores the filter is refused as changed", async () => {
    const r = await createSend({
      pageId: PAGE, channel: "email", subject: "s", body: "{{pz_id}}", expectedCount: 3, expectedNotPaid: 0, confirmNotPaid: false, actorId: "admin-1",
    });
    expect(r).toMatchObject({ ok: false, code: "count_changed" });
  });
});
