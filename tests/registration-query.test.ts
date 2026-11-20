import { describe, it, expect } from "vitest";
import { activeFilterCount } from "@/components/admin/registrations/query";

describe("activeFilterCount", () => {
  it("is 0 for an empty query", () => {
    expect(activeFilterCount({})).toBe(0);
  });
  it("ignores status and search", () => {
    expect(activeFilterCount({ status: "paid", q: "ali" })).toBe(0);
  });
  it("counts mode and optionScopes", () => {
    expect(activeFilterCount({ mode: "live", optionScopes: "full,1" })).toBe(2);
  });
  it("counts region, optionLabel and mode", () => {
    expect(activeFilterCount({ region: "PK", optionLabel: "Recorded — Modules: M4", mode: "recorded" })).toBe(3);
  });
  it("ignores page, agent and pager", () => {
    expect(activeFilterCount({ pageId: "x", agentId: "y", p: 3 })).toBe(0);
  });
  it("counts empty strings as 0", () => {
    expect(activeFilterCount({ mode: "", region: "", optionLabel: "", optionScopes: "" })).toBe(0);
  });
});
