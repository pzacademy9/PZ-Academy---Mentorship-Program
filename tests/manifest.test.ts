// @vitest-environment node
import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";

describe("manifest", () => {
  const m = manifest();
  it("opens /resume as a standalone app", () => {
    expect(m.start_url).toBe("/resume");
    expect(m.display).toBe("standalone");
    expect(m.scope).toBe("/");
    expect(m.name).toBe("PZ Academy");
    expect(m.theme_color).toBe("#1b4b33");
    expect(m.background_color).toBe("#ffffff");
  });
  it("has at least one icon", () => {
    expect(m.icons && m.icons.length).toBeGreaterThan(0);
    expect(m.icons![0].src).toBe("/pz-logo.png");
  });
});
