// tests/landing-registration-edit.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, type Op } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
vi.mock("@/lib/data/landing-registration-admin", () => ({ queueStatusFollowUps: async () => {} }));
const background = vi.hoisted(() => vi.fn());
vi.mock("@/lib/landing/registration/background", () => ({ runInBackground: background }));

const adminGate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    adminGate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: adminGate.mode === "401" ? 401 : 403 }) },
}));

import { updateRegistrationDetails } from "@/lib/data/landing-registration-edit";
import { saveContactSnapshots } from "@/lib/data/landing-sheet-sync";

const ID = "00000000-0000-4000-8000-000000000001";
const row = { id: ID, page_id: "page-1", name: "Old Name", email: "old@x.com", whatsapp: "923001234567", status: "paid", amount_received: 5000, student_id: "stu-1" };

interface Script { row: Record<string, unknown> | null; taken: boolean; updateError: { code: string } | null }
let script: Script;

beforeEach(() => {
  db.reset();
  background.mockReset();
  adminGate.mode = "ok";
  script = { row: { ...row }, taken: false, updateError: null };
  db.state.handler = (op: Op) => {
    if (op.table === "landing_registrations" && op.op === "select") {
      if (op.filters.some(([k]) => k === "ilike")) return { data: script.taken ? [{ id: "other" }] : [], error: null };
      return { data: script.row, error: null };
    }
    if (op.table === "landing_registrations" && op.op === "update") return { data: null, error: script.updateError };
    return { data: null, error: null };
  };
});

const regUpdates = () => db.find("landing_registrations", "update");
const jobs = () => db.find("landing_jobs", "upsert");

describe("updateRegistrationDetails", () => {
  it("updates only the changed columns and enqueues one coalesced sheet_details job", async () => {
    const r = await updateRegistrationDetails({ registrationId: ID, name: " New Name ", email: " New@X.com ", whatsapp: "+92 300 7654321" });
    expect(r).toEqual({ ok: true, changed: ["name", "email", "whatsapp"] });
    expect(regUpdates()).toHaveLength(1);
    expect(regUpdates()[0].payload).toEqual({ name: "New Name", email: "new@x.com", whatsapp: "923007654321" });
    expect(regUpdates()[0].filters).toContainEqual(["eq", "id", ID]);
    expect(jobs()).toHaveLength(1);
    expect(jobs()[0].payload).toMatchObject({ registration_id: ID, type: "sheet_details", status: "pending", attempts: 0, last_error: null });
    expect(jobs()[0].upsertOptions).toEqual({ onConflict: "registration_id,type" });
    expect(background).toHaveBeenCalledTimes(1);
  });

  it("writes only the fields that actually changed and never student_id, status or amount", async () => {
    const r = await updateRegistrationDetails({ registrationId: ID, name: "Old Name", whatsapp: "923007654321" });
    expect(r).toEqual({ ok: true, changed: ["whatsapp"] });
    expect(Object.keys(regUpdates()[0].payload as object)).toEqual(["whatsapp"]);
  });

  it("a second edit while a job is pending upserts the same (registration, type) key, so one job remains", async () => {
    await updateRegistrationDetails({ registrationId: ID, name: "A" });
    await updateRegistrationDetails({ registrationId: ID, name: "B" });
    expect(jobs()).toHaveLength(2);
    for (const j of jobs()) expect(j.upsertOptions).toEqual({ onConflict: "registration_id,type" });
  });

  it("email already used on the same page gives email-taken, writes nothing and enqueues nothing", async () => {
    script.taken = true;
    const r = await updateRegistrationDetails({ registrationId: ID, email: "Taken@X.com" });
    expect(r).toEqual({ ok: false, reason: "email-taken" });
    const check = db.state.ops.find((o) => o.op === "select" && o.filters.some(([k]) => k === "ilike"))!;
    expect(check.filters).toContainEqual(["eq", "page_id", "page-1"]);
    expect(check.filters).toContainEqual(["neq", "id", ID]);
    expect(check.filters).toContainEqual(["ilike", "email", "taken@x.com"]);
    expect(regUpdates()).toHaveLength(0);
    expect(db.find("landing_sheet_snapshots", "upsert")).toHaveLength(0);
    expect(jobs()).toHaveLength(0);
  });

  it("escapes LIKE wildcards in the taken-email check", async () => {
    await updateRegistrationDetails({ registrationId: ID, email: "a_b%c@x.com" });
    const check = db.state.ops.find((o) => o.op === "select" && o.filters.some(([k]) => k === "ilike"))!;
    expect(check.filters).toContainEqual(["ilike", "email", "a\\_b\\%c@x.com"]);
  });

  it("the same email on a different page is allowed (the check is scoped to this page)", async () => {
    const r = await updateRegistrationDetails({ registrationId: ID, email: "shared@x.com" });
    expect(r).toEqual({ ok: true, changed: ["email"] });
  });

  it("a unique violation from the update also maps to email-taken and enqueues nothing", async () => {
    script.updateError = { code: "23505" };
    const r = await updateRegistrationDetails({ registrationId: ID, email: "race@x.com" });
    expect(r).toEqual({ ok: false, reason: "email-taken" });
    expect(jobs()).toHaveLength(0);
  });

  it("another update error is db-error with nothing enqueued", async () => {
    script.updateError = { code: "XX000" };
    expect(await updateRegistrationDetails({ registrationId: ID, name: "Z" })).toEqual({ ok: false, reason: "db-error" });
    expect(jobs()).toHaveLength(0);
  });

  it("rejects an invalid email, an empty name and a 7-digit WhatsApp before touching the database", async () => {
    expect(await updateRegistrationDetails({ registrationId: ID, email: "nope" })).toEqual({ ok: false, reason: "bad-email" });
    expect(await updateRegistrationDetails({ registrationId: ID, email: "@x.com" })).toEqual({ ok: false, reason: "bad-email" });
    expect(await updateRegistrationDetails({ registrationId: ID, name: "   " })).toEqual({ ok: false, reason: "bad-name" });
    expect(await updateRegistrationDetails({ registrationId: ID, name: "x".repeat(201) })).toEqual({ ok: false, reason: "bad-name" });
    expect(await updateRegistrationDetails({ registrationId: ID, whatsapp: "1234567" })).toEqual({ ok: false, reason: "bad-whatsapp" });
    expect(await updateRegistrationDetails({ registrationId: ID, whatsapp: "1".repeat(16) })).toEqual({ ok: false, reason: "bad-whatsapp" });
    expect(db.state.ops).toHaveLength(0);
  });

  it("not-found and nothing-to-change", async () => {
    script.row = null;
    expect(await updateRegistrationDetails({ registrationId: ID, name: "Z" })).toEqual({ ok: false, reason: "not-found" });
    script.row = { ...row };
    expect(await updateRegistrationDetails({ registrationId: ID, name: " Old Name ", email: "OLD@x.com", whatsapp: "+92 300 1234567" })).toEqual({ ok: false, reason: "nothing-to-change" });
    expect(regUpdates()).toHaveLength(0);
    expect(jobs()).toHaveLength(0);
  });

  it("creates the pre-edit snapshot insert-only BEFORE the update, with the OLD values", async () => {
    await updateRegistrationDetails({ registrationId: ID, email: "new@x.com" });
    const snapIdx = db.state.ops.findIndex((o) => o.table === "landing_sheet_snapshots");
    const updIdx = db.state.ops.findIndex((o) => o.table === "landing_registrations" && o.op === "update");
    expect(snapIdx).toBeGreaterThan(-1);
    expect(snapIdx).toBeLessThan(updIdx);
    const snap = db.state.ops[snapIdx];
    expect(snap.op).toBe("upsert");
    expect(snap.upsertOptions).toMatchObject({ onConflict: "registration_id", ignoreDuplicates: true });
    expect((snap.payload as Record<string, unknown>[])[0]).toMatchObject({ registration_id: ID, status: "paid", amount_received: 5000, name: "Old Name", email: "old@x.com", whatsapp: "923001234567" });
  });

  it("never overwrites an existing snapshot and never updates one", async () => {
    await updateRegistrationDetails({ registrationId: ID, name: "Z" });
    expect(db.find("landing_sheet_snapshots", "upsert").every((o) => (o.upsertOptions as { ignoreDuplicates?: boolean }).ignoreDuplicates === true)).toBe(true);
    expect(db.find("landing_sheet_snapshots", "update")).toHaveLength(0);
  });

  it("a failed snapshot write stops the edit before the update", async () => {
    const base = db.state.handler;
    db.state.handler = (op) => (op.table === "landing_sheet_snapshots" ? { data: null, error: { message: "boom" } } : base(op));
    expect(await updateRegistrationDetails({ registrationId: ID, name: "Z" })).toEqual({ ok: false, reason: "db-error" });
    expect(regUpdates()).toHaveLength(0);
  });

  it("a failed enqueue never fails the edit", async () => {
    const base = db.state.handler;
    db.state.handler = (op) => (op.table === "landing_jobs" ? { data: null, error: { code: "XX000" } } : base(op));
    expect(await updateRegistrationDetails({ registrationId: ID, name: "Z" })).toEqual({ ok: true, changed: ["name"] });
    expect(background).toHaveBeenCalledTimes(1);
  });
});

describe("saveContactSnapshots", () => {
  it("updates only name, email, whatsapp and updated_at on existing rows, normalized", async () => {
    await saveContactSnapshots([{ id: "r1", name: " N ", email: " E@X.com ", whatsapp: "+92 300-1234567" }]);
    const ops = db.find("landing_sheet_snapshots", "update");
    expect(ops).toHaveLength(1);
    expect(db.find("landing_sheet_snapshots", "upsert")).toHaveLength(0);
    expect(db.find("landing_sheet_snapshots", "insert")).toHaveLength(0);
    expect(ops[0].filters).toContainEqual(["eq", "registration_id", "r1"]);
    expect(Object.keys(ops[0].payload as object).sort()).toEqual(["email", "name", "updated_at", "whatsapp"]);
    expect(ops[0].payload).toMatchObject({ name: "N", email: "e@x.com", whatsapp: "923001234567" });
  });
  it("a registration with no snapshot matches nothing and creates nothing", async () => {
    await saveContactSnapshots([{ id: "none", name: "N", email: "e@x.com", whatsapp: "923001234567" }]);
    expect(db.find("landing_sheet_snapshots", "upsert")).toHaveLength(0);
  });
  it("throws on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(saveContactSnapshots([{ id: "r1", name: "N", email: "e@x.com", whatsapp: "923001234567" }])).rejects.toThrow("boom");
  });
});

describe("PATCH /api/admin/registrations/[id]/details", () => {
  const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
  const req = (body: unknown) => new Request("http://x", { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
  async function patch() { return (await import("@/app/api/admin/registrations/[id]/details/route")).PATCH; }

  it("401 and 403 before anything else", async () => {
    const PATCH = await patch();
    adminGate.mode = "401";
    expect((await PATCH(req({ name: "A" }), ctx())).status).toBe(401);
    adminGate.mode = "403";
    expect((await PATCH(req({ name: "A" }), ctx("bad"))).status).toBe(403);
    expect(db.state.ops).toHaveLength(0);
  });
  it("malformed id is 404 after auth", async () => {
    expect((await (await patch())(req({ name: "A" }), ctx("nope"))).status).toBe(404);
  });
  it("empty or unknown body is 400", async () => {
    const PATCH = await patch();
    for (const bad of ["not json", {}, { extra: 1 }, { name: 5 }]) expect((await PATCH(req(bad), ctx())).status).toBe(400);
  });
  it("success returns changed; nothing-to-change returns 200 with an empty list", async () => {
    const PATCH = await patch();
    const ok = await PATCH(req({ name: "New" }), ctx());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, changed: ["name"] });
    const same = await PATCH(req({ name: "Old Name" }), ctx());
    expect(same.status).toBe(200);
    expect(await same.json()).toEqual({ ok: true, changed: [] });
  });
  it("422 with plain messages", async () => {
    const PATCH = await patch();
    const e = await PATCH(req({ email: "nope" }), ctx());
    expect(e.status).toBe(422);
    expect((await e.json()).error).toBe("Enter a valid email address, like name@example.com.");
    const w = await PATCH(req({ whatsapp: "123" }), ctx());
    expect(w.status).toBe(422);
    expect((await w.json()).error).toBe("Enter a WhatsApp number with the country code, digits only.");
    const n = await PATCH(req({ name: " " }), ctx());
    expect(n.status).toBe(422);
    expect((await n.json()).error).toBe("The name cannot be empty.");
  });
  it("409 when the email is taken", async () => {
    script.taken = true;
    const res = await (await patch())(req({ email: "t@x.com" }), ctx());
    expect(res.status).toBe(409);
    const msg = (await res.json()).error as string;
    expect(msg).toBe("Another person on this page already uses that email. Their account is not changed.");
    expect(msg.toLowerCase()).not.toContain("snapshot");
  });
  it("404 when the registration does not exist", async () => {
    script.row = null;
    expect((await (await patch())(req({ name: "A" }), ctx())).status).toBe(404);
  });
});
