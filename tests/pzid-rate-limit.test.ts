import { describe, it, expect } from "vitest";
import { allowRequest } from "@/lib/pzid/rate-limit";

describe("allowRequest", () => {
  it("refuses the 11th call within a minute for one key", () => {
    const t = 1_000_000;
    for (let i = 0; i < 10; i++) expect(allowRequest("ip-a", t + i)).toBe(true);
    expect(allowRequest("ip-a", t + 10)).toBe(false);
  });

  it("allows a different key", () => {
    const t = 2_000_000;
    for (let i = 0; i < 10; i++) allowRequest("ip-b", t);
    expect(allowRequest("ip-b", t)).toBe(false);
    expect(allowRequest("ip-c", t)).toBe(true);
  });

  it("allows the key again after 61 seconds", () => {
    const t = 3_000_000;
    for (let i = 0; i < 11; i++) allowRequest("ip-d", t);
    expect(allowRequest("ip-d", t + 61_000)).toBe(true);
  });
});
