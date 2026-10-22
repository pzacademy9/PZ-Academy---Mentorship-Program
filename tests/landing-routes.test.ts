// tests/landing-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => ({ ok: true, user: { id: "admin-user" } }) }));

const createLandingPage = vi.fn();
const saveDraft = vi.fn();
const publishLandingPage = vi.fn();
const rollbackLandingPage = vi.fn();
const duplicateLandingPage = vi.fn();
const setPageStatus = vi.fn();
const renameLandingPage = vi.fn();
vi.mock("@/lib/data/landing-pages", () => ({
  createLandingPage: (...a: unknown[]) => createLandingPage(...a),
  saveDraft: (...a: unknown[]) => saveDraft(...a),
  publishLandingPage: (...a: unknown[]) => publishLandingPage(...a),
  rollbackLandingPage: (...a: unknown[]) => rollbackLandingPage(...a),
  duplicateLandingPage: (...a: unknown[]) => duplicateLandingPage(...a),
  setPageStatus: (...a: unknown[]) => setPageStatus(...a),
  renameLandingPage: (...a: unknown[]) => renameLandingPage(...a),
}));

import { POST as create } from "@/app/api/admin/landing-pages/route";
import { PATCH as patchDraft } from "@/app/api/admin/landing-pages/[id]/route";
import { POST as publish } from "@/app/api/admin/landing-pages/[id]/publish/route";
import { POST as rollback } from "@/app/api/admin/landing-pages/[id]/rollback/route";
import { POST as duplicate } from "@/app/api/admin/landing-pages/[id]/duplicate/route";
import { POST as status } from "@/app/api/admin/landing-pages/[id]/status/route";
import { POST as rename } from "@/app/api/admin/landing-pages/[id]/rename/route";
import { emptyContent, MAX_CONTENT_BYTES } from "@/lib/landing/content";

const req = (body: unknown, method = "POST") => new Request("http://x", { method, body: JSON.stringify(body) }) as never;
const ID = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: ID }) };
const badCtx = { params: Promise.resolve({ id: "not-a-uuid" }) };

beforeEach(() => {
  for (const m of [createLandingPage, saveDraft, publishLandingPage, rollbackLandingPage, duplicateLandingPage, setPageStatus, renameLandingPage]) m.mockReset();
});

describe("POST /api/admin/landing-pages", () => {
  it("creates a page and returns its id", async () => {
    createLandingPage.mockResolvedValue({ ok: true, id: "new-id" });
    const res = await create(req({ title: "PPC Batch 4", kind: "course" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new-id" });
    expect(createLandingPage.mock.calls[0][1]).toMatchObject({ title: "PPC Batch 4", slug: "ppc-batch-4", kind: "course" });
  });
  it("rejects a reserved slug with a plain message", async () => {
    const res = await create(req({ title: "x", kind: "course", slug: "api" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reserved|different/i);
    expect(createLandingPage).not.toHaveBeenCalled();
  });
  it("rejects a title that makes no usable slug", async () => {
    const res = await create(req({ title: "دورة", kind: "course" }));
    expect(res.status).toBe(400);
  });
  it("maps slug-taken to 409", async () => {
    createLandingPage.mockResolvedValue({ ok: false, reason: "slug-taken" });
    const res = await create(req({ title: "PPC", kind: "course", slug: "ppc-b3" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already/i);
  });
  it("rejects an unknown kind", async () => {
    expect((await create(req({ title: "x", kind: "party" }))).status).toBe(400);
  });
});

describe("PATCH draft", () => {
  it("saves and returns the new revision", async () => {
    saveDraft.mockResolvedValue({ ok: true, revision: 5 });
    const res = await patchDraft(req({ content: emptyContent("course"), baseRevision: 4 }, "PATCH"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: 5 });
  });
  it("maps a stale revision to 409 conflict", async () => {
    saveDraft.mockResolvedValue({ ok: false, reason: "conflict" });
    const res = await patchDraft(req({ content: emptyContent("course"), baseRevision: 1 }, "PATCH"), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("conflict");
  });
  it("rejects content with an unsafe link before touching the database", async () => {
    const c = emptyContent("course");
    c.settings.registerUrl = "javascript:alert(1)";
    const res = await patchDraft(req({ content: c, baseRevision: 1 }, "PATCH"), ctx);
    expect(res.status).toBe(400);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it("rejects oversized content with 413", async () => {
    const c = emptyContent("course");
    c.sections[0].data.subheadline = "x".repeat(400);
    c.sections[0].data.badges = Array.from({ length: 6 }, () => ({ text: "y".repeat(60) }));
    const huge = { ...c, seo: { ...c.seo, description: "z".repeat(300) } };
    // Force the byte cap path with a payload over the limit using many sections' text.
    const big = JSON.stringify({ content: huge, baseRevision: 1, padding: "p".repeat(410_000) });
    const res = await patchDraft(new Request("http://x", { method: "PATCH", body: big }) as never, ctx);
    expect(res.status).toBe(413);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it("accepts a small payload under the byte cap", async () => {
    saveDraft.mockResolvedValue({ ok: true, revision: 2 });
    const body = JSON.stringify({ content: emptyContent("course"), baseRevision: 1 });
    expect(body.length).toBeLessThan(MAX_CONTENT_BYTES);
    const res = await patchDraft(new Request("http://x", { method: "PATCH", body }) as never, ctx);
    expect(res.status).toBe(200);
  });
  it("measures the size cap in bytes, not characters (Urdu / emoji text is 2-4 bytes each)", async () => {
    const pad = "€".repeat(Math.floor(MAX_CONTENT_BYTES / 3) + 10); // "€" is 3 bytes in UTF-8
    const big = JSON.stringify({ content: emptyContent("course"), baseRevision: 1, padding: pad });
    expect(big.length).toBeLessThan(MAX_CONTENT_BYTES);
    const res = await patchDraft(new Request("http://x", { method: "PATCH", body: big }) as never, ctx);
    expect(res.status).toBe(413);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it("stores normalized content: unknown keys inside section data are stripped", async () => {
    saveDraft.mockResolvedValue({ ok: true, revision: 2 });
    const c = emptyContent("course");
    c.sections[0].data.junk = "should not be saved";
    const res = await patchDraft(req({ content: c, baseRevision: 1 }, "PATCH"), ctx);
    expect(res.status).toBe(200);
    const saved = saveDraft.mock.calls[0][1];
    expect(saved.sections[0].data).not.toHaveProperty("junk");
  });
  it("maps not-found to 404", async () => {
    saveDraft.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await patchDraft(req({ content: emptyContent("course"), baseRevision: 1 }, "PATCH"), ctx)).status).toBe(404);
  });
});

describe("publish", () => {
  it("returns 422 with the plain-language problems when the server finds the page incomplete", async () => {
    publishLandingPage.mockResolvedValue({ ok: false, reason: "not-ready", problems: [{ message: "Fill in \"Headline\"" }] });
    const res = await publish(req({}), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toEqual([{ message: "Fill in \"Headline\"" }]);
  });
  it("no-accounts is 422 with the readiness error shape", async () => {
    const problems = [{ message: "Add payment accounts for Pakistan on the Payment accounts screen before publishing." }];
    publishLandingPage.mockResolvedValue({ ok: false, reason: "no-accounts", problems });
    const res = await publish(req({}), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "The page is not ready to publish yet.", problems });
  });
  it("a failed account check is 500 with a plain message", async () => {
    publishLandingPage.mockResolvedValue({ ok: false, reason: "accounts-check-failed" });
    const res = await publish(req({}), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("We could not check the payment accounts. Please try again.");
  });
  it("returns ok when published", async () => {
    publishLandingPage.mockResolvedValue({ ok: true, version: 1 });
    expect((await publish(req({}), ctx)).status).toBe(200);
    expect(publishLandingPage).toHaveBeenCalledWith("admin-user", ID);
  });
  it("404s a missing page", async () => {
    publishLandingPage.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await publish(req({}), ctx)).status).toBe(404);
  });
  it("maps a publish conflict to 409 with a plain message, never 500", async () => {
    publishLandingPage.mockResolvedValue({ ok: false, reason: "conflict" });
    const res = await publish(req({}), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("conflict");
    expect(body.error).toMatch(/changed while it was being published/i);
  });
  it("returns the new version number on success", async () => {
    publishLandingPage.mockResolvedValue({ ok: true, version: 6 });
    expect(await (await publish(req({}), ctx)).json()).toEqual({ ok: true, version: 6 });
  });
});

describe("rollback / duplicate / status", () => {
  it("rollback needs a positive integer version", async () => {
    expect((await rollback(req({ version: 0 }), ctx)).status).toBe(400);
    rollbackLandingPage.mockResolvedValue({ ok: true, version: 1 });
    expect((await rollback(req({ version: 2 }), ctx)).status).toBe(200);
    expect(rollbackLandingPage).toHaveBeenCalledWith("admin-user", ID, 2);
  });
  it("rollback maps a concurrent-save conflict to 409", async () => {
    rollbackLandingPage.mockResolvedValue({ ok: false, reason: "conflict" });
    const res = await rollback(req({ version: 2 }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Someone else changed this page. Reload and try again.", code: "conflict" });
  });
  it("duplicate creates a copy and returns its id; slug-taken is 409", async () => {
    duplicateLandingPage.mockResolvedValue({ ok: true, id: "copy" });
    const ok = await duplicate(req({ title: "PPC Batch 4" }), ctx);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ id: "copy" });
    duplicateLandingPage.mockResolvedValue({ ok: false, reason: "slug-taken" });
    expect((await duplicate(req({ title: "PPC Batch 4" }), ctx)).status).toBe(409);
  });
  it("status accepts only closed/published; closing an unpublished page is 409", async () => {
    expect((await status(req({ status: "draft" }), ctx)).status).toBe(400);
    setPageStatus.mockResolvedValue({ ok: false, reason: "not-published" });
    expect((await status(req({ status: "closed" }), ctx)).status).toBe(409);
    setPageStatus.mockResolvedValue({ ok: true });
    expect((await status(req({ status: "closed" }), ctx)).status).toBe(200);
  });
});

describe("POST /api/admin/landing-pages/[id]/rename", () => {
  it("renames with a trimmed title", async () => {
    renameLandingPage.mockResolvedValue({ ok: true });
    const res = await rename(req({ title: "  New name  " }), ctx);
    expect(res.status).toBe(200);
    expect(renameLandingPage).toHaveBeenCalledWith(ID, "New name");
  });
  it("rejects an empty, blank or over-long name with a plain message", async () => {
    for (const title of ["", "   ", "x".repeat(121)]) {
      const res = await rename(req({ title }), ctx);
      expect(res.status).toBe(400);
    }
    expect((await (await rename(req({ title: " " }), ctx)).json()).error).toBe("Give the page a name.");
    expect(renameLandingPage).not.toHaveBeenCalled();
  });
  it("maps not-found to 404 and db errors to 500", async () => {
    renameLandingPage.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await rename(req({ title: "A" }), ctx)).status).toBe(404);
    renameLandingPage.mockResolvedValue({ ok: false, reason: "db-error" });
    expect((await rename(req({ title: "A" }), ctx)).status).toBe(500);
  });
});

describe("malformed page ids", () => {
  it("every [id] route answers 404 for a non-uuid id and never reaches the data layer", async () => {
    const calls: [string, () => Promise<Response>][] = [
      ["PATCH", () => patchDraft(req({ content: emptyContent("course"), baseRevision: 1 }, "PATCH"), badCtx)],
      ["publish", () => publish(req({}), badCtx)],
      ["rollback", () => rollback(req({ version: 1 }), badCtx)],
      ["duplicate", () => duplicate(req({ title: "Copy" }), badCtx)],
      ["status", () => status(req({ status: "closed" }), badCtx)],
      ["rename", () => rename(req({ title: "New" }), badCtx)],
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect(res.status, name).toBe(404);
      expect((await res.json()).error, name).toBe("Page not found");
    }
    for (const m of [saveDraft, publishLandingPage, rollbackLandingPage, duplicateLandingPage, setPageStatus, renameLandingPage]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});
