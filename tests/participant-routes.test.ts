import { describe, it, expect, vi, beforeEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403", email: "admin@example.com" as string | undefined }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => {
    if (gate.mode === "401") return { ok: false, response: new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 }) };
    if (gate.mode === "403") return { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) };
    return { ok: true, user: { id: "admin-1", email: gate.email } };
  },
}));
const sends = vi.hoisted(() => ({
  previewSend: vi.fn(), createSend: vi.fn(), listSends: vi.fn(), getSend: vi.fn(), runEmailSend: vi.fn(),
  retryFailed: vi.fn(), markWhatsAppSent: vi.fn(), sendTestToMe: vi.fn(),
}));
const tpl = vi.hoisted(() => ({ listTemplates: vi.fn(), saveTemplate: vi.fn(), deleteTemplate: vi.fn() }));
vi.mock("@/lib/data/participant-sends", () => sends);
vi.mock("@/lib/data/participant-templates", () => tpl);

import { POST as preview } from "@/app/api/admin/participants/preview/route";
import { POST as createSend, GET as listSends } from "@/app/api/admin/participants/sends/route";
import { GET as getSend } from "@/app/api/admin/participants/sends/[id]/route";
import { POST as run, maxDuration } from "@/app/api/admin/participants/sends/[id]/run/route";
import { POST as retry } from "@/app/api/admin/participants/sends/[id]/retry/route";
import { PATCH as markSent } from "@/app/api/admin/participants/sends/[id]/recipients/[recipientId]/route";
import { POST as testSend } from "@/app/api/admin/participants/test/route";
import { GET as listTpl, POST as createTpl } from "@/app/api/admin/participants/templates/route";
import { PUT as putTpl, DELETE as delTpl } from "@/app/api/admin/participants/templates/[id]/route";

const ID = "00000000-0000-4000-8000-000000000001";
const RID = "00000000-0000-4000-8000-000000000002";
const PAGE = "00000000-0000-4000-8000-000000000003";
const ctx = { params: Promise.resolve({ id: ID }) };
const ctx2 = { params: Promise.resolve({ id: ID, recipientId: RID }) };
const req = (body: unknown, method = "POST", url = "http://x") =>
  new Request(url, {
    method,
    ...(method === "GET" || method === "DELETE" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }) as never;

const createBody = {
  pageId: PAGE, channel: "email", ids: [ID], subject: "Hi", body: "Hello {{name}}",
  expectedCount: 1, expectedNotPaid: 0, confirmNotPaid: false,
};

const handlers: [string, () => Promise<Response>][] = [
  ["preview", () => preview(req({}))],
  ["sends POST", () => createSend(req(createBody))],
  ["sends GET", () => listSends(req(null, "GET", `http://x?pageId=${PAGE}`))],
  ["sends/[id] GET", () => getSend(req(null, "GET"), ctx)],
  ["run", () => run(req({}), ctx)],
  ["retry", () => retry(req({}), ctx)],
  ["mark sent", () => markSent(req({ sent: true }, "PATCH"), ctx2)],
  ["test", () => testSend(req({ pageId: PAGE, subject: "s", body: "b" }))],
  ["templates GET", () => listTpl()],
  ["templates POST", () => createTpl(req({ name: "n", subject: "", emailBody: "", whatsappBody: "" }))],
  ["templates PUT", () => putTpl(req({ name: "n", subject: "", emailBody: "", whatsappBody: "" }, "PUT"), ctx)],
  ["templates DELETE", () => delTpl(req(null, "DELETE"), ctx)],
];

beforeEach(() => {
  gate.mode = "ok";
  gate.email = "admin@example.com";
  for (const f of [...Object.values(sends), ...Object.values(tpl)]) f.mockReset();
});

describe("admin gate", () => {
  it.each([["401", 401], ["403", 403]] as const)("every handler answers %s and touches no data", async (mode, status) => {
    gate.mode = mode;
    for (const [name, call] of handlers) expect((await call()).status, name).toBe(status);
    for (const f of [...Object.values(sends), ...Object.values(tpl)]) expect(f).not.toHaveBeenCalled();
  });
});

describe("preview", () => {
  it("returns the data layer result", async () => {
    sends.previewSend.mockResolvedValue({ count: 2, summary: { total: 2 } });
    const res = await preview(req({ pageId: PAGE, channel: "email", ids: [ID] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 2, summary: { total: 2 } });
  });
  it("400 when both or neither of ids/filters are given", async () => {
    for (const body of [{ pageId: PAGE, channel: "email" }, { pageId: PAGE, channel: "email", ids: [ID], filters: {} }, "nope"]) {
      expect((await preview(req(body))).status).toBe(400);
    }
    expect(sends.previewSend).not.toHaveBeenCalled();
  });
});

describe("create send", () => {
  it("201 on success and passes the actor", async () => {
    sends.createSend.mockResolvedValue({ ok: true, sendId: ID, count: 1 });
    const res = await createSend(req(createBody));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ sendId: ID, count: 1 });
    expect(sends.createSend).toHaveBeenCalledWith(expect.objectContaining({ actorId: "admin-1", expectedNotPaid: 0 }));
  });
  it("409 with code not_paid_unconfirmed and the summary", async () => {
    sends.createSend.mockResolvedValue({ ok: false, code: "not_paid_unconfirmed", message: "Some people have not paid. Confirm to send anyway.", summary: { notPaid: 2 } });
    const res = await createSend(req(createBody));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Some people have not paid. Confirm to send anyway.", code: "not_paid_unconfirmed", summary: { notPaid: 2 } });
  });
  it("409 with code duplicate_send", async () => {
    sends.createSend.mockResolvedValue({ ok: false, code: "duplicate_send", message: "dup" });
    const res = await createSend(req(createBody));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("duplicate_send");
  });
  it("400 for invalid bodies, nothing created", async () => {
    for (const body of [
      { ...createBody, expectedNotPaid: undefined },
      { ...createBody, expectedNotPaid: -1 },
      { ...createBody, expectedCount: 0 },
      { ...createBody, pageId: "nope" },
      { ...createBody, filters: {} },
      "not json",
    ]) {
      const res = await createSend(req(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid input");
    }
    expect(sends.createSend).not.toHaveBeenCalled();
  });
});

describe("list sends", () => {
  it("400 without a uuid pageId, otherwise lists", async () => {
    expect((await listSends(req(null, "GET", "http://x?pageId=zzz"))).status).toBe(400);
    expect((await listSends(req(null, "GET", "http://x"))).status).toBe(400);
    sends.listSends.mockResolvedValue([{ id: ID }]);
    const res = await listSends(req(null, "GET", `http://x?pageId=${PAGE}`));
    expect(await res.json()).toEqual({ sends: [{ id: ID }] });
  });
});

describe("path ids", () => {
  it("404 for a non-uuid id without touching data", async () => {
    const bad = { params: Promise.resolve({ id: "zzz", recipientId: "zzz" }) };
    expect((await getSend(req(null, "GET"), bad)).status).toBe(404);
    expect((await run(req({}), bad)).status).toBe(404);
    expect((await retry(req({}), bad)).status).toBe(404);
    expect((await markSent(req({ sent: true }, "PATCH"), bad)).status).toBe(404);
    expect((await putTpl(req({ name: "n", subject: "", emailBody: "", whatsappBody: "" }, "PUT"), bad)).status).toBe(404);
    expect((await delTpl(req(null, "DELETE"), bad)).status).toBe(404);
    for (const f of [...Object.values(sends), ...Object.values(tpl)]) expect(f).not.toHaveBeenCalled();
  });
  it("get send 404 when missing", async () => {
    sends.getSend.mockResolvedValue(null);
    expect((await getSend(req(null, "GET"), ctx)).status).toBe(404);
  });
});

describe("run", () => {
  it("returns the data-layer result and allows 60s", async () => {
    sends.runEmailSend.mockResolvedValue({ sent: 3, failed: 1, pending: 5 });
    const res = await run(req({}), ctx);
    expect(await res.json()).toEqual({ sent: 3, failed: 1, pending: 5 });
    expect(sends.runEmailSend).toHaveBeenCalledWith(ID);
    expect(maxDuration).toBe(60);
  });
});

describe("retry and mark sent", () => {
  it("retry reports how many were requeued", async () => {
    sends.retryFailed.mockResolvedValue(4);
    expect(await (await retry(req({}), ctx)).json()).toEqual({ requeued: 4 });
  });
  it("mark sent passes the flag; 400 on a bad body; 404 for not found", async () => {
    sends.markWhatsAppSent.mockResolvedValue(undefined);
    expect((await markSent(req({ sent: false }, "PATCH"), ctx2)).status).toBe(200);
    expect(sends.markWhatsAppSent).toHaveBeenCalledWith(ID, RID, false);
    expect((await markSent(req({ sent: "yes" }, "PATCH"), ctx2)).status).toBe(400);
    sends.markWhatsAppSent.mockRejectedValue(new Error("Recipient not found"));
    expect((await markSent(req({ sent: true }, "PATCH"), ctx2)).status).toBe(404);
  });
});

describe("test send", () => {
  it("always sends to the signed-in admin and ignores a body toEmail", async () => {
    sends.sendTestToMe.mockResolvedValue({ ok: true });
    const res = await testSend(req({ pageId: PAGE, subject: "s", body: "b", toEmail: "victim@example.com" }));
    expect(res.status).toBe(200);
    expect(sends.sendTestToMe).toHaveBeenCalledWith({ pageId: PAGE, subject: "s", body: "b", toEmail: "admin@example.com" });
  });
  it("400 when the admin has no email, 400 on a bad body", async () => {
    gate.email = undefined;
    expect((await testSend(req({ pageId: PAGE, subject: "s", body: "b" }))).status).toBe(400);
    gate.email = "admin@example.com";
    expect((await testSend(req({ pageId: "x", subject: "s", body: "b" }))).status).toBe(400);
    expect(sends.sendTestToMe).not.toHaveBeenCalled();
  });
  it("surfaces a failed send", async () => {
    sends.sendTestToMe.mockResolvedValue({ ok: false, error: "boom" });
    const res = await testSend(req({ pageId: PAGE, subject: "s", body: "b" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error).toBe("boom");
  });
});

describe("templates", () => {
  const body = { name: "Reminder", subject: "s", emailBody: "e", whatsappBody: "w" };
  it("lists, creates, updates, deletes", async () => {
    tpl.listTemplates.mockResolvedValue([{ id: ID }]);
    expect(await (await listTpl()).json()).toEqual({ templates: [{ id: ID }] });
    tpl.saveTemplate.mockResolvedValue({ id: ID, name: "Reminder" });
    expect((await createTpl(req(body))).status).toBe(201);
    expect(tpl.saveTemplate).toHaveBeenLastCalledWith({ ...body, actorId: "admin-1" });
    expect((await putTpl(req(body, "PUT"), ctx)).status).toBe(200);
    expect(tpl.saveTemplate).toHaveBeenLastCalledWith({ ...body, id: ID, actorId: "admin-1" });
    tpl.deleteTemplate.mockResolvedValue(undefined);
    expect((await delTpl(req(null, "DELETE"), ctx)).status).toBe(200);
    expect(tpl.deleteTemplate).toHaveBeenCalledWith(ID);
  });
  it("blank name is 400 with the message; bad body is 400 Invalid input", async () => {
    tpl.saveTemplate.mockRejectedValue(new Error("Give the template a name"));
    const res = await createTpl(req({ ...body, name: "  " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Give the template a name");
    const bad = await createTpl(req({ name: 5 }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Invalid input");
  });
});
