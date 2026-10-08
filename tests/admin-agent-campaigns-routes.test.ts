import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => ({ ok: true, user: { id: "admin-user" } }) }));

const updateWhatsAppBatch = vi.fn();
const updateRecipientStatus = vi.fn();
const deleteWhatsAppBatch = vi.fn();
vi.mock("@/lib/data/admin-crm-whatsapp", () => ({
  getWhatsAppBatchDetail: vi.fn(),
  updateWhatsAppBatch: (...a: unknown[]) => updateWhatsAppBatch(...a),
  updateRecipientStatus: (...a: unknown[]) => updateRecipientStatus(...a),
  deleteWhatsAppBatch: (...a: unknown[]) => deleteWhatsAppBatch(...a),
}));

import { PATCH as patchBatch, DELETE as deleteBatch } from "@/app/api/admin/crm/whatsapp/batches/[id]/route";
import { PATCH as patchRecipient } from "@/app/api/admin/crm/whatsapp/batches/[id]/recipients/[recipientId]/route";

const MSG = "This campaign belongs to a sales agent. You can watch its progress but not change it.";
const req = (body: unknown) => new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }) as never;

beforeEach(() => {
  updateWhatsAppBatch.mockReset();
  updateRecipientStatus.mockReset();
  deleteWhatsAppBatch.mockReset();
});

describe("admin whatsapp routes and agent campaigns", () => {
  it("PATCH batch maps agent-campaign to 409", async () => {
    updateWhatsAppBatch.mockResolvedValue({ ok: false, reason: "agent-campaign" });
    const res = await patchBatch(req({ name: "x" }), { params: Promise.resolve({ id: "b" }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MSG });
  });

  it("PATCH recipient maps agent-campaign to 409", async () => {
    updateRecipientStatus.mockResolvedValue({ ok: false, reason: "agent-campaign" });
    const res = await patchRecipient(req({ status: "sent" }), { params: Promise.resolve({ id: "b", recipientId: "r" }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MSG });
  });

  it("existing reasons keep their old status codes", async () => {
    updateWhatsAppBatch.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await patchBatch(req({ name: "x" }), { params: Promise.resolve({ id: "b" }) })).status).toBe(404);
    updateRecipientStatus.mockResolvedValue({ ok: false, reason: "db-error" });
    expect((await patchRecipient(req({ status: "sent" }), { params: Promise.resolve({ id: "b", recipientId: "r" }) })).status).toBe(500);
  });

  it("DELETE stays available to admins for agent campaigns", async () => {
    deleteWhatsAppBatch.mockResolvedValue({ ok: true });
    const res = await deleteBatch(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id: "b-agent" }) });
    expect(res.status).toBe(200);
    expect(deleteWhatsAppBatch).toHaveBeenCalledWith("b-agent");
  });
});
