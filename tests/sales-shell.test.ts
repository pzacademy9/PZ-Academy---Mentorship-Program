import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const page = join(process.cwd(), "src", "app", "dashboard", "sales", "page.tsx");

describe("sales workspace shell", () => {
  it("exists and is gated by requireSalesAgentPage", () => {
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toContain("requireSalesAgentPage()");
  });
  it("has a loading state", () => {
    expect(existsSync(join(process.cwd(), "src", "app", "dashboard", "sales", "loading.tsx"))).toBe(true);
  });
});
