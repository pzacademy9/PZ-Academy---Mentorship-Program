import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403" }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () =>
    gate.mode === "ok"
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) },
}));

const q = vi.hoisted(() => ({
  countAudience: vi.fn(),
  loadAudienceFile: vi.fn(),
  audienceFacets: vi.fn(),
  clearAudienceCache: vi.fn(),
}));
vi.mock("@/lib/data/audience-query", () => q);
const s = vi.hoisted(() => ({
  listSavedAudiences: vi.fn(),
  createSavedAudience: vi.fn(),
  renameSavedAudience: vi.fn(),
  deleteSavedAudience: vi.fn(),
  getSavedAudience: vi.fn(),
}));
vi.mock("@/lib/data/audience-saved", () => s);
const c = vi.hoisted(() => ({ closeBatch: vi.fn() }));
vi.mock("@/lib/data/landing-close-batch", () => c);

import { encodeAudienceFilter, DEFAULT_AUDIENCE_FILTER } from "@/lib/crm/audience-filter";
import { POST as countPOST } from "@/app/api/admin/crm/audiences/count/route";
import { GET as exportGET } from "@/app/api/admin/crm/audiences/export/route";
import { GET as savedGET, POST as savedPOST } from "@/app/api/admin/crm/audiences/saved/route";
import { PATCH as savedPATCH, DELETE as savedDELETE } from "@/app/api/admin/crm/audiences/saved/[id]/route";
import { GET as facetsGET } from "@/app/api/admin/crm/audiences/facets/route";
import { POST as bringPOST } from "@/app/api/admin/crm/audiences/bring-in/route";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const base = "http://x/api/admin/crm/audiences";
const post = (path: string, body: unknown, method = "POST") =>
  new Request(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
const get = (path: string) => new Request(`${base}${path}`) as never;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const contact = {
  id: "a", email: "a@x.com", phoneE164: "+923001234567", fullName: "Ann Lee", country: "PK",
  emailUnsubscribedAt: null, whatsappUnsubscribedAt: null, doNotContactAt: null, emailSuppressed: false,
};
const F = { ...DEFAULT_AUDIENCE_FILTER, statuses: ["paid" as const] };
const enc = encodeAudienceFilter(F);

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  gate.mode = "ok";
  for (const o of [q, s, c]) for (const fn of Object.values(o)) fn.mockReset();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("count route", () => {
  it("401/403 never reach the engine", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      expect((await countPOST(post("/count", F))).status).toBe(Number(mode));
    }
    expect(q.countAudience).not.toHaveBeenCalled();
  });
  it("400 on a bad filter or bad json", async () => {
    expect((await countPOST(post("/count", { ...F, statuses: ["nobody"] }))).status).toBe(400);
    expect((await countPOST(post("/count", "not json"))).status).toBe(400);
    expect(q.countAudience).not.toHaveBeenCalled();
  });
  it("forwards a validated fresh flag; default is not fresh; a non-boolean is a 400", async () => {
    q.countAudience.mockResolvedValue({
      total: 1, inFile: 1, leftOut: { noContact: 0, doNotContact: 0 }, tooLarge: false, needsUpdate: false, statusNeedsUpdate: false, ignoredChoices: [],
    });
    await countPOST(post("/count", F));
    expect(q.countAudience).toHaveBeenLastCalledWith(expect.anything(), { fresh: false });
    await countPOST(post("/count", { ...F, fresh: true }));
    expect(q.countAudience).toHaveBeenLastCalledWith(expect.anything(), { fresh: true });
    q.countAudience.mockClear();
    expect((await countPOST(post("/count", { ...F, fresh: "yes" }))).status).toBe(400);
    expect(q.countAudience).not.toHaveBeenCalled();
  });
  it("returns only the numbers", async () => {
    q.countAudience.mockResolvedValue({
      total: 10, inFile: 8, leftOut: { noContact: 1, doNotContact: 1 }, tooLarge: false, needsUpdate: false, statusNeedsUpdate: false, ignoredChoices: [],
    });
    const res = await countPOST(post("/count", F));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["ignoredChoices", "inFile", "leftOut", "needsUpdate", "statusNeedsUpdate", "tooLarge", "total"]);
    expect(JSON.stringify(body)).not.toContain("@");
  });
  it("500 is generic and logs only the step", async () => {
    q.countAudience.mockRejectedValue(new Error("boom a@x.com"));
    const res = await countPOST(post("/count", F));
    expect(res.status).toBe(500);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("a@x.com");
    expect(errSpy.mock.calls[0][0]).toBe("[audiences] count failed");
  });
});

describe("export route", () => {
  it("401/403 never reach the engine", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      expect((await exportGET(get(`/export?f=${enc}`))).status).toBe(Number(mode));
    }
    expect(q.loadAudienceFile).not.toHaveBeenCalled();
  });
  it("400 on missing, both, or bad inputs", async () => {
    for (const qs of ["", "?f=%%%", `?f=${enc}&saved=${U1}`, "?saved=nope", `?f=${enc}&format=csv`]) {
      expect((await exportGET(get(`/export${qs}`))).status).toBe(400);
    }
    expect(q.loadAudienceFile).not.toHaveBeenCalled();
  });
  it("hashed attachment", async () => {
    q.loadAudienceFile.mockResolvedValue({ contacts: [contact], tooLarge: false, needsUpdate: false });
    const res = await exportGET(get(`/export?f=${enc}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename=paid-meta-audience-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("email,phone,fn,ln,country");
    expect(text).not.toContain("a@x.com");
  });
  it("plain is attachment-only and readable", async () => {
    q.loadAudienceFile.mockResolvedValue({ contacts: [contact], tooLarge: false, needsUpdate: false });
    const res = await exportGET(get(`/export?f=${enc}&format=plain`));
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename=paid-plain-meta-audience-/);
    expect(await res.text()).toBe("email,phone,fn,ln,country\na@x.com,+923001234567,Ann,Lee,PK\n");
  });
  it("413 when too large", async () => {
    q.loadAudienceFile.mockResolvedValue({ contacts: [], tooLarge: true, needsUpdate: false });
    const res = await exportGET(get(`/export?f=${enc}`));
    expect(res.status).toBe(413);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
  it("400 when nobody would be in the file", async () => {
    q.loadAudienceFile.mockResolvedValue({ contacts: [], tooLarge: false, needsUpdate: false });
    const res = await exportGET(get(`/export?f=${enc}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nobody to download for these choices." });
  });
  it("400 when every chosen course no longer exists, never a wider file (f= and saved=)", async () => {
    const GONE = "The courses chosen for this audience no longer exist. Choose the courses again.";
    const FC = { ...F, courses: ["Gone Course"] };
    q.loadAudienceFile.mockResolvedValue({
      contacts: [], tooLarge: false, needsUpdate: false, ignoredChoices: ["Gone Course"], allCoursesGone: true,
    });
    const res = await exportGET(get(`/export?f=${encodeAudienceFilter(FC)}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: GONE });
    s.getSavedAudience.mockResolvedValue({ needsUpdate: false, item: { id: U1, name: "Old", filter: FC, invalid: false } });
    const saved = await exportGET(get(`/export?saved=${U1}`));
    expect(saved.status).toBe(400);
    expect(await saved.json()).toEqual({ error: GONE });
  });
  it("some chosen courses gone: the file still downloads", async () => {
    q.loadAudienceFile.mockResolvedValue({
      contacts: [contact], tooLarge: false, needsUpdate: false, ignoredChoices: ["Gone Course"], allCoursesGone: false,
    });
    const res = await exportGET(get(`/export?f=${encodeAudienceFilter({ ...F, courses: ["Gone Course", "Live One"] })}`));
    expect(res.status).toBe(200);
  });
  it("409 when the update is missing", async () => {
    q.loadAudienceFile.mockResolvedValue({ contacts: [], tooLarge: false, needsUpdate: true });
    expect((await exportGET(get(`/export?f=${enc}`))).status).toBe(409);
  });
  it("saved audience uses the saved name and re-validated filter", async () => {
    s.getSavedAudience.mockResolvedValue({ needsUpdate: false, item: { id: U1, name: "Paid PMH", filter: F, invalid: false } });
    q.loadAudienceFile.mockResolvedValue({ contacts: [contact], tooLarge: false, needsUpdate: false });
    const res = await exportGET(get(`/export?saved=${U1}`));
    expect(res.status).toBe(200);
    expect(q.loadAudienceFile).toHaveBeenCalledWith(F);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename=paid-pmh-meta-audience-/);
  });
  it("saved audience whose stored filter is bad answers 400; missing answers 404", async () => {
    s.getSavedAudience.mockResolvedValue({ needsUpdate: false, item: { id: U1, name: "Old", filter: null, invalid: true } });
    expect((await exportGET(get(`/export?saved=${U1}`))).status).toBe(400);
    s.getSavedAudience.mockResolvedValue({ needsUpdate: false, item: null });
    expect((await exportGET(get(`/export?saved=${U1}`))).status).toBe(404);
    expect(q.loadAudienceFile).not.toHaveBeenCalled();
  });
  it("500 is generic", async () => {
    q.loadAudienceFile.mockRejectedValue(new Error("boom a@x.com"));
    const res = await exportGET(get(`/export?f=${enc}`));
    expect(res.status).toBe(500);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("a@x.com");
    expect(errSpy.mock.calls[0][0]).toBe("[audiences] export failed");
  });
});

describe("saved routes", () => {
  it("401/403 passthrough", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      expect((await savedGET()).status).toBe(Number(mode));
      expect((await savedPOST(post("/saved", { name: "A", filter: F }))).status).toBe(Number(mode));
      expect((await savedPATCH(post("/saved/x", { name: "A" }, "PATCH"), ctx(U1))).status).toBe(Number(mode));
      expect((await savedDELETE(get("/saved/x"), ctx(U1))).status).toBe(Number(mode));
      expect((await facetsGET()).status).toBe(Number(mode));
      expect((await bringPOST(post("/bring-in", { pageIds: [U1] }))).status).toBe(Number(mode));
    }
    expect(s.listSavedAudiences).not.toHaveBeenCalled();
    expect(c.closeBatch).not.toHaveBeenCalled();
  });
  it("list degrades when the table is missing", async () => {
    s.listSavedAudiences.mockResolvedValue({ items: [], needsUpdate: true });
    const res = await savedGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], needsUpdate: true });
  });
  it("create validates name and filter", async () => {
    for (const body of [{ name: "  ", filter: F }, { name: "x".repeat(81), filter: F }, { name: "A", filter: { who: "x" } }, {}]) {
      expect((await savedPOST(post("/saved", body))).status).toBe(400);
    }
    expect(s.createSavedAudience).not.toHaveBeenCalled();
  });
  it("create passes a trimmed name and the admin id", async () => {
    s.createSavedAudience.mockResolvedValue({ ok: true, item: { id: U1, name: "Paid", filter: F, invalid: false } });
    const res = await savedPOST(post("/saved", { name: "  Paid ", filter: F }));
    expect(res.status).toBe(200);
    expect(s.createSavedAudience).toHaveBeenCalledWith({ name: "Paid", filter: F, adminId: "admin-1" });
  });
  it("create duplicate is 409 with the plain message", async () => {
    s.createSavedAudience.mockResolvedValue({ ok: false, reason: "duplicate" });
    const res = await savedPOST(post("/saved", { name: "Paid", filter: F }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "A saved audience with this name already exists." });
  });
  it("create with the table missing is 409 needs one update", async () => {
    s.createSavedAudience.mockResolvedValue({ ok: false, reason: "needsUpdate" });
    const res = await savedPOST(post("/saved", { name: "Paid", filter: F }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/needs one update first/i);
  });
  it("rename: bad id/name 400, duplicate 409, missing 404, ok 200", async () => {
    expect((await savedPATCH(post("/saved/x", { name: "A" }, "PATCH"), ctx("nope"))).status).toBe(400);
    expect((await savedPATCH(post("/saved/x", { name: "" }, "PATCH"), ctx(U1))).status).toBe(400);
    s.renameSavedAudience.mockResolvedValue({ ok: false, reason: "duplicate" });
    expect((await savedPATCH(post("/saved/x", { name: "A" }, "PATCH"), ctx(U1))).status).toBe(409);
    s.renameSavedAudience.mockResolvedValue({ ok: false, reason: "notFound" });
    expect((await savedPATCH(post("/saved/x", { name: "A" }, "PATCH"), ctx(U1))).status).toBe(404);
    s.renameSavedAudience.mockResolvedValue({ ok: true, item: { id: U1, name: "A", filter: F, invalid: false } });
    expect((await savedPATCH(post("/saved/x", { name: " A " }, "PATCH"), ctx(U1))).status).toBe(200);
    expect(s.renameSavedAudience).toHaveBeenLastCalledWith({ id: U1, name: "A" });
  });
  it("delete: bad id 400, ok 200", async () => {
    expect((await savedDELETE(get("/saved/x"), ctx("nope"))).status).toBe(400);
    s.deleteSavedAudience.mockResolvedValue({ ok: true });
    expect((await savedDELETE(get("/saved/x"), ctx(U1))).status).toBe(200);
    expect(s.deleteSavedAudience).toHaveBeenCalledWith(U1);
  });
});

describe("facets route", () => {
  it("returns the facets", async () => {
    q.audienceFacets.mockResolvedValue({ courses: [], countries: [], unknownCountry: 0, landingPages: [], statusCounts: {}, needsUpdate: false, statusNeedsUpdate: false });
    const res = await facetsGET();
    expect(res.status).toBe(200);
    expect((await res.json()).needsUpdate).toBe(false);
  });
  it("500 is generic", async () => {
    q.audienceFacets.mockRejectedValue(new Error("boom"));
    expect((await facetsGET()).status).toBe(500);
    expect(errSpy.mock.calls[0][0]).toBe("[audiences] facets failed");
  });
});

describe("bring-in route", () => {
  it("400 for none, non-UUID, or more than 20", async () => {
    const many = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    for (const body of [{ pageIds: [] }, { pageIds: ["nope"] }, { pageIds: many }, {}, { pageIds: [U1, "bad"] }]) {
      expect((await bringPOST(post("/bring-in", body))).status).toBe(400);
    }
    expect(c.closeBatch).not.toHaveBeenCalled();
  });
  it("dedupes ids, passes the admin id, and reports per page", async () => {
    c.closeBatch.mockResolvedValue({ paidAdded: 3, interestedAdded: 2, contactsCreated: 1, contactsMerged: 0, skipped: 1 });
    const res = await bringPOST(post("/bring-in", { pageIds: [U1, U1, U2] }));
    expect(res.status).toBe(200);
    expect(c.closeBatch).toHaveBeenCalledTimes(2);
    expect(c.closeBatch).toHaveBeenCalledWith({ pageId: U1, adminId: "admin-1" });
    expect(await res.json()).toEqual({
      pages: [
        { id: U1, ok: true, paidAdded: 3, interestedAdded: 2, skipped: 1 },
        { id: U2, ok: true, paidAdded: 3, interestedAdded: 2, skipped: 1 },
      ],
    });
  });
  it("one failing page does not stop the others and leaks nothing", async () => {
    c.closeBatch.mockRejectedValueOnce(new Error("boom a@x.com")).mockResolvedValueOnce({
      paidAdded: 1, interestedAdded: 0, contactsCreated: 0, contactsMerged: 0, skipped: 0,
    });
    const res = await bringPOST(post("/bring-in", { pageIds: [U1, U2] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages[0]).toEqual({ id: U1, ok: false, paidAdded: 0, interestedAdded: 0, skipped: 0, error: "Could not bring this page in. Please try again." });
    expect(body.pages[1].ok).toBe(true);
    expect(JSON.stringify(body)).not.toContain("a@x.com");
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("a@x.com");
    expect(errSpy.mock.calls[0][0]).toBe("[audiences] bring-in failed");
  });
  it("clears the audience cache after a run, even when a page fails", async () => {
    c.closeBatch.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({
      paidAdded: 1, interestedAdded: 0, contactsCreated: 0, contactsMerged: 0, skipped: 0,
    });
    await bringPOST(post("/bring-in", { pageIds: [U1, U2] }));
    expect(q.clearAudienceCache).toHaveBeenCalledTimes(1);
    await bringPOST(post("/bring-in", { pageIds: ["nope"] }));
    expect(q.clearAudienceCache).toHaveBeenCalledTimes(1);
  });
  it("clears the cache once per request even when EVERY page fails", async () => {
    c.closeBatch.mockRejectedValue(new Error("boom"));
    q.clearAudienceCache.mockClear();
    const res = await bringPOST(post("/bring-in", { pageIds: [U1, U2] }));
    expect(res.status).toBe(200);
    expect(q.clearAudienceCache).toHaveBeenCalledTimes(1);
  });
});
