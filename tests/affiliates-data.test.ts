import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const calls: { table: string; op: string; args: unknown[] }[] = [];
let answers: Record<string, unknown> = {};

function chain(table: string): unknown {
  const proxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") return (res: (v: unknown) => void) => res(answers[table]);
      return (...args: unknown[]) => {
        calls.push({ table, op: prop, args });
        if (prop === "maybeSingle" || prop === "single") return Promise.resolve(answers[`${table}:one`] ?? answers[table]);
        return proxy;
      };
    },
  });
  return proxy;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ from: (t: string) => chain(t), rpc: async () => ({ data: 321, error: null }) }) }));

import { createApplication, listAffiliates, getAffiliateDetail, dropAffiliate } from "@/lib/data/affiliates";
import type { AffiliateApplication } from "@/lib/validations/affiliate-application";

const app: AffiliateApplication = {
  name: "Test Person", email: "test.person@example.com", whatsapp: "+923001234567", city: "Lahore", country: "Pakistan",
  status: "student", organization: "Test University", field: "PharmD",
  commissionExperience: { yes: false, details: "" }, eventsManaged: { yes: false, details: "" },
  promotingPrograms: false, onlineSales: false,
  ratings: { marketing: 3, eventPromotion: 3, onlineEngagement: 3, communication: 3 },
  hoursPerWeek: "4-6", linkedin: "", why: "I like helping my class.", agreeTerms: true, website: "",
};

beforeEach(() => {
  calls.length = 0;
  answers = {};
});

describe("createApplication", () => {
  it("saves the row with the terms version and returns its id", async () => {
    answers.affiliates = { data: { id: "a1" }, error: null };
    const r = await createApplication(app, "v1");
    expect(r).toEqual({ ok: true, id: "a1" });
    const insert = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(insert.email).toBe("test.person@example.com");
    expect(insert.city_country).toBe("Lahore, Pakistan");
    expect(insert.terms_version).toBe("v1");
    expect(typeof insert.terms_accepted_at).toBe("string");
    expect(insert.status).toBeUndefined();
    expect(insert).not.toHaveProperty("website");
    expect(insert).not.toHaveProperty("agreeTerms");
  });
  it("a second application with the same email is a duplicate (unique violation)", async () => {
    answers.affiliates = { data: null, error: { code: "23505" } };
    expect(await createApplication(app, "v1")).toEqual({ ok: false, reason: "duplicate" });
  });
  it("any other database error is db-error", async () => {
    answers.affiliates = { data: null, error: { code: "XX000" } };
    expect(await createApplication(app, "v1")).toEqual({ ok: false, reason: "db-error" });
  });
});

describe("listAffiliates and getAffiliateDetail", () => {
  it("the list never selects the private token", async () => {
    answers.affiliates = { data: [], error: null };
    await listAffiliates({ status: "applied" });
    const select = calls.find((c) => c.op === "select")!.args[0] as string;
    expect(select).not.toMatch(/token/);
    expect(calls.some((c) => c.op === "eq" && c.args[0] === "status" && c.args[1] === "applied")).toBe(true);
  });
  it("the detail selects the token (it is the copy-link button's source)", async () => {
    answers["affiliates:one"] = { data: null, error: null };
    await getAffiliateDetail("a1");
    const select = calls.find((c) => c.op === "select")!.args[0] as string;
    expect(select).toMatch(/token/);
  });
});

describe("dropAffiliate", () => {
  it("saves the trimmed reason with the status change", async () => {
    answers["affiliates:one"] = { data: { id: "a1" }, error: null };
    const r = await dropAffiliate("a1", "  Never posted  ");
    expect(r).toEqual({ ok: true });
    const update = calls.find((c) => c.op === "update")!.args[0] as Record<string, unknown>;
    expect(update.status).toBe("dropped");
    expect(update.drop_reason).toBe("Never posted");
  });
  it("the list and detail select drop_reason", async () => {
    answers.affiliates = { data: [], error: null };
    await listAffiliates();
    expect(calls.find((c) => c.op === "select")!.args[0] as string).toMatch(/drop_reason/);
  });
});
