import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
let ip = "1.2.3.4";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": ip }) }));

const getSessionByCode = vi.fn();
const eligiblePersonForEmail = vi.fn();
const markPresent = vi.fn();
const isLiveEnrolled = vi.fn();
const personFirstName = vi.fn();
vi.mock("@/lib/data/attendance", () => ({
  getSessionByCode: (...a: unknown[]) => getSessionByCode(...a),
  eligiblePersonForEmail: (...a: unknown[]) => eligiblePersonForEmail(...a),
  markPresent: (...a: unknown[]) => markPresent(...a),
  isLiveEnrolled: (...a: unknown[]) => isLiveEnrolled(...a),
  personFirstName: (...a: unknown[]) => personFirstName(...a),
}));

import { checkInPersonal, checkInShared } from "@/app/attend/[code]/actions";
import { signCheckinToken, checkinSecret } from "@/lib/attendance/link-token";

const SID = "11111111-1111-4111-8111-111111111111";
const PERSON = "33333333-3333-4333-8333-333333333333";
const session = (over: Record<string, unknown> = {}) => ({
  id: SID, page_id: "pg1", starts_at: new Date().toISOString(), window_override: "auto", public_code: "abcd1234", batchTitle: "B", ...over,
});
let token: string;
let n = 0;

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";
  ip = `9.9.${Math.floor(n / 250)}.${n % 250}`;
  n++;
  [getSessionByCode, eligiblePersonForEmail, markPresent, isLiveEnrolled, personFirstName].forEach((m) => m.mockReset());
  getSessionByCode.mockResolvedValue(session());
  isLiveEnrolled.mockResolvedValue(true);
  personFirstName.mockResolvedValue("Ayesha");
  markPresent.mockResolvedValue({ created: true });
  token = signCheckinToken(SID, PERSON, checkinSecret()!);
});

describe("checkInPersonal", () => {
  it("marks and returns first name only", async () => {
    const r = await checkInPersonal("abcd1234", token);
    expect(r).toEqual({ status: "marked", firstName: "Ayesha", already: false });
    expect(markPresent).toHaveBeenCalledWith(SID, PERSON, "personal");
  });
  it("reports already when the mark existed", async () => {
    markPresent.mockResolvedValue({ created: false });
    expect(await checkInPersonal("abcd1234", token)).toEqual({ status: "marked", firstName: "Ayesha", already: true });
  });
  it("closed window never marks", async () => {
    getSessionByCode.mockResolvedValue(session({ starts_at: "2020-01-01T00:00:00Z" }));
    expect(await checkInPersonal("abcd1234", token)).toEqual({ status: "closed" });
    expect(markPresent).not.toHaveBeenCalled();
  });
  it("before window never marks", async () => {
    getSessionByCode.mockResolvedValue(session({ starts_at: "2099-01-01T00:00:00Z" }));
    expect(await checkInPersonal("abcd1234", token)).toEqual({ status: "before" });
    expect(markPresent).not.toHaveBeenCalled();
  });
  it("bad token is bad_link", async () => {
    expect(await checkInPersonal("abcd1234", token + "x")).toEqual({ status: "bad_link" });
    expect(markPresent).not.toHaveBeenCalled();
  });
  it("fails closed without a secret", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await checkInPersonal("abcd1234", token)).toEqual({ status: "bad_link" });
    expect(markPresent).not.toHaveBeenCalled();
  });
  it("recorded-only person is not_live", async () => {
    isLiveEnrolled.mockResolvedValue(false);
    expect(await checkInPersonal("abcd1234", token)).toEqual({ status: "not_live" });
    expect(markPresent).not.toHaveBeenCalled();
  });
  it("deleted person gives bad_link, no throw", async () => {
    personFirstName.mockResolvedValue(null);
    expect(await checkInPersonal("abcd1234", token)).toEqual({ status: "bad_link" });
    expect(markPresent).not.toHaveBeenCalled();
  });
  it("unknown code is not_found", async () => {
    getSessionByCode.mockResolvedValue(null);
    expect(await checkInPersonal("zzzzzzzz", token)).toEqual({ status: "not_found" });
  });
  it("never leaks raw error text", async () => {
    markPresent.mockRejectedValue(new Error('relation "x" does not exist'));
    expect(await checkInPersonal("abcd1234", token)).toEqual({ status: "error" });
  });
});

describe("checkInShared", () => {
  beforeEach(() => {
    eligiblePersonForEmail.mockResolvedValue({ personId: PERSON, firstName: "Ayesha" });
  });
  it("marks and carries no email", async () => {
    const r = await checkInShared("abcd1234", "ayesha@x.com");
    expect(r).toEqual({ status: "marked", firstName: "Ayesha", already: false });
    expect(JSON.stringify(r)).not.toContain("@");
    expect(markPresent).toHaveBeenCalledWith(SID, PERSON, "shared");
  });
  it("unknown email is not_found", async () => {
    eligiblePersonForEmail.mockResolvedValue({ reason: "no_person" });
    expect(await checkInShared("abcd1234", "no@x.com")).toEqual({ status: "not_found" });
    expect(markPresent).not.toHaveBeenCalled();
  });
  it("not in batch is not_found, recorded is not_live", async () => {
    eligiblePersonForEmail.mockResolvedValue({ reason: "not_in_batch" });
    expect(await checkInShared("abcd1234", "a@x.com")).toEqual({ status: "not_found" });
    eligiblePersonForEmail.mockResolvedValue({ reason: "not_live" });
    expect(await checkInShared("abcd1234", "a@x.com")).toEqual({ status: "not_live" });
  });
  it("closed and before never mark", async () => {
    getSessionByCode.mockResolvedValue(session({ starts_at: "2020-01-01T00:00:00Z" }));
    expect(await checkInShared("abcd1234", "a@x.com")).toEqual({ status: "closed" });
    getSessionByCode.mockResolvedValue(session({ starts_at: "2099-01-01T00:00:00Z" }));
    expect(await checkInShared("abcd1234", "a@x.com")).toEqual({ status: "before" });
    expect(markPresent).not.toHaveBeenCalled();
  });
  it("rejects a blank email without lookup", async () => {
    expect(await checkInShared("abcd1234", "  ")).toEqual({ status: "not_found" });
    expect(eligiblePersonForEmail).not.toHaveBeenCalled();
  });
  it("eleventh call from one IP is rate_limited", async () => {
    eligiblePersonForEmail.mockResolvedValue({ reason: "no_person" });
    for (let i = 0; i < 10; i++) expect((await checkInShared("abcd1234", "a@x.com")).status).toBe("not_found");
    expect(await checkInShared("abcd1234", "a@x.com")).toEqual({ status: "rate_limited" });
  });
  it("personal action is rate limited too", async () => {
    for (let i = 0; i < 10; i++) await checkInPersonal("abcd1234", token);
    expect(await checkInPersonal("abcd1234", token)).toEqual({ status: "rate_limited" });
  });
  it("never leaks raw error text", async () => {
    eligiblePersonForEmail.mockRejectedValue(new Error("boom secret"));
    expect(await checkInShared("abcd1234", "a@x.com")).toEqual({ status: "error" });
  });
});
