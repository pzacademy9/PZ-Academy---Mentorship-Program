import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  signCheckinToken,
  verifyCheckinToken,
  checkinSecret,
} from "@/lib/attendance/link-token";

const SESSION = "11111111-1111-4111-8111-111111111111";
const OTHER_SESSION = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";
const SECRET = "test-secret";

describe("check-in link token", () => {
  it("round-trips the person id", () => {
    const token = signCheckinToken(SESSION, PERSON, SECRET);
    expect(verifyCheckinToken(token, SESSION, SECRET)).toEqual({ personId: PERSON });
  });

  it("is url-safe", () => {
    const token = signCheckinToken(SESSION, PERSON, SECRET);
    expect(token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
  });

  it("rejects the same token for a different session", () => {
    const token = signCheckinToken(SESSION, PERSON, SECRET);
    expect(verifyCheckinToken(token, OTHER_SESSION, SECRET)).toBeNull();
  });

  it("rejects a different secret", () => {
    const token = signCheckinToken(SESSION, PERSON, SECRET);
    expect(verifyCheckinToken(token, SESSION, "other")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signCheckinToken(SESSION, PERSON, SECRET);
    const last = token.slice(-1);
    const flipped = token.slice(0, -1) + (last === "A" ? "B" : "A");
    expect(verifyCheckinToken(flipped, SESSION, SECRET)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(verifyCheckinToken("nodothere", SESSION, SECRET)).toBeNull();
    expect(verifyCheckinToken("", SESSION, SECRET)).toBeNull();
    expect(verifyCheckinToken("x".repeat(5000), SESSION, SECRET)).toBeNull();
  });

  it("rejects a wrong-length signature", () => {
    const token = signCheckinToken(SESSION, PERSON, SECRET);
    expect(verifyCheckinToken(`${token}extra`, SESSION, SECRET)).toBeNull();
    expect(verifyCheckinToken(`${PERSON}.abc`, SESSION, SECRET)).toBeNull();
  });

  it("rejects a non-uuid person id even with a valid signature", () => {
    const token = signCheckinToken(SESSION, "not-a-uuid", SECRET);
    expect(verifyCheckinToken(token, SESSION, SECRET)).toBeNull();
  });

  it("checkinSecret is null when the key is unset and never equals the raw key", () => {
    const prev = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(checkinSecret()).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "raw-key";
    const derived = checkinSecret();
    expect(derived).toBeTruthy();
    expect(derived).not.toBe("raw-key");
    if (prev === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prev;
  });
});
