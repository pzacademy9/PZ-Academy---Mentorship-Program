import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  createApplication: vi.fn(),
  getAffiliatePolicies: vi.fn(),
  allow: vi.fn(),
}));
vi.mock("@/lib/data/affiliates", () => ({ createApplication: m.createApplication }));
vi.mock("@/lib/data/site-terms", () => ({ getAffiliatePolicies: m.getAffiliatePolicies }));
vi.mock("@/lib/pzid/lookup-limit", () => ({ allowAffiliateApply: m.allow }));

import { POST } from "@/app/api/affiliates/apply/route";

const valid = () => ({
  name: "Test Person",
  email: "test.person@example.com",
  whatsapp: "+92 300 1234567",
  city: "Lahore",
  country: "Pakistan",
  status: "student",
  organization: "Test University",
  field: "PharmD",
  commissionExperience: { yes: false, details: "" },
  eventsManaged: { yes: false, details: "" },
  promotingPrograms: true,
  onlineSales: false,
  ratings: { marketing: 4, eventPromotion: 3, onlineEngagement: 5, communication: 2 },
  hoursPerWeek: "4-6",
  linkedin: "",
  why: "I help my class find good courses.",
  agreeTerms: true,
  website: "",
});

const post = (body: unknown, raw?: string) =>
  POST(new Request("http://x/api/affiliates/apply", { method: "POST", body: raw ?? JSON.stringify(body), headers: { "x-forwarded-for": "1.2.3.4" } }) as never);

beforeEach(() => {
  m.createApplication.mockReset().mockResolvedValue({ ok: true, id: "1" });
  m.getAffiliatePolicies.mockReset().mockResolvedValue({ ready: true, version: "v1|v2|v3" });
  m.allow.mockReset().mockResolvedValue(true);
});

describe("POST /api/affiliates/apply", () => {
  it("saves a valid application with the policy version and answers 201", async () => {
    const res = await post(valid());
    expect(res.status).toBe(201);
    expect(m.createApplication).toHaveBeenCalledTimes(1);
    expect(m.createApplication.mock.calls[0][1]).toBe("v1|v2|v3");
  });
  it("answers 503 and saves nothing when the documents are not all published", async () => {
    m.getAffiliatePolicies.mockResolvedValue({ ready: false, version: "||" });
    const res = await post(valid());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("Applications are not open yet.");
    expect(m.createApplication).not.toHaveBeenCalled();
  });
  it("answers 503 when reading the documents fails", async () => {
    m.getAffiliatePolicies.mockRejectedValue(new Error("db"));
    expect((await post(valid())).status).toBe(503);
  });
  it("honeypot filled answers 200 and saves nothing", async () => {
    const res = await post({ ...valid(), website: "http://spam.example" });
    expect(res.status).toBe(200);
    expect(m.createApplication).not.toHaveBeenCalled();
  });
  it("an invalid body gives 400 with a field message", async () => {
    const res = await post({ ...valid(), email: "nope" });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error: string; field?: string };
    expect(j.error).toBeTruthy();
    expect(j.field).toBe("email");
    expect(m.createApplication).not.toHaveBeenCalled();
  });
  it("not JSON gives 400", async () => {
    expect((await post(null, "{not json")).status).toBe(400);
  });
  it("a body over about 20 KB is refused before parsing", async () => {
    const res = await post(null, JSON.stringify({ ...valid(), why: "x".repeat(25000) }));
    expect(res.status).toBe(413);
    expect(m.createApplication).not.toHaveBeenCalled();
  });
  it("a duplicate gives 409", async () => {
    m.createApplication.mockResolvedValue({ ok: false, reason: "duplicate" });
    const res = await post(valid());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("You have already applied with this email.");
  });
  it("a database failure gives 500 in plain words", async () => {
    m.createApplication.mockResolvedValue({ ok: false, reason: "db-error" });
    expect((await post(valid())).status).toBe(500);
  });
  it("answers 429 when the limiter says no, and saves nothing", async () => {
    m.allow.mockResolvedValue(false);
    const res = await post(valid());
    expect(res.status).toBe(429);
    expect(m.createApplication).not.toHaveBeenCalled();
  });
  it("counts by the caller IP", async () => {
    await post(valid());
    expect(m.allow).toHaveBeenCalledWith("1.2.3.4");
  });
});
